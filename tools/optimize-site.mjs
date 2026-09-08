import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 24)
const ICON_URL = /(?:https?:)?\/\/at\.alicdn\.com\/t\/(?:c\/)?font_[\w]+\.js/g
const PICBED = 'https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/'

async function files(root, extension) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const name = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...await files(name, extension))
    else if (name.endsWith(extension)) result.push(name)
  }
  return result
}

export function subsetIcons(script, used) {
  const symbols = [...script.matchAll(/<symbol\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/symbol>/g)]
  if (!symbols.length) throw new Error('Unrecognized icon bundle')
  return symbols.filter(match => used.has(match[1])).map(match =>
    match[0].replace(/<path\b[^>]*\bd="[^"]*NaN[^"]*"[^>]*>(?:\s*<\/path>)?/g, '')
  ).join('')
}

// Lossless encoding avoids introducing new compression artifacts. Resizing is
// reserved for responsive card derivatives; original links stay untouched.
export async function imageVariants(input) {
  const meta = await sharp(input).metadata()
  if (!meta.width || !meta.height || (meta.pages || 1) > 1 || (meta.orientation && meta.orientation !== 1)) return []
  const results = []
  for (const width of [...new Set([480, 960, meta.width].filter(w => w <= meta.width))]) {
    const data = await sharp(input).rotate().resize({ width, withoutEnlargement: true })
      .webp({ lossless: true, effort: 6 }).toBuffer()
    if (data.length < input.length) results.push({ width, data })
  }
  return results
}

export async function optimizeSite({ root = 'dist', cache = '.local/asset-cache', fetcher = fetch } = {}) {
  await mkdir(cache, { recursive: true })
  const output = path.join(root, 'optimized')
  await mkdir(output, { recursive: true })
  const pages = await Promise.all((await files(root, '.html')).map(async file => ({ file, html: await readFile(file, 'utf8') })))
  const runtime = (await Promise.all((await files(path.join(root, 'js'), '.js')).map(file => readFile(file, 'utf8')))).join('\n')
  const all = pages.map(p => p.html).join('\n') + runtime
  const used = new Set([...all.matchAll(/\bicon-[\w-]+/g)].map(m => m[0]))
  const report = { icons: [], images: [], warnings: [] }
  async function fetchCached(url) {
    const target = path.join(cache, hash(url))
    let cached
    try {
      cached = await readFile(target)
      if (Date.now() - (await stat(target)).mtimeMs < 86400000) return cached
    } catch {}
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await writeFile(target, buffer)
      return buffer
    } catch (error) {
      if (!cached) throw error
      report.warnings.push(`Using cached asset after refresh failed: ${url}`)
      return cached
    }
  }
  for (const original of new Set(all.match(ICON_URL) || [])) {
    try {
      const input = await fetchCached(original.startsWith('//') ? `https:${original}` : original)
      const svg = subsetIcons(input.toString(), used)
      // Inline symbols retain all existing dynamic #icon-* references.
      const script = `(()=>{const d=document.createElement('div');d.hidden=true;d.innerHTML=${JSON.stringify(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`)};document.body.appendChild(d)})();`
      const url = `/optimized/icons-${hash(script)}.js`
      await writeFile(path.join(root, url.slice(1)), script)
      for (const page of pages) page.html = page.html.split(original).join(url)
      report.icons.push({ original, before: input.length, after: Buffer.byteLength(script) })
    } catch (error) { report.warnings.push(`Icon bundle retained: ${original}: ${error.message}`) }
  }
  // Only decorative covers, never article diagrams, SVG math, or linked originals.
  const imgPattern = /<img\b[^>]*\bclass=["'][^"']*\barticle-cover\b[^"']*["'][^>]*>/g
  const sources = new Set()
  for (const match of all.matchAll(/"cover":"(https:\/\/cdn\.jsdelivr\.net\/gh\/Creeper5261\/picbed@main\/[^"<>]+)"/g)) sources.add(match[1])
  for (const { html } of pages) for (const [tag] of html.matchAll(imgPattern)) {
    const url = tag.match(/\bdata-lazy-src="([^"]+)"/)?.[1] || tag.match(/\bsrc="([^"]+)"/)?.[1]
    if (url?.startsWith(PICBED) && /\.(webp|png|jpe?g)$/i.test(url)) sources.add(url)
  }
  const variants = new Map()
  for (const url of sources) {
    try {
      const input = await fetchCached(url)
      const key = `variants-v1-${hash(input)}.json`
      let entries
      try { entries = JSON.parse(await readFile(path.join(cache, key), 'utf8')) } catch {
        entries = []
        for (const { width, data } of await imageVariants(input)) {
          const name = `${hash(data)}.webp`
          await writeFile(path.join(cache, name), data)
          entries.push({ width, name, bytes: data.length })
        }
        await writeFile(path.join(cache, key), JSON.stringify(entries))
      }
      for (const entry of entries) await writeFile(path.join(output, entry.name), await readFile(path.join(cache, entry.name)))
      if (entries.length) {
        const { width } = await sharp(input).metadata()
        variants.set(url, entries.some(e => e.width === width) ? entries : [...entries, { width, url }])
      }
      report.images.push({ url, originalBytes: input.length, variants: entries })
    } catch (error) { report.warnings.push(`Original image retained: ${url}: ${error.message}`) }
  }
  const sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 480px'
  const manifest = Object.fromEntries([...variants].map(([url, entries]) => [url, {
    srcset: entries.map(e => `${e.url || `/optimized/${e.name}`} ${e.width}w`).join(', '), sizes
  }]))
  const enhancer = await readFile(path.join(root, 'js/responsive-covers.js'), 'utf8')
  const runtimeCode = `window.DAT_COVER_VARIANTS=${JSON.stringify(manifest)};\n${enhancer}`
  const runtimeUrl = `/optimized/covers-${hash(runtimeCode)}.js`
  await writeFile(path.join(root, runtimeUrl.slice(1)), runtimeCode)
  for (const page of pages) {
    page.html = page.html.replace(imgPattern, tag => {
      const url = tag.match(/\bdata-lazy-src="([^"]+)"/)?.[1] || tag.match(/\bsrc="([^"]+)"/)?.[1]
      const entries = variants.get(url)
      if (!entries?.length || /\bsrcset=/.test(tag)) return tag
      // Native lazy loading avoids a placeholder blocking responsive selection.
      const set = entries.map(e => `${e.url || `/optimized/${e.name}`} ${e.width}w`).join(', ')
      return tag.replace(/\sdata-lazy-src="[^"]*"/, '').replace(/\bsrc\s*=\s*"[^"]*"/, `src="${url}"`)
        .replace(/\s*\/?>(\s*)$/, ` data-responsive-source="${url}" srcset="${set}" sizes="${sizes}" loading="lazy" decoding="async">`)
    })
    if (page.html.includes('article-cover') || page.html.includes('blog-slider__img')) {
      page.html = page.html.replace(/<script\b[^>]*src="\/optimized\/covers-[^"]+"[^>]*><\/script>/g, '')
      page.html = page.html.replace('</head>', `<script defer src="${runtimeUrl}"></script></head>`)
    }
    await writeFile(page.file, page.html)
  }
  const configPath = path.join(root, 'vercel.json')
  let config = {}
  try { config = JSON.parse(await readFile(configPath, 'utf8')) } catch {}
  config.headers = [...(config.headers || []).filter(h => h.source !== '/optimized/(.*)'), {
    source: '/optimized/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
  }]
  await writeFile(configPath, JSON.stringify(config, null, 2))
  await writeFile(path.join(cache, 'last-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ icons: report.icons, images: report.images.length, warnings: report.warnings }, null, 2))
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await optimizeSite()
