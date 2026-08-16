#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import matter from 'gray-matter'
import katex from 'katex'

const root = process.cwd()
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i]
  if (value.startsWith('--')) args.set(value.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true)
}
const readYaml = async (file) => matter(`---\n${await fs.readFile(file, 'utf8')}\n---`).data
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
const postMarkdown = (meta, id) => {
  const fields = [['title', meta.title], ['date', meta.date], ['updated', meta.updated || meta.date], ['description', meta.description || ''], ['permalink', meta.permalink || `/${id}/`], ['comments', meta.comments ?? true], ['mathjax', false], ['toc', meta.toc ?? false]]
  const lines = ['---', ...fields.map(([key, value]) => `${key}: ${typeof value === 'boolean' ? value : yamlValue(value)}`)]
  for (const key of ['categories', 'tags']) { lines.push(`${key}:`); lines.push(yamlValue(meta[key] || [])) }
  lines.push('---', '', `<div class="latex-document-rendered" data-render-fragment="${id}"></div>`, '')
  return lines.join('\n')
}
async function main() {
  const texFile = args.get('tex'); if (!texFile) throw new Error('用法: pnpm publish:latex -- --tex path/to/article.tex --meta path/to/article.yaml')
  const metaFile = args.get('meta') || texFile.replace(/\.tex$/i, '.yaml')
  const source = await fs.readFile(path.resolve(root, texFile), 'utf8'); const meta = await readYaml(path.resolve(root, metaFile))
  const id = String(meta.id || path.basename(texFile, path.extname(texFile))).replace(/[^\p{L}\p{N}_-]+/gu, '-')
  let rendered = renderTex(source)
  if (meta.renderFragment) {
    try { rendered = await fs.readFile(path.resolve(root, meta.renderFragment), 'utf8') } catch { /* cache is optional; render from the source */ }
  }
  await fs.mkdir(path.resolve(root, 'source/content/renders'), { recursive: true }); await fs.mkdir(path.resolve(root, 'source/_posts'), { recursive: true })
  await fs.writeFile(path.resolve(root, `source/content/renders/${id}.html`), rendered)
  const postsDir = path.resolve(root, 'source/_posts')
  let postFile = path.join(postsDir, `${id}.md`)
  try {
    for (const candidate of await fs.readdir(postsDir)) {
      if (!candidate.endsWith('.md')) continue
      const candidatePath = path.join(postsDir, candidate)
      const candidateMeta = matter(await fs.readFile(candidatePath, 'utf8')).data
      if (candidateMeta.permalink && meta.permalink && candidateMeta.permalink === meta.permalink) { postFile = candidatePath; break }
    }
  } catch {}
  await fs.writeFile(postFile, postMarkdown(meta, id))
  const manifestPath = path.resolve(root, 'source/_data/latex-publications.json'); let manifest = { articles: [] }
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch {}
  manifest.articles = (manifest.articles || []).filter((article) => article.id !== id)
  manifest.articles.push({ id, title: meta.title, date: meta.date, updated: meta.updated || meta.date, description: meta.description || '', permalink: meta.permalink || `/${id}/`, cover: meta.cover || '', categories: meta.categories || [], tags: meta.tags || [], home: meta.home !== false, carousel: meta.carousel === true, timeline: meta.timeline !== false })
  manifest.articles.sort((a, b) => String(b.date).localeCompare(String(a.date))); await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`published ${id}: post, render fragment and publication manifest updated`)
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
