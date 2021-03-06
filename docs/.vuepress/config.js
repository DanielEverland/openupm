const path = require("path");
const { description } = require("../../package");

const docSideBar = function() {
  return [
    {
      title: "Guide",
      collapsable: false,
      children: [
        "/docs/",
        "/docs/getting-started",
        "/docs/adding-upm-package",
        "/docs/modifying-upm-package"
      ]
    },
    {
      title: "Package Creator Guide",
      collapsable: false,
      children: ["/docs/adding-badge"]
    },
    {
      title: "Resources",
      collapsable: false,
      children: [
        "/support/",
        "/docs/team",
        "/docs/terms",
        "/docs/code-of-conduct",
        "/docs/privacy"
      ]
    }
  ];
};

module.exports = {
  title: "OpenUPM",
  description: description,
  head: [
    ["meta", { name: "theme-color", content: "#3068E5" }],
    ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
    [
      "meta",
      { name: "apple-mobile-web-app-status-bar-style", content: "black" }
    ],
    [
      "link",
      { rel: "stylesheet", href: "https://use.typekit.net/uwx2pxu.css" }
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://use.fontawesome.com/releases/v5.11.2/css/all.css"
      }
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href:
          "https://cdn.jsdelivr.net/npm/cookieconsent@3.1.1/build/cookieconsent.min.css"
      }
    ],
    ["link", { rel: "icon", href: `/images/openupm-icon-256.png` }],
    ["link", { rel: "manifest", href: "/manifest.json" }],
    ["meta", { name: "theme-color", content: "#3068E5" }],
    ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
    [
      "meta",
      { name: "apple-mobile-web-app-status-bar-style", content: "black" }
    ],
    ["link", { rel: "apple-touch-icon", href: `/images/openupm-icon-256.png` }],
    [
      "link",
      {
        rel: "mask-icon",
        href: "/images/openupm-icon-mask.svg",
        color: "#3068E5"
      }
    ],
    [
      "meta",
      {
        name: "msapplication-TileImage",
        content: "/images/openupm-icon-256.png"
      }
    ],
    ["meta", { name: "msapplication-TileColor", content: "#000000" }]
  ],
  themeConfig: {
    domain: "https://openupm.com",
    repo: "https://github.com/openupm/openupm",
    editLinks: true,
    docsDir: "docs",
    lastUpdated: true,
    smoothScroll: true,
    logo: "/images/openupm-icon-128.png",
    nav: [
      {
        text: "Packages",
        link: "/packages/"
      },
      {
        text: "Docs",
        link: "/docs/"
      },
      {
        text: "Support OpenUPM",
        link: "/support/"
      },
      {
        text: "Blog",
        link: "https://www.patreon.com/openupm/posts"
      },
      {
        text: "CLI",
        link: "https://github.com/openupm/openupm-cli#openupm-cli"
      }
    ],
    sidebar: {
      "/docs/": docSideBar(),
      "/support/": docSideBar()
    }
  },
  /**
   * Apply plugins，ref：https://v1.vuepress.vuejs.org/zh/plugin/
   */
  plugins: [
    "@vuepress/plugin-back-to-top",
    // ["@vuepress/pwa", { serviceWorker: true, updatePopup: true }],
    "@vuepress/plugin-medium-zoom",
    "vuepress-plugin-table-of-contents",
    "flowchart",
    require("./plugins/openupm-packages"),
    ["@vuepress/google-analytics", { ga: "UA-154679622-1" }],
    ["vuepress-plugin-sitemap", { hostname: "https://openupm.com" }],
    [
      "vuepress-plugin-seo",
      {
        image: ($page, $site) => {
          if ($page.frontmatter.image)
            return ($site.themeConfig.domain || "") + $page.frontmatter.image;
          else
            return (
              ($site.themeConfig.domain || "") + "/images/openupm-twitter.png"
            );
        },
        type: $page =>
          ["docs"].some(folder => $page.regularPath.startsWith("/" + folder))
            ? "article"
            : "website"
      }
    ]
  ],
  // eslint-disable-next-line no-unused-vars
  chainWebpack: (config, isServer) => {
    config.module
      .rule("yaml")
      .test(/\.ya?ml$/)
      .use("js-yaml-loader")
      .loader("js-yaml-loader");
  },
  alias: {
    "@root": path.resolve(__dirname, "../../")
  }
};
