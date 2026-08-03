import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateKnowledgeSite } from '../tools/content-contracts/validate.mjs'

const temporaryRoots = []
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
})

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'knowledge-contracts-'))
  temporaryRoots.push(root)
  await Promise.all([
    mkdir(path.join(root, 'content'), { recursive: true }),
    mkdir(path.join(root, 'assets'), { recursive: true }),
    mkdir(path.join(root, 'external'), { recursive: true }),
    cp(path.join(repositoryRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  ])
  await writeJson(path.join(root, 'knowledge-site.config.json'), {
    schemaVersion: 1,
    roots: {
      content: 'content',
      assets: 'assets',
      schemas: 'schemas',
      external: 'external',
      generated: 'generated'
    },
    allowedExternalHosts: ['github.com'],
    assetPolicy: {
      metadataFile: 'metadata.json',
      publicPath: '/media',
      allowedExtensions: ['.png', '.svg'],
      maxBytes: 1048576,
      requireAlt: true,
      requireRights: true
    },
    siteDataPolicy: {
      releaseRetention: 3,
      immutableCacheControl: 'public, max-age=31536000, immutable',
      mutableCacheControl: 'public, max-age=0, must-revalidate',
      hybridIndex: { maxShardBytes: 2048, objectHashPrefixLength: 2 }
    }
  })
  await writeJson(path.join(root, 'assets', 'metadata.json'), { schemaVersion: 1, assets: {} })
  return root
}

function object(kind, id, properties = {}) {
  return {
    schemaVersion: 1,
    id,
    kind,
    title: id,
    status: 'draft',
    ...properties
  }
}

test('the repository S0 content contract validates without generated data', async () => {
  const result = await validateKnowledgeSite({ root: repositoryRoot })

  assert.equal(result.ok, true)
  assert.equal(result.objectCount, 132)
  assert.deepEqual(result.errors, [])
})

test('all S0 object kinds share one versioned contract', async () => {
  const root = await createFixture()
  const documents = [
    object('article', 'test.article', { body: 'article' }),
    object('note', 'test.note', { body: 'note', relations: [{ type: 'follows', target: 'test.article' }] }),
    object('entity', 'test.entity', { entityType: 'concept' }),
    object('collection', 'test.collection', { members: ['test.article', 'test.note'] }),
    object('timeline', 'test.timeline', { entries: [{ at: '2026-08-01', title: 'Milestone', target: 'test.article' }] }),
    object('media', 'test.media', { asset: { path: '../assets/hero.png', alt: 'Hero' } }),
    object('tool', 'test.tool', { slug: 'test-tool', privacy: 'local-only', inputKinds: ['text/plain'], outputKinds: ['text/plain'] })
  ]

  await Promise.all(documents.map((document, index) => writeJson(path.join(root, 'content', `${index}.json`), document)))
  await writeJson(path.join(root, 'external', 'embed.json'), object('external-embed', 'test.embed', {
    provider: 'github',
    url: 'https://github.com/Creeper5261'
  }))
  await writeJson(path.join(root, 'external', 'pulse.json'), object('pulse', 'test.pulse', {
    source: 'github',
    query: 'created:>2026-07-01',
    schedule: 'daily',
    accessRules: 'Official public API metadata.'
  }))

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, true)
  assert.equal(result.objectCount, 9)
})

test('Markdown content participates in stable ID and relationship validation', async () => {
  const root = await createFixture()
  await writeJson(path.join(root, 'content', 'target.json'), object('note', 'test.target', { body: 'target' }))
  await writeFile(path.join(root, 'content', 'article.md'), `---
schemaVersion: 1
id: test.article
kind: article
title: Markdown article
status: draft
relations:
  - type: follows
    target: test.target
---

[Target](knowledge:test.target)
`)

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, true)
  assert.equal(result.objectCount, 2)
})

test('unknown knowledge links in Markdown fail with source location', async () => {
  const root = await createFixture()
  await writeFile(path.join(root, 'content', 'article.md'), `---
schemaVersion: 1
id: test.article
kind: article
title: Markdown article
status: draft
---

[Missing](knowledge:test.missing)
`)

  const result = await validateKnowledgeSite({ root })
  const failure = result.errors.find((error) => error.code === 'missing-target')
  assert.equal(result.ok, false)
  assert.equal(failure.file, 'content/article.md')
  assert.match(failure.pointer, /^line:\d+:\d+$/)
})

test('duplicate IDs and unresolved relationship targets fail validation', async () => {
  const root = await createFixture()
  await writeJson(path.join(root, 'content', 'first.json'), object('note', 'test.duplicate', {
    body: 'first',
    relations: [{ type: 'depends-on', target: 'test.missing' }]
  }))
  await writeJson(path.join(root, 'content', 'second.json'), object('note', 'test.duplicate', { body: 'second' }))

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, false)
  assert.deepEqual(new Set(result.errors.map((error) => error.code)), new Set(['duplicate-id', 'missing-target']))
})

test('paths outside configured roots fail validation', async () => {
  const root = await createFixture()
  await writeJson(path.join(root, 'content', 'media.json'), object('media', 'test.media', {
    asset: { path: '../../private/secret.png', alt: 'Invalid path' }
  }))

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.code === 'unsafe-asset-path'), true)
})

test('configured roots cannot escape the repository', async () => {
  const root = await createFixture()
  const configFile = path.join(root, 'knowledge-site.config.json')
  const config = JSON.parse(await readFile(configFile, 'utf8'))
  config.roots.schemas = '../schemas'
  await writeJson(configFile, config)

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.code === 'unsafe-root'), true)
})

test('unapproved or insecure external URLs fail validation', async () => {
  const root = await createFixture()
  await writeJson(path.join(root, 'external', 'unapproved.json'), object('external-embed', 'test.unapproved', {
    provider: 'example',
    url: 'https://example.com/video'
  }))
  await writeJson(path.join(root, 'external', 'insecure.json'), object('external-embed', 'test.insecure', {
    provider: 'github',
    url: 'http://github.com/Creeper5261'
  }))

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, false)
  assert.deepEqual(
    new Set(result.errors.map((error) => error.code)),
    new Set(['external-host-not-allowed', 'invalid-external-url'])
  )
})

test('content kinds in the external root fail validation', async () => {
  const root = await createFixture()
  await writeJson(path.join(root, 'external', 'note.json'), object('note', 'test.note', { body: 'wrong root' }))

  const result = await validateKnowledgeSite({ root })
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.code === 'wrong-root'), true)
})

test('the content check package script remains part of the full check', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))

  assert.match(packageJson.scripts['check:content'], /tools\/content-build\/build\.mjs --check/)
  assert.match(packageJson.scripts.check, /check:content/)
})
