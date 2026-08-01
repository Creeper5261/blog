import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const PICBED_CDN_PREFIX = 'https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main'
export const DEFAULT_ASSETS_DIR = path.resolve('.local', 'writer-assets')

function normalizeList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

function sanitizeSegment(value, fallback) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-|-$/g, '')
  return sanitized || fallback
}

function extensionFrom(originalName, imageName) {
  const fromImageName = path.extname(String(imageName || '')).toLowerCase()
  if (/^\.[a-z0-9]{1,8}$/i.test(fromImageName)) return fromImageName

  const fromOriginal = path.extname(String(originalName || '')).toLowerCase()
  if (/^\.[a-z0-9]{1,8}$/i.test(fromOriginal)) return fromOriginal

  return '.png'
}

function stemFrom(filename, fallback) {
  const ext = path.extname(String(filename || ''))
  const stem = ext ? String(filename).slice(0, -ext.length) : String(filename || '')
  return sanitizeSegment(stem, fallback)
}

function pad(value, length = 2) {
  return String(value).padStart(length, '0')
}

function defaultImageStem(now, sequence) {
  const date = now instanceof Date ? now : new Date(now || Date.now())
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    '-',
    pad(sequence || 1, 3)
  ].join('')
}

function categorySegments(categories) {
  const segments = normalizeList(categories).map((item) => sanitizeSegment(item, '未分类'))
  return segments.length ? segments : ['未分类']
}

export function planAssetTarget({
  categories = [],
  postFilename = 'draft.md',
  originalName = 'image.png',
  imageName = '',
  sequence = 1,
  now = new Date()
} = {}) {
  const ext = extensionFrom(originalName, imageName)
  const customStem = String(imageName || '').trim() ? stemFrom(imageName, 'image') : ''
  const stem = customStem || defaultImageStem(now, sequence)
  const filename = `${stem}${ext}`
  const postStem = stemFrom(postFilename, 'draft')
  const relativePath = ['img', 'posts', ...categorySegments(categories), postStem, filename].join('/')
  const url = `${PICBED_CDN_PREFIX}/${relativePath}`
  const alt = customStem || stem

  return {
    filename,
    relativePath,
    url,
    markdown: `![${alt}](${url})`
  }
}

export function bufferFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('invalid data url')
  const [, , base64Flag, payload] = match
  return Buffer.from(decodeURIComponent(payload), base64Flag ? 'base64' : 'utf8')
}

export async function stageAsset({
  assetsDir = DEFAULT_ASSETS_DIR,
  data,
  dataUrl,
  categories = [],
  postFilename = 'draft.md',
  originalName = 'image.png',
  imageName = '',
  sequence = 1,
  now = new Date()
} = {}) {
  const planned = planAssetTarget({ categories, postFilename, originalName, imageName, sequence, now })
  const root = path.resolve(assetsDir)
  const target = path.resolve(root, planned.relativePath)

  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('invalid asset target')

  const bytes = data ? Buffer.from(data) : bufferFromDataUrl(dataUrl)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)

  return {
    ...planned,
    localFile: target
  }
}

async function listFiles(root, current = root) {
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const files = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolute))
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolute).replaceAll(path.sep, '/'))
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export async function copyStagedAssetsToPicbed({
  assetsDir = DEFAULT_ASSETS_DIR,
  picbedCheckout
} = {}) {
  if (!picbedCheckout || !String(picbedCheckout).trim()) throw new Error('picbed checkout is required')

  const sourceRoot = path.resolve(assetsDir)
  const targetRoot = path.resolve(picbedCheckout)
  const files = await listFiles(sourceRoot)

  for (const relativePath of files) {
    const source = path.resolve(sourceRoot, relativePath)
    const target = path.resolve(targetRoot, relativePath)
    if (!source.startsWith(`${sourceRoot}${path.sep}`)) throw new Error('invalid staged asset path')
    if (!target.startsWith(`${targetRoot}${path.sep}`)) throw new Error('invalid picbed asset path')
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
  }

  return files
}

function quoteCommandValue(value) {
  return String(value || '').replace(/["\\]/g, '\\$&')
}

export function createPicbedPublishPlan({
  picbedCheckout = process.env.PICBED_REPO_CHECKOUT || '',
  message = 'chore: add blog assets'
} = {}) {
  if (!picbedCheckout || !String(picbedCheckout).trim()) {
    return {
      ok: false,
      error: 'PICBED_REPO_CHECKOUT is not configured'
    }
  }

  const checkout = String(picbedCheckout)
  const quotedCheckout = quoteCommandValue(checkout)
  const quotedMessage = quoteCommandValue(message)

  return {
    ok: true,
    checkout,
    commands: [
      `git -C "${quotedCheckout}" add img/posts`,
      `git -C "${quotedCheckout}" commit -m "${quotedMessage}"`,
      `git -C "${quotedCheckout}" push origin main`
    ]
  }
}
