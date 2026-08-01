import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parsePostMarkdown } from '../writer/core.mjs'

function normalizeList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  return [String(value).trim()].filter(Boolean)
}

function quoteYaml(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function pushScalar(lines, key, value) {
  if (value === undefined || value === null || value === '') return
  if (typeof value === 'boolean') {
    lines.push(`${key}: ${value ? 'true' : 'false'}`)
    return
  }
  lines.push(`${key}: ${quoteYaml(value)}`)
}

function pushList(lines, key, values) {
  const normalized = normalizeList(values)
  if (!normalized.length) return
  lines.push(`${key}:`)
  for (const value of normalized) lines.push(`  - ${quoteYaml(value)}`)
}

export function createPostMarkdown({
  title,
  date,
  updated,
  description,
  cover,
  permalink,
  comments = true,
  mathjax = false,
  toc = true,
  categories = [],
  tags = [],
  body = ''
} = {}) {
  if (!title || !String(title).trim()) throw new Error('post title is required')
  if (!date || !String(date).trim()) throw new Error('post date is required')

  const lines = ['---']
  pushScalar(lines, 'title', title)
  pushScalar(lines, 'date', date)
  pushScalar(lines, 'updated', updated)
  pushScalar(lines, 'description', description)
  pushScalar(lines, 'cover', cover)
  pushScalar(lines, 'permalink', permalink)
  pushScalar(lines, 'comments', comments)
  pushScalar(lines, 'mathjax', mathjax)
  pushScalar(lines, 'toc', toc)
  pushList(lines, 'categories', categories)
  pushList(lines, 'tags', tags)
  lines.push('---', '', String(body || '').replace(/\s+$/u, ''), '')
  return lines.join('\n')
}

function increment(map, values) {
  for (const value of normalizeList(values)) map.set(value, (map.get(value) || 0) + 1)
}

function mapToSortedEntries(map) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'))
}

export async function listTaxonomy({
  postsDir = path.resolve('source', '_posts')
} = {}) {
  let entries
  try {
    entries = await readdir(postsDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return { categories: [], tags: [] }
    throw error
  }

  const categories = new Map()
  const tags = new Map()

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    const markdown = await readFile(path.join(postsDir, entry.name), 'utf8')
    const parsed = parsePostMarkdown(markdown)
    increment(categories, parsed.categories)
    increment(tags, parsed.tags)
  }

  return {
    categories: mapToSortedEntries(categories),
    tags: mapToSortedEntries(tags)
  }
}
