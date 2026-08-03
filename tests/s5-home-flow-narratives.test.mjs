import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S5 knowledge and text-flow pages consume only published static payloads', async () => {
  const pages = {
    'src/pages/knowledge/index.astro': ['ExperiencePage', '<noscript>', '知识库', '暂时还没有主题'],
    'src/pages/flow/index.astro': ['content-records.json', 'immutableReleasePath', '<noscript>', '文字流']
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

test('S5 does not expose the synthetic narrative prototype as a public route', async () => {
  const routes = await readFile(path.join(repositoryRoot, 'tools', 'site-data', 'routes.mjs'), 'utf8')
  const knowledge = await readFile(path.join(repositoryRoot, 'src', 'pages', 'knowledge', 'index.astro'), 'utf8')
  const topics = await readFile(path.join(repositoryRoot, 'src', 'pages', 'topics', 'index.astro'), 'utf8')

  assert.doesNotMatch(routes, /site\.narratives/)
  assert.doesNotMatch(knowledge, /narratives\//)
  assert.doesNotMatch(topics, /narratives\//)
})
