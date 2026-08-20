#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

const run = promisify(execFile)
const root = process.cwd()
const now = process.env.POST_UPDATED_AT || new Date().toISOString()
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const rendererIdentity = 'markdown-frontmatter-v1'

async function changedPosts() {
  const before = process.env.GITHUB_EVENT_BEFORE || process.env.GITHUB_BEFORE
  if (!before || /^0+$/.test(before)) return []
  const { stdout } = await run('git', ['diff', '--name-only', `${before}^`, 'HEAD', '--', 'source/_posts'], { cwd: root, windowsHide: true })
  return stdout.split(/\r?\n/).filter((file) => file.endsWith('.md'))
}

async function main() {
  const files = await changedPosts()
  for (const relative of files) {
    const file = path.resolve(root, relative)
    const original = await fs.readFile(file, 'utf8')
    const parsed = matter(original)
    if (!parsed.data.date || !parsed.data.permalink) continue
    const bodyHash = hash(parsed.content)
    const metadataHash = hash(JSON.stringify({ title: parsed.data.title, description: parsed.data.description || '', categories: parsed.data.categories || [], tags: parsed.data.tags || [], permalink: parsed.data.permalink }, Object.keys({ title: 1, description: 1, categories: 1, tags: 1, permalink: 1 }).sort()))
    if (parsed.data.sourceHash === bodyHash && parsed.data.metadataHash === metadataHash && parsed.data.rendererIdentity === rendererIdentity) continue
    parsed.data.updated = process.env.POST_UPDATED_AT || parsed.data.updated || now
    parsed.data.sourceHash = bodyHash
    parsed.data.metadataHash = metadataHash
    parsed.data.rendererIdentity = rendererIdentity
    await fs.writeFile(file, matter.stringify(parsed.content, parsed.data))
    console.log(`updated ${relative}: ${updated} -> ${now}`)
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
