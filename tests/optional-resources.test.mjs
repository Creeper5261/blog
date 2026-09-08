import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { applyPublicServices } from '../src/legacy/html-transform.mjs'

test('shell loads optional library bootstrap once but not the optional libraries', () => {
  const html = applyPublicServices(`<head></head><body>
    <script defer src="/js/search/algolia.js"></script><script src="/js/search/algolia.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/algoliasearch/4.17.0/algoliasearch-lite.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/instantsearch.js/4.55.0/instantsearch.production.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/winbox@0.2.82/dist/winbox.bundle.min.js"></script></body>`)
  assert.equal((html.match(/src="\/js\/search\/algolia.js"/g) || []).length, 1)
  assert.match(html, /optional-resources.js/)
  assert.doesNotMatch(html, /instantsearch.production|algoliasearch-lite|winbox.bundle/)
})

test('optional resource loader shares concurrent requests and permits retry after failure', async () => {
  const scripts = []
  const window = {}
  vm.runInNewContext(await readFile('source/js/optional-resources.js', 'utf8'), {
    window, Map, Promise, Error,
    setTimeout: () => 1, clearTimeout: () => {},
    document: { createElement: () => ({ remove() {} }), head: { appendChild: script => scripts.push(script) } }
  })
  const first = window.datLoadScript('/library.js')
  assert.equal(window.datLoadScript('/library.js'), first)
  assert.equal(scripts.length, 1)
  scripts[0].onerror()
  await assert.rejects(first, /加载失败/)
  const retry = window.datLoadScript('/library.js')
  assert.equal(scripts.length, 2)
  scripts[1].onload()
  await retry
  assert.equal(window.datLoadScript('/library.js'), retry)
  assert.equal(scripts.length, 2)
})
