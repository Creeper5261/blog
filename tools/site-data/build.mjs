import crypto from 'node:crypto'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildKnowledgeContent } from '../content-build/build.mjs'
import { validateKnowledgeSite } from '../content-contracts/validate.mjs'
import { compileExplainUnits } from '../explain/compiler.mjs'
import { buildToolManifestPayload } from '../capabilities/manifests.mjs'
import { buildHybridIndex } from './hybrid-index.mjs'
import { buildKnowledgePaths } from './paths.mjs'
import { buildRoutesPayload } from './routes.mjs'
import { buildTopicsPayload } from './topics.mjs'

const INPUT_CACHE_VERSION = 1
const WINDOWS_RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY'])
const BUILDER_INPUTS = [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('../content-build/build.mjs', import.meta.url)),
  fileURLToPath(new URL('../content-build/markdown.mjs', import.meta.url)),
  fileURLToPath(new URL('../content-contracts/validate.mjs', import.meta.url)),
  fileURLToPath(new URL('../explain/compiler.mjs', import.meta.url)),
  fileURLToPath(new URL('../capabilities/manifests.mjs', import.meta.url)),
  fileURLToPath(new URL('../../schemas/v1/explain.schema.json', import.meta.url)),
  fileURLToPath(new URL('./hybrid-index.mjs', import.meta.url)),
  fileURLToPath(new URL('./paths.mjs', import.meta.url)),
  fileURLToPath(new URL('./routes.mjs', import.meta.url)),
  fileURLToPath(new URL('./topics.mjs', import.meta.url))
]

async function renameDirectoryWithRetry(source, target) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, target)
      return
    } catch (error) {
      if (!WINDOWS_RENAME_RETRY_CODES.has(error.code)) throw error
      if (attempt >= 5) {
        if (process.platform !== 'win32') throw error
        await cp(source, target, { recursive: true, errorOnExist: true, force: false })
        await rm(source, { recursive: true, force: true })
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)))
    }
  }
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
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
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(absolute))
    if (entry.isFile()) files.push(absolute)
  }
  return files
}

async function inputFingerprint(repositoryRoot, pulseSnapshotRoot) {
  const configFile = path.join(repositoryRoot, 'knowledge-site.config.json')
  let config = {}
  try { config = JSON.parse(await readFile(configFile, 'utf8')) } catch {}
  const files = new Map([[configFile, 'knowledge-site.config.json']])
  for (const [label, configured] of Object.entries(config.roots ?? {})) {
    if (label === 'generated' || typeof configured !== 'string' || path.isAbsolute(configured)) continue
    const root = path.resolve(repositoryRoot, configured)
    if (!isInside(repositoryRoot, root)) continue
    for (const file of await walkFiles(root)) files.set(file, normalizePath(path.relative(repositoryRoot, file)))
  }
  const explainRoot = path.resolve(repositoryRoot, 'source', 'explain')
  if (isInside(repositoryRoot, explainRoot)) {
    for (const file of await walkFiles(explainRoot)) files.set(file, `@explain/${normalizePath(path.relative(explainRoot, file))}`)
  }
  for (const [index, file] of BUILDER_INPUTS.entries()) files.set(file, `@builder/${index}-${path.basename(file)}`)
  if (pulseSnapshotRoot) {
    for (const file of await walkFiles(pulseSnapshotRoot)) {
      files.set(file, `@pulse-snapshot/${normalizePath(path.relative(pulseSnapshotRoot, file))}`)
    }
  }

  const hash = crypto.createHash('sha256').update(`site-data-input-v${INPUT_CACHE_VERSION}\n`)
  for (const [file, label] of [...files].sort((left, right) => left[1].localeCompare(right[1]))) {
    hash.update(label).update('\0').update(await readFile(file)).update('\0')
  }
  return hash.digest('hex')
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}

async function configuredGeneratedRoot(repositoryRoot) {
  const config = await readJson(path.join(repositoryRoot, 'knowledge-site.config.json'))
  const configured = config?.roots?.generated
  if (typeof configured !== 'string' || path.isAbsolute(configured)) return path.join(repositoryRoot, 'generated')
  const resolved = path.resolve(repositoryRoot, configured)
  return isInside(repositoryRoot, resolved) && resolved !== repositoryRoot ? resolved : path.join(repositoryRoot, 'generated')
}

function byId(left, right) {
  return left.id.localeCompare(right.id)
}

function canonical(record, locators) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    status: record.status,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    assetUrls: record.assets.map((asset) => asset.url),
    locator: locators?.get(record.id)
  }
}

function searchableText(record) {
  return [record.title, record.body]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildRelationships(records, locators) {
  const nodes = records.map((record) => canonical(record, locators)).sort(byId)
  const edges = []
  for (const record of records) {
    for (const relation of record.relations) {
      edges.push({ from: record.id, to: relation.target, type: relation.type })
    }
    for (const target of record.members) {
      edges.push({ from: record.id, to: target, type: 'contains' })
    }
    for (const entry of record.entries) {
      if (entry.target) edges.push({ from: record.id, to: entry.target, type: 'timeline-entry', at: entry.at })
    }
  }
  edges.sort((left, right) => `${left.from}:${left.type}:${left.to}`.localeCompare(`${right.from}:${right.type}:${right.to}`))
  return { schemaVersion: 1, nodes, edges }
}

function buildTimelines(records, recordById, locators) {
  return {
    schemaVersion: 1,
    timelines: records
      .filter((record) => record.kind === 'timeline')
      .map((record) => ({
        ...canonical(record, locators),
        entries: record.entries.map((entry) => ({
          ...entry,
          target: entry.target ? canonical(recordById.get(entry.target), locators) : null
        }))
      }))
      .sort(byId)
  }
}

async function resolvePulses(records, sourceRecords, pulseProvider, pulseSnapshotRoot, locators, errors) {
  const pulses = []
  for (const record of records.filter((item) => item.kind === 'pulse').sort(byId)) {
    const source = sourceRecords.get(record.id)
    if (source.enabled === false) continue
    let snapshot
    let status = 'snapshot'
    if (pulseProvider) {
      try {
        snapshot = await pulseProvider(source)
        if (!isPulseSnapshot(snapshot)) throw new Error('invalid snapshot')
        status = 'fresh'
      } catch {
        snapshot = source.snapshot
        status = 'fallback'
      }
    } else if (pulseSnapshotRoot) {
      snapshot = await readJson(path.join(pulseSnapshotRoot, record.id, 'latest.json'))
      if (isPulseSnapshot(snapshot) && snapshot.query === source.query) status = 'stored'
      else snapshot = source.snapshot
    } else {
      snapshot = source.snapshot
    }
    if (!snapshot) {
      errors.push({
        file: record.source,
        code: 'missing-pulse-snapshot',
        pointer: '/snapshot',
        message: `Pulse ${record.id} has no valid snapshot to publish`
      })
      continue
    }
    pulses.push({
      ...canonical(record, locators),
      source: record.sourceName,
      query: record.query,
      schedule: record.schedule,
      accessRules: source.accessRules,
      snapshotStatus: status,
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
      sortBasis: snapshot.sortBasis,
      items: snapshot.items
    })
  }
  return { schemaVersion: 1, pulses }
}

function isPulseSnapshot(snapshot) {
  return Boolean(
    snapshot &&
    typeof snapshot.fetchedAt === 'string' &&
    typeof snapshot.expiresAt === 'string' &&
    snapshot.sortBasis &&
    typeof snapshot.sortBasis.field === 'string' &&
    ['ascending', 'descending'].includes(snapshot.sortBasis.direction) &&
    typeof snapshot.query === 'string' &&
    Array.isArray(snapshot.items) &&
    snapshot.items.length > 0 &&
    snapshot.items.every((item) => item && typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.url === 'string' && item.url.startsWith('https://') && typeof item.source === 'string')
  )
}

function buildPayloads(core, sourceRecords, pulses, hybrid, explain, toolManifests) {
  const records = core.content.records
  const locators = hybrid.locators
  const recordById = new Map(records.map((record) => [record.id, record]))
  const contentIndex = { schemaVersion: 1, items: records.map((record) => canonical(record, locators)).sort(byId) }
  const relationships = buildRelationships(records, locators)
  const timelines = buildTimelines(records, recordById, locators)
  const search = {
    schemaVersion: 1,
    documents: records
      .filter((record) => ['article', 'entity', 'note', 'tool'].includes(record.kind))
      .map((record) => ({ ...canonical(record, locators), text: searchableText(record) }))
      .sort(byId)
  }
  const navigation = {
    schemaVersion: 1,
    items: records.map((record) => ({
      ...canonical(record, locators),
      route: record.routeLinks[0] ?? null
    })).sort(byId)
  }
  const assetMap = {
    schemaVersion: 1,
    byContentId: Object.fromEntries(records.map((record) => [record.id, record.assets]).sort(([left], [right]) => left.localeCompare(right)))
  }
  const externalEmbeds = {
    schemaVersion: 1,
    embeds: records.filter((record) => record.kind === 'external-embed').map((record) => ({
      ...canonical(record, locators),
      provider: record.provider,
      url: record.url,
      embedUrl: record.embedUrl,
      sourceUrl: record.sourceUrl
    })).sort(byId)
  }
  const features = {
    schemaVersion: 1,
    tools: records.filter((record) => record.kind === 'tool').map((record) => ({
      ...canonical(record, locators),
      slug: record.slug,
      privacy: record.privacy,
      inputKinds: record.inputKinds,
      outputKinds: record.outputKinds
    })).sort(byId)
  }
  const topics = buildTopicsPayload(records, locators)
  const routes = buildRoutesPayload(toolManifests)
  const paths = buildKnowledgePaths(records, locators)

  return new Map([
    ['asset-manifest.json', core.manifest],
    ['content-records.json', core.content],
    ['build-report.json', core.report],
    ['content-index.json', contentIndex],
    ['relationship-graph.json', relationships],
    ['timelines.json', timelines],
    ['search-source.json', search],
    ['navigation.json', navigation],
    ['asset-map.json', assetMap],
    ['external-embeds.json', externalEmbeds],
    ['features.json', features],
    ['pulses.json', pulses],
    ['explain.json', explain],
    ['tool-manifests.json', toolManifests],
    ['topics.json', topics],
    ['routes.json', routes],
    ['paths.json', paths],
    ...hybrid.payloads
  ])
}

function releaseManifest(payloads, policy) {
  const files = [...payloads]
    .map(([file, value]) => {
      const bytes = json(value)
      return { file, hash: sha256(bytes), bytes: Buffer.byteLength(bytes) }
    })
    .sort((left, right) => left.file.localeCompare(right.file))
  const buildHash = sha256(files.map((item) => `${item.file}:${item.hash}`).join('\n'))
  return {
    schemaVersion: 1,
    buildHash,
    compatibility: {
      minimumReaderVersion: 1,
      currentReaderVersion: 2,
      supportedSchemaVersions: [1],
      preferredEntryPoint: 'hybrid-index.json',
      legacyEntryPoints: ['content-index.json', 'content-records.json', 'relationship-graph.json', 'timelines.json']
    },
    cache: {
      immutableReleasePath: `/data/knowledge/releases/${buildHash}/`,
      mutablePointer: '/data/knowledge/release.json',
      immutableCacheControl: policy.immutableCacheControl,
      mutableCacheControl: policy.mutableCacheControl
    },
    rollback: { strategy: 'deploy-release-by-hash', release: buildHash, requiresDeploymentArtifact: true },
    files
  }
}

async function writePayloadDirectory(directory, payloads, release) {
  await mkdir(directory, { recursive: true })
  for (const [file, value] of payloads) {
    const target = path.join(directory, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, json(value))
  }
  await writeFile(path.join(directory, 'release.json'), json(release))
}

async function listReleaseHashes(siteDataRoot) {
  try {
    return (await readdir(path.join(siteDataRoot, 'releases'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function releaseOrder(siteDataRoot) {
  const history = await readJson(path.join(siteDataRoot, 'release-history.json'))
  const available = new Set(await listReleaseHashes(siteDataRoot))
  const ordered = []
  for (const hash of history?.releases ?? []) {
    if (available.delete(hash)) ordered.push(hash)
  }
  return [...ordered, ...available]
}

async function copyRetainedReleases({ staging, currentHash, sources, retention }) {
  const candidates = [currentHash]
  for (const source of sources) {
    for (const hash of await releaseOrder(source)) {
      if (!candidates.includes(hash)) candidates.push(hash)
    }
  }
  const retained = candidates.slice(0, retention)
  for (const hash of retained.slice(1)) {
    let selected = null
    for (const candidate of sources) {
      try {
        if ((await stat(path.join(candidate, 'releases', hash))).isDirectory()) { selected = candidate; break }
      } catch {}
    }
    if (selected) await cp(path.join(selected, 'releases', hash), path.join(staging, 'releases', hash), { recursive: true })
  }
  await writeFile(path.join(staging, 'release-history.json'), json({ schemaVersion: 1, releases: retained }))
  return retained
}

async function pruneMediaForReleases(generatedRoot, retainedReleases) {
  const keep = new Set()
  for (const hash of retainedReleases) {
    const manifest = await readJson(path.join(generatedRoot, 'site-data', 'releases', hash, 'asset-manifest.json'))
    for (const asset of manifest?.assets ?? []) keep.add(asset.filename)
  }
  const mediaRoot = path.join(generatedRoot, 'media')
  let entries = []
  try { entries = await readdir(mediaRoot, { withFileTypes: true }) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const entry of entries) {
    if (entry.isFile() && !keep.has(entry.name)) await rm(path.join(mediaRoot, entry.name), { force: true })
  }
}

async function hydrateRetainedObjects(generatedRoot, retainedReleases) {
  const siteDataRoot = path.join(generatedRoot, 'site-data')
  const objectRoot = path.join(siteDataRoot, 'objects')
  await mkdir(objectRoot, { recursive: true })
  for (const hash of retainedReleases) {
    const release = await readJson(path.join(siteDataRoot, 'releases', hash, 'release.json'))
    for (const descriptor of release?.files ?? []) {
      if (!descriptor.file.startsWith('objects/')) continue
      const source = path.join(siteDataRoot, 'releases', hash, descriptor.file)
      const target = path.join(siteDataRoot, descriptor.file)
      await mkdir(path.dirname(target), { recursive: true })
      try {
        await stat(target)
      } catch {
        await cp(source, target)
      }
    }
  }
}

async function writeSiteData({ generatedRoot, payloads, release, policy, previousSiteDataRoot }) {
  const staging = path.join(generatedRoot, `.site-data-${process.pid}`)
  const target = path.join(generatedRoot, 'site-data')
  await rm(staging, { recursive: true, force: true })
  await writePayloadDirectory(staging, payloads, release)
  await writePayloadDirectory(path.join(staging, 'releases', release.buildHash), payloads, release)
  const sources = [target]
  if (previousSiteDataRoot) {
    const resolved = path.resolve(previousSiteDataRoot)
    if (!sources.includes(resolved)) sources.push(resolved)
  }
  const retainedReleases = await copyRetainedReleases({
    staging,
    currentHash: release.buildHash,
    sources,
    retention: policy.releaseRetention
  })
  await rm(target, { recursive: true, force: true })
  await renameDirectoryWithRetry(staging, target)
  await hydrateRetainedObjects(generatedRoot, retainedReleases)
  await pruneMediaForReleases(generatedRoot, retainedReleases)
  return retainedReleases
}

async function verifyFileHash(file, expectedHash) {
  try { return sha256(await readFile(file)) === expectedHash } catch { return false }
}

async function loadIncrementalHit({ generatedRoot, inputHash }) {
  const cacheFile = path.join(generatedRoot, '.cache', `site-data-v${INPUT_CACHE_VERSION}.json`)
  const cache = await readJson(cacheFile)
  if (cache?.inputHash !== inputHash) return null
  const siteDataRoot = path.join(generatedRoot, 'site-data')
  const release = await readJson(path.join(siteDataRoot, 'release.json'))
  if (!release || release.buildHash !== cache.buildHash) return null

  const bundle = {}
  for (const descriptor of release.files ?? []) {
    const file = path.join(siteDataRoot, descriptor.file)
    if (!await verifyFileHash(file, descriptor.hash)) return null
    bundle[descriptor.file] = await readJson(file)
    if (!bundle[descriptor.file]) return null
  }
  for (const asset of bundle['asset-manifest.json']?.assets ?? []) {
    if (!await verifyFileHash(path.join(generatedRoot, 'media', asset.filename), asset.hash)) return null
  }
  const history = await readJson(path.join(siteDataRoot, 'release-history.json'))
  return {
    ok: true,
    mode: 'incremental',
    cacheHit: true,
    inputHash,
    objectCount: bundle['content-records.json']?.records?.length ?? 0,
    assetCount: bundle['asset-manifest.json']?.assets?.length ?? 0,
    buildHash: release.buildHash,
    retainedReleases: history?.releases ?? [release.buildHash],
    outputs: [...release.files.map((item) => item.file), 'release.json'].sort(),
    bundle,
    release,
    errors: []
  }
}

async function writeIncrementalCache(generatedRoot, inputHash, buildHash) {
  const cacheRoot = path.join(generatedRoot, '.cache')
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(path.join(cacheRoot, `site-data-v${INPUT_CACHE_VERSION}.json`), json({
    schemaVersion: 1,
    inputHash,
    buildHash
  }))
}

export async function buildSiteData({
  root = process.cwd(),
  write = true,
  mode = 'full',
  pulseProvider,
  previousSiteDataRoot = process.env.SITE_DATA_PREVIOUS_ROOT,
  pulseSnapshotRoot = process.env.PULSE_SNAPSHOT_ROOT
} = {}) {
  if (!['full', 'incremental'].includes(mode)) throw new Error(`unsupported site-data build mode: ${mode}`)
  const repositoryRoot = path.resolve(root)
  const incrementalGeneratedRoot = await configuredGeneratedRoot(repositoryRoot)
  const resolvedPulseSnapshotRoot = pulseSnapshotRoot
    ? path.resolve(repositoryRoot, pulseSnapshotRoot)
    : path.join(incrementalGeneratedRoot, 'pulse-snapshots')
  const inputHash = await inputFingerprint(repositoryRoot, resolvedPulseSnapshotRoot)
  if (mode === 'incremental' && write && !pulseProvider) {
    const hit = await loadIncrementalHit({ generatedRoot: incrementalGeneratedRoot, inputHash })
    if (hit) return hit
  }
  const [core, validation] = await Promise.all([
    buildKnowledgeContent({ root: repositoryRoot, write }),
    validateKnowledgeSite({ root: repositoryRoot, includeRecords: true })
  ])
  if (!core.ok) return core
  if (!validation.ok) return validation

  const errors = []
  const sourceRecords = new Map(validation.records.map((record) => [record.document.id, record.document]))
  const hybrid = buildHybridIndex(core.content.records, validation.config.siteDataPolicy.hybridIndex)
  const pulses = await resolvePulses(
    core.content.records,
    sourceRecords,
    pulseProvider,
    resolvedPulseSnapshotRoot,
    hybrid.locators,
    errors
  )
  if (errors.length) return { ok: false, objectCount: core.objectCount, assetCount: core.assetCount, errors }

  const explain = await compileExplainUnits({ root: repositoryRoot })
  if (!explain.ok) return { ok: false, objectCount: core.objectCount, assetCount: core.assetCount, errors: explain.errors }
  const explainPayload = explain.payload
  const toolManifests = buildToolManifestPayload()

  const payloads = buildPayloads(core, sourceRecords, pulses, hybrid, explainPayload, toolManifests)
  const release = releaseManifest(payloads, validation.config.siteDataPolicy)
  let retainedReleases = [release.buildHash]
  if (write) {
    retainedReleases = await writeSiteData({
      generatedRoot: validation.roots.generated,
      payloads,
      release,
      policy: validation.config.siteDataPolicy,
      previousSiteDataRoot
    })
    await writeIncrementalCache(validation.roots.generated, inputHash, release.buildHash)
  }

  return {
    ok: true,
    mode,
    cacheHit: false,
    inputHash,
    objectCount: core.objectCount,
    assetCount: core.assetCount,
    buildHash: release.buildHash,
    retainedReleases,
    outputs: [...payloads.keys(), 'release.json'].sort(),
    bundle: Object.fromEntries(payloads),
    release,
    errors: []
  }
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='))
  const result = await buildSiteData({ write: !checkOnly, mode: modeArgument?.slice('--mode='.length) ?? 'full' })
  const printable = { ...result }
  delete printable.bundle
  delete printable.release
  console.log(JSON.stringify(printable, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
