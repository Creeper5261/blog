import crypto from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateKnowledgeSite } from '../content-contracts/validate.mjs'
import { fetchGitHubRepositories } from './adapters/github-repositories.mjs'

const DEFAULT_ADAPTERS = new Map([
  ['github-repositories', fetchGitHubRepositories]
])

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function compactText(value, maximumLength = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximumLength)
}

function validHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function normalizePulseSnapshot(descriptor, adapterResult, fetchedAt = new Date()) {
  const now = fetchedAt instanceof Date ? fetchedAt : new Date(fetchedAt)
  if (Number.isNaN(now.valueOf())) throw new Error('Pulse fetched time is invalid')
  const ttlHours = descriptor.ttlHours ?? 24
  const deduplicated = new Map()

  for (const candidate of adapterResult?.items ?? []) {
    const id = compactText(candidate?.id, 200)
    const title = compactText(candidate?.title, 300)
    const url = compactText(candidate?.url, 2000)
    const source = compactText(candidate?.source ?? descriptor.source, 100)
    if (!id || !title || !source || !validHttpsUrl(url)) continue
    const score = Number(candidate.score)
    const item = {
      id,
      title,
      url,
      source,
      summary: compactText(candidate.summary)
    }
    if (Number.isFinite(score)) item.score = score
    const previous = deduplicated.get(id)
    if (!previous || (item.score ?? 0) > (previous.score ?? 0)) deduplicated.set(id, item)
  }

  const items = [...deduplicated.values()]
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.id.localeCompare(right.id))
    .slice(0, descriptor.itemLimit ?? 20)
  if (items.length === 0) throw new Error(`Pulse ${descriptor.id} produced no publishable items`)

  const sortBasis = adapterResult?.sortBasis
  if (!sortBasis || typeof sortBasis.field !== 'string' || !['ascending', 'descending'].includes(sortBasis.direction)) {
    throw new Error(`Pulse ${descriptor.id} adapter did not declare a valid sort basis`)
  }

  return {
    schemaVersion: 1,
    pulseId: descriptor.id,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.valueOf() + ttlHours * 60 * 60 * 1000).toISOString(),
    query: descriptor.query,
    sortBasis,
    items
  }
}

async function writeAtomic(file, contents) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, contents)
  try {
    await rename(temporary, file)
  } catch (error) {
    if (process.platform !== 'win32') throw error
    await rm(file, { force: true })
    await rename(temporary, file)
  }
}

async function persistSnapshot(root, snapshot) {
  const pulseRoot = path.join(root, snapshot.pulseId)
  const contents = json(snapshot)
  const fingerprint = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 12)
  const timestamp = snapshot.fetchedAt.replace(/[^0-9]/g, '').slice(0, 14)
  const historyFile = path.join(pulseRoot, 'history', `${timestamp}-${fingerprint}.json`)
  await writeAtomic(historyFile, contents)
  await writeAtomic(path.join(pulseRoot, 'latest.json'), contents)
  return historyFile
}

export async function updatePulseSnapshots({
  root = process.cwd(),
  outputRoot = process.env.PULSE_SNAPSHOT_ROOT,
  adapters = DEFAULT_ADAPTERS,
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  now = () => new Date()
} = {}) {
  const repositoryRoot = path.resolve(root)
  const validation = await validateKnowledgeSite({ root: repositoryRoot, includeRecords: true })
  if (!validation.ok) return { ok: false, outputRoot: null, updates: [], errors: validation.errors }
  const snapshotRoot = outputRoot
    ? path.resolve(repositoryRoot, outputRoot)
    : path.join(validation.roots.generated, 'pulse-snapshots')
  const descriptors = validation.records
    .map((record) => record.document)
    .filter((document) => document.kind === 'pulse')
    .sort((left, right) => left.id.localeCompare(right.id))
  const updates = []
  await mkdir(snapshotRoot, { recursive: true })

  for (const descriptor of descriptors) {
    if (descriptor.enabled === false) {
      updates.push({ id: descriptor.id, status: 'disabled' })
      continue
    }
    const adapter = adapters.get(descriptor.source)
    if (!adapter) {
      updates.push({ id: descriptor.id, status: 'failed', error: `unknown Pulse adapter: ${descriptor.source}` })
      continue
    }
    try {
      const result = await adapter(descriptor, { fetchImpl, token })
      const snapshot = normalizePulseSnapshot(descriptor, result, now())
      const historyFile = await persistSnapshot(snapshotRoot, snapshot)
      updates.push({
        id: descriptor.id,
        status: 'updated',
        fetchedAt: snapshot.fetchedAt,
        itemCount: snapshot.items.length,
        historyFile: path.relative(snapshotRoot, historyFile).split(path.sep).join('/')
      })
    } catch (error) {
      updates.push({ id: descriptor.id, status: 'failed', error: error.message })
    }
  }

  return {
    ok: updates.every((update) => update.status !== 'failed'),
    outputRoot: snapshotRoot,
    updates,
    errors: []
  }
}

async function runCli() {
  const result = await updatePulseSnapshots()
  process.stdout.write(json(result))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli()
}
