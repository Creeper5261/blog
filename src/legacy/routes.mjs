import { readdir } from 'node:fs/promises'
import path from 'node:path'

function normalizeRoutePath(filePath) {
  return filePath.split(path.sep).join('/')
}

export function routeFromLegacyPage(filePath) {
  const outputPath = normalizeRoutePath(filePath)

  if (outputPath === 'index.html') {
    return { kind: 'home', outputPath, slug: undefined }
  }

  if (outputPath === '404.html') {
    return { kind: 'not-found', outputPath, slug: undefined }
  }

  const slug = outputPath.endsWith('/index.html')
    ? outputPath.slice(0, -'/index.html'.length)
    : outputPath.replace(/\.html$/, '')

  return { kind: 'page', outputPath, slug }
}

async function walkHtml(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkHtml(root, fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.relative(root, fullPath))
    }
  }

  return files
}

export async function listLegacyPages(root) {
  const files = await walkHtml(root)
  return files.map(routeFromLegacyPage)
}
