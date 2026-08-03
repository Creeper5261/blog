import crypto from 'node:crypto'
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as cheerio from 'cheerio'
import matter from 'gray-matter'

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'source')
const ARTICLES_ROOT = path.join(REPOSITORY_ROOT, 'content', 'articles')
const MEDIA_ROOT = path.join(REPOSITORY_ROOT, 'content', 'media')
const EXTERNAL_ROOT = path.join(REPOSITORY_ROOT, 'external', 'resources')
const INVENTORY_FILE = path.join(REPOSITORY_ROOT, 'source', '_data', 'content-migration.json')

const PUBLISHABLE_EXTENSIONS = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.pdf', '.png', '.svg', '.webp'
])
const RESOURCE_ATTRIBUTES = [
  ['src', 'source'],
  ['data-lazy-src', 'lazy-source'],
  ['poster', 'poster'],
  ['href', 'link']
]

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function safeTitle(value, fallback) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value !== 'string' || !value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function stripRawDirectives(value) {
  return value.replace(/{%\s*raw\s*%}/gi, '').replace(/{%\s*endraw\s*%}/gi, '').trim()
}

function relativeRepositoryPath(file) {
  return normalizePath(path.relative(REPOSITORY_ROOT, file))
}

function stableId(prefix, value) {
  return `${prefix}.${digest(value)}`
}

function isAbsoluteHttp(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function resourceValue(value) {
  return String(value ?? '').trim().replace(/&amp;/g, '&')
}

async function walkFiles(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(file))
    if (entry.isFile()) files.push(file)
  }
  return files
}

async function contentSources() {
  return (await walkFiles(SOURCE_ROOT))
    .filter((file) => path.extname(file).toLowerCase() === '.md')
    .filter((file) => !relativeRepositoryPath(file).startsWith('source/explain/'))
    .sort((left, right) => relativeRepositoryPath(left).localeCompare(relativeRepositoryPath(right)))
}

function parseResourceReferences(file, document) {
  const body = stripRawDirectives(document.content)
  const $ = cheerio.load(body, { decodeEntities: false })
  const references = []
  const add = (value, type, element, attribute) => {
    const resource = resourceValue(value)
    if (!resource || resource.startsWith('#') || resource.startsWith('data:') || resource.startsWith('javascript:')) return
    references.push({
      value: resource,
      type,
      attribute,
      tag: element?.tagName ?? null,
      alt: safeTitle(element ? $(element).attr('alt') : '', document.data.title ?? 'legacy resource')
    })
  }

  for (const [attribute, type] of RESOURCE_ATTRIBUTES) {
    $('*').each((_, element) => add($(element).attr(attribute), type, element, attribute))
  }
  $('*').each((_, element) => {
    for (const [attribute, value] of Object.entries(element.attribs ?? {})) {
      if (/^data-(?:src|href|url|poster)$/i.test(attribute) || attribute === 'data') add(value, 'data-resource', element, attribute)
      if (attribute === 'style') {
        for (const match of value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1], 'style-url', element, attribute)
      }
    }
  })
  $('*').each((_, element) => {
    const srcset = $(element).attr('srcset')
    if (!srcset) return
    for (const candidate of srcset.split(',')) add(candidate.trim().split(/\s+/)[0], 'srcset', element, 'srcset')
  })
  for (const cover of [document.data.cover, document.data.banner_img, document.data.top_img]) {
    if (cover) add(cover, 'cover', null, 'frontmatter')
  }
  return references
}

function localCandidate(file, value) {
  if (value.startsWith('/')) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null
  const withoutQuery = value.split(/[?#]/, 1)[0]
  const absolute = path.resolve(path.dirname(file), withoutQuery)
  if (!absolute.startsWith(`${SOURCE_ROOT}${path.sep}`)) return null
  return absolute
}

function providerFor(url, type) {
  const host = new URL(url).hostname.toLowerCase()
  if (type === 'cover' || type.includes('source') || type === 'poster' || type === 'srcset') return 'source-media'
  if (host.includes('bilibili')) return 'source-video'
  if (url.toLowerCase().endsWith('.pdf')) return 'source-document'
  return 'source-link'
}

function assetPathFor(sourceFile) {
  const relative = normalizePath(path.relative(SOURCE_ROOT, sourceFile))
  return normalizePath(path.join('migrated', relative))
}

function altFor(reference, document) {
  return safeTitle(reference.alt, safeTitle(document.data.title, 'source asset'))
}

async function copyLegacyAsset(sourceFile, targetRelative) {
  const target = path.join(REPOSITORY_ROOT, 'assets', targetRelative)
  await mkdir(path.dirname(target), { recursive: true })
  const bytes = await readFile(sourceFile)
  await writeFile(target, isBmp(bytes) ? bmpToPng(bytes) : bytes)
  return target
}

function isBmp(bytes) {
  return bytes.length > 54 && bytes.subarray(0, 2).toString('ascii') === 'BM'
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(8 + data.length + 4)
  chunk.writeUInt32BE(data.length, 0)
  name.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length)
  return chunk
}

function bmpToPng(bytes) {
  const pixelOffset = bytes.readUInt32LE(10)
  const width = bytes.readInt32LE(18)
  const signedHeight = bytes.readInt32LE(22)
  const height = Math.abs(signedHeight)
  const bitsPerPixel = bytes.readUInt16LE(28)
  const compression = bytes.readUInt32LE(30)
  if (!width || !height || ![24, 32].includes(bitsPerPixel) || compression !== 0) {
    throw new Error('unsupported BMP source asset')
  }
  const bytesPerPixel = bitsPerPixel / 8
  const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4
  const scanlines = Buffer.alloc((width * 4 + 1) * height)
  for (let outputRow = 0; outputRow < height; outputRow++) {
    const sourceRow = signedHeight > 0 ? height - outputRow - 1 : outputRow
    const sourceStart = pixelOffset + sourceRow * rowStride
    const outputStart = outputRow * (width * 4 + 1)
    scanlines[outputStart] = 0
    for (let x = 0; x < width; x++) {
      const source = sourceStart + x * bytesPerPixel
      const target = outputStart + 1 + x * 4
      scanlines[target] = bytes[source + 2]
      scanlines[target + 1] = bytes[source + 1]
      scanlines[target + 2] = bytes[source]
      scanlines[target + 3] = bitsPerPixel === 32 ? bytes[source + 3] : 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function externalRecord({ id, url, source, title, provider }) {
  return {
    schemaVersion: 1,
    id,
    kind: 'external-embed',
    title,
    status: 'archived',
    provider,
    url,
    source,
  }
}

function mediaRecord({ id, title, asset, source }) {
  return {
    schemaVersion: 1,
    id,
    kind: 'media',
    title,
    status: 'archived',
    asset,
    source,
  }
}

function articleRecord({ id, document, source, media, relations }) {
  const record = {
    schemaVersion: 1,
    id,
    kind: 'article',
    title: safeTitle(document.data.title, path.basename(source, '.md')),
    status: 'archived',
    body: stripRawDirectives(document.content),
    source,
    media,
    relations,
  }
  const publishedAt = dateValue(document.data.date)
  const updatedAt = dateValue(document.data.updated)
  if (publishedAt) record.publishedAt = publishedAt
  if (updatedAt) record.updatedAt = updatedAt
  return record
}

async function migrate({ write = true } = {}) {
  const files = await contentSources()
  const external = new Map()
  const media = new Map()
  const articles = []
  const resourceEntries = []
  const copiedAssets = new Set()

  for (const file of files) {
    const source = relativeRepositoryPath(file)
    const document = matter(await readFile(file, 'utf8'))
    const articleId = stableId('article', source)
    const articleMedia = []
    const relations = []
    const references = parseResourceReferences(file, document)
    for (const [index, reference] of references.entries()) {
      const local = localCandidate(file, reference.value)
      if (local) {
        try {
          const fileStat = await stat(local)
          if (!fileStat.isFile()) throw new Error('not a file')
          const extension = path.extname(local).toLowerCase()
          if (!PUBLISHABLE_EXTENSIONS.has(extension)) {
            resourceEntries.push({ articleId, source, index, type: 'local-unpublished', value: reference.value, resolved: relativeRepositoryPath(local) })
            continue
          }
          const targetRelative = assetPathFor(local)
          const targetPath = normalizePath(path.join('..', '..', 'assets', targetRelative))
          const id = stableId('media', targetRelative)
          if (!media.has(id)) {
            media.set(id, mediaRecord({
              id,
              title: path.basename(local),
              asset: { path: targetPath, alt: altFor(reference, document), rights: 'source asset; provenance retained in source field' },
              source: relativeRepositoryPath(local)
            }))
          }
          articleMedia.push({ path: targetPath, alt: altFor(reference, document), rights: 'source asset; provenance retained in source field' })
          relations.push({ type: 'references', target: id })
          resourceEntries.push({ articleId, source, index, type: reference.type, value: reference.value, resolved: relativeRepositoryPath(local), target: id })
          if (write && !copiedAssets.has(targetRelative)) {
            await copyLegacyAsset(local, targetRelative)
            copiedAssets.add(targetRelative)
          }
        } catch {
          resourceEntries.push({ articleId, source, index, type: 'missing-local', value: reference.value })
        }
        continue
      }

      if (isAbsoluteHttp(reference.value)) {
        const id = stableId('external', reference.value)
        if (!external.has(id)) {
          external.set(id, externalRecord({
            id,
            url: reference.value,
            title: reference.value,
            provider: providerFor(reference.value, reference.type),
            source: `${source}#resource-${index}`
          }))
        }
        relations.push({ type: 'references', target: id })
        resourceEntries.push({ articleId, source, index, type: reference.type, value: reference.value, target: id })
        continue
      }

      resourceEntries.push({ articleId, source, index, type: 'internal-route', value: reference.value })
    }
    articles.push(articleRecord({ id: articleId, document, source, media: articleMedia, relations }))
  }

  const staticAssetFiles = []
  for (const root of ['img', 'temp_classify']) {
    for (const file of await walkFiles(path.join(SOURCE_ROOT, root))) {
      const relative = relativeRepositoryPath(file)
      const extension = path.extname(file).toLowerCase()
      if (!PUBLISHABLE_EXTENSIONS.has(extension)) {
        staticAssetFiles.push({ source: relative, status: 'excluded', reason: 'extension-not-publishable' })
        continue
      }
      const targetRelative = assetPathFor(file)
      const targetPath = normalizePath(path.join('..', '..', 'assets', targetRelative))
      const id = stableId('media', targetRelative)
      if (!media.has(id)) {
        media.set(id, mediaRecord({
          id,
          title: path.basename(file),
          asset: { path: targetPath, alt: path.basename(file), rights: 'source asset; provenance retained in source field' },
          source: relative
        }))
      }
      staticAssetFiles.push({ source: relative, target: targetRelative, id, status: 'migrated' })
      if (write && !copiedAssets.has(targetRelative)) {
        await copyLegacyAsset(file, targetRelative)
        copiedAssets.add(targetRelative)
      }
    }
  }

  const records = [...articles, ...media.values(), ...external.values()].sort((left, right) => left.id.localeCompare(right.id))
  const inventory = {
    schemaVersion: 1,
    sourceRoot: 'source',
    generatedBy: 'tools/content-migration/migrate.mjs',
    preservation: {
      sourceMarkdownUnchanged: true,
      publishedRoutesUnchanged: true,
    },
    counts: {
      sourceFiles: files.length,
      articles: articles.length,
      mediaObjects: media.size,
      externalObjects: external.size,
      resourceReferences: resourceEntries.length,
      migratedStaticAssets: staticAssetFiles.filter((item) => item.status === 'migrated').length,
      excludedStaticAssets: staticAssetFiles.filter((item) => item.status === 'excluded').length
    },
    articles: articles.map((record) => ({ id: record.id, source: record.source, title: record.title })).sort((left, right) => left.id.localeCompare(right.id)),
    resources: resourceEntries,
    staticAssets: staticAssetFiles.sort((left, right) => left.source.localeCompare(right.source))
  }

  if (write) {
    await rm(ARTICLES_ROOT, { recursive: true, force: true })
    await rm(MEDIA_ROOT, { recursive: true, force: true })
    await rm(EXTERNAL_ROOT, { recursive: true, force: true })
    await mkdir(ARTICLES_ROOT, { recursive: true })
    await mkdir(MEDIA_ROOT, { recursive: true })
    await mkdir(EXTERNAL_ROOT, { recursive: true })
    for (const record of articles) await writeFile(path.join(ARTICLES_ROOT, `${record.id}.json`), json(record))
    for (const record of media.values()) await writeFile(path.join(MEDIA_ROOT, `${record.id}.json`), json(record))
    for (const record of external.values()) await writeFile(path.join(EXTERNAL_ROOT, `${record.id}.json`), json(record))
    await writeFile(INVENTORY_FILE, json(inventory))
  }

  return { ok: true, records, inventory }
}

async function checkMigration() {
  const result = await migrate({ write: false })
  let inventory
  try {
    inventory = JSON.parse(await readFile(INVENTORY_FILE, 'utf8'))
  } catch (error) {
    return { ok: false, errors: [`missing migration inventory: ${error.message}`], expected: result.inventory }
  }
  const errors = []
  if (JSON.stringify(inventory) !== JSON.stringify(result.inventory)) errors.push('migration inventory is stale; run pnpm run migrate:content')
  for (const record of result.records) {
    const root = record.kind === 'external-embed' ? EXTERNAL_ROOT : record.kind === 'article' ? ARTICLES_ROOT : MEDIA_ROOT
    const file = path.join(root, `${record.id}.json`)
    try { await access(file) } catch { errors.push(`missing migrated record: ${relativeRepositoryPath(file)}`) }
  }
  for (const item of result.inventory.staticAssets.filter((entry) => entry.status === 'migrated')) {
    try { await access(path.join(REPOSITORY_ROOT, 'assets', item.target)) } catch { errors.push(`missing migrated asset: assets/${item.target}`) }
  }
  return { ok: errors.length === 0, errors, inventory }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes('--check')
  const result = checkOnly ? await checkMigration() : await migrate({ write: true })
  console.log(JSON.stringify({ ok: result.ok, counts: result.inventory?.counts }, null, 2))
  if (!result.ok) {
    for (const error of result.errors ?? []) console.error(error)
    process.exitCode = 1
  }
}

export { checkMigration, migrate, parseResourceReferences }
