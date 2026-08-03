import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAP_PADDING, MAP_SIZE, layoutGraph, truncateLabel } from '../tools/site-data/explore-map.mjs'

const node = (id, kind, title) => ({
  id,
  kind,
  title,
  status: 'evergreen',
  publishedAt: '2026-08-01',
  updatedAt: '2026-08-01',
  assetUrls: [],
  locator: {
    strategy: 'content-addressed',
    base: 'site-data',
    file: `objects/${id}.json`,
    url: `/data/knowledge/objects/${id}.json`,
    hash: 'a'.repeat(64),
    bytes: 1
  }
})

const graph = {
  schemaVersion: 1,
  nodes: [
    node('b.node', 'entity', 'B 实体'),
    node('a.node', 'article', 'A 文章'),
    node('c.node', 'collection', 'C 集合')
  ],
  edges: [
    { from: 'a.node', to: 'b.node', type: 'explains' },
    { from: 'missing', to: 'b.node', type: 'broken' }
  ]
}

test('S5 explore map layout is deterministic and keeps every node inside the viewport', () => {
  const first = layoutGraph(graph)
  const second = layoutGraph(graph)

  assert.deepEqual(first, second)
  assert.equal(first.nodes.length, 3)
  assert.equal(first.edges.length, 1)
  assert.deepEqual(first.nodes.map((entry) => entry.id), ['a.node', 'b.node', 'c.node'])
  assert.ok(first.edges.every((edge) => edge.from && edge.to && edge.from.id === 'a.node' && edge.to.id === 'b.node'))
  for (const entry of first.nodes) {
    assert.ok(Number.isFinite(entry.x) && Number.isFinite(entry.y))
    assert.ok(entry.x >= MAP_PADDING && entry.x <= MAP_SIZE - MAP_PADDING)
    assert.ok(entry.y >= MAP_PADDING && entry.y <= MAP_SIZE - MAP_PADDING)
  }
})

test('S5 explore map labels truncate deterministically', () => {
  assert.equal(truncateLabel('短标题'), '短标题')
  assert.equal(truncateLabel('这是一个很长的标题需要被截断显示'), '这是一个很长的标题需…')
  assert.equal(truncateLabel('A  B  多空格'), 'A B 多空格')
})
