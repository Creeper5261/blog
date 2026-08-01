import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPicbedPublishPlan, stageAsset } from '../blog-ops/assets.mjs'
import { createPostMarkdown, listTaxonomy } from '../blog-ops/posts.mjs'
import { createPublishPlan } from '../blog-ops/publish.mjs'
import { listPostMarkdownFiles, parsePostMarkdown, savePostMarkdown, slugifyPostFilename } from './core.mjs'

export const DEFAULT_WRITER_HOST = '127.0.0.1'
const DEFAULT_WRITER_PORT = 4126

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DAT Blog Writer</title>
  <link rel="stylesheet" href="/vendor/cherry/cherry-markdown.css">
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --line: color-mix(in srgb, CanvasText 14%, Canvas); --muted: color-mix(in srgb, CanvasText 62%, Canvas); --accent: #0f766e; --panel: color-mix(in srgb, Canvas 97%, CanvasText); --surface: color-mix(in srgb, Canvas 99%, CanvasText); }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; background: Canvas; color: CanvasText; }
    .writer-shell { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: 100vh; min-width: 0; background: Canvas; }
    .writer-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-bottom: 1px solid var(--line); padding: 8px 12px; background: var(--surface); }
    .writer-brand { display: flex; align-items: baseline; gap: 10px; min-width: 0; white-space: nowrap; }
    .writer-brand strong { font-size: 15px; }
    .writer-brand span, .muted { color: var(--muted); }
    .writer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .editor-stage { min-height: 0; overflow: hidden; background: Canvas; }
    .writer-status { display: flex; align-items: center; min-height: 34px; border-top: 1px solid var(--line); background: var(--surface); }
    h2 { margin: 0; font-size: 18px; line-height: 1.35; }
    h3 { margin: 18px 0 8px; font-size: 14px; line-height: 1.35; }
    label { display: block; margin: 12px 0 6px; font-weight: 650; font-size: 13px; }
    input, button { font: inherit; }
    input[type="text"], input[type="datetime-local"] { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px; background: Canvas; color: CanvasText; }
    button { border: 1px solid var(--line); border-radius: 6px; padding: 8px 11px; background: Canvas; color: CanvasText; cursor: pointer; }
    button.primary { border-color: var(--accent); background: var(--accent); color: white; }
    button.secondary { border-color: #475569; background: #475569; color: white; }
    button.ghost { background: transparent; color: CanvasText; }
    button:disabled { opacity: .55; cursor: wait; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; color: var(--muted); font-size: 12px; }
    .dropzone { border: 1px dashed color-mix(in srgb, var(--accent) 65%, CanvasText); border-radius: 8px; padding: 14px; text-align: center; color: var(--muted); }
    .dropzone.active { background: color-mix(in srgb, var(--accent) 12%, Canvas); }
    #markdownEditor { height: 100%; min-height: 0; }
    output, pre { display: block; min-height: 22px; white-space: pre-wrap; overflow: auto; }
    output { width: 100%; min-height: 0; padding: 7px 12px; overflow: hidden; color: var(--muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    pre { margin: 8px 0 0; border: 1px solid var(--line); border-radius: 6px; padding: 10px; max-height: 180px; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 4px 0; color: var(--muted); }
    .cherry { height: 100%; }
    dialog { width: min(760px, calc(100vw - 28px)); max-height: min(820px, calc(100vh - 28px)); border: 1px solid var(--line); border-radius: 8px; padding: 0; background: var(--panel); color: CanvasText; }
    dialog::backdrop { background: rgb(0 0 0 / .34); }
    .dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: inherit; }
    .dialog-head, .dialog-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
    .dialog-head { border-bottom: 1px solid var(--line); }
    .dialog-foot { border-top: 1px solid var(--line); }
    .dialog-body { overflow: auto; padding: 14px 16px 18px; }
    .check-row label { display: inline-flex; align-items: center; gap: 6px; margin: 0; }
    @media (max-width: 680px) {
      body { overflow: hidden; }
      .writer-topbar { align-items: flex-start; flex-direction: column; }
      .writer-actions { justify-content: flex-start; }
      .split { grid-template-columns: 1fr; }
      output { white-space: normal; }
    }
  </style>
</head>
<body>
  <main class="writer-shell">
    <header class="writer-topbar">
      <div class="writer-brand">
        <strong>DAT Blog Writer</strong>
        <span>Cherry Markdown</span>
      </div>
      <nav class="writer-actions" aria-label="写作操作">
        <button id="openPostMetaDialog" type="button">文章</button>
        <button id="validate" class="ghost" type="button">校验</button>
        <button id="save" class="secondary" type="button">保存</button>
        <button id="openPostsDialog" type="button">列表</button>
        <button id="openOpsDialog" type="button">图片/发布</button>
      </nav>
    </header>

    <section class="editor-stage" aria-label="Markdown 编辑器">
      <div id="markdownEditor"></div>
    </section>

    <footer class="writer-status">
      <output id="status"></output>
    </footer>
  </main>

  <dialog id="postMetaDialog">
    <div class="dialog-shell">
      <header class="dialog-head">
        <div>
          <h2>文章信息</h2>
          <div class="muted">用于生成 front-matter 和保存文件名。</div>
        </div>
        <button class="ghost close-dialog" type="button" data-close-dialog="postMetaDialog">关闭</button>
      </header>
      <div class="dialog-body">
        <label for="title">标题</label>
        <input id="title" type="text" placeholder="文章标题">
        <div class="split">
          <div>
            <label for="date">发布时间</label>
            <input id="date" type="datetime-local">
          </div>
          <div>
            <label for="filename">文件名</label>
            <input id="filename" type="text" placeholder="post-title.md">
          </div>
        </div>
        <label for="description">摘要</label>
        <input id="description" type="text" placeholder="一句话摘要">
        <label for="cover">封面</label>
        <input id="cover" type="text" placeholder="picbed cover path">
        <div class="split">
          <div>
            <label for="categories">分类</label>
            <input id="categories" type="text" placeholder="博客, 工程">
          </div>
          <div>
            <label for="tags">标签</label>
            <input id="tags" type="text" placeholder="writer, notes">
          </div>
        </div>
        <div class="row check-row">
          <label><input id="comments" type="checkbox" checked> 评论</label>
          <label><input id="mathjax" type="checkbox"> 公式</label>
          <label><input id="toc" type="checkbox" checked> 目录</label>
          <label><input id="overwrite" type="checkbox"> 覆盖保存</label>
        </div>
      </div>
      <footer class="dialog-foot">
        <span class="muted">模板会替换当前编辑器内容。</span>
        <button id="template" class="primary" type="button">生成模板</button>
      </footer>
    </div>
  </dialog>

  <dialog id="postsDialog">
    <div class="dialog-shell">
      <header class="dialog-head">
        <div>
          <h2>文章和分类</h2>
          <div class="muted">查看已有文章、分类和标签。</div>
        </div>
        <button class="ghost close-dialog" type="button" data-close-dialog="postsDialog">关闭</button>
      </header>
      <div class="dialog-body">
        <h3>分类和标签</h3>
        <div id="taxonomy" class="chips"></div>
        <h3>已有文章</h3>
        <ul id="posts"></ul>
      </div>
      <footer class="dialog-foot">
        <button id="reloadLists" type="button">刷新</button>
      </footer>
    </div>
  </dialog>

  <dialog id="opsDialog">
    <div class="dialog-shell">
      <header class="dialog-head">
        <div>
          <h2>图片和发布</h2>
          <div class="muted">拖放图片、导入 Markdown，并生成后续命令。</div>
        </div>
        <button class="ghost close-dialog" type="button" data-close-dialog="opsDialog">关闭</button>
      </header>
      <div class="dialog-body">
        <h3>导入和图片</h3>
        <input id="file" type="file" accept=".md,text/markdown,text/plain,image/*" multiple>
        <div id="dropzone" class="dropzone">拖入图片，或用编辑器图片按钮/粘贴上传</div>
        <ul id="assets"></ul>
        <h3>Picbed</h3>
        <label for="picbedCheckout">Picbed 本地仓库</label>
        <input id="picbedCheckout" type="text" placeholder="D:/Projects/picbed">
        <div class="row">
          <button id="assetPublishPlan" type="button">生成图片上传命令</button>
          <button id="publishPlan" type="button">生成博客发布命令</button>
        </div>
        <pre id="commands"></pre>
      </div>
    </div>
  </dialog>

  <script src="/vendor/cherry/cherry-markdown.js"></script>
  <script src="/writer-client.js"></script>
</body>
</html>`

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

function text(data, contentType) {
  return new Response(data, {
    headers: { 'content-type': contentType }
  })
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function assertLocalHost(host) {
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('writer server is local-only; bind to 127.0.0.1 or localhost')
  }
}

function cherryDistFile(rootDir, ...segments) {
  return path.resolve(rootDir, 'node_modules', 'cherry-markdown', 'dist', ...segments)
}

async function serveFile(file, contentType) {
  return text(await readFile(file, 'utf8'), contentType)
}

async function serveBinaryFile(file, contentType) {
  return new Response(await readFile(file), {
    headers: { 'content-type': contentType }
  })
}

function fontContentType(filename) {
  if (filename.endsWith('.woff2')) return 'font/woff2'
  if (filename.endsWith('.woff')) return 'font/woff'
  if (filename.endsWith('.ttf')) return 'font/ttf'
  if (filename.endsWith('.eot')) return 'application/vnd.ms-fontobject'
  if (filename.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

export function createWriterServer({
  host = DEFAULT_WRITER_HOST,
  postsDir = path.resolve('source', '_posts'),
  assetsDir = path.resolve('.local', 'writer-assets'),
  rootDir = process.cwd()
} = {}) {
  assertLocalHost(host)

  return {
    async fetch(request) {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/') {
        return text(HTML, 'text/html; charset=utf-8')
      }

      if (request.method === 'GET' && url.pathname === '/writer-client.js') {
        return serveFile(new URL('./client.js', import.meta.url), 'text/javascript; charset=utf-8')
      }

      if (request.method === 'GET' && url.pathname === '/vendor/cherry/cherry-markdown.css') {
        return serveFile(cherryDistFile(rootDir, 'cherry-markdown.css'), 'text/css; charset=utf-8')
      }

      if (request.method === 'GET' && url.pathname === '/vendor/cherry/cherry-markdown.js') {
        return serveFile(cherryDistFile(rootDir, 'cherry-markdown.core.js'), 'text/javascript; charset=utf-8')
      }

      if (request.method === 'GET' && url.pathname.startsWith('/vendor/cherry/fonts/')) {
        const filename = path.basename(url.pathname)
        if (filename !== decodeURIComponent(url.pathname.split('/').pop() || '')) {
          return new Response('not found', { status: 404 })
        }
        return serveBinaryFile(cherryDistFile(rootDir, 'fonts', filename), fontContentType(filename))
      }

      if (request.method === 'POST' && url.pathname === '/api/validate') {
        try {
          const body = await readJson(request)
          const parsed = parsePostMarkdown(String(body.markdown || ''))
          return json({
            ok: true,
            filename: slugifyPostFilename(String(body.filename || parsed.title)),
            title: parsed.title,
            date: parsed.date
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/posts') {
        try {
          return json({
            ok: true,
            posts: await listPostMarkdownFiles({ postsDir })
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/taxonomy') {
        try {
          return json({
            ok: true,
            ...await listTaxonomy({ postsDir })
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/template') {
        try {
          const body = await readJson(request)
          const markdown = createPostMarkdown({
            title: String(body.title || ''),
            date: String(body.date || ''),
            updated: body.updated ? String(body.updated) : undefined,
            description: body.description ? String(body.description) : undefined,
            cover: body.cover ? String(body.cover) : undefined,
            permalink: body.permalink ? String(body.permalink) : undefined,
            comments: body.comments !== false,
            mathjax: Boolean(body.mathjax),
            toc: body.toc !== false,
            categories: Array.isArray(body.categories) ? body.categories : [],
            tags: Array.isArray(body.tags) ? body.tags : [],
            body: body.body ? String(body.body) : '# 正文\n\n从这里开始写。'
          })
          const parsed = parsePostMarkdown(markdown)
          return json({
            ok: true,
            filename: slugifyPostFilename(String(body.filename || parsed.title)),
            markdown
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/assets/stage') {
        try {
          const body = await readJson(request)
          return json({
            ok: true,
            ...await stageAsset({
              assetsDir,
              dataUrl: String(body.dataUrl || ''),
              originalName: String(body.originalName || 'image.png'),
              imageName: String(body.imageName || ''),
              postFilename: String(body.postFilename || body.filename || 'draft.md'),
              categories: Array.isArray(body.categories) ? body.categories : [],
              sequence: Number(body.sequence || 1),
              now: body.now ? new Date(String(body.now)) : new Date()
            })
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/assets/publish-plan') {
        try {
          const body = await readJson(request)
          const plan = createPicbedPublishPlan({
            picbedCheckout: String(body.picbedCheckout || process.env.PICBED_REPO_CHECKOUT || ''),
            message: String(body.message || 'chore: add blog assets')
          })
          return json(plan, plan.ok ? 200 : 400)
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/publish-plan') {
        try {
          const body = await readJson(request)
          return json({
            ok: true,
            commands: createPublishPlan({ message: String(body.message || 'post: update blog') })
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/save') {
        try {
          const body = await readJson(request)
          return json({
            ok: true,
            ...await savePostMarkdown({
              postsDir,
              filename: String(body.filename || ''),
              markdown: String(body.markdown || ''),
              overwrite: Boolean(body.overwrite)
            })
          })
        } catch (error) {
          return json({ ok: false, error: error.message }, 400)
        }
      }

      return new Response('not found', { status: 404 })
    }
  }
}

export function listenWriterServer({
  host = process.env.WRITER_HOST || DEFAULT_WRITER_HOST,
  port = Number(process.env.WRITER_PORT || DEFAULT_WRITER_PORT),
  postsDir = process.env.WRITER_POSTS_DIR || path.resolve('source', '_posts')
} = {}) {
  const app = createWriterServer({ host, postsDir })
  const server = createServer(async (request, response) => {
    const origin = `http://${request.headers.host || `${host}:${port}`}`
    const webResponse = await app.fetch(new Request(new URL(request.url || '/', origin), {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
      duplex: 'half'
    }))

    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()))
    response.end(Buffer.from(await webResponse.arrayBuffer()))
  })
  server.listen(port, host, () => {
    console.log(`DAT Blog Writer listening at http://${host}:${port}`)
  })
  return server
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) listenWriterServer()
