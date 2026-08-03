import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('S5 homepage, text flow and narrative pages consume only published static payloads', async () => {
  const pages = {
    'src/pages/index.astro': ['routes.json', 'topics.json', 'tool-manifests.json', 'pulses.json', '<noscript>', '博客与知识站'],
    'src/pages/flow/index.astro': ['content-records.json', 'immutableReleasePath', '<noscript>', '文字流'],
    'src/pages/narratives/index.astro': ['topics.json', '<noscript>', '专题叙事'],
    'src/pages/narratives/[id].astro': ['topics.json', 'explain.json', '<noscript>', 'explain-unit', 'getStaticPaths']
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

test('S5 explain units share one runtime script across explain and narrative pages', async () => {
  const explainPage = await readFile(path.join(repositoryRoot, 'src', 'pages', 'explain', 'index.astro'), 'utf8')
  const narrativePage = await readFile(path.join(repositoryRoot, 'src', 'pages', 'narratives', '[id].astro'), 'utf8')
  const runtime = await readFile(path.join(repositoryRoot, 'source', 'js', 'explain-runtime.js'), 'utf8')

  assert.match(explainPage, /src="\/js\/explain-runtime\.js"/)
  assert.match(narrativePage, /src="\/js\/explain-runtime\.js"/)
  assert.match(runtime, /data-action="advance"/)
  assert.match(runtime, /data-action="reset"/)
  assert.match(runtime, /explain-unit/)
})
