import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listPostMarkdownFiles, parsePostMarkdown, savePostMarkdown, slugifyPostFilename } from './core.mjs'

export const DEFAULT_WRITER_HOST = '127.0.0.1'
const DEFAULT_WRITER_PORT = 4126

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DAT Blog Writer</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 18px 48px; }
    h1 { margin: 0 0 20px; font-size: 24px; }
    label { display: block; margin: 16px 0 6px; font-weight: 650; }
    input, textarea, button { box-sizing: border-box; font: inherit; }
    input[type="text"], textarea { width: 100%; border: 1px solid color-mix(in srgb, CanvasText 28%, Canvas); border-radius: 6px; padding: 10px; background: Canvas; color: CanvasText; }
    textarea { min-height: 340px; resize: vertical; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: #0f766e; color: white; cursor: pointer; }
    button.secondary { background: #475569; }
    output { display: block; margin-top: 14px; min-height: 22px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>DAT Blog Writer</h1>
    <label for="file">Markdown</label>
    <input id="file" type="file" accept=".md,text/markdown,text/plain">
    <label for="filename">Filename</label>
    <input id="filename" type="text" placeholder="post-title.md">
    <label for="markdown">Content</label>
    <textarea id="markdown" spellcheck="false"></textarea>
    <div class="row">
      <button id="validate">Validate</button>
      <button id="save" class="secondary">Save</button>
      <label><input id="overwrite" type="checkbox"> overwrite</label>
    </div>
    <output id="status"></output>
    <ul id="posts"></ul>
  </main>
  <script>
    const file = document.querySelector('#file');
    const filename = document.querySelector('#filename');
    const markdown = document.querySelector('#markdown');
    const status = document.querySelector('#status');
    file.addEventListener('change', async () => {
      const selected = file.files[0];
      if (!selected) return;
      filename.value = selected.name;
      markdown.value = await selected.text();
    });
    async function call(endpoint) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: filename.value,
          markdown: markdown.value,
          overwrite: document.querySelector('#overwrite').checked
        })
      });
      const payload = await response.json();
      status.value = JSON.stringify(payload, null, 2);
    }
    document.querySelector('#validate').addEventListener('click', () => call('/api/validate'));
    document.querySelector('#save').addEventListener('click', () => call('/api/save'));
    fetch('/api/posts').then((response) => response.json()).then((payload) => {
      const posts = document.querySelector('#posts');
      posts.textContent = '';
      for (const post of payload.posts || []) {
        const item = document.createElement('li');
        item.textContent = post.date + ' ' + post.title + ' (' + post.filename + ')';
        posts.appendChild(item);
      }
    }).catch(() => {});
  </script>
</body>
</html>`

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
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

export function createWriterServer({
  host = DEFAULT_WRITER_HOST,
  postsDir = path.resolve('source', '_posts')
} = {}) {
  assertLocalHost(host)

  return {
    async fetch(request) {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/') {
        return new Response(HTML, {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        })
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
