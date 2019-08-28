// Build release job.

'use strict';
const superagent = require('superagent');
const config = require('config');
const { $enum } = require('ts-enum-util');
const sleep = require('util').promisify(setTimeout);
const azureDevops = require("azure-devops-node-api");
const { BuildStatus, BuildResult } = require("azure-devops-node-api/interfaces/BuildInterfaces");
const BuildStatusEnum = $enum(BuildStatus);
const BuildResultEnum = $enum(BuildResult);

const { knex } = require('../../app/db/postgres');
const { ReleaseState, ReleaseReason } = require('../../app/models/common');
const { Project } = require('../../app/models/project');
const { Package } = require('../../app/models/package');
const { Release } = require('../../app/models/release');
const logger = require('../../app/utils/log')(module);

// Build release for given id.
let buildRelease = async function (id) {
  let release = await Release.fetchOne(id);
  let builder = new ReleaseBuilder(release);
  await builder.build();
}

// Release builder
class ReleaseBuilder {

  constructor(release) {
    this.release = release;
    this.buildApi = null;
  }

  async build() {
    // Skip if state is succeeded or failed.
    if (this.release.state == ReleaseState.succeeded) {
      logger.info(`[id=${this.release.id}] skip for state ${this.release.state}.`);
      return;
    }
    // Handle building state.
    if (this.release.state == ReleaseState.failed && this.release.reason == ReleaseReason.timeout)
      // Previous build timeout, change state to building, without touching build_id.
      await this.release.update({ state: ReleaseState.building });
    else if (this.release.state == ReleaseState.pending || this.release.state == ReleaseState.failed)
      // Previous build not exist or failed, change state to building and clean build_id.
      await this.release.update({ state: ReleaseState.building, build_id: '' });
    // Prepare build api.
    this.buildApi = await this.getBuildApi();
    // Start new build pipelines if need.
    let build = null;
    if (!this.release.build_id) {
      build = await this.CreateBuildPipelines();
      await this.release.update({ build_id: build.id + '' });
      await sleep(config.azureDevops.check.duration);
    }
    // Wait build pipelines to finish.
    build = await this.checkBuildPipelines();
    if (build === null) {
      // Pipelines timeout.
      await this.release.update({ state: ReleaseState.failed, reason: ReleaseReason.timeout });
      // Raise error to retry.
      throw new Error(`[id=${this.release.id}] [build_id=${this.release.build_id}] build pipelines timeout.`);
    } else if (build.status == BuildStatus.Completed && build.result == BuildResult.Succeeded) {
      // Pipelines succeeded.
      await this.release.update({ state: ReleaseState.succeeded });
      logger.info(`[id=${this.release.id}] [build_id=${this.release.build_id}] build pipelines succeeded.`);
    } else {
      // Pipelines failed.
      await this.release.update({ state: ReleaseState.failed });
      let reason = '';
      // Update publish_log.
      if (build.status == BuildStatus.Completed && build.result == BuildResult.Failed) {
        // Fetch build message.
        let publishLog = await this.getPublishLog();
        // Find reason.
        reason = this.getReasonFromPublishLog(publishLog);
        // Update to database.
        await this.release.update({ publish_log: publishLog, reason });
      }
      let statusName = BuildStatusEnum.getKeyOrThrow(build.status);
      let resultName = typeof build.result === 'undefined'
        ? 'undefined'
        : BuildResultEnum.getKeyOrThrow(build.result);
      if (reason != ReleaseReason.badGateway && reason != ReleaseReason.serverError) {
        // Acceptable failure reason, just log it.
        logger.error(`[id=${this.release.id}] [build_id=${this.release.build_id}] build pipelines failed, status ${statusName}, result ${resultName}, reason ${reason}`);
      }
      else {
        // Other failure reason, raise error to retry.
        throw new Error(`[id=${this.release.id}] [build_id=${this.release.build_id}] build pipelines failed, status ${statusName}, result ${resultName}`);
      }
    }
  }

  // Get publish log
  async getPublishLog() {
    let resp = await superagent.get(this.release.buildPublishResultUrl);
    return resp.text;
  }

  // Return failure reason from publish log.
  getReasonFromPublishLog(text) {
    if (text.includes('EPUBLISHCONFLICT'))
      return ReleaseReason.publishConflict;
    else if (text.includes('ENOENT') && text.includes('error path package.json'))
      return ReleaseReason.nonPackage;
    else if (text.includes('error code E502'))
      return ReleaseReason.badGateway;
    else if (text.includes('error code E500'))
      return ReleaseReason.serverError;
    return '';
  }

  // Create new build pipelines and return the build object.
  async CreateBuildPipelines() {
    logger.info(`[id=${this.release.id}] create build pipelines`);
    let pkg = await Package.fetchOne(this.release.package_id);
    let project = await Project.fetchOne(pkg.project_id);
    let build = await this.buildApi.queueBuild({
      definition: {
        id: config.azureDevops.definitionId
      },
      parameters:
        JSON.stringify(
          {
            repo_url: project.gitUrl,
            repo_branch: this.release.tag,
            package_name: pkg.name,
            package_ver: this.release.version,
            build_name: getBuildName(this.release.id, pkg.name, this.release.version),
          }
        )
    }, config.azureDevops.project);
    return build;
  }

  /* Check build pipelines. Return the build object if pipelines in completed
  or cancelling status. Return null if run out of retries. */
  async checkBuildPipelines() {
    logger.info(`[id=${this.release.id}] [build_id=${this.release.build_id}] check build pipelines`);
    for (let i = 0; i < config.azureDevops.check.retries; i++) {
      let build = await this.buildApi.getBuild(config.azureDevops.project, this.release.build_id);
      let statusName = BuildStatusEnum.getKeyOrThrow(build.status);
      let resultName = typeof build.result === 'undefined'
        ? 'undefined'
        : BuildResultEnum.getKeyOrThrow(build.result);
      logger.info(`[id=${this.release.id}] [build_id=${this.release.build_id}] status ${statusName}, result ${resultName}, retries ${i}`);
      if (build.status == BuildStatus.Completed || build.status == BuildStatus.Cancelling)
        return build;
      await sleep(config.azureDevops.check.retryIntervalStep * (i + 1));
    }
    return null;
  }

  // Return a build api instance.
  async getBuildApi() {
    let authHandler = azureDevops.getPersonalAccessTokenHandler(config.azureDevops.token);
    let conn = new azureDevops.WebApi(config.azureDevops.endpoint, authHandler);
    let buildApi = await conn.getBuildApi();
    return buildApi;
  }
}

const getBuildName = function (releaseId, packageName, packageVer) {
  let buildName = packageName + '#' + packageVer;
  // The maximum length of a build number is 255 characters, and leaves 55 for other runtime suffix.
  // Characters which are not allowed include '"', '/', ':', '<', '>', '\', '|', '?', '@', and '*'.
  if (buildName.startsWith('@'))
    buildName = buildName.substr(1);
  buildName = 'rel#' + releaseId + '-' + buildName;
  buildName = buildName.replace(/[\/:<>\\|\?@\*]/g, '_');
  return buildName.substr(0, 255 - 55);
}

module.exports = { buildRelease, getBuildName };

if (require.main === module) {
  let program = require('../../app/utils/commander');
  let releaseId = null;
  program
    .arguments('<id>')
    .action(function (id) { releaseId = parseInt(id); })
    .requiredArgument(1)
    .parse(process.argv)
    .run(buildRelease, releaseId);
}