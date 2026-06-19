import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
  assert.match(html, /type="file"/)
  assert.doesNotMatch(html, /cdn\.|http:\/\/|https:\/\//)
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
