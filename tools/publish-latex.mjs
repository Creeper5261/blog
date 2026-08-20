#!/usr/bin/env node
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import katex from 'katex'
import { promisify } from 'node:util'

const root = process.cwd()
const exec = promisify(execFile)
const RENDERER_IDENTITY = 'katex-0.18.2-latex-basic-v2'
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i]
  if (value.startsWith('--')) args.set(value.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true)
}
const readYaml = async (file) => matter(`---\n${await fs.readFile(file, 'utf8')}\n---`).data
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort())
const stableUpdated = async (file, fallback) => {
  try {
    const status = await exec('git', ['status', '--short', '--', path.relative(root, file)], { cwd: root, windowsHide: true })
    if (status.stdout.trim()) return fallback
    const { stdout } = await exec('git', ['log', '-1', '--format=%cI', '--', path.relative(root, file)], { cwd: root, windowsHide: true })
    return stdout.trim() || fallback
  } catch { return fallback }
}
const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error))
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(file))
    else if (entry.isFile() && /\.tex$/iu.test(entry.name)) files.push(file)
  }
  return files
}
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const math = (source, display = false) => { try { return katex.renderToString(source, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' }) } catch { return `<code>${esc(source)}</code>` } }
const renderText = (line) => esc(line).replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>').replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>').replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>').replace(/\\\[([\s\S]*?)\\\]/g, (_, value) => math(value, true)).replace(/\$([^$]+)\$/g, (_, value) => math(value))
function renderTex(source) {
  const body = source.replace(/[\s\S]*?\\begin\{document\}/, '').replace(/\\end\{document\}[\s\S]*/, '')
  const out = []; let paragraph = []; let display = []; let displayEnv = null
  const flush = () => { if (paragraph.length) { out.push(`<p>${paragraph.join(' ')}</p>`); paragraph = [] } }
  const flushDisplay = () => { if (display.length) { out.push(`<div class="latex-display">${math(display.join('\n'), true)}</div>`); display = [] } }
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line === '---') { flush(); continue }
    if (displayEnv) { if (line.includes(`\\end{${displayEnv}}`)) { displayEnv = null; flushDisplay() } else display.push(line); continue }
    const env = line.match(/^\\begin\{(equation\*?|align\*?|gather\*?|bmatrix|pmatrix|matrix|cases)\}/)
    if (env) { flush(); displayEnv = env[1]; display = []; continue }
    if (line.startsWith('\\section')) { flush(); const heading = line.match(/^\\(section|subsection|subsubsection|paragraph)\*?\{(.+)\}$/); if (heading) { const level = { section: 2, subsection: 3, subsubsection: 4, paragraph: 5 }[heading[1]]; out.push(`<h${level}>${renderText(heading[2])}</h${level}>`) }; continue }
    if (line === '\\maketitle' || line.startsWith('\\begin{center}') || line.startsWith('\\end{center}')) continue
    if (line.startsWith('\\item ')) { out.push(`<li>${renderText(line.slice(6))}</li>`); continue }
    if (line.startsWith('\\begin{itemize}') || line.startsWith('\\begin{enumerate}')) { flush(); out.push('<ul>'); continue }
    if (line.startsWith('\\end{itemize}') || line.startsWith('\\end{enumerate}')) { out.push('</ul>'); continue }
    paragraph.push(renderText(line))
  }
  flush(); flushDisplay(); return out.join('\n')
}
const yamlValue = (value) => Array.isArray(value) ? value.map((item) => `  - '${String(item).replaceAll("'", "''")}'`).join('\n') : `'${String(value ?? '').replaceAll("'", "''")}'`
const postMarkdown = (meta, id, existing = {}) => {
  const fields = [['title', meta.title], ['date', existing.date || meta.date], ['updated', meta.updated || existing.updated || meta.date], ['description', meta.description || ''], ['permalink', existing.permalink || meta.permalink || `/${id}/`], ['sourceHash', meta.sourceHash], ['metadataHash', meta.metadataHash], ['rendererIdentity', RENDERER_IDENTITY], ['comments', meta.comments ?? true], ['mathjax', false], ['toc', meta.toc ?? false]]
  const lines = ['---', ...fields.map(([key, value]) => `${key}: ${typeof value === 'boolean' ? value : yamlValue(value)}`)]
  for (const key of ['categories', 'tags']) { lines.push(`${key}:`); lines.push(yamlValue(meta[key] || [])) }
  lines.push('---', '', `<div class="latex-document-rendered" data-render-fragment="${id}"></div>`, '')
  return lines.join('\n')
}
export function validatePublicationManifest(manifest) {
  const articles = manifest?.articles
  if (!Array.isArray(articles)) throw new Error('latex publication manifest must contain an articles array')
  const ids = new Set(); const permalinks = new Set()
  for (const article of articles) {
    if (!article.id || ids.has(article.id)) throw new Error(`duplicate or missing publication id: ${article.id || '<empty>'}`)
    if (!article.permalink || permalinks.has(article.permalink)) throw new Error(`duplicate or missing publication permalink: ${article.permalink || '<empty>'}`)
    if (!article.sourceHash || !article.metadataHash || !article.rendererIdentity || !article.renderKey) throw new Error(`publication identity incomplete: ${article.id}`)
    ids.add(article.id); permalinks.add(article.permalink)
  }
  return true
}
async function publish(texFile, metaFile) {
  const source = await fs.readFile(texFile, 'utf8'); const sourceHash = hash(source); const meta = await readYaml(metaFile)
  const id = String(meta.id || path.basename(texFile, path.extname(texFile))).replace(/[^\p{L}\p{N}_-]+/gu, '-')
  const metadataHash = hash(canonical({ title: meta.title, description: meta.description || '', categories: meta.categories || [], tags: meta.tags || [], permalink: meta.permalink || `/${id}/`, renderer: RENDERER_IDENTITY }))
  const renderKey = hash(`${sourceHash}\0${metadataHash}\0${RENDERER_IDENTITY}`)
  let rendered = renderTex(source)
  let renderCache = false
  if (meta.renderFragment && meta.renderSourceHash === renderKey) {
    try { rendered = await fs.readFile(path.resolve(root, meta.renderFragment), 'utf8'); renderCache = true } catch { /* render from source */ }
  }
  await fs.mkdir(path.resolve(root, 'source/content/renders'), { recursive: true }); await fs.mkdir(path.resolve(root, 'source/_posts'), { recursive: true })
  await fs.writeFile(path.resolve(root, `source/content/renders/${id}.html`), rendered)
  const postsDir = path.resolve(root, 'source/_posts')
  let postFile = path.join(postsDir, `${id}.md`); let existing = {}
  try {
    for (const candidate of await fs.readdir(postsDir)) {
      if (!candidate.endsWith('.md')) continue
      const candidatePath = path.join(postsDir, candidate)
      const candidateMeta = matter(await fs.readFile(candidatePath, 'utf8')).data
      if (candidateMeta.permalink && meta.permalink && candidateMeta.permalink === meta.permalink) { postFile = candidatePath; existing = candidateMeta; break }
    }
  } catch {}
  const manifestPath = path.resolve(root, 'source/_data/latex-publications.json'); let manifest = { articles: [] }
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch {}
  const previous = (manifest.articles || []).find((article) => article.id === id)
  const changed = previous ? previous.sourceHash !== sourceHash || previous.metadataHash !== metadataHash || previous.rendererIdentity !== RENDERER_IDENTITY : Boolean(existing.sourceHash && existing.sourceHash !== sourceHash)
  const updated = changed ? await stableUpdated(texFile, new Date().toISOString()) : (previous?.updated || existing.updated || meta.updated || meta.date)
  await fs.writeFile(postFile, postMarkdown({ ...meta, updated, sourceHash, metadataHash }, id, existing))
  manifest.articles = (manifest.articles || []).filter((article) => article.id !== id)
  manifest.articles.push({ id, title: meta.title, date: existing.date || previous?.date || meta.date, updated, description: meta.description || '', permalink: existing.permalink || previous?.permalink || meta.permalink || `/${id}/`, cover: meta.cover || '', categories: meta.categories || [], tags: meta.tags || [], home: meta.home !== false, carousel: meta.carousel === true, timeline: meta.timeline !== false, source: path.relative(root, texFile).split(path.sep).join('/'), sourceHash, metadataHash, rendererIdentity: RENDERER_IDENTITY, renderKey, renderCache })
  validatePublicationManifest(manifest)
  manifest.articles.sort((a, b) => String(b.date).localeCompare(String(a.date))); await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`published ${id}: ${renderCache ? 'cache reused' : 'rendered'}; source ${sourceHash.slice(0, 12)}`)
}
async function main() {
  const explicit = args.get('tex')
  const files = explicit ? [path.resolve(root, explicit)] : args.get('all') ? await walk(path.resolve(root, args.get('dir') || 'source/tex')) : []
  if (!files.length) throw new Error('用法: pnpm publish:latex -- --tex path/to/article.tex [--meta path/to/article.yaml] 或 --all [--dir source/tex]')
  for (const texFile of files) {
    const metaFile = path.resolve(root, explicit && args.get('meta') ? args.get('meta') : texFile.replace(/\.tex$/iu, '.yaml'))
    await publish(texFile, metaFile)
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
