import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S5 pages consume only published static payloads and keep no-JavaScript fallbacks', async () => {
  const pages = {
    'src/pages/topics/index.astro': ['topics.json', 'immutableReleasePath', '<noscript>', '主题展厅'],
    'src/pages/tools/index.astro': ['tool-manifests.json', '<noscript>', '今天想做什么？', '搜索工具'],
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

test('experience shell inherits legacy theme preferences instead of embedding new visual assets', async () => {
  const component = await readFile(path.join(repositoryRoot, 'src', 'components', 'ExperiencePage.astro'), 'utf8')
  const stylesheet = await readFile(path.join(repositoryRoot, 'source', 'css', 'experience.css'), 'utf8')

  for (const key of ['theme', 'themeColor', 'font', 'blogbg', 'web_bg']) assert.match(component, new RegExp(`localStorage\\.getItem\\('${key}'\\)`))
  assert.doesNotMatch(stylesheet, /cdn\.jsdelivr\.net\/gh\/Creeper5261\/picbed.*(?:background|experience-bg-image)/)
})
