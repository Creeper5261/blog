# Astro Rewrite Design

## Goal

以当前恢复版 Hexo/Butterfly 输出为视觉黄金样本，直接切换到底层更现代的 Astro 静态站构建链路。第一版验收目标不是重新设计界面，而是在本地和构建产物中尽量保持现有视觉、路由、脚本效果和静态资源路径不变。

## Non-Goals

- 不在第一版重新设计首页、文章页、侧边栏、页脚、右键菜单或动效。
- 不在第一版重写所有页面为手写 Astro 组件。
- 不把真实 app key、服务端 token、私有 endpoint 或平台状态文件提交到仓库。

## Architecture

新版默认构建链路使用 Astro。当前 Hexo 生成出的 HTML 页面会进入 `src/legacy/pages/`，作为 Astro 兼容层的页面源。Astro 的 catch-all 静态端点读取这些 HTML，按原路径输出页面，从而最大限度保持 DOM、CSS class、脚本挂载点和视觉效果不变。

静态资源不再依赖 Hexo 生成目录。构建前由 `tools/prepare-astro-assets.mjs` 从已恢复的 `source/css`、`source/js`、`source/img`、`source/font`、`source/lib`、`source/live2dw`、`source/temp_classify` 复制到被忽略的 `.astro-static/`，Astro 将它作为 `publicDir` 输出。APK 等与视觉无关的大文件默认不进入新版产物。

服务配置统一通过 `src/config/services.mjs` 读取环境变量。仓库只提交 `.env.example` 和无密钥默认值。页面和复制出的客户端脚本在 Astro 输出阶段按环境变量注入公开浏览器配置，真实值来自本地 `.env`、Vercel Environment Variables 或其他部署平台的安全配置。

## Secret Policy

`.env`、`.env.*`、`.vercel/`、`.netlify/`、`.wrangler/`、`secrets/`、私钥和证书文件都必须被忽略。仓库内允许出现的只有变量名、说明和空默认值。

公开浏览器 key 也从源文件移除，统一放入环境变量。它们可能最终出现在浏览器产物中，但不能硬编码在 Git 源码里。需要管理的首批配置如下：

- `PUBLIC_SITE_URL`
- `PUBLIC_ALGOLIA_APP_ID`
- `PUBLIC_ALGOLIA_SEARCH_KEY`
- `PUBLIC_ALGOLIA_INDEX_NAME`
- `PUBLIC_TWIKOO_ENV_ID`
- `PUBLIC_TENCENT_MAP_KEY`
- `PUBLIC_QWEATHER_KEY`
- `PUBLIC_GAUD_MAP_KEY`
- `PUBLIC_BAIDU_MAP_AK`

## Compatibility Strategy

第一版以输出兼容为主。所有 HTML 页面从 Hexo 黄金样本迁入 `src/legacy/pages/`，Astro 根据路径生成同名静态页面。后续可以逐步把这些页面拆成真正的 Astro layout、content collections 和交互组件，但每次拆分都必须用当前黄金样本做视觉回归。

这种做法有三个好处：

- 立即摆脱默认 Hexo 构建链路，部署更简单。
- 保留当前你喜欢的视觉和动效，不发生一次性大改版。
- 为后续组件化留出安全通道，先稳住，再精修。

## Verification

完成标准：

- `pnpm run test` 通过，覆盖路由映射、HTML 配置脱敏和资源准备逻辑。
- `pnpm run build` 使用 Astro 成功生成 `dist/`。
- `dist/` 包含当前黄金样本的 48 个 HTML 页面。
- 源码扫描不再发现旧的硬编码 Algolia、Twikoo、Tencent Map、QWeather、Gaode/Baidu key。
- 本地 Astro 服务可访问首页、文章页、关于页、留言页和 404。
- 对比当前 Hexo 本地页与 Astro 本地页，首屏布局、侧边栏、导航、页脚和主要动效挂载点几乎不变。

## Rollback

`main` 分支保留可运行的恢复版 Hexo 源码。`feature/astro-rewrite` 如果需要回退，可以直接切回 `main` 并使用 `pnpm run server` 启动旧站。
