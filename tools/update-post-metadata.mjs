#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'

const run = promisify(execFile)
const root = process.cwd()
const now = process.env.POST_UPDATED_AT || new Date().toISOString()
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const rendererIdentity = 'markdown-frontmatter-v1'

async function changedPosts() {
  const { stdout } = await run('git', ['ls-files', 'source/_posts/*.md'], { cwd: root, windowsHide: true })
  return stdout.split(/\r?\n/).filter((file) => file.endsWith('.md'))
}

export function updateMarkdownText(original, updatedAt) {
  const parsed = matter(original)
  if (!parsed.data.date || !parsed.data.permalink || /data-render-fragment=/u.test(parsed.content)) return { changed: false, text: original, reason: 'latex-placeholder' }
  const bodyHash = hash(parsed.content)
  const metadataHash = hash(JSON.stringify({ title: parsed.data.title, description: parsed.data.description || '', categories: parsed.data.categories || [], tags: parsed.data.tags || [], permalink: parsed.data.permalink }, ['categories', 'description', 'permalink', 'tags', 'title']))
  if (parsed.data.sourceHash === bodyHash && parsed.data.metadataHash === metadataHash && parsed.data.rendererIdentity === rendererIdentity && parsed.data.updated === updatedAt) return { changed: false, text: original, bodyHash, metadataHash }
  parsed.data.updated = updatedAt
  parsed.data.sourceHash = bodyHash
  parsed.data.metadataHash = metadataHash
  parsed.data.rendererIdentity = rendererIdentity
  return { changed: true, text: matter.stringify(parsed.content, parsed.data), bodyHash, metadataHash }
}

async function main() {
  const files = await changedPosts()
  for (const relative of files) {
    const file = path.resolve(root, relative)
    const original = await fs.readFile(file, 'utf8')
    let updatedAt = process.env.POST_UPDATED_AT
    if (!updatedAt) {
      try {
        const { stdout } = await run('git', ['log', '-1', '--format=%cI', '--', relative], { cwd: root, windowsHide: true })
        updatedAt = stdout.trim() || now
      } catch { updatedAt = now }
    }
    const result = updateMarkdownText(original, updatedAt)
    if (!result.changed) continue
    await fs.writeFile(file, result.text)
    console.log(`updated ${relative}: ${result.bodyHash.slice(0, 12)}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
