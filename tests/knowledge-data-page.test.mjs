import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('knowledge data inspector reads only published static JSON', async () => {
  const source = await readFile(path.join(repositoryRoot, 'src', 'pages', 'knowledge-data', 'index.astro'), 'utf8')

  assert.match(source, /\/data\/knowledge/)
  assert.match(source, /load\('release\.json'\)/)
  assert.match(source, /load\('content-index\.json'\)/)
  assert.match(source, /<script is:inline type="module">/)
  assert.match(source, /textContent/)
  assert.doesNotMatch(source, /readFile|content\/|external\/|generated\//)
})
