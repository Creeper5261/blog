import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PRESERVE = ['.git', 'CNAME']

async function listEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function countFiles(directory) {
  let count = 0
  for (const entry of await listEntries(directory)) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      count += await countFiles(fullPath)
    } else if (entry.isFile()) {
      count += 1
    }
  }
  return count
}

function normalizePreserve(preserve) {
  return new Set(preserve.map((item) => item.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')))
}

async function cleanCheckout(checkoutDir, preserve) {
  await mkdir(checkoutDir, { recursive: true })
  const preserveSet = normalizePreserve(preserve)

  for (const entry of await listEntries(checkoutDir)) {
    if (preserveSet.has(entry.name)) continue
    await rm(path.join(checkoutDir, entry.name), { recursive: true, force: true })
  }
}

export async function publishOutput({
  distDir = path.resolve('dist'),
  checkoutDir = path.resolve('../Creeper5261.github.io'),
  preserve = DEFAULT_PRESERVE
} = {}) {
  await cleanCheckout(checkoutDir, preserve)
  await cp(distDir, checkoutDir, {
    recursive: true,
    force: true,
    dereference: false
  })

  return {
    checkoutDir,
    distDir,
    copiedFiles: await countFiles(distDir)
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const result = await publishOutput({
    distDir: process.env.PUBLISH_DIST_DIR || undefined,
    checkoutDir: process.env.PUBLIC_REPO_CHECKOUT || undefined
  })
  console.log(JSON.stringify(result, null, 2))
}
