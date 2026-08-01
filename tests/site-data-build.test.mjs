import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildSiteData } from '../tools/site-data/build.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const temporaryRoots = []
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>'

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
})

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'site-data-'))
  temporaryRoots.push(root)
  await Promise.all([
    mkdir(path.join(root, 'content'), { recursive: true }),
    mkdir(path.join(root, 'assets'), { recursive: true }),
    mkdir(path.join(root, 'external'), { recursive: true }),
    cp(path.join(repositoryRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  ])
  await writeJson(path.join(root, 'knowledge-site.config.json'), {
    schemaVersion: 1,
    roots: { content: 'content', assets: 'assets', schemas: 'schemas', external: 'external', generated: 'generated' },
    allowedExternalHosts: ['example.com'],
    assetPolicy: {
      metadataFile: 'metadata.json', publicPath: '/media', allowedExtensions: ['.svg'], maxBytes: 1024,
      requireAlt: true, requireRights: true
    }
  })
  await writeFile(path.join(root, 'assets', 'diagram.svg'), SVG)
  await writeJson(path.join(root, 'assets', 'metadata.json'), {
    schemaVersion: 1,
    assets: { 'diagram.svg': { rights: 'original' } }
  })

  const common = { schemaVersion: 1, status: 'evergreen', publishedAt: '2026-08-01', updatedAt: '2026-08-01' }
  await writeJson(path.join(root, 'content', 'article.json'), {
    ...common, id: 'test.article', kind: 'article', title: 'Canonical title', body: 'Searchable body', relations: [],
    media: [{ path: '../assets/diagram.svg', alt: 'Diagram' }]
  })
  await writeJson(path.join(root, 'content', 'collection.json'), {
    ...common, id: 'test.collection', kind: 'collection', title: 'Collection', members: ['test.article']
  })
  await writeJson(path.join(root, 'content', 'timeline.json'), {
    ...common, id: 'test.timeline', kind: 'timeline', title: 'Timeline',
    entries: [{ at: '2026-08-01', title: 'Published', target: 'test.article' }]
  })
  await writeJson(path.join(root, 'content', 'tool.json'), {
    ...common, id: 'test.tool', kind: 'tool', title: 'Tool', slug: 'test-tool', privacy: 'local-only',
    inputKinds: ['text/plain'], outputKinds: ['text/plain']
  })
  await writeJson(path.join(root, 'external', 'embed.json'), {
    ...common, id: 'test.embed', kind: 'external-embed', title: 'Embed', provider: 'example', url: 'https://example.com/embed'
  })
  await writeJson(path.join(root, 'external', 'pulse.json'), {
    ...common, id: 'test.pulse', kind: 'pulse', title: 'Pulse', source: 'fixture', query: 'latest', schedule: 'daily',
    snapshot: { fetchedAt: '2026-08-01T10:00:00Z', items: [{ id: 'one', title: 'Snapshot item', url: 'https://example.com/one' }] }
  })
  return root
}

test('site-data build keeps canonical fields consistent across every projection', async () => {
  const root = await createFixture()
  const result = await buildSiteData({ root, write: false, pulseProvider: async () => { throw new Error('offline') } })

  assert.equal(result.ok, true)
  const article = result.bundle['content-index.json'].items.find((item) => item.id === 'test.article')
  const node = result.bundle['relationship-graph.json'].nodes.find((item) => item.id === 'test.article')
  const timelineTarget = result.bundle['timelines.json'].timelines[0].entries[0].target
  const search = result.bundle['search-source.json'].documents.find((item) => item.id === 'test.article')
  const assetUrl = result.bundle['asset-map.json'].byContentId['test.article'][0].url

  for (const projection of [node, timelineTarget, search]) {
    assert.equal(projection.id, article.id)
    assert.equal(projection.title, article.title)
    assert.equal(projection.publishedAt, article.publishedAt)
    assert.deepEqual(projection.assetUrls, article.assetUrls)
  }
  assert.equal(assetUrl, article.assetUrls[0])
  assert.equal(result.bundle['pulses.json'].pulses[0].snapshotStatus, 'fallback')
  assert.equal(result.bundle['pulses.json'].pulses[0].fetchedAt, '2026-08-01T10:00:00Z')
  assert.equal(result.bundle['external-embeds.json'].embeds[0].url, 'https://example.com/embed')
  assert.equal(result.bundle['features.json'].tools[0].privacy, 'local-only')
})

test('full, incremental, and repeated builds produce the same release hash', async () => {
  const root = await createFixture()
  const full = await buildSiteData({ root, write: true })
  const firstRelease = await readFile(path.join(root, 'generated', 'site-data', 'release.json'), 'utf8')
  const incremental = await buildSiteData({ root, write: false, mode: 'incremental' })
  const repeated = await buildSiteData({ root, write: true })

  assert.equal(full.ok, true)
  assert.equal(incremental.ok, true)
  assert.equal(repeated.ok, true)
  assert.equal(full.buildHash, incremental.buildHash)
  assert.equal(full.buildHash, repeated.buildHash)
  assert.equal(await readFile(path.join(root, 'generated', 'site-data', 'release.json'), 'utf8'), firstRelease)
  assert.equal(
    await readFile(path.join(root, 'generated', 'site-data', 'releases', full.buildHash, 'release.json'), 'utf8'),
    firstRelease
  )
  assert.match(full.release.cache.immutableReleasePath, new RegExp(full.buildHash))
  assert.equal(full.release.rollback.release, full.buildHash)
})

test('a fresh Pulse snapshot replaces fallback data', async () => {
  const root = await createFixture()
  const result = await buildSiteData({
    root,
    write: false,
    pulseProvider: async () => ({ fetchedAt: '2026-08-01T12:00:00Z', items: [{ id: 'fresh', title: 'Fresh item' }] })
  })

  assert.equal(result.ok, true)
  assert.equal(result.bundle['pulses.json'].pulses[0].snapshotStatus, 'fresh')
  assert.equal(result.bundle['pulses.json'].pulses[0].items[0].id, 'fresh')
})

test('an invalid fresh Pulse response falls back to the versioned snapshot', async () => {
  const root = await createFixture()
  const result = await buildSiteData({ root, write: false, pulseProvider: async () => ({ items: [] }) })

  assert.equal(result.ok, true)
  assert.equal(result.bundle['pulses.json'].pulses[0].snapshotStatus, 'fallback')
  assert.equal(result.bundle['pulses.json'].pulses[0].items[0].id, 'one')
})

test('Pulse publication fails instead of silently emitting empty data without a snapshot', async () => {
  const root = await createFixture()
  const pulseFile = path.join(root, 'external', 'pulse.json')
  const pulse = JSON.parse(await readFile(pulseFile, 'utf8'))
  delete pulse.snapshot
  await writeJson(pulseFile, pulse)

  const result = await buildSiteData({ root, write: false, pulseProvider: async () => { throw new Error('offline') } })
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.code === 'missing-pulse-snapshot'), true)
})
