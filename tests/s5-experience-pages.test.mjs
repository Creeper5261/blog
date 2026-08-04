import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S5 public pages consume only published static payloads and keep no-JavaScript fallbacks', async () => {
  const pages = {
    'src/pages/topics/index.astro': ['topics.json', 'immutableReleasePath', '<noscript>', '主题展厅'],
    'src/pages/tools/index.astro': ['tool-manifests.json', '<noscript>', 'https://www.google.com/search', 'comments={false}', 'tool-item'],
    'src/pages/explore/map/index.astro': ['relationship-graph.json', 'immutableReleasePath', '<noscript>', '探索地图', '<svg'],
    'src/pages/paths/index.astro': ['paths.json', 'immutableReleasePath', '<noscript>', '知识路径']
  }
  for (const [relative, patterns] of Object.entries(pages)) {
    const source = await readFile(path.join(repositoryRoot, relative), 'utf8')
    for (const pattern of patterns) {
      assert.match(source, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    const script = source.match(/<script is:inline type="module">([\s\S]*?)<\/script>/)
    assert.ok(script, `${relative} must contain an inline module script`)
    assert.doesNotMatch(script[1], /generated\/|content\/|external\//)
  }
})

test('S5 legacy catch-all defers routes owned by modern experience pages', async () => {
  const source = await readFile(path.join(repositoryRoot, 'src', 'pages', '[...slug].astro'), 'utf8')

  assert.match(source, /SITE_ROUTES/)
  assert.match(source, /modernRouteSlugs/)
  assert.match(source, /page\.kind !== 'page' \|\| !modernRouteSlugs\.has\(page\.slug\)/)
})

test('removed experience shell is not used by public tool surfaces', async () => {
  const toolsPage = await readFile(path.join(repositoryRoot, 'src', 'pages', 'tools', 'index.astro'), 'utf8')
  assert.match(toolsPage, /NativePageFrame/)
  assert.doesNotMatch(toolsPage, /ExperiencePage/)
})

test('knowledge and pulse pages are removed from the public surface', async () => {
  await assert.rejects(readFile(path.join(repositoryRoot, 'src', 'pages', 'knowledge', 'index.astro')), { code: 'ENOENT' })
  await assert.rejects(readFile(path.join(repositoryRoot, 'src', 'pages', 'pulse', 'index.astro')), { code: 'ENOENT' })
  const routes = await readFile(path.join(repositoryRoot, 'tools', 'site-data', 'routes.mjs'), 'utf8')
  assert.doesNotMatch(routes, /\/pulse\//)
})
