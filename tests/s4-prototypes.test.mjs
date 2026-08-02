import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { compileExplainUnits } from '../tools/explain/compiler.mjs'
import { buildToolManifestPayload } from '../tools/capabilities/manifests.mjs'
import { buildSiteData } from '../tools/site-data/build.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S4 compiles queue and Agent explain units through one schema', async () => {
  const result = await compileExplainUnits({ root: repositoryRoot })

  assert.equal(result.ok, true)
  assert.deepEqual(result.units.map((unit) => unit.id), ['explain.agent-tool-call', 'explain.queue-enqueue'])
  assert.ok(result.units.every((unit) => unit.schemaVersion === 1))
  assert.ok(result.units.every((unit) => unit.actions.some((action) => action.type === 'advance')))
  assert.ok(result.units.every((unit) => unit.actions.some((action) => action.type === 'reset')))
  assert.deepEqual(result.units.map((unit) => unit.model.kind), ['agent-tool', 'queue'])
})

test('S4 tool manifest declares local privacy, offline support, and S3 task shell', () => {
  const payload = buildToolManifestPayload()
  const tool = payload.tools.find((entry) => entry.id === 'tool.local-json')

  assert.equal(payload.schemaVersion, 1)
  assert.equal(tool.privacy.mode, 'local-only')
  assert.equal(tool.privacy.uploads, false)
  assert.equal(tool.offline.supported, true)
  assert.equal(tool.runtime.shell, 's3-local-task-runner')
  assert.equal(tool.runtime.worker, true)
  assert.equal(tool.runtime.mainThreadFallback, true)
})

test('S4 Pulse page can publish the last valid snapshot when its source refresh fails', async () => {
  const result = await buildSiteData({
    root: repositoryRoot,
    write: false,
    pulseProvider: async () => { throw new Error('source unavailable') }
  })
  const pulse = result.bundle['pulses.json'].pulses.find((entry) => entry.id === 'pulse.github-repositories')

  assert.equal(result.ok, true)
  assert.equal(pulse.snapshotStatus, 'fallback')
  assert.ok(pulse.items.length > 0)
  assert.match(pulse.items[0].url, /^https:\/\/github\.com\//)
})

test('S4 pages consume versioned static payloads and retain no-JavaScript fallbacks', async () => {
  const pages = {
    'src/pages/tools/local-json/index.astro': ['tool-manifests.json', 'createTaskRunner', 'registerRuntimeServiceWorker', "scope: '/tools/local-json/'", '<noscript>'],
    'src/pages/pulse/index.astro': ['immutableReleasePath', 'pulses.json', '预渲染'],
    'src/pages/explore/index.astro': ['relationship-graph.json', 'timelines.json', '稳定 ID'],
    'src/pages/explain/index.astro': ['explain.json', 'data-action="advance"', '静态回退']
  }
  for (const [relative, patterns] of Object.entries(pages)) {
    const source = await readFile(path.join(repositoryRoot, relative), 'utf8')
    for (const pattern of patterns) assert.match(source, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
