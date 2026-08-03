import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'

import { buildSiteData } from '../tools/site-data/build.mjs'
import { buildKnowledgePaths } from '../tools/site-data/paths.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const baseRecord = {
  status: 'evergreen',
  publishedAt: '2026-08-01',
  updatedAt: '2026-08-01',
  assets: []
}

test('S5 knowledge paths derive collection and entity walks without cycles', () => {
  const records = [
    { ...baseRecord, id: 'topic.a', kind: 'collection', title: '集合 A', members: ['topic.one', 'topic.two'], relations: [] },
    { ...baseRecord, id: 'topic.one', kind: 'article', title: '对象一', body: 'private body', relations: [] },
    {
      ...baseRecord,
      id: 'topic.two',
      kind: 'entity',
      title: '实体二',
      entityType: 'concept',
      relations: [{ type: 'explains', target: 'topic.one' }]
    }
  ]
  const locators = new Map(records.map((record, index) => [record.id, {
    strategy: 'content-addressed',
    base: 'site-data',
    file: `objects/${record.id}.json`,
    url: `/data/knowledge/objects/${record.id}.json`,
    hash: String(index).padStart(64, 'a'),
    bytes: 1
  }]))

  const payload = buildKnowledgePaths(records, locators)
  const collectionPath = payload.paths.find((entry) => entry.kind === 'collection')
  const entityPath = payload.paths.find((entry) => entry.kind === 'entity')

  assert.equal(payload.schemaVersion, 1)
  assert.deepEqual(collectionPath.steps.map((step) => step.id), ['topic.a', 'topic.one', 'topic.two'])
  assert.deepEqual(collectionPath.edges.map((edge) => edge.type), ['contains', 'contains'])
  assert.deepEqual(entityPath.steps.map((step) => step.id), ['topic.two', 'topic.one'])
  assert.ok(entityPath.edges.every((edge) => edge.type === 'explains'))
  assert.ok(payload.paths.every((entry) => new Set(entry.steps.map((step) => step.id)).size === entry.steps.length))
  assert.equal(
    new Set(payload.paths.map((entry) => entry.steps.map((step) => step.id).join('>'))).size,
    payload.paths.length
  )
})

test('S5 paths payload satisfies the declared schema and references only known ids', async () => {
  const result = await buildSiteData({ root: repositoryRoot, write: false })

  assert.equal(result.ok, true)
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  const schema = JSON.parse(await readFile(path.join(repositoryRoot, 'schemas', 'v1', 'knowledge-paths.schema.json'), 'utf8'))
  const validate = ajv.compile(schema)
  const payload = result.bundle['paths.json']

  assert.equal(validate(payload), true, JSON.stringify(validate.errors))
  const ids = new Set(result.bundle['content-index.json'].items.map((item) => item.id))
  for (const entry of payload.paths) {
    assert.ok(entry.steps.length >= 2)
    assert.ok(entry.steps.every((step) => ids.has(step.id)))
    assert.equal(entry.edges.length, entry.steps.length - 1)
    assert.ok(entry.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)))
  }
})
