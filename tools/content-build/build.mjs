import crypto from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'
import sharp from 'sharp'

import { validateKnowledgeSite } from '../content-contracts/validate.mjs'
import { rewriteMarkdownAssetUrls } from './markdown.mjs'

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function addError(errors, file, code, message, pointer = '') {
  errors.push({ file, code, pointer, message })
}

async function walkFiles(root, current = root) {
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(root, absolute))
    if (entry.isFile()) files.push(absolute)
  }
  return files
}

async function loadAssetMetadata({ repositoryRoot, schemasRoot, assetsRoot, policy, errors }) {
  const metadataFile = path.resolve(assetsRoot, policy.metadataFile)
  if (!isInside(assetsRoot, metadataFile)) {
    addError(errors, 'knowledge-site.config.json', 'unsafe-metadata-path', 'asset metadata file escapes the asset root', '/assetPolicy/metadataFile')
    return { file: metadataFile, assets: {} }
  }

  let metadata
  try {
    metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
  } catch (error) {
    addError(errors, normalizePath(path.relative(repositoryRoot, metadataFile)), 'invalid-asset-metadata', error.message)
    return { file: metadataFile, assets: {} }
  }

  const schema = JSON.parse(await readFile(path.join(schemasRoot, 'v1', 'asset-metadata.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  if (!validate(metadata)) {
    for (const error of validate.errors ?? []) {
      addError(errors, normalizePath(path.relative(repositoryRoot, metadataFile)), 'asset-metadata-schema', error.message ?? 'schema validation failed', error.instancePath)
    }
  }

  return { file: metadataFile, assets: metadata.assets ?? {} }
}

function assetReferences(record) {
  const markdown = record.references?.assets ?? []
  const structured = [
    ...(record.document.media ?? []).map((reference, index) => ({
      path: reference.path,
      kind: IMAGE_EXTENSIONS.has(path.extname(reference.path).toLowerCase()) ? 'image' : 'file',
      alt: reference.alt,
      rights: reference.rights,
      pointer: `/media/${index}/path`
    })),
    ...(record.document.asset ? [{
      path: record.document.asset.path,
      kind: IMAGE_EXTENSIONS.has(path.extname(record.document.asset.path).toLowerCase()) ? 'image' : 'file',
      alt: record.document.asset.alt,
      rights: record.document.asset.rights,
      pointer: '/asset/path'
    }] : [])
  ]
  return [...markdown, ...structured]
}

async function imageMetadata(bytes, extension) {
  if (!IMAGE_EXTENSIONS.has(extension)) return { width: null, height: null, format: null }
  const metadata = await sharp(bytes, { animated: true }).metadata()
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? extension.slice(1)
  }
}

function contentRecord(record, resolvedAssets) {
  const extension = path.extname(record.absoluteFile).toLowerCase()
  const body = ['.md', '.mdx'].includes(extension)
    ? rewriteMarkdownAssetUrls(
        record.document.body ?? '',
        resolvedAssets.map((asset) => ({ path: asset.authoredPath, url: asset.url })),
        { extension }
      )
    : record.document.body ?? null
  return {
    schemaVersion: 1,
    id: record.document.id,
    kind: record.document.kind,
    title: record.document.title,
    status: record.document.status,
    publishedAt: record.document.publishedAt ?? null,
    updatedAt: record.document.updatedAt ?? null,
    source: record.file,
    body,
    relations: record.document.relations ?? [],
    knowledgeLinks: (record.references?.knowledgeIds ?? []).map((reference) => reference.target),
    contentLinks: (record.references?.contentPaths ?? []).map((reference) => reference.path),
    routeLinks: (record.references?.routes ?? []).map((reference) => reference.path),
    externalLinks: (record.references?.externalUrls ?? []).map((reference) => reference.url),
    codeBlocks: record.codeBlocks,
    assets: resolvedAssets
  }
}

async function writeGeneratedOutput({ generatedRoot, manifest, records, report, assetSources }) {
  const stagingRoot = path.join(generatedRoot, `.content-build-${process.pid}`)
  const siteDataTarget = path.join(generatedRoot, 'site-data')
  const mediaTarget = path.join(generatedRoot, 'media')
  await rm(stagingRoot, { recursive: true, force: true })
  await mkdir(path.join(stagingRoot, 'site-data'), { recursive: true })
  await mkdir(path.join(stagingRoot, 'media'), { recursive: true })

  await Promise.all([
    writeFile(path.join(stagingRoot, 'site-data', 'asset-manifest.json'), json(manifest)),
    writeFile(path.join(stagingRoot, 'site-data', 'content-records.json'), json(records)),
    writeFile(path.join(stagingRoot, 'site-data', 'build-report.json'), json(report))
  ])
  for (const [filename, source] of assetSources) {
    await copyFile(source, path.join(stagingRoot, 'media', filename))
  }

  await rm(siteDataTarget, { recursive: true, force: true })
  await rm(mediaTarget, { recursive: true, force: true })
  await rename(path.join(stagingRoot, 'site-data'), siteDataTarget)
  await rename(path.join(stagingRoot, 'media'), mediaTarget)
  await rm(stagingRoot, { recursive: true, force: true })
}

export async function buildKnowledgeContent({ root = process.cwd(), write = true } = {}) {
  const repositoryRoot = path.resolve(root)
  const validation = await validateKnowledgeSite({ root: repositoryRoot, includeRecords: true })
  if (!validation.ok) {
    return {
      ok: false,
      scannedFiles: validation.scannedFiles,
      objectCount: validation.objectCount,
      errors: validation.errors
    }
  }

  const { config, records, roots } = validation
  const errors = []
  const policy = config.assetPolicy
  const metadata = await loadAssetMetadata({
    repositoryRoot,
    schemasRoot: roots.schemas,
    assetsRoot: roots.assets,
    policy,
    errors
  })
  const allowedExtensions = new Set(policy.allowedExtensions)
  const assetsByHash = new Map()
  const assetSources = new Map()
  const referencedSourcePaths = new Set()
  const resolvedByRecord = new Map()

  for (const record of records) {
    for (const reference of record.references?.contentPaths ?? []) {
      const pointer = reference.line ? `line:${reference.line}:${reference.column}` : ''
      const localPath = reference.path.split(/[?#]/, 1)[0]
      const absolute = path.resolve(path.dirname(record.absoluteFile), localPath)
      if (!isInside(roots.content, absolute)) {
        addError(errors, record.file, 'content-link-outside-root', 'relative content link escapes the configured content root', pointer)
        continue
      }
      try {
        const targetStat = await stat(absolute)
        if (!targetStat.isFile()) throw new Error('not a file')
      } catch {
        addError(errors, record.file, 'missing-content-link', `linked content does not exist: ${reference.path}`, pointer)
      }
    }

    const resolvedAssets = []
    for (const reference of assetReferences(record)) {
      const pointer = reference.pointer ?? (reference.line ? `line:${reference.line}:${reference.column}` : '')
      let localPath = reference.path.split(/[?#]/, 1)[0]
      try {
        localPath = decodeURIComponent(localPath)
      } catch {
        addError(errors, record.file, 'invalid-asset-path', `asset path cannot be decoded: ${reference.path}`, pointer)
        continue
      }
      const absolute = path.resolve(path.dirname(record.absoluteFile), localPath)
      if (!isInside(roots.assets, absolute)) {
        addError(errors, record.file, 'asset-outside-root', 'publishable assets must resolve inside the configured asset root', pointer)
        continue
      }

      const sourcePath = normalizePath(path.relative(roots.assets, absolute))
      const extension = path.extname(sourcePath).toLowerCase()
      if (!allowedExtensions.has(extension)) {
        addError(errors, record.file, 'asset-extension-not-allowed', `asset extension is not allowed: ${extension || '(none)'}`, pointer)
        continue
      }
      if (reference.kind === 'image' && policy.requireAlt && !reference.alt.trim()) {
        addError(errors, record.file, 'missing-asset-alt', 'image alternative text is required', pointer)
      }
      const rights = metadata.assets[sourcePath]
      const rightsLabel = reference.rights ?? rights?.rights
      if (policy.requireRights && !rightsLabel) {
        addError(errors, record.file, 'missing-asset-rights', `asset rights metadata is required: ${sourcePath}`, pointer)
      }

      let fileStat
      let bytes
      try {
        fileStat = await stat(absolute)
        if (!fileStat.isFile()) throw new Error('not a file')
        bytes = await readFile(absolute)
      } catch (error) {
        addError(errors, record.file, 'missing-asset', `asset does not exist: ${sourcePath}`, pointer)
        continue
      }
      if (fileStat.size > policy.maxBytes) {
        addError(errors, record.file, 'asset-too-large', `asset exceeds ${policy.maxBytes} bytes: ${sourcePath}`, pointer)
      }

      let dimensions
      try {
        dimensions = await imageMetadata(bytes, extension)
      } catch (error) {
        addError(errors, record.file, 'invalid-image', `image metadata cannot be read: ${sourcePath}`, pointer)
        continue
      }

      const hash = sha256(bytes)
      const filename = `${hash}${extension}`
      const url = `${policy.publicPath}/${filename}`
      const assetReference = {
        id: `asset.${hash}`,
        url,
        alt: reference.alt,
        kind: reference.kind,
        authoredPath: reference.path,
        sourcePath
      }
      resolvedAssets.push(assetReference)
      referencedSourcePaths.add(sourcePath)

      const reverseReference = {
        contentId: record.document.id,
        source: record.file,
        line: reference.line ?? null,
        column: reference.column ?? null,
        alt: reference.alt
      }
      const existing = assetsByHash.get(hash)
      if (existing) {
        if (!existing.sourcePaths.includes(sourcePath)) existing.sourcePaths.push(sourcePath)
        existing.references.push(reverseReference)
      } else {
        assetsByHash.set(hash, {
          id: `asset.${hash}`,
          hash,
          filename,
          url,
          bytes: fileStat.size,
          extension,
          mimeType: MIME_TYPES[extension] ?? 'application/octet-stream',
          width: dimensions.width,
          height: dimensions.height,
          format: dimensions.format,
          rights: rightsLabel ?? null,
          source: rights?.source ?? null,
          credit: rights?.credit ?? null,
          sourcePaths: [sourcePath],
          references: [reverseReference]
        })
        assetSources.set(filename, absolute)
      }
    }
    resolvedByRecord.set(record.file, resolvedAssets.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)))
  }

  const metadataRelative = normalizePath(path.relative(roots.assets, metadata.file))
  const allAssetFiles = (await walkFiles(roots.assets))
    .map((file) => normalizePath(path.relative(roots.assets, file)))
    .filter((file) => file !== metadataRelative && path.basename(file) !== '.gitkeep')
  const unreferencedAssets = allAssetFiles.filter((file) => !referencedSourcePaths.has(file)).sort()

  errors.sort((left, right) => `${left.file}:${left.pointer}:${left.code}`.localeCompare(`${right.file}:${right.pointer}:${right.code}`))
  if (errors.length) {
    return { ok: false, scannedFiles: validation.scannedFiles, objectCount: validation.objectCount, errors }
  }

  const manifestAssets = [...assetsByHash.values()]
    .map((asset) => ({
      ...asset,
      sourcePaths: asset.sourcePaths.sort(),
      references: asset.references.sort((left, right) => `${left.source}:${left.line}`.localeCompare(`${right.source}:${right.line}`))
    }))
    .sort((left, right) => left.hash.localeCompare(right.hash))
  const contentRecords = records
    .map((record) => contentRecord(record, resolvedByRecord.get(record.file) ?? []))
    .sort((left, right) => left.id.localeCompare(right.id))
  const manifest = { schemaVersion: 1, assets: manifestAssets }
  const content = { schemaVersion: 1, records: contentRecords }
  const report = {
    schemaVersion: 1,
    unreferencedAssets,
    duplicateContent: manifestAssets
      .filter((asset) => asset.sourcePaths.length > 1)
      .map((asset) => ({ hash: asset.hash, sourcePaths: asset.sourcePaths }))
  }

  if (write) {
    if (!isInside(repositoryRoot, roots.generated) || roots.generated === repositoryRoot) {
      throw new Error('generated root must stay inside the repository')
    }
    await mkdir(roots.generated, { recursive: true })
    await writeGeneratedOutput({
      generatedRoot: roots.generated,
      manifest,
      records: content,
      report,
      assetSources
    })
  }

  return {
    ok: true,
    objectCount: contentRecords.length,
    assetCount: manifestAssets.length,
    unreferencedAssetCount: unreferencedAssets.length,
    outputs: ['site-data/asset-manifest.json', 'site-data/content-records.json', 'site-data/build-report.json'],
    manifest,
    content,
    report,
    errors: []
  }
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const result = await buildKnowledgeContent({ write: !checkOnly })
  const printable = { ...result }
  delete printable.manifest
  delete printable.content
  delete printable.report
  console.log(JSON.stringify(printable, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
