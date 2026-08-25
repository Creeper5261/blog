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
import { parseLatexTable, splitHtmlDetails } from '../src/lib/latex-compat.mjs'

const root = process.cwd()
const exec = promisify(execFile)
const RENDERER_IDENTITY = 'katex-0.18.2-latex-basic-v6'
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i]
  if (value.startsWith('--')) args.set(value.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true)
}
const readYaml = async (file) => matter(`---\n${await fs.readFile(file, 'utf8')}\n---`).data
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort())
export const metadataHashFor = (meta, id) => hash(canonical(Object.fromEntries(Object.entries({ ...meta, id, rendererIdentity: RENDERER_IDENTITY }).filter(([key]) => !['updated', 'renderFragment', 'renderSourceHash'].includes(key)))))
const stableUpdated = async (file, fallback) => {
  if (process.env.PUBLISH_UPDATED_AT) return process.env.PUBLISH_UPDATED_AT
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
const renderText = (line) => esc(line)
  .replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>')
  .replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>')
  .replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>')
  .replace(/\\text\{([^{}]*)\}/g, '$1')
  .replace(/\\texttt\{([^{}]*)\}/g, '<code>$1</code>')
  .replace(/\\[,;!]/g, ' ')
  .replace(/\\\[([\s\S]*?)\\\]/g, (_, value) => math(value, true))
  .replace(/\$([^$]+)\$/g, (_, value) => math(value))
const renderTable = (source) => {
  const parsed = parseLatexTable(source)
  if (!parsed.rows.length) return ''
  const rows = parsed.rows.map(({ cells, header }) => `<tr>${cells.map((cell) => `<${header ? 'th' : 'td'}>${renderText(cell)}</${header ? 'th' : 'td'}>`).join('')}</tr>`).join('')
  return `<div class="latex-table-wrap"><table class="latex-table${parsed.hasBooktabs ? ' latex-table-booktabs' : ''}"><tbody>${rows}</tbody></table></div>`
}
function renderTexBody(body) {
  const out = []; let paragraph = []; let display = []; let displayEnv = null; let displayBracket = false; let tableEnv = null; let table = []
  const layoutControls = /^(?:\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|centering|raggedright|raggedleft|noindent|smallskip|medskip|bigskip))$/u
  const flush = () => { if (paragraph.length) { out.push(`<p>${paragraph.join(' ')}</p>`); paragraph = [] } }
  const flushDisplay = () => { if (display.length) { out.push(`<div class="latex-display">${math(display.join('\n'), true)}</div>`); display = [] } }
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line === '---') { flush(); continue }
    if (tableEnv) { if (line.includes(`\\end{${tableEnv}}`)) { out.push(renderTable(table.join('\n'))); tableEnv = null; table = [] } else table.push(line); continue }
    if (displayEnv || displayBracket) {
      const endToken = displayBracket ? '\\]' : `\\end{${displayEnv}}`
      if (line.includes(endToken)) {
        const before = line.split(endToken)[0]
        if (before) display.push(before)
        if (displayEnv) display.push(`\\end{${displayEnv}}`)
        displayEnv = null; displayBracket = false; flushDisplay()
      } else display.push(line)
      continue
    }
    const tableMatch = line.match(/^\\begin\{(tabular\*?|tabularx|longtable|array)\}/)
    if (tableMatch) { flush(); tableEnv = tableMatch[1]; table = []; continue }
    const env = line.match(/^\\begin\{(equation\*?|align\*?|gather\*?|bmatrix|pmatrix|matrix|cases)\}/)
    if (env) { flush(); displayEnv = env[1]; display = [`\\begin{${env[1]}}`]; continue }
    if (line.startsWith('\\[')) {
      flush()
      const rest = line.slice(2)
      if (rest.includes('\\]')) { display = [rest.split('\\]')[0]]; flushDisplay() }
      else { displayBracket = true; display = rest ? [rest] : [] }
      continue
    }
    if (line.startsWith('\\section')) { flush(); const heading = line.match(/^\\(section|subsection|subsubsection|paragraph)\*?\{(.+)\}$/); if (heading) { const level = { section: 2, subsection: 3, subsubsection: 4, paragraph: 5 }[heading[1]]; out.push(`<h${level}>${renderText(heading[2])}</h${level}>`) }; continue }
    if (layoutControls.test(line)) continue
    if (line === '\\maketitle' || line.startsWith('\\begin{center}') || line.startsWith('\\end{center}')) continue
    if (line.startsWith('\\item ')) { out.push(`<li>${renderText(line.slice(6))}</li>`); continue }
    if (line.startsWith('\\begin{itemize}') || line.startsWith('\\begin{enumerate}')) { flush(); out.push('<ul>'); continue }
    if (line.startsWith('\\end{itemize}') || line.startsWith('\\end{enumerate}')) { out.push('</ul>'); continue }
    paragraph.push(renderText(line))
  }
  flush(); flushDisplay(); return out.join('\n')
}
function renderTex(source) {
  const body = source.replace(/[\s\S]*?\\begin\{document\}/, '').replace(/\\end\{document\}[\s\S]*/, '')
  return splitHtmlDetails(body).map((segment) => {
    if (segment.type !== 'details') return renderTexBody(segment.source)
    const open = segment.open ? ' open' : ''
    return `<details class="latex-details"${open}><summary>${renderText(segment.summary)}</summary><div class="latex-details-body">${renderTexBody(segment.source)}</div></details>`
  }).join('\n')
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
    if (article.renderCache !== true && article.renderCache !== false) throw new Error(`publication renderCache incomplete: ${article.id}`)
    ids.add(article.id); permalinks.add(article.permalink)
  }
  return true
}
export async function validatePublicationFiles(manifest, repositoryRoot = root) {
  validatePublicationManifest(manifest)
  for (const article of manifest.articles) {
    for (const file of [article.source, article.yaml, `source/content/renders/${article.id}.html`]) {
      if (!file || !await fs.stat(path.resolve(repositoryRoot, file)).catch(() => null)) throw new Error(`publication file missing: ${article.id}:${file || '<empty>'}`)
    }
    const sourceText = await fs.readFile(path.resolve(repositoryRoot, article.source), 'utf8')
    const yamlText = await fs.readFile(path.resolve(repositoryRoot, article.yaml), 'utf8')
    const meta = matter(`---\n${yamlText}\n---`).data
    if (meta.id !== article.id || meta.renderFragment !== `source/content/renders/${article.id}.html`) throw new Error(`publication render fragment mismatch: ${article.id}`)
    const sourceHash = hash(sourceText)
    const metadataHash = metadataHashFor(meta, article.id)
    const renderKey = hash(`${sourceHash}\0${metadataHash}\0${RENDERER_IDENTITY}`)
    if (meta.renderSourceHash !== renderKey) throw new Error(`publication YAML render identity mismatch: ${article.id}`)
    if (article.sourceHash !== sourceHash || article.metadataHash !== metadataHash || article.rendererIdentity !== RENDERER_IDENTITY || article.renderKey !== renderKey) throw new Error(`publication identity mismatch: ${article.id}`)
    const render = await fs.readFile(path.resolve(repositoryRoot, `source/content/renders/${article.id}.html`), 'utf8')
    if (!render.trim()) throw new Error(`publication render empty: ${article.id}`)
    const posts = await fs.readdir(path.resolve(repositoryRoot, 'source/_posts'))
    const postFile = (await Promise.all(posts.filter((name) => name.endsWith('.md')).map(async (name) => ({ name, data: matter(await fs.readFile(path.resolve(repositoryRoot, 'source/_posts', name), 'utf8')).data })))).find(({ data }) => data.sourceHash === article.sourceHash)
    if (!postFile || postFile.data.permalink !== article.permalink || !((await fs.readFile(path.resolve(repositoryRoot, 'source/_posts', postFile.name), 'utf8')).includes(`data-render-fragment="${article.id}"`))) throw new Error(`publication post contract mismatch: ${article.id}`)
    if (article.renderCache && meta.renderFragment !== `source/content/renders/${article.id}.html`) throw new Error(`publication cache is not linked: ${article.id}`)
  }
  return true
}
async function publish(texFile, metaFile) {
  const source = await fs.readFile(texFile, 'utf8'); const sourceHash = hash(source); const meta = await readYaml(metaFile)
  const id = String(meta.id || path.basename(texFile, path.extname(texFile))).replace(/[^\p{L}\p{N}_-]+/gu, '-')
  const metadataHash = metadataHashFor(meta, id)
  const renderKey = hash(`${sourceHash}\0${metadataHash}\0${RENDERER_IDENTITY}`)
  const yamlText = await fs.readFile(metaFile, 'utf8')
  const syncedYaml = yamlText
    .replace(/^renderFragment:.*$/mu, `renderFragment: 'source/content/renders/${id}.html'`)
    .replace(/^renderSourceHash:.*$/mu, `renderSourceHash: '${renderKey}'`)
  if (syncedYaml !== yamlText) await fs.writeFile(metaFile, syncedYaml)
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
  manifest.articles.push({ id, title: meta.title, date: existing.date || previous?.date || meta.date, updated, description: meta.description || '', permalink: existing.permalink || previous?.permalink || meta.permalink || `/${id}/`, cover: meta.cover || '', categories: meta.categories || [], tags: meta.tags || [], home: meta.home !== false, carousel: meta.carousel === true, timeline: meta.timeline !== false, source: path.relative(root, texFile).split(path.sep).join('/'), yaml: path.relative(root, metaFile).split(path.sep).join('/'), sourceHash, metadataHash, rendererIdentity: RENDERER_IDENTITY, renderKey, renderCache })
  validatePublicationManifest(manifest)
  await validatePublicationFiles(manifest)
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
