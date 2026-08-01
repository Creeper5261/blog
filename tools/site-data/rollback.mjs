import crypto from 'node:crypto'
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

function releaseFile(root, relativeFile) {
  if (typeof relativeFile !== 'string' || path.isAbsolute(relativeFile)) throw new Error('release contains an unsafe file path')
  const resolved = path.resolve(root, relativeFile)
  const relative = path.relative(root, resolved)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('release contains an unsafe file path')
  }
  return resolved
}

export async function rollbackSiteData({ root = process.cwd(), releaseHash } = {}) {
  if (!/^[a-f0-9]{64}$/.test(releaseHash ?? '')) throw new Error('release hash must be 64 lowercase hexadecimal characters')
  const repositoryRoot = path.resolve(root)
  const siteDataRoot = path.join(repositoryRoot, 'generated', 'site-data')
  const releaseRoot = path.join(siteDataRoot, 'releases', releaseHash)
  const release = await readJson(path.join(releaseRoot, 'release.json'))
  if (release.buildHash !== releaseHash) throw new Error('release manifest hash does not match requested release')

  for (const descriptor of release.files ?? []) {
    const bytes = await readFile(releaseFile(releaseRoot, descriptor.file))
    if (sha256(bytes) !== descriptor.hash) throw new Error(`release file failed integrity check: ${descriptor.file}`)
  }

  const staging = path.join(repositoryRoot, 'generated', `.site-data-rollback-${process.pid}`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  for (const descriptor of release.files) {
    const target = releaseFile(staging, descriptor.file)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(releaseFile(releaseRoot, descriptor.file), target)
  }
  await copyFile(path.join(releaseRoot, 'release.json'), path.join(staging, 'release.json'))
  for (const entry of await readdir(siteDataRoot, { withFileTypes: true })) {
    if (entry.name === 'releases' || entry.name === 'release-history.json' || entry.name === 'objects') continue
    await rm(path.join(siteDataRoot, entry.name), { recursive: true, force: true })
  }
  for (const entry of await readdir(staging, { withFileTypes: true })) {
    await cp(path.join(staging, entry.name), path.join(siteDataRoot, entry.name), { recursive: true, force: true })
  }
  await rm(staging, { recursive: true, force: true })
  const cacheRoot = path.join(repositoryRoot, 'generated', '.cache')
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(path.join(cacheRoot, 'site-data-v1.json'), `${JSON.stringify({
    schemaVersion: 1,
    inputHash: null,
    buildHash: releaseHash,
    rolledBack: true
  }, null, 2)}\n`)

  return { ok: true, releaseHash, restoredFiles: release.files.length + 1 }
}

async function main() {
  const releaseHash = process.argv.find((argument) => argument.startsWith('--release='))?.slice('--release='.length)
  const result = await rollbackSiteData({ releaseHash })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
