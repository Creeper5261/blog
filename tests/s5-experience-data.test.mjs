import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'

import { buildToolManifestPayload } from '../tools/capabilities/manifests.mjs'
import { buildSiteData } from '../tools/site-data/build.mjs'
import { buildRoutesPayload } from '../tools/site-data/routes.mjs'
import { buildTopicsPayload } from '../tools/site-data/topics.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

const baseRecord = {
  status: 'evergreen',
  publishedAt: '2026-08-01',
  updatedAt: '2026-08-01',
  assets: []
}

test('S5 topics projection composes collections from records without copying content storage', () => {
  const records = [
    {
      ...baseRecord,
      id: 'topic.gallery',
      kind: 'collection',
      title: '专题展厅',
      members: ['topic.one', 'topic.two'],
      relations: [{ type: 'covers', target: 'topic.three' }]
    },
    { ...baseRecord, id: 'topic.one', kind: 'article', title: '对象一', body: 'private body', relations: [] },
    { ...baseRecord, id: 'topic.two', kind: 'entity', title: '对象二', entityType: 'concept', relations: [{ type: 'explains', target: 'topic.one' }] },
    { ...baseRecord, id: 'topic.three', kind: 'note', title: '相关札记', body: 'related body', relations: [] }
  ]
  const locators = new Map(records.map((record, index) => [record.id, {
    strategy: 'content-addressed',
    base: 'site-data',
    file: `objects/${record.id}.json`,
    url: `/data/knowledge/objects/${record.id}.json`,
    hash: String(index).padStart(64, 'a'),
    bytes: 1
  }]))

  const payload = buildTopicsPayload(records, locators)
  const collection = payload.collections.find((entry) => entry.id === 'topic.gallery')

  assert.equal(payload.schemaVersion, 1)
  assert.equal(payload.collections.length, 1)
  assert.deepEqual(collection.members.map((member) => member.id), ['topic.one', 'topic.two'])
  assert.ok(collection.members.every((member) => !('body' in member)))
  assert.ok(collection.relations.some((edge) => edge.type === 'covers' && edge.to === 'topic.three'))
  assert.ok(collection.relations.some((edge) => edge.type === 'explains' && edge.from === 'topic.two'))
})

test('S5 routes projection merges tool manifests with curated site routes', () => {
  const payload = buildRoutesPayload(buildToolManifestPayload())
  const routes = payload.items.map((item) => item.route)

  assert.equal(payload.schemaVersion, 1)
  assert.equal(new Set(routes).size, routes.length)
  assert.deepEqual(routes, [...routes].sort())
  const tool = payload.items.find((item) => item.route === '/tools/local-json/')
  assert.equal(tool.source, 'tool-manifest')
  assert.equal(tool.kind, 'tool')
  for (const route of ['/', '/topics/', '/tools/', '/explore/', '/explore/map/', '/paths/', '/flow/', '/lab/', '/pulse/', '/explain/', '/knowledge-data/']) {
    assert.ok(payload.items.some((item) => item.route === route && item.source === 'site-routes'))
  }
  assert.equal(payload.items.some((item) => item.route === '/tools/' && item.source === 'site-routes'), true)
})

test('S5 experience payloads satisfy the declared JSON schemas and stay canonical', async () => {
  const result = await buildSiteData({ root: repositoryRoot, write: false })

  assert.equal(result.ok, true)
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  const topicsSchema = JSON.parse(await readFile(path.join(repositoryRoot, 'schemas', 'v1', 'topic-gallery.schema.json'), 'utf8'))
  const routesSchema = JSON.parse(await readFile(path.join(repositoryRoot, 'schemas', 'v1', 'site-routes.schema.json'), 'utf8'))
  const validateTopics = ajv.compile(topicsSchema)
  const validateRoutes = ajv.compile(routesSchema)

  assert.equal(validateTopics(result.bundle['topics.json']), true, JSON.stringify(validateTopics.errors))
  assert.equal(validateRoutes(result.bundle['routes.json']), true, JSON.stringify(validateRoutes.errors))

  const index = result.bundle['content-index.json'].items
  const collection = result.bundle['topics.json'].collections.find((entry) => entry.id === 'site.hybrid-indexing.collection')
  for (const member of collection.members) {
    const canonical = index.find((item) => item.id === member.id)
    assert.equal(member.title, canonical.title)
    assert.equal(member.kind, canonical.kind)
    assert.deepEqual(member.locator, canonical.locator)
  }
})
