import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { prepareAstroAssets } from '../tools/prepare-astro-assets.mjs'

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

test('prepareAstroAssets copies static assets and skips apk files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-'))
  const sourceRoot = path.join(root, 'source')
  const targetRoot = path.join(root, '.astro-static')
  await mkdir(path.join(sourceRoot, 'css'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'img'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'css', 'custom.css'), 'body{}')
  await writeFile(path.join(sourceRoot, 'img', 'cover.png'), 'png')
  await writeFile(path.join(sourceRoot, 'img', 'large.apk'), 'apk')

  const result = await prepareAstroAssets({ sourceRoot, targetRoot })

  assert.equal(await exists(path.join(targetRoot, 'css', 'custom.css')), true)
  assert.equal(await exists(path.join(targetRoot, 'img', 'cover.png')), true)
  assert.equal(await exists(path.join(targetRoot, 'img', 'large.apk')), false)
  assert.deepEqual(result.skipped.map((item) => item.reason), ['excluded-extension'])
})

test('prepareAstroAssets sanitizes copied Tencent map script', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-script-'))
  const sourceRoot = path.join(root, 'source')
  const targetRoot = path.join(root, '.astro-static')
  await mkdir(path.join(sourceRoot, 'js'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'js', 'txmap.js'), "data: { key: 'OLD_TENCENT_MAP', output: 'jsonp' }")

  await prepareAstroAssets({ sourceRoot, targetRoot })
  const copied = await readFile(path.join(targetRoot, 'js', 'txmap.js'), 'utf8')

  assert.doesNotMatch(copied, /OLD_TENCENT_MAP/)
  assert.match(copied, /DAT_PUBLIC_SERVICES/)
  assert.match(copied, /tencentMapKey/)
})
