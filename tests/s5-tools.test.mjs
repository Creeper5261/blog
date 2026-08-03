import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildToolManifestPayload } from '../tools/capabilities/manifests.mjs'
import { buildSiteData } from '../tools/site-data/build.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S5 second tool follows the single manifest channel', async () => {
  const payload = buildToolManifestPayload()
  const tool = payload.tools.find((entry) => entry.id === 'tool.sha256')

  assert.equal(payload.tools.length, 2)
  assert.equal(tool.route, '/tools/sha256/')
  assert.equal(tool.task, 'hash-sha256')
  assert.equal(tool.privacy.mode, 'local-only')
  assert.equal(tool.privacy.uploads, false)
  assert.equal(tool.offline.supported, true)
  assert.equal(tool.runtime.shell, 's3-local-task-runner')
  assert.equal(tool.runtime.mainThreadFallback, true)

  const result = await buildSiteData({ root: repositoryRoot, write: false })
  assert.equal(result.ok, true)
  const featuresTool = result.bundle['features.json'].tools.find((entry) => entry.id === 'tool.sha256')
  assert.equal(featuresTool.slug, 'sha256')
  assert.equal(featuresTool.privacy, 'local-only')
  const routesTool = result.bundle['routes.json'].items.find((entry) => entry.route === '/tools/sha256/')
  assert.equal(routesTool.source, 'tool-manifest')
  assert.ok(result.bundle['tool-manifests.json'].tools.some((entry) => entry.id === 'tool.sha256'))
})

test('S5 SHA-256 tool page reuses the S3 task shell without a second upload path', async () => {
  const source = await readFile(path.join(repositoryRoot, 'src', 'pages', 'tools', 'sha256', 'index.astro'), 'utf8')
  for (const pattern of ['tool-manifests.json', 'createTaskRunner', 'hash-sha256', 'registerRuntimeServiceWorker', "scope: '/tools/sha256/'", '<noscript>']) {
    assert.match(source, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  const script = source.match(/<script is:inline type="module">([\s\S]*?)<\/script>/)
  assert.ok(script)
  assert.doesNotMatch(script[1], /generated\/|content\/|external\//)
})
