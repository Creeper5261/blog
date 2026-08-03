import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S5 legacy catch-all stops serving the home route now owned by the homepage', async () => {
  const source = await readFile(path.join(repositoryRoot, 'src', 'pages', '[...slug].astro'), 'utf8')

  assert.match(source, /page\.kind !== 'not-found' && page\.kind !== 'home'/)
})
