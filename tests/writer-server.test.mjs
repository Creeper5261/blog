import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { DEFAULT_WRITER_HOST, createWriterServer } from '../tools/writer/server.mjs'

test('writer server defaults to localhost only', () => {
  assert.equal(DEFAULT_WRITER_HOST, '127.0.0.1')
})

test('writer server rejects non-local hosts', () => {
  assert.throws(() => createWriterServer({ host: '0.0.0.0' }), /local-only/)
})

test('writer server serves a lightweight upload page', async () => {
  const server = createWriterServer()
  const response = await server.fetch(new Request('http://127.0.0.1:4126/'))
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.match(html, /DAT Blog Writer/)
  assert.match(html, /class="writer-shell"/)
  assert.match(html, /id="postMetaDialog"/)
  assert.match(html, /id="postsDialog"/)
  assert.match(html, /id="opsDialog"/)
  assert.match(html, /id="markdownEditor"/)
  assert.match(html, /\/vendor\/cherry\/cherry-markdown\.css/)
  assert.match(html, /\/vendor\/cherry\/cherry-markdown\.js/)
  assert.match(html, /\/writer-client\.js/)
  assert.doesNotMatch(html, /<aside/)
  assert.doesNotMatch(html, /<textarea id="markdown"/)
  assert.doesNotMatch(html, /cdn\.|http:\/\/|https:\/\//)
})

test('writer server serves local Cherry Markdown assets', async () => {
  const server = createWriterServer()
  const css = await server.fetch(new Request('http://127.0.0.1:4126/vendor/cherry/cherry-markdown.css'))
  const js = await server.fetch(new Request('http://127.0.0.1:4126/vendor/cherry/cherry-markdown.js'))

  assert.equal(css.status, 200)
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8')
  assert.match(await css.text(), /cherry/)

  assert.equal(js.status, 200)
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.match(await js.text(), /Cherry/)
})

test('writer server serves the Cherry integration client script', async () => {
  const server = createWriterServer()
  const response = await server.fetch(new Request('http://127.0.0.1:4126/writer-client.js'))
  const script = await response.text()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.match(script, /new Cherry/)
  assert.match(script, /\/api\/assets\/stage/)
  assert.match(script, /\/api\/save/)
})

test('writer server validates markdown without writing it', async () => {
  const server = createWriterServer()
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/validate', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'post.md',
      markdown: '---\ntitle: x\ndate: 2026-06-19\n---\nbody'
    })
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    filename: 'post.md',
    title: 'x',
    date: '2026-06-19'
  })
})

test('writer server lists existing posts for lightweight management', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'writer-server-list-'))
  const postsDir = path.join(root, 'source', '_posts')
  await mkdir(postsDir, { recursive: true })
  await writeFile(path.join(postsDir, 'post.md'), '---\ntitle: x\ndate: 2026-06-19\n---\nbody')

  const server = createWriterServer({ postsDir })
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/posts'))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    posts: [{ filename: 'post.md', title: 'x', date: '2026-06-19' }]
  })
})

test('writer server exposes taxonomy for visual post classification', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'writer-server-taxonomy-'))
  const postsDir = path.join(root, 'source', '_posts')
  await mkdir(postsDir, { recursive: true })
  await writeFile(path.join(postsDir, 'post.md'), `---
title: x
date: 2026-06-19
categories:
  - 博客
tags:
  - writer
---
body`)

  const server = createWriterServer({ postsDir })
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/taxonomy'))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    categories: [{ name: '博客', count: 1 }],
    tags: [{ name: 'writer', count: 1 }]
  })
})

test('writer server creates a post template from visual metadata', async () => {
  const server = createWriterServer()
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/template', {
    method: 'POST',
    body: JSON.stringify({
      title: '可视化写作',
      date: '2026-06-19T20:30:00+08:00',
      categories: ['博客'],
      tags: ['writer']
    })
  }))

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.match(payload.markdown, /title: '可视化写作'/)
  assert.match(payload.markdown, /categories:\n  - '博客'/)
})

test('writer server stages pasted images into a local cache', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'writer-server-assets-'))
  const assetsDir = path.join(root, 'assets')
  const server = createWriterServer({ assetsDir })
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/assets/stage', {
    method: 'POST',
    body: JSON.stringify({
      dataUrl: 'data:image/png;base64,aW1n',
      originalName: 'paste.png',
      imageName: '截图',
      postFilename: '可视化写作.md',
      categories: ['博客'],
      sequence: 1,
      now: '2026-06-19T12:34:56Z'
    })
  }))

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.relativePath, 'img/posts/博客/可视化写作/截图.png')
  assert.equal(payload.markdown, '![截图](https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/posts/博客/可视化写作/截图.png)')
  assert.equal(await readFile(path.join(assetsDir, payload.relativePath), 'utf8'), 'img')
})

test('writer server returns a publish command plan without executing it', async () => {
  const server = createWriterServer()
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/publish-plan', {
    method: 'POST',
    body: JSON.stringify({ message: 'post: add 可视化写作' })
  }))

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.commands.map((command) => command.command), [
    'pnpm run legacy:build',
    'pnpm run recovery:prepare-legacy-pages',
    'pnpm run check',
    'pnpm run build',
    'git status --short',
    'git add source/_posts src/legacy/pages',
    'git commit -m "post: add 可视化写作"',
    'git push origin main'
  ])
})

test('writer server returns a picbed upload command plan', async () => {
  const server = createWriterServer()
  const response = await server.fetch(new Request('http://127.0.0.1:4126/api/assets/publish-plan', {
    method: 'POST',
    body: JSON.stringify({
      picbedCheckout: 'D:/Projects/picbed',
      message: 'chore: add blog assets'
    })
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    checkout: 'D:/Projects/picbed',
    commands: [
      'git -C "D:/Projects/picbed" add img/posts',
      'git -C "D:/Projects/picbed" commit -m "chore: add blog assets"',
      'git -C "D:/Projects/picbed" push origin main'
    ]
  })
})
