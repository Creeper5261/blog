function canonicalSummary(record, locator) {
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

function relationKey(edge) {
  return `${edge.from}:${edge.type}:${edge.to}`
}

function collectionRelations(collection, records) {
  const scope = new Set([collection.id, ...(collection.members ?? [])])
  const edges = []
  for (const record of records) {
    for (const relation of record.relations ?? []) {
      if (scope.has(record.id) || scope.has(relation.target)) {
        edges.push({ from: record.id, to: relation.target, type: relation.type })
      }
    }
  }
  return edges.sort((left, right) => relationKey(left).localeCompare(relationKey(right)))
}

export function buildTopicsPayload(records, locators) {
  const recordById = new Map(records.map((record) => [record.id, record]))
  const collections = records
    .filter((record) => record.kind === 'collection')
    .map((record) => ({
      ...canonicalSummary(record, locators.get(record.id)),
      members: (record.members ?? []).map((id) => canonicalSummary(recordById.get(id), locators.get(id))),
      relations: collectionRelations(record, records)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  return { schemaVersion: 1, collections }
}
