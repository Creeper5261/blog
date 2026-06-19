import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeLegacyHtml } from '../src/legacy/html-transform.mjs'

async function copyHtmlPages({ sourceRoot, targetRoot, current = sourceRoot }) {
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }

  let pages = 0

  for (const entry of entries) {
    const from = path.join(current, entry.name)
    if (entry.isDirectory()) {
      pages += await copyHtmlPages({ sourceRoot, targetRoot, current: from })
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.html')) continue

    const relativePath = path.relative(sourceRoot, from)
    const to = path.join(targetRoot, relativePath)
    const html = await readFile(from, 'utf8')

    await mkdir(path.dirname(to), { recursive: true })
    await writeFile(to, sanitizeLegacyHtml(html))
    pages += 1
  }

  return pages
}

export async function prepareAstroLegacyPages({
  sourceRoot = path.resolve('public'),
  targetRoot = path.resolve('src', 'legacy', 'pages')
} = {}) {
  await rm(targetRoot, { recursive: true, force: true })
  const pages = await copyHtmlPages({ sourceRoot, targetRoot })
  return { pages }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const result = await prepareAstroLegacyPages()
  console.log(JSON.stringify(result, null, 2))
}
