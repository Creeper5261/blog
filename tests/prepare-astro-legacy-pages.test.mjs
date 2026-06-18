import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { prepareAstroLegacyPages } from '../tools/prepare-astro-legacy-pages.mjs'

test('prepareAstroLegacyPages copies and sanitizes html pages', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'legacy-copy-'))
  const sourceRoot = path.join(root, 'public')
  const targetRoot = path.join(root, 'src', 'legacy', 'pages')
  await mkdir(path.join(sourceRoot, 'about'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'index.html'), '<script>const GLOBAL_CONFIG = { algolia: {"appId":"OLD_APP","apiKey":"OLD_SEARCH","indexName":"old_index"} }</script>')
  await writeFile(path.join(sourceRoot, 'about', 'index.html'), '<script>var qweather_key = \'OLD_QWEATHER\';</script>')

  const result = await prepareAstroLegacyPages({ sourceRoot, targetRoot })
  const home = await readFile(path.join(targetRoot, 'index.html'), 'utf8')
  const about = await readFile(path.join(targetRoot, 'about', 'index.html'), 'utf8')

  assert.equal(result.pages, 2)
  assert.doesNotMatch(home, /OLD_APP|OLD_SEARCH|old_index/)
  assert.match(home, /__DAT_PUBLIC_ALGOLIA_APP_ID__/)
  assert.doesNotMatch(about, /OLD_QWEATHER/)
  assert.match(about, /__DAT_PUBLIC_QWEATHER_KEY__/)
})
