import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { listLegacyPages, routeFromLegacyPage } from '../src/legacy/routes.mjs'

test('routeFromLegacyPage maps index files to Astro route slugs', () => {
  assert.deepEqual(routeFromLegacyPage('index.html'), {
    kind: 'home',
    outputPath: 'index.html',
    slug: undefined
  })
  assert.deepEqual(routeFromLegacyPage('404.html'), {
    kind: 'not-found',
    outputPath: '404.html',
    slug: undefined
  })
  assert.deepEqual(routeFromLegacyPage(path.join('about', 'index.html')), {
    kind: 'page',
    outputPath: 'about/index.html',
    slug: 'about'
  })
  assert.deepEqual(routeFromLegacyPage(path.join('archives', 'page', '2', 'index.html')), {
    kind: 'page',
    outputPath: 'archives/page/2/index.html',
    slug: 'archives/page/2'
  })
})

test('listLegacyPages discovers html pages recursively', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'legacy-pages-'))
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Home</title>')
  await writeFile(path.join(root, '404.html'), '<!doctype html><title>Not Found</title>')
  await mkdir(path.join(root, 'about'), { recursive: true })
  await writeFile(path.join(root, 'about', 'index.html'), '<!doctype html><title>About</title>')

  const pages = await listLegacyPages(root)

  assert.deepEqual(
    pages.map((page) => page.outputPath).sort(),
    ['404.html', 'about/index.html', 'index.html']
  )
})
