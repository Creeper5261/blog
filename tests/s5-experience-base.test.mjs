import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('legacy homepage and toolbox remain available while S5 uses separate routes', async () => {
  const homepage = await readFile(path.join(repositoryRoot, 'src', 'pages', 'index.astro'), 'utf8')
  assert.match(homepage, /src', 'legacy', 'pages', 'index\.html'/)
  assert.match(homepage, /applyPublicServices/)

  const routes = await readFile(path.join(repositoryRoot, 'tools', 'site-data', 'routes.mjs'), 'utf8')
  assert.match(routes, /route: '\/tools\/', kind: 'tools'/)
  assert.doesNotMatch(routes, /route: '\/tools\/catalog\/'/)

  const source = await readFile(path.join(repositoryRoot, 'src', 'pages', '[...slug].astro'), 'utf8')
  assert.match(source, /page\.kind !== 'not-found' && page\.kind !== 'home'/)
  assert.match(source, /modernRouteSlugs/)
})
