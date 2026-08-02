import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'

export const RUNTIME_FILES = [
  'js/local-runtime.js',
  'js/local-runtime-worker.js',
  'js/local-runtime-sw.js'
]

function publicFile(relativeFile) {
  return relativeFile === 'js/local-runtime-sw.js' ? 'local-runtime-sw.js' : relativeFile
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export async function buildRuntimeManifest({ targetRoot, outputRoot = path.join(targetRoot, 'runtime') } = {}) {
  if (!targetRoot) throw new Error('targetRoot is required')

  const entries = []
  for (const relativeFile of RUNTIME_FILES) {
    const file = path.join(targetRoot, publicFile(relativeFile))
    const contents = await readFile(file)
    const bytes = (await stat(file)).size
    const digest = sha256(contents)
    entries.push({
      url: `/${publicFile(relativeFile).replaceAll(path.sep, '/')}`,
      file: publicFile(relativeFile).replaceAll(path.sep, '/'),
      bytes,
      sha256: digest,
      integrity: `sha256-${digest}`
    })
  }

  const version = sha256(JSON.stringify(entries)).slice(0, 16)
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
