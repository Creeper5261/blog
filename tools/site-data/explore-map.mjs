export const MAP_SIZE = 1000
export const MAP_PADDING = 90

export function truncateLabel(title, max = 10) {
  const clean = String(title).replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export function layoutGraph(graph) {
  const nodes = [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))
  const center = MAP_SIZE / 2
  const radius = nodes.length > 1
    ? MAP_SIZE / 2 - MAP_PADDING
    : 0
  const positioned = nodes.map((node, index) => {
    const angle = nodes.length === 1
      ? -Math.PI / 2
      : (index / nodes.length) * Math.PI * 2 - Math.PI / 2
    return {
      ...node,
      x: Math.round((center + radius * Math.cos(angle)) * 10) / 10,
      y: Math.round((center + radius * Math.sin(angle)) * 10) / 10
    }
  })
  const byId = new Map(positioned.map((node) => [node.id, node]))
  const edges = graph.edges
    .map((edge) => ({ ...edge, from: byId.get(edge.from), to: byId.get(edge.to) }))
    .filter((edge) => edge.from && edge.to)
    .sort((left, right) => `${left.from.id}:${left.type}:${left.to.id}`.localeCompare(`${right.from.id}:${right.type}:${right.to.id}`))
  return { schemaVersion: 1, size: MAP_SIZE, nodes: positioned, edges }
}
