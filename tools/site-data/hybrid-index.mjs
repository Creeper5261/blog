import crypto from 'node:crypto'

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function payloadDescriptor(file, value, extra = {}) {
  const bytes = json(value)
  return {
    file,
    hash: sha256(bytes),
    bytes: Buffer.byteLength(bytes),
    ...extra
  }
}

function compareIds(left, right) {
  return left.id.localeCompare(right.id)
}

function compareListings(left, right) {
  return (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '') ||
    (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') ||
    left.id.localeCompare(right.id)
}

function canonical(record, locator) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    status: record.status,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    assetUrls: record.assets.map((asset) => asset.url),
    locator
  }
}

function splitShards({ items, directory, name, maxBytes, describe }) {
  const shards = []
  let current = []

  const flush = () => {
    if (current.length === 0) return
    const file = `${directory}/${name}-${String(shards.length).padStart(4, '0')}.json`
    const payload = { schemaVersion: 1, items: current }
    shards.push({ file, payload, descriptor: payloadDescriptor(file, payload, describe(current)) })
    current = []
  }

  for (const item of items) {
    const candidate = [...current, item]
    if (current.length > 0 && Buffer.byteLength(json({ schemaVersion: 1, items: candidate })) > maxBytes) flush()
    current.push(item)
  }
  flush()
  return shards
}

function addShards(payloads, shards) {
  for (const shard of shards) payloads.set(shard.file, shard.payload)
  return shards.map((shard) => shard.descriptor)
}

function relationshipEntries(records, locators) {
  const entries = new Map(records.map((record) => [record.id, {
    id: record.id,
    locator: locators.get(record.id),
    outgoing: [],
    incoming: []
  }]))
  const add = (from, to, type, at) => {
    const edge = { type, target: to }
    const reverse = { type, source: from }
    if (at) {
      edge.at = at
      reverse.at = at
    }
    entries.get(from)?.outgoing.push(edge)
    entries.get(to)?.incoming.push(reverse)
  }
  for (const record of records) {
    for (const relation of record.relations) add(record.id, relation.target, relation.type)
    for (const target of record.members) add(record.id, target, 'contains')
    for (const entry of record.entries) {
      if (entry.target) add(record.id, entry.target, 'timeline-entry', entry.at)
    }
  }
  const edgeKey = (edge) => `${edge.type}:${edge.target ?? edge.source}:${edge.at ?? ''}`
  for (const entry of entries.values()) {
    entry.outgoing.sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)))
    entry.incoming.sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)))
  }
  return [...entries.values()].sort(compareIds)
}

function timelineBuckets(records, locators) {
  const recordById = new Map(records.map((record) => [record.id, record]))
  const buckets = new Map()
  for (const timeline of records.filter((record) => record.kind === 'timeline')) {
    for (const entry of timeline.entries) {
      const bucket = entry.at.slice(0, 7)
      const target = entry.target ? recordById.get(entry.target) : null
      const item = {
        timelineId: timeline.id,
        at: entry.at,
        title: entry.title,
        target: target ? canonical(target, locators.get(target.id)) : null
      }
      if (!buckets.has(bucket)) buckets.set(bucket, [])
      buckets.get(bucket).push(item)
    }
  }
  for (const items of buckets.values()) {
    items.sort((left, right) => right.at.localeCompare(left.at) ||
      left.timelineId.localeCompare(right.timelineId) || left.title.localeCompare(right.title))
  }
  return [...buckets].sort(([left], [right]) => right.localeCompare(left))
}

export function buildHybridIndex(records, {
  maxShardBytes = 131072,
  objectHashPrefixLength = 2
} = {}) {
  const payloads = new Map()
  const locators = new Map()

  for (const record of [...records].sort(compareIds)) {
    const object = { schemaVersion: 1, object: record }
    const contents = json(object)
    const hash = sha256(contents)
    const file = `objects/${hash.slice(0, objectHashPrefixLength)}/${hash}.json`
    payloads.set(file, object)
    locators.set(record.id, {
      strategy: 'content-addressed',
      base: 'site-data',
      file,
      url: `/data/knowledge/${file}`,
      hash,
      bytes: Buffer.byteLength(contents)
    })
  }

  const byIdItems = [...records]
    .sort(compareIds)
    .map((record) => ({ id: record.id, kind: record.kind, locator: locators.get(record.id) }))
  const byIdShards = splitShards({
    items: byIdItems,
    directory: 'catalog/by-id',
    name: 'ids',
    maxBytes: maxShardBytes,
    describe: (items) => ({ firstId: items[0].id, lastId: items.at(-1).id, count: items.length })
  })

  const byKind = {}
  for (const kind of [...new Set(records.map((record) => record.kind))].sort()) {
    const items = records
      .filter((record) => record.kind === kind)
      .map((record) => canonical(record, locators.get(record.id)))
      .sort(compareListings)
    const shards = splitShards({
      items,
      directory: 'catalog/by-kind',
      name: kind,
      maxBytes: maxShardBytes,
      describe: (values) => ({
        kind,
        count: values.length,
        firstId: values[0].id,
        lastId: values.at(-1).id
      })
    })
    byKind[kind] = addShards(payloads, shards)
  }
  const catalog = {
    schemaVersion: 1,
    strategy: 'sorted-range-shards',
    maxShardBytes,
    byId: addShards(payloads, byIdShards),
    byKind
  }
  payloads.set('catalog/manifest.json', catalog)

  const adjacencyShards = splitShards({
    items: relationshipEntries(records, locators),
    directory: 'relationships/shards',
    name: 'adjacency',
    maxBytes: maxShardBytes,
    describe: (items) => ({ firstId: items[0].id, lastId: items.at(-1).id, count: items.length })
  })
  const relationships = {
    schemaVersion: 1,
    strategy: 'adjacency-range-shards',
    maxShardBytes,
    shards: addShards(payloads, adjacencyShards)
  }
  payloads.set('relationships/manifest.json', relationships)

  const buckets = []
  for (const [bucket, items] of timelineBuckets(records, locators)) {
    const shards = splitShards({
      items,
      directory: 'timeline-buckets',
      name: bucket,
      maxBytes: maxShardBytes,
      describe: (values) => ({ bucket, count: values.length, firstAt: values[0].at, lastAt: values.at(-1).at })
    })
    buckets.push({ bucket, shards: addShards(payloads, shards) })
  }
  const timelines = { schemaVersion: 1, strategy: 'monthly-time-buckets', maxShardBytes, buckets }
  payloads.set('timeline-buckets/manifest.json', timelines)

  const manifest = {
    schemaVersion: 1,
    readerVersion: 2,
    strategy: 'hybrid-index',
    locators: {
      objects: { strategy: 'content-addressed', catalog: 'catalog/manifest.json', base: 'site-data' },
      listings: { strategy: 'sorted-range-shards', manifest: 'catalog/manifest.json', base: 'release' },
      relationships: { strategy: 'adjacency-range-shards', manifest: 'relationships/manifest.json', base: 'release' },
      timelines: { strategy: 'monthly-time-buckets', manifest: 'timeline-buckets/manifest.json', base: 'release' },
      assets: {
        strategy: 'content-addressed-reverse-map',
        manifest: 'asset-manifest.json',
        reverseMap: 'asset-map.json',
        base: 'release'
      },
      pulses: { strategy: 'latest-with-private-history', publication: 'pulses.json', base: 'release' },
      search: { strategy: 'compatibility-document-source', file: 'search-source.json', base: 'release', enhanced: false }
    },
    compatibility: {
      preferredEntryPoint: 'hybrid-index.json',
      legacyFiles: ['content-records.json', 'content-index.json', 'relationship-graph.json', 'timelines.json']
    }
  }
  payloads.set('hybrid-index.json', manifest)

  return { payloads, locators, manifest, catalog, relationships, timelines }
}
