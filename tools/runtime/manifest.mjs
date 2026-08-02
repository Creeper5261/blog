import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'

export const RUNTIME_FILES = [
  'js/local-runtime.js',
  'js/local-runtime-worker.js',
  'js/local-runtime-sw.js'
]

function versionedFile(relativeFile, version) {
  const name = path.posix.basename(relativeFile.replaceAll(path.sep, '/'))
  return relativeFile === 'js/local-runtime-sw.js'
    ? `local-runtime-sw.${version}.js`
    : `runtime/assets/${version}/${name}`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export async function buildRuntimeManifest({ targetRoot, outputRoot = path.join(targetRoot, 'runtime') } = {}) {
  if (!targetRoot) throw new Error('targetRoot is required')

  const sources = []
  for (const relativeFile of RUNTIME_FILES) {
    const file = path.join(targetRoot, relativeFile)
    const contents = await readFile(file)
    const bytes = (await stat(file)).size
    sources.push({
      relativeFile,
      bytes,
      sha256: sha256(contents),
      integrity: `sha256-${crypto.createHash('sha256').update(contents).digest('base64')}`
    })
  }

  const version = sha256(JSON.stringify(sources)).slice(0, 16)
  const entries = []
  for (const source of sources) {
    const file = versionedFile(source.relativeFile, version)
    const target = path.join(targetRoot, file)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(targetRoot, source.relativeFile), target)
    entries.push({
      url: `/${file.replaceAll(path.sep, '/')}`,
      file: file.replaceAll(path.sep, '/'),
      bytes: source.bytes,
      sha256: source.sha256,
      integrity: source.integrity
    })
  }
  const manifest = {
    schemaVersion: 1,
    runtimeVersion: version,
    generatedAt: 'build-time',
    entries,
    precache: ['/lab/', '/runtime/manifest.json', ...entries.map((entry) => entry.url)]
  }

  await mkdir(outputRoot, { recursive: true })
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
