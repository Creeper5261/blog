import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'

import { parseMarkdownContent } from '../content-build/markdown.mjs'

const DEFAULT_CONFIG = 'knowledge-site.config.json'
const EXTERNAL_KINDS = new Set(['external-embed', 'pulse'])

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function repositoryPath(root, candidate) {
  return normalizePath(path.relative(root, candidate))
}

function addError(errors, file, code, message, pointer = '') {
  errors.push({ file, code, pointer, message })
}

async function readJson(file, root, errors) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    addError(errors, repositoryPath(root, file), 'invalid-json', error.message)
    return null
  }
}

async function walkContentFiles(directory, extensions = new Set(['.json'])) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walkContentFiles(target, extensions))
    if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push(target)
  }
  return files
}

function resolveConfiguredRoot(repositoryRoot, configuredPath, label, errors, configFile = DEFAULT_CONFIG) {
  if (path.isAbsolute(configuredPath)) {
    addError(errors, configFile, 'unsafe-root', `${label} root must be repository-relative`, `/roots/${label}`)
    return null
  }

  const resolved = path.resolve(repositoryRoot, configuredPath)
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    addError(errors, configFile, 'unsafe-root', `${label} root escapes the repository`, `/roots/${label}`)
    return null
  }
  return resolved
}

function referencedIds(document) {
  const references = []
  for (const [index, relation] of (document.relations ?? []).entries()) {
    references.push({ target: relation.target, pointer: `/relations/${index}/target` })
  }
  for (const [index, target] of (document.members ?? []).entries()) {
    references.push({ target, pointer: `/members/${index}` })
  }
  for (const [index, entry] of (document.entries ?? []).entries()) {
    if (entry.target) references.push({ target: entry.target, pointer: `/entries/${index}/target` })
  }
  return references
}

function referencedAssets(document) {
  const references = []
  for (const [index, media] of (document.media ?? []).entries()) {
    references.push({ value: media.path, pointer: `/media/${index}/path` })
  }
  if (document.asset?.path) references.push({ value: document.asset.path, pointer: '/asset/path' })
  return references
}

function externalUrls(document) {
  return ['url', 'embedUrl', 'sourceUrl']
    .filter((property) => document[property])
    .map((property) => ({ value: document[property], pointer: `/${property}` }))
}

async function readContentRecord(absoluteFile, root, errors) {
  const extension = path.extname(absoluteFile).toLowerCase()
  if (extension === '.json') {
    const document = await readJson(absoluteFile, root, errors)
    return document ? { document, references: null, codeBlocks: [] } : null
  }

  try {
    return parseMarkdownContent(await fs.readFile(absoluteFile, 'utf8'), { extension })
  } catch (error) {
    addError(errors, repositoryPath(root, absoluteFile), 'invalid-markdown', error.message)
    return null
  }
}

function validateAssetReferences(record, allowedRoots, errors) {
  const markdownReferences = (record.references?.assets ?? []).map((reference) => ({
    value: reference.path,
    pointer: reference.line ? `line:${reference.line}:${reference.column}` : ''
  }))
  for (const reference of [...referencedAssets(record.document), ...markdownReferences]) {
    if (path.isAbsolute(reference.value)) {
      addError(errors, record.file, 'unsafe-asset-path', 'asset path must be relative', reference.pointer)
      continue
    }

    const resolved = path.resolve(path.dirname(record.absoluteFile), reference.value)
    if (!allowedRoots.some((root) => isInside(root, resolved))) {
      addError(errors, record.file, 'unsafe-asset-path', 'asset path escapes the configured content and asset roots', reference.pointer)
    }
  }
}

function validateExternalUrls(record, allowedHosts, errors) {
  const markdownReferences = (record.references?.externalUrls ?? []).map((reference) => ({
    value: reference.url,
    pointer: reference.line ? `line:${reference.line}:${reference.column}` : ''
  }))
  for (const reference of [...externalUrls(record.document), ...markdownReferences]) {
    let url
    try {
      url = new URL(reference.value)
    } catch {
      addError(errors, record.file, 'invalid-external-url', 'external URL must be absolute', reference.pointer)
      continue
    }

    if (url.protocol !== 'https:') {
      addError(errors, record.file, 'invalid-external-url', 'external URL must use HTTPS', reference.pointer)
    } else if (!allowedHosts.has(url.hostname.toLowerCase())) {
      addError(errors, record.file, 'external-host-not-allowed', `external host is not allowed: ${url.hostname}`, reference.pointer)
    }
  }
}

export async function validateKnowledgeSite({
  root = process.cwd(),
  configFile = DEFAULT_CONFIG,
  includeRecords = false
} = {}) {
  const repositoryRoot = path.resolve(root)
  const errors = []
  const absoluteConfig = path.resolve(repositoryRoot, configFile)
  if (!isInside(repositoryRoot, absoluteConfig)) {
    addError(errors, configFile, 'unsafe-config-path', 'config file must stay inside the repository')
    return { ok: false, scannedFiles: 0, objectCount: 0, errors }
  }
  const config = await readJson(absoluteConfig, repositoryRoot, errors)

  if (!config) return { ok: false, scannedFiles: 0, objectCount: 0, errors }

  const configuredSchemasRoot = typeof config.roots?.schemas === 'string' ? config.roots.schemas : 'schemas'
  const schemasRoot = resolveConfiguredRoot(repositoryRoot, configuredSchemasRoot, 'schemas', errors, configFile)
  if (!schemasRoot) return { ok: false, scannedFiles: 0, objectCount: 0, errors }
  const configSchemaFile = path.join(schemasRoot, 'v1', 'site-config.schema.json')
  const objectSchemaFile = path.join(schemasRoot, 'v1', 'knowledge-object.schema.json')
  const [configSchema, objectSchema] = await Promise.all([
    readJson(configSchemaFile, repositoryRoot, errors),
    readJson(objectSchemaFile, repositoryRoot, errors)
  ])

  if (!configSchema || !objectSchema) {
    return { ok: false, scannedFiles: 0, objectCount: 0, errors }
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  const validateConfig = ajv.compile(configSchema)
  const validateObject = ajv.compile(objectSchema)

  if (!validateConfig(config)) {
    for (const error of validateConfig.errors ?? []) {
      addError(errors, configFile, 'schema', error.message ?? 'schema validation failed', error.instancePath)
    }
    return { ok: false, scannedFiles: 0, objectCount: 0, errors }
  }

  const roots = Object.fromEntries(
    Object.entries(config.roots).map(([label, value]) => [
      label,
      resolveConfiguredRoot(repositoryRoot, value, label, errors, configFile)
    ])
  )
  if (errors.length) return { ok: false, scannedFiles: 0, objectCount: 0, errors }

  for (const label of ['content', 'assets', 'schemas', 'external']) {
    try {
      const stat = await fs.stat(roots[label])
      if (!stat.isDirectory()) throw new Error('not a directory')
    } catch {
      addError(errors, configFile, 'missing-root', `${label} root does not exist`, `/roots/${label}`)
    }
  }
  if (errors.length) return { ok: false, scannedFiles: 0, objectCount: 0, errors }

  const contentFiles = await walkContentFiles(roots.content, new Set(['.json', '.md', '.mdx']))
  const externalFiles = await walkContentFiles(roots.external)
  const records = []

  for (const [scope, files] of [['content', contentFiles], ['external', externalFiles]]) {
    for (const absoluteFile of files) {
      const parsed = await readContentRecord(absoluteFile, repositoryRoot, errors)
      if (!parsed) continue
      const { document, references, codeBlocks } = parsed

      const file = repositoryPath(repositoryRoot, absoluteFile)
      if (!validateObject(document)) {
        for (const error of validateObject.errors ?? []) {
          addError(errors, file, 'schema', error.message ?? 'schema validation failed', error.instancePath)
        }
      }

      if (scope === 'external' && !EXTERNAL_KINDS.has(document.kind)) {
        addError(errors, file, 'wrong-root', `${document.kind ?? 'unknown'} objects belong in the content root`, '/kind')
      }
      if (scope === 'content' && EXTERNAL_KINDS.has(document.kind)) {
        addError(errors, file, 'wrong-root', `${document.kind} objects belong in the external root`, '/kind')
      }

      records.push({ absoluteFile, document, file, references, codeBlocks })
    }
  }

  const ids = new Map()
  for (const record of records) {
    if (typeof record.document.id !== 'string') continue
    const previous = ids.get(record.document.id)
    if (previous) {
      addError(errors, record.file, 'duplicate-id', `duplicate id ${record.document.id}; first declared in ${previous}`, '/id')
    } else {
      ids.set(record.document.id, record.file)
    }
  }

  const allowedHosts = new Set(config.allowedExternalHosts.map((host) => host.toLowerCase()))
  for (const record of records) {
    const markdownTargets = (record.references?.knowledgeIds ?? []).map((reference) => ({
      target: reference.target,
      pointer: reference.line ? `line:${reference.line}:${reference.column}` : ''
    }))
    for (const reference of [...referencedIds(record.document), ...markdownTargets]) {
      if (!ids.has(reference.target)) {
        addError(errors, record.file, 'missing-target', `unknown target id: ${reference.target}`, reference.pointer)
      }
    }
    validateAssetReferences(record, [roots.content, roots.assets], errors)
    validateExternalUrls(record, allowedHosts, errors)
  }

  errors.sort((left, right) => `${left.file}:${left.pointer}:${left.code}`.localeCompare(`${right.file}:${right.pointer}:${right.code}`))
  const result = {
    ok: errors.length === 0,
    scannedFiles: contentFiles.length + externalFiles.length,
    objectCount: records.length,
    errors
  }
  if (includeRecords) {
    result.config = config
    result.roots = roots
    result.records = records
  }
  return result
}

async function main() {
  const rootArgument = process.argv[2]
  const result = await validateKnowledgeSite({ root: rootArgument ?? process.cwd() })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
