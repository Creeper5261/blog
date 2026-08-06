import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('desktop nav width calculation ignores the alternate scroll-title slot', async () => {
  const script = await readFile('source/js/main.js', 'utf8')

  assert.doesNotMatch(script, /getAllWidth\(document\.getElementById\('menus'\)\.children\)/)
  assert.doesNotMatch(script, /if \(init\) \{\s*const blogInfoWidth/s)
  assert.match(script, /querySelector\('#menus > \.menus_items'\)/)
  assert.match(script, /getElementById\('nav-right'\)/)
  assert.match(script, /addEventListener\('load', \(\) => \{ adjustMenu\(false\) \}/)
})

test('custom nav scroll binding is single-owner and desktop-aware', async () => {
  const script = await readFile('source/js/nav.js', 'utf8')

  assert.match(script, /removeEventListener\('scroll', navScrollHandler\)/)
  assert.match(script, /matchMedia\('\(min-width: 769px\)'\)/)
  assert.doesNotMatch(script, /\$\(window\)\.scroll\(function/)
})

test('main navigation always restores its top state inside the threshold', async () => {
  const script = await readFile('source/js/main.js', 'utf8')

  assert.match(script, /else \{\s*\/\/ Scroll positions close to the top[\s\S]*?classList\.remove\('nav-fixed', 'nav-visible'\)/)
  assert.doesNotMatch(script, /if \(currentTop === 0\)/)
})
