import assert from 'node:assert/strict'
import { access, copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildRuntimeManifest, RUNTIME_FILES } from '../tools/runtime/manifest.mjs'

test('S3 runtime exposes local storage, capability detection, worker tasks and static fallback', async () => {
  const runtime = await readFile('source/js/local-runtime.js', 'utf8')
  const page = await readFile('src/pages/lab/index.astro', 'utf8')
  const worker = await readFile('source/js/local-runtime-worker.js', 'utf8')
  const serviceWorker = await readFile('source/js/local-runtime-sw.js', 'utf8')

  assert.match(runtime, /indexedDB/)
  assert.match(runtime, /getDirectory/)
  assert.match(runtime, /new Worker/)
  assert.match(runtime, /signal\?\.aborted/)
  assert.match(runtime, /MAX_TASK_BYTES/)
  assert.match(runtime, /registerRuntimeServiceWorker/)
  assert.match(worker, /format-json/)
  assert.match(worker, /state-step/)
  assert.match(worker, /type: 'progress'/)
  assert.match(serviceWorker, /manifest\.json/)
  assert.match(runtime, /register\('\/local-runtime-sw\.js'/)
  assert.match(page, /拖入 JSON 文件/)
  assert.match(page, /改用主线程/)
  assert.match(page, /主线程重试/)
  assert.match(page, /下载结果/)
  assert.match(page, /导出状态/)
  assert.match(page, /AbortController/)
  assert.match(page, /<noscript>/)
})

test('runtime manifest records integrity metadata and offline precache entries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 's3-runtime-'))
  const targetRoot = path.join(root, '.astro-static')
  for (const relativeFile of RUNTIME_FILES) {
    const source = path.join(process.cwd(), 'source', relativeFile)
    const targetFile = relativeFile === 'js/local-runtime-sw.js' ? 'local-runtime-sw.js' : relativeFile
    const target = path.join(targetRoot, targetFile)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
  }

  const manifest = await buildRuntimeManifest({ targetRoot })
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.entries.length, RUNTIME_FILES.length)
  assert.ok(manifest.entries.every((entry) => /^sha256-[a-f0-9]{64}$/.test(entry.integrity)))
  assert.ok(manifest.entries.some((entry) => entry.url === '/local-runtime-sw.js'))
  assert.ok(manifest.precache.includes('/lab/'))
  await access(path.join(targetRoot, 'runtime', 'manifest.json'))
})
