import crypto from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildKnowledgeContent } from '../content-build/build.mjs'
import { validateKnowledgeSite } from '../content-contracts/validate.mjs'

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function byId(left, right) {
  return left.id.localeCompare(right.id)
}

function canonical(record) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    status: record.status,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    assetUrls: record.assets.map((asset) => asset.url)
  }
}

function searchableText(record) {
  return [record.title, record.body]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildRelationships(records) {
  const nodes = records.map(canonical).sort(byId)
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

function buildTimelines(records, recordById) {
  return {
    schemaVersion: 1,
    timelines: records
      .filter((record) => record.kind === 'timeline')
      .map((record) => ({
        ...canonical(record),
        entries: record.entries.map((entry) => ({
          ...entry,
          target: entry.target ? canonical(recordById.get(entry.target)) : null
        }))
      }))
      .sort(byId)
  }
}

async function resolvePulses(records, sourceRecords, pulseProvider, errors) {
  const pulses = []
  for (const record of records.filter((item) => item.kind === 'pulse').sort(byId)) {
    const source = sourceRecords.get(record.id)
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
      ...canonical(record),
      source: record.sourceName,
      query: record.query,
      schedule: record.schedule,
      snapshotStatus: status,
      fetchedAt: snapshot.fetchedAt,
      items: snapshot.items
    })
  }
  return { schemaVersion: 1, pulses }
}

function isPulseSnapshot(snapshot) {
  return Boolean(
    snapshot &&
    typeof snapshot.fetchedAt === 'string' &&
    Array.isArray(snapshot.items) &&
    snapshot.items.every((item) => item && typeof item.id === 'string' && typeof item.title === 'string')
  )
}

function buildPayloads(core, sourceRecords, pulses) {
  const records = core.content.records
  const recordById = new Map(records.map((record) => [record.id, record]))
  const contentIndex = { schemaVersion: 1, items: records.map(canonical).sort(byId) }
  const relationships = buildRelationships(records)
  const timelines = buildTimelines(records, recordById)
  const search = {
    schemaVersion: 1,
    documents: records
      .filter((record) => ['article', 'entity', 'note', 'tool'].includes(record.kind))
      .map((record) => ({ ...canonical(record), text: searchableText(record) }))
      .sort(byId)
  }
  const navigation = {
    schemaVersion: 1,
    items: records.map((record) => ({
      ...canonical(record),
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
      ...canonical(record),
      provider: record.provider,
      url: record.url,
      embedUrl: record.embedUrl,
      sourceUrl: record.sourceUrl
    })).sort(byId)
  }
  const features = {
    schemaVersion: 1,
    tools: records.filter((record) => record.kind === 'tool').map((record) => ({
      ...canonical(record),
      slug: record.slug,
      privacy: record.privacy,
      inputKinds: record.inputKinds,
      outputKinds: record.outputKinds
    })).sort(byId)
  }

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
    ['pulses.json', pulses]
  ])
}

function releaseManifest(payloads) {
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
    compatibility: { minimumReaderVersion: 1, currentReaderVersion: 1, supportedSchemaVersions: [1] },
    cache: { immutableReleasePath: `/data/knowledge/releases/${buildHash}/`, mutablePointer: '/data/knowledge/release.json' },
    rollback: { strategy: 'deploy-release-by-hash', release: buildHash, requiresDeploymentArtifact: true },
    files
  }
}

async function writePayloadDirectory(directory, payloads, release) {
  await mkdir(directory, { recursive: true })
  for (const [file, value] of payloads) await writeFile(path.join(directory, file), json(value))
  await writeFile(path.join(directory, 'release.json'), json(release))
}

async function writeSiteData(generatedRoot, payloads, release) {
  const staging = path.join(generatedRoot, `.site-data-${process.pid}`)
  const target = path.join(generatedRoot, 'site-data')
  await rm(staging, { recursive: true, force: true })
  await writePayloadDirectory(staging, payloads, release)
  await writePayloadDirectory(path.join(staging, 'releases', release.buildHash), payloads, release)
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)
}

export async function buildSiteData({ root = process.cwd(), write = true, mode = 'full', pulseProvider } = {}) {
  if (!['full', 'incremental'].includes(mode)) throw new Error(`unsupported site-data build mode: ${mode}`)
  const repositoryRoot = path.resolve(root)
  const [core, validation] = await Promise.all([
    buildKnowledgeContent({ root: repositoryRoot, write }),
    validateKnowledgeSite({ root: repositoryRoot, includeRecords: true })
  ])
  if (!core.ok) return core
  if (!validation.ok) return validation

  const errors = []
  const sourceRecords = new Map(validation.records.map((record) => [record.document.id, record.document]))
  const pulses = await resolvePulses(core.content.records, sourceRecords, pulseProvider, errors)
  if (errors.length) return { ok: false, objectCount: core.objectCount, assetCount: core.assetCount, errors }

  const payloads = buildPayloads(core, sourceRecords, pulses)
  const release = releaseManifest(payloads)
  if (write) await writeSiteData(validation.roots.generated, payloads, release)

  return {
    ok: true,
    mode,
    objectCount: core.objectCount,
    assetCount: core.assetCount,
    buildHash: release.buildHash,
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
