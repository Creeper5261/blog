import assert from 'node:assert/strict'
import { access, copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildRuntimeManifest, RUNTIME_FILES } from '../tools/runtime/manifest.mjs'

async function importRuntime() {
  const source = await readFile('source/js/local-runtime.js', 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('S3 runtime exposes local storage, capability detection, worker tasks and static fallback', async () => {
  const runtime = await readFile('source/js/local-runtime.js', 'utf8')
  const page = await readFile('src/pages/lab/index.astro', 'utf8')
  const worker = await readFile('source/js/local-runtime-worker.js', 'utf8')
  const serviceWorker = await readFile('source/js/local-runtime-sw.js', 'utf8')

  assert.match(runtime, /indexedDB/)
  assert.match(runtime, /getDirectory/)
  assert.match(runtime, /new Worker/)
  assert.match(runtime, /probe\(/)
  assert.match(runtime, /signal\?\.aborted/)
  assert.match(runtime, /MAX_TASK_BYTES/)
  assert.match(runtime, /registerRuntimeServiceWorker/)
  assert.match(worker, /format-json/)
  assert.match(worker, /state-step/)
  assert.match(worker, /type: 'progress'/)
  assert.match(worker, /type: 'pong'/)
  assert.match(serviceWorker, /manifest\.json/)
  assert.match(serviceWorker, /request\.mode === 'navigate'/)
  assert.match(runtime, /terminateWorker/)
  assert.match(runtime, /scope = '\/lab\/'/)
  assert.match(page, /拖入 JSON 文件/)
  assert.match(page, /改用主线程/)
  assert.match(page, /主线程重试/)
  assert.match(page, /清空并重选小文件/)
  assert.match(page, /addEventListener\('click', \(\) => formatJson\(false\)\)/)
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
    const target = path.join(targetRoot, relativeFile)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
  }

  const manifest = await buildRuntimeManifest({ targetRoot })
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.entries.length, RUNTIME_FILES.length)
  assert.ok(manifest.entries.every((entry) => /^sha256-[A-Za-z0-9+/]{43}=$/.test(entry.integrity)))
  assert.ok(manifest.entries.every((entry) => entry.url.includes(manifest.runtimeVersion)))
  assert.ok(manifest.entries.some((entry) => entry.url === `/local-runtime-sw.${manifest.runtimeVersion}.js`))
  assert.ok(!manifest.precache.includes('/lab/'))
  assert.ok(!manifest.precache.includes('/tools/local-json/'))
  await access(path.join(targetRoot, 'runtime', 'manifest.json'))
})

test('service worker registration allows S4 consumers to use their own scope', async () => {
  const originalNavigator = globalThis.navigator
  const calls = []
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker: { register: async (...args) => { calls.push(args); return {} } } }
  })
  try {
    const runtime = await importRuntime()
    const result = await runtime.registerRuntimeServiceWorker('/local-runtime-sw.test.js', { scope: '/tools/local-json/' })
    assert.deepEqual(result, { registered: true, scope: '/tools/local-json/' })
    assert.deepEqual(calls, [['/local-runtime-sw.test.js', { scope: '/tools/local-json/' }]])
  } finally {
    if (originalNavigator === undefined) delete globalThis.navigator
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator })
  }
})

test('aborting a running task terminates the worker before rejecting', async () => {
  const originalWorker = globalThis.Worker
  const workers = []
  class FakeWorker {
    constructor() { this.terminated = false; workers.push(this) }
    postMessage() {}
    terminate() { this.terminated = true }
  }
  globalThis.Worker = FakeWorker
  try {
    const { createTaskRunner } = await importRuntime()
    const runner = createTaskRunner()
    const controller = new AbortController()
    const task = runner.run('format-json', { input: '{}' }, { signal: controller.signal })
    controller.abort()
    await assert.rejects(task, (error) => error.name === 'AbortError')
    assert.equal(workers.length, 1)
    assert.equal(workers[0].terminated, true)

    const nextTask = runner.run('state-step', { state: { items: [] }, action: 'enqueue' })
    assert.equal(workers.length, 2, 'the next task must receive a fresh worker')
    runner.cancelAll()
    await assert.rejects(nextTask, (error) => error.name === 'AbortError')
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = originalWorker
  }
})

test('worker probe reports module availability before task execution', async () => {
  const originalWorker = globalThis.Worker
  globalThis.Worker = class {
    postMessage(message) {
      if (message.type === 'ping') queueMicrotask(() => this.onmessage?.({ data: { type: 'pong', id: message.id } }))
    }
    terminate() {}
  }
  try {
    const { createTaskRunner } = await importRuntime()
    const runner = createTaskRunner({ workerUrl: '/runtime-worker.test.js' })
    assert.deepEqual(await runner.probe({ timeout: 50 }), { available: true })
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = originalWorker
  }
})

test('oversized input returns a typed limit error before worker or fallback execution', async () => {
  const originalWorker = globalThis.Worker
  let workerCount = 0
  globalThis.Worker = class { constructor() { workerCount += 1 } }
  try {
    const { createTaskRunner } = await importRuntime()
    const runner = createTaskRunner({ maxBytes: 4 })
    await assert.rejects(
      runner.run('format-json', { input: '12345' }, { forceMainThread: true }),
      (error) => error.name === 'TaskLimitError' && error.code === 'TASK_INPUT_TOO_LARGE'
    )
    assert.equal(workerCount, 0)
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = originalWorker
  }
})
