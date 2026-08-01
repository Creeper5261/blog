import path from 'node:path'

import matter from 'gray-matter'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

function normalizeYamlValue(value) {
  if (value instanceof Date) return value.toISOString().replace(/T00:00:00\.000Z$/, '')
  if (Array.isArray(value)) return value.map(normalizeYamlValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeYamlValue(item)]))
  }
  return value
}

function sourceLocation(node, lineOffset = 0) {
  const start = node.position?.start
  return start ? { line: start.line + lineOffset, column: start.column } : {}
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url)
}

function isIgnoredUrl(url) {
  return !url || url.startsWith('#') || /^(?:data|mailto|tel|javascript):/i.test(url)
}

function isMarkdownPath(url) {
  return ['.md', '.mdx'].includes(path.extname(url.split(/[?#]/, 1)[0]).toLowerCase())
}

export function parseMarkdownContent(markdown, { extension = '.md' } = {}) {
  const source = String(markdown)
  const parsed = matter(source)
  const bodyIndex = source.indexOf(parsed.content)
  const lineOffset = bodyIndex > 0 ? source.slice(0, bodyIndex).split(/\r?\n/).length - 1 : 0
  const processor = unified().use(remarkParse)
  if (extension.toLowerCase() === '.mdx') processor.use(remarkMdx)
  const tree = processor.parse(parsed.content)

  const references = {
    assets: [],
    contentPaths: [],
    externalUrls: [],
    knowledgeIds: [],
    routes: []
  }
  const codeBlocks = []

  visit(tree, (node) => {
    if (node.type === 'code') {
      codeBlocks.push({ language: node.lang || null, ...sourceLocation(node, lineOffset) })
      return
    }

    if (!['image', 'link'].includes(node.type)) return
    const url = String(node.url || '').trim()
    if (isIgnoredUrl(url)) return
    const location = sourceLocation(node, lineOffset)

    if (url.startsWith('knowledge:')) {
      references.knowledgeIds.push({ target: url.slice('knowledge:'.length), ...location })
      return
    }
    if (isExternalUrl(url)) {
      references.externalUrls.push({ url, kind: node.type, ...location })
      return
    }
    if (url.startsWith('/')) {
      references.routes.push({ path: url, ...location })
      return
    }
    if (node.type === 'link' && isMarkdownPath(url)) {
      references.contentPaths.push({ path: url, ...location })
      return
    }

    references.assets.push({
      path: url,
      kind: node.type === 'image' ? 'image' : 'file',
      alt: node.type === 'image' ? String(node.alt || '') : null,
      title: node.title || null,
      ...location
    })
  })

  return {
    document: {
      ...normalizeYamlValue(parsed.data),
      body: parsed.content
    },
    references,
    codeBlocks
  }
}
