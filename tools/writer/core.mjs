import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function parseScalar(value) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontMatterBlock(block) {
  const data = {}
  const lines = block.split(/\r?\n/)
  let currentListKey = ''

  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (listMatch && currentListKey) {
      data[currentListKey].push(parseScalar(listMatch[1]))
      continue
    }

    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!fieldMatch) continue

    const [, key, value] = fieldMatch
    if (value === '') {
      data[key] = []
      currentListKey = key
    } else {
      data[key] = parseScalar(value)
      currentListKey = ''
    }
  }

  return data
}

export function parsePostMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.startsWith('---\n')) {
    throw new Error('post markdown must start with YAML front matter')
  }

  const endIndex = markdown.indexOf('\n---', 4)
  if (endIndex === -1) throw new Error('post markdown front matter is not closed')

  const frontMatter = parseFrontMatterBlock(markdown.slice(4, endIndex))
  const bodyStart = markdown.indexOf('\n', endIndex + 4)
  const body = bodyStart === -1 ? '' : markdown.slice(bodyStart + 1)

  if (!frontMatter.title) throw new Error('post front matter title is required')
  if (!frontMatter.date) throw new Error('post front matter date is required')

  return {
    ...frontMatter,
    title: String(frontMatter.title),
    date: String(frontMatter.date),
    tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : frontMatter.tags ? [String(frontMatter.tags)] : [],
    categories: Array.isArray(frontMatter.categories) ? frontMatter.categories : frontMatter.categories ? [String(frontMatter.categories)] : [],
    body
  }
}

export function slugifyPostFilename(filename) {
  if (typeof filename !== 'string' || !filename.trim()) throw new Error('invalid filename')
  const normalized = filename.trim().replaceAll('\\', '/')
  if (normalized.includes('/') || normalized.includes('..')) throw new Error('invalid filename')

  const withExtension = normalized.toLowerCase().endsWith('.md') ? normalized : `${normalized}.md`
  const stem = withExtension.slice(0, -3)
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!stem) throw new Error('invalid filename')
  return `${stem}.md`
}

export async function savePostMarkdown({
  postsDir = path.resolve('source', '_posts'),
  filename,
  markdown,
  overwrite = false
} = {}) {
  const parsed = parsePostMarkdown(markdown)
  const safeFilename = slugifyPostFilename(filename || parsed.title)
  const target = path.resolve(postsDir, safeFilename)
  const root = path.resolve(postsDir)

  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('invalid filename')
  await mkdir(root, { recursive: true })

  try {
    await writeFile(target, markdown, { flag: overwrite ? 'w' : 'wx' })
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`post already exists: ${safeFilename}`)
    throw error
  }

  return {
    file: target,
    filename: safeFilename,
    title: parsed.title,
    date: parsed.date,
    tags: parsed.tags,
    categories: parsed.categories
  }
}

export async function listPostMarkdownFiles({
  postsDir = path.resolve('source', '_posts')
} = {}) {
  let entries
  try {
    entries = await readdir(postsDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const posts = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    const markdown = await readFile(path.join(postsDir, entry.name), 'utf8')
    const parsed = parsePostMarkdown(markdown)
    posts.push({
      filename: entry.name,
      title: parsed.title,
      date: parsed.date
    })
  }

  return posts.sort((left, right) => left.filename.localeCompare(right.filename, 'zh-CN'))
}
