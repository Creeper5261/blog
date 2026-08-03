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

function byId(left, right) {
  return left.id.localeCompare(right.id)
}

function pathKey(steps) {
  return steps.map((step) => step.id).join('>')
}

function relationKey(relation) {
  return `${relation.type}:${relation.target}`
}

export function buildKnowledgePaths(records, locators, { maxDepth = 3, maxPaths = 64 } = {}) {
  const recordById = new Map(records.map((record) => [record.id, record]))
  const summary = (record) => canonicalSummary(record, locators.get(record.id))
  const paths = []
  const seen = new Set()

  const pushPath = (path) => {
    const key = pathKey(path.steps)
    if (seen.has(key)) return
    seen.add(key)
    paths.push(path)
  }

  for (const collection of records.filter((record) => record.kind === 'collection').sort(byId)) {
    const steps = [collection, ...(collection.members ?? []).map((id) => recordById.get(id))]
    if (!steps.every(Boolean) || steps.length < 2) continue
    pushPath({
      id: `path.collection.${collection.id}`,
      title: `${collection.title} · 主题路径`,
      description: '沿集合成员顺序阅读该主题：从集合进入，逐个浏览成员。',
      kind: 'collection',
      steps: steps.map((record) => summary(record)),
      edges: steps.slice(1).map((member) => ({ from: collection.id, to: member.id, type: 'contains' }))
    })
  }

  for (const entity of records.filter((record) => record.kind === 'entity').sort(byId)) {
    const walk = (current, trail) => {
      if (trail.length >= 1) {
        const steps = [entity, ...trail]
        pushPath({
          id: `path.entity.${entity.id}.${steps.slice(1).map((step) => step.id).join('.')}`,
          title: `${entity.title} · 知识路径`,
          description: `从实体「${entity.title}」出发，沿关系逐级展开。`,
          kind: 'entity',
          steps: steps.map((record) => summary(record)),
          edges: steps.slice(1).map((record, index) => {
            const source = steps[index]
            const relation = (source.relations ?? []).find((item) => item.target === record.id)
            return { from: source.id, to: record.id, type: relation?.type ?? 'relates-to' }
          })
        })
      }
      if (trail.length >= maxDepth) return
      const next = [...(current.relations ?? [])]
        .sort(relationKey)
        .map((relation) => recordById.get(relation.target))
        .filter((record) => record && record.id !== entity.id && !trail.some((item) => item.id === record.id))
      for (const target of next) walk(target, [...trail, target])
    }
    walk(entity, [])
  }

  paths.sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
  return { schemaVersion: 1, paths: paths.slice(0, maxPaths) }
}
