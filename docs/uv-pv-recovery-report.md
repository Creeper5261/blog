# UV/PV 历史数据恢复调查报告

调查时间：2026-06-19  
目标：尽最大可能从 Vercel 历史部署快照、构建产物、日志、公开静态站点和本地恢复源码中寻找可恢复的 UV/PV 历史数据或证据，并区分可恢复数据、可估算数据和仍需外部服务方的数据。

## 结论摘要

截至本次调查，未在 Vercel 历史部署快照、公开生成仓库历史、本地恢复源码、公开归档入口中找到可直接恢复的历史 Busuanzi UV/PV 数字。

这不是因为 Vercel 历史部署不存在。Vercel Dashboard 仍能打开 2023-11-06 的老部署 `9fahxtugedkcZtkNs4SyxJX9Pscs`，并能查看当时的 Source、Resources 和部署详情。但这些快照保存的是静态生成产物：HTML 中只有 Busuanzi 运行时占位 DOM 和加载脚本，没有第三方服务返回后的计数值。

精确历史 UV/PV 的唯一强数据源仍然是 Busuanzi 后端以站点域名、referer/path 或类似键保存的计数数据库；当前没有找到从 Vercel 或 GitHub 侧导出该数据库的入口。Vercel Web Analytics 在项目页显示未启用，Usage 页当前窗口也显示 Web Analytics Events 为 0，因此 Vercel Web Analytics 不是这个历史 UV/PV 的来源。

## 已确认的数据源

### 1. 本地恢复源码

恢复源码中 Butterfly 配置启用了 Busuanzi：

```yaml
busuanzi:
  site_uv: true
  site_pv: true
  page_pv: true
```

同时未配置其它主流分析服务：

```yaml
baidu_analytics:
google_analytics:
cloudflare_analytics:
microsoft_clarity:
```

这说明旧站点的站点访客数、站点访问量和页面访问量主要依赖 Busuanzi 前端脚本运行时填充。

### 2. 公开生成仓库历史

对 `Creeper5261/Creeper5261.github.io` 的本地完整历史执行了全量搜索，未发现 Busuanzi 占位元素附近存在静态数字：

```text
NO_BUSUANZI_NUMERIC_NEAR_PLACEHOLDER_IN_ALL_HISTORY
```

搜索范围覆盖所有 Git 历史提交中的 `*.html`，包括 2023 年旧站点生成提交，例如：

- `bafbdc3`：Site updated: 2023-11-06 20:54:03
- `595dc86`：Site updated: 2023-11-05 22:14:38
- `26b6ec5`：Site updated: 2023-11-05 22:08:24
- 更早的 2023-05 至 2023-10 提交

旧 HTML 中的典型内容是：

```html
<div class="item-count" id="busuanzi_value_site_uv"><i class="fa-solid fa-spinner fa-spin"></i></div>
<div class="item-count" id="busuanzi_value_site_pv"><i class="fa-solid fa-spinner fa-spin"></i></div>
```

也就是说，生成产物只保存了加载前状态，不保存 Busuanzi 返回后的数字。

### 3. Vercel 历史部署快照

Vercel Dashboard 仍能列出旧部署，2023-11-06 部署信息如下：

- Deployment ID：`9fahxtugedkcZtkNs4SyxJX9Pscs`
- Created：2023-11-06
- Commit：`bafbdc3c694fd5a79369fa9ee9c5cdef96145129`
- Alias：`creeper5261-github-dgip3vfga-godboyfeng-gmailcom.vercel.app`
- 状态：Ready / Stale

部署 Source 页面显示该快照来自公开生成仓库的对应 commit，并提供 “View file on github” 到 `bafbdc3` 的 `index.html`。这说明 Vercel Source 视图里的内容与公开生成仓库静态产物一致，不是丢失的 Hexo 源码，也不是第三方计数数据库。

部署 Resources 页面显示：

- Static Assets：126
- 资源类型主要为 HTML、CSS、JS、图片等静态文件
- 页面条目链接到 `source?f=out/...`

未发现包含历史 UV/PV 的 JSON、日志数据库或服务端状态文件。

### 4. Vercel Runtime Logs / Observability

旧部署专属 Logs 页面实际显示：

```text
There are no runtime logs in this time range
```

并且时间控件仍是最近 30 分钟窗口。项目级 Logs 尝试带 2023 的 since/until 参数后，Dashboard 仍展示当前时间附近日志。

Vercel 官方 Runtime Logs 文档说明当前保留期为：

- Hobby：1 hour of logs
- Pro：1 day of logs
- Pro with Observability Plus：30 days of logs
- Enterprise：3 days of logs
- Enterprise with Observability Plus：30 days of logs

因此，即使把静态站访问请求当作可估算 PV 的日志来源，当前 Hobby/当前 Dashboard 可见日志也不足以回溯到 2023 年。

### 5. Vercel Web Analytics / Usage

项目 Analytics 页面显示：

- `Enable` 按钮
- `Demo Data`
- Web Analytics 说明卡片，而非真实项目数据

这说明当前项目没有启用可用的 Vercel Web Analytics 历史数据。

Usage 页面当前窗口为 `May 20, 2:00 - Jun 19`，能看到近 30 天账单用量，例如：

- Edge Requests：3.3K / 1M
- Web Analytics Events：0 / 50K

这类账单用量可以给近期待宽或请求量提供粗粒度参考，但不能恢复 2023 年的 Busuanzi UV/PV，也不能区分唯一访客。

### 6. Busuanzi 服务

旧站点通过以下脚本加载 Busuanzi：

```text
https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js
```

脚本逻辑会请求：

```text
//busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback
```

并把 `site_uv`、`site_pv`、`page_pv` 填入 DOM。

对以下历史/当前域名做过一次性 JSONP 探针，均返回 502 或无法得到计数结果：

- `https://www.godboy.cc/`
- `https://godboy.cc/`
- `https://creeper5261-github-io.vercel.app/`
- `https://creeper5261.github.io/`
- `https://creeper5261.github.io/Creeper5261.github.io/`

为了避免人为增加计数，没有进行循环探测。

### 7. 公开归档

Wayback Availability API 对以下 URL 在 2023-11 附近未返回可用快照：

- `www.godboy.cc`
- `creeper5261-github-io.vercel.app`

CDX 查询多次遇到 Web Archive 侧 502 或 TLS 握手错误。即使归档存在，通常也只会保存静态 HTML；除非归档系统保存了执行 JS 后的截图，并且截图中刚好包含小站数据卡片，否则仍无法精确恢复 UV/PV 数字。

## 可恢复性分级

### 可直接恢复

当前没有找到可直接恢复的历史 UV/PV 数字。

已经可恢复并已掌握的是：

- 旧站点每个部署快照对应的 commit、时间、静态资源列表
- 旧 HTML 中 Busuanzi 占位 DOM 和加载脚本
- 文章发布时间、更新时间、站点字数、文章数、标签数、分类数等静态生成信息

### 可估算

如果未来拿到更完整的 Vercel usage/observability 导出，理论上可以估算 PV 上界：

- Edge Requests 可作为请求量上界
- 排除静态资源请求后，HTML route 请求可作为页面访问近似
- 仍无法可靠去重成 UV
- 缓存命中、爬虫、预取、刷新、图片/CSS/JS 请求都会污染估算

目前 Dashboard 只看到了近 30 天 Usage，不能用于 2023 历史估算。

### 需要外部服务方或额外凭证

以下路径仍有理论可能，但不在当前可直接恢复范围内：

1. Busuanzi 服务方仍保存旧域名计数数据库，并愿意按旧域名或路径导出。
2. 用户本地、浏览器截图、社交平台截图、备份视频中曾拍到过小站数据卡片。
3. 旧 Vercel 团队曾配置过 Log Drain，把访问日志发到第三方日志系统；当前项目未发现 Drain 历史数据。
4. 用户提供显式 Vercel API token 后，可再跑一次 REST/CLI 只读查询确认指标接口返回，但 Dashboard 已显示 Web Analytics 未启用、Runtime Logs 保留期不足，预期不会恢复 2023 UV/PV。

## 建议

1. 保留当前报告和本地恢复证据，不再对 Busuanzi 做频繁探针，避免污染当前计数。
2. 后续新站点不要继续把核心访问数据只放在不可控第三方计数服务中。
3. 如果继续用轻量访客计数，建议同时启用一个可导出的自有或半自有数据源，例如：
   - Vercel Web Analytics，用于页面访问趋势；
   - Umami / Plausible / GoatCounter，自托管或可导出；
   - Cloudflare Web Analytics，如果域名恢复到 Cloudflare；
   - 简单服务端日志落库，只记录匿名化日期、路径、国家/城市、hash 后访客标识。
4. 对公开产物仓库继续保持无私密源码、无 appkey 的策略；统计服务配置放在 Vercel 环境变量或服务端代理中。

## 本次调查用到的关键页面和文档

- Vercel Deployment Overview：`/dats-projects-7cce5d62/creeper5261-github-io/9fahxtugedkcZtkNs4SyxJX9Pscs`
- Vercel Deployment Source：`/dats-projects-7cce5d62/creeper5261-github-io/9fahxtugedkcZtkNs4SyxJX9Pscs/source`
- Vercel Deployment Resources：`/dats-projects-7cce5d62/creeper5261-github-io/9fahxtugedkcZtkNs4SyxJX9Pscs/resources`
- Vercel Deployment Logs：`/dats-projects-7cce5d62/creeper5261-github-io/9fahxtugedkcZtkNs4SyxJX9Pscs/logs`
- Vercel Analytics：`/dats-projects-7cce5d62/creeper5261-github-io/analytics`
- Vercel Usage：`/dats-projects-7cce5d62/creeper5261-github-io/usage`
- Vercel Runtime Logs docs：`https://vercel.com/docs/observability/runtime-logs`
- Vercel Web Analytics docs：`https://vercel.com/docs/analytics`
