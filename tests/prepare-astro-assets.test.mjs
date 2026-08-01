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

test('prepareAstroAssets keeps copied Tencent location script on the same-origin API proxy', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-script-'))
  const sourceRoot = path.join(root, 'source')
  const targetRoot = path.join(root, '.astro-static')
  await mkdir(path.join(sourceRoot, 'js'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'js', 'txmap.js'), "fetch('/api/location')")

  await prepareAstroAssets({ sourceRoot, targetRoot })
  const copied = await readFile(path.join(targetRoot, 'js', 'txmap.js'), 'utf8')

  assert.match(copied, /\/api\/location/)
  assert.doesNotMatch(copied, /DAT_PUBLIC_SERVICES|tencentMapKey|OLD_TENCENT_MAP/)
})

test('prepareAstroAssets copies generated data files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-data-'))
  const sourceRoot = path.join(root, 'source')
  const targetRoot = path.join(root, '.astro-static')
  await mkdir(path.join(sourceRoot, 'data'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'data', 'github-calendar.json'), '{"days":[]}')

  await prepareAstroAssets({ sourceRoot, targetRoot })

  assert.equal(await exists(path.join(targetRoot, 'data', 'github-calendar.json')), true)
})

test('prepareAstroAssets publishes generated knowledge data and hashed media', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-knowledge-'))
  const sourceRoot = path.join(root, 'source')
  const generatedRoot = path.join(root, 'generated')
  const targetRoot = path.join(root, '.astro-static')
  await mkdir(path.join(generatedRoot, 'site-data'), { recursive: true })
  await mkdir(path.join(generatedRoot, 'media'), { recursive: true })
  await writeFile(path.join(generatedRoot, 'site-data', 'asset-manifest.json'), '{"schemaVersion":1,"assets":[]}')
  await writeFile(path.join(generatedRoot, 'media', 'abc.svg'), '<svg/>')

  await prepareAstroAssets({ sourceRoot, generatedRoot, targetRoot })

  assert.equal(await exists(path.join(targetRoot, 'data', 'knowledge', 'asset-manifest.json')), true)
  assert.equal(await exists(path.join(targetRoot, 'media', 'abc.svg')), true)
})

test('prepareAstroAssets writes static host metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-metadata-'))
  const sourceRoot = path.join(root, 'source')
  const targetRoot = path.join(root, '.astro-static')

  await prepareAstroAssets({ sourceRoot, targetRoot })

  const packageJson = JSON.parse(await readFile(path.join(targetRoot, 'package.json'), 'utf8'))
  assert.equal(await exists(path.join(targetRoot, '.nojekyll')), true)
  assert.equal(packageJson.engines.node, '24.x')
})

test('prepareAstroAssets publishes Vercel API functions with static output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astro-assets-api-'))
  const sourceRoot = path.join(root, 'source')
  const apiRoot = path.join(root, 'api')
  const targetRoot = path.join(root, '.astro-static')
  await mkdir(apiRoot, { recursive: true })
  await writeFile(path.join(apiRoot, 'location.mjs'), 'export function GET() {}')

  await prepareAstroAssets({ sourceRoot, apiRoot, targetRoot })

  assert.equal(await exists(path.join(targetRoot, 'api', 'location.mjs')), true)
})
