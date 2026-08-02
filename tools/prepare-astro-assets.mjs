import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeLegacyScript } from '../src/legacy/html-transform.mjs'
import { buildRuntimeManifest, RUNTIME_FILES } from './runtime/manifest.mjs'

const DEFAULT_ASSET_DIRS = [
  'css',
  'data',
  'font',
  'img',
  'js',
  'lib',
  'live2dw',
  'temp_classify'
]

const EXCLUDED_EXTENSIONS = new Set(['.apk'])
const STATIC_HOST_PACKAGE = {
  private: true,
  engines: {
    node: '24.x'
  }
}

async function writeVercelConfig(generatedRoot, targetRoot) {
  let release
  try { release = JSON.parse(await readFile(path.join(generatedRoot, 'site-data', 'release.json'), 'utf8')) } catch { return }
  const immutable = release.cache?.immutableCacheControl
  const mutable = release.cache?.mutableCacheControl
  if (!immutable || !mutable) return
  const config = {
    headers: [
      { source: '/data/knowledge/releases/(.*)', headers: [{ key: 'Cache-Control', value: immutable }] },
      { source: '/data/knowledge/objects/(.*)', headers: [{ key: 'Cache-Control', value: immutable }] },
      { source: '/media/(.*)', headers: [{ key: 'Cache-Control', value: immutable }] },
      { source: '/data/knowledge/:file', headers: [{ key: 'Cache-Control', value: mutable }] }
    ]
  }
  await writeFile(path.join(targetRoot, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`)
}

async function copyDir({ sourceDir, targetDir, skipped, relativeBase = '' }) {
  let entries
  try {
    entries = await readdir(sourceDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  await mkdir(targetDir, { recursive: true })

  for (const entry of entries) {
    const from = path.join(sourceDir, entry.name)
    const to = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyDir({
        sourceDir: from,
        targetDir: to,
        skipped,
        relativeBase: path.join(relativeBase, entry.name)
      })
      continue
    }

    if (!entry.isFile()) continue

    if (EXCLUDED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      skipped.push({ path: from, reason: 'excluded-extension' })
      continue
    }

    await mkdir(path.dirname(to), { recursive: true })
    if (path.join(relativeBase, entry.name).split(path.sep).join('/') === 'js/txmap.js') {
      const script = await readFile(from, 'utf8')
      await writeFile(to, sanitizeLegacyScript(script))
      continue
    }

    await cp(from, to)
  }
}

export async function prepareAstroAssets({
  sourceRoot = path.resolve('source'),
  apiRoot = path.resolve('api'),
  generatedRoot = path.resolve('generated'),
  targetRoot = path.resolve('.astro-static'),
  assetDirs = DEFAULT_ASSET_DIRS
} = {}) {
  const skipped = []
  await rm(targetRoot, { recursive: true, force: true })
  await mkdir(targetRoot, { recursive: true })

  for (const dir of assetDirs) {
    await copyDir({
      sourceDir: path.join(sourceRoot, dir),
      targetDir: path.join(targetRoot, dir),
      skipped,
      relativeBase: dir
    })
  }

  await copyDir({
    sourceDir: apiRoot,
    targetDir: path.join(targetRoot, 'api'),
    skipped,
    relativeBase: 'api'
  })

  await copyDir({
    sourceDir: path.join(generatedRoot, 'media'),
    targetDir: path.join(targetRoot, 'media'),
    skipped,
    relativeBase: 'media'
  })

  await copyDir({
    sourceDir: path.join(generatedRoot, 'site-data'),
    targetDir: path.join(targetRoot, 'data', 'knowledge'),
    skipped,
    relativeBase: path.join('data', 'knowledge')
  })

  const runtimeFiles = await Promise.all(RUNTIME_FILES.map(async (relativeFile) => {
    try {
      await access(path.join(targetRoot, relativeFile))
      return true
    } catch {
      return false
    }
  }))
  if (runtimeFiles.some(Boolean) && !runtimeFiles.every(Boolean)) {
    throw new Error('runtime assets are incomplete; expected local-runtime.js, local-runtime-worker.js and local-runtime-sw.js')
  }
  if (runtimeFiles.every(Boolean)) await buildRuntimeManifest({ targetRoot })

  await writeVercelConfig(generatedRoot, targetRoot)

  await writeFile(path.join(targetRoot, '.nojekyll'), '')
  await writeFile(path.join(targetRoot, 'package.json'), `${JSON.stringify(STATIC_HOST_PACKAGE, null, 2)}\n`)

  return { skipped }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const result = await prepareAstroAssets()
  console.log(JSON.stringify(result, null, 2))
}
