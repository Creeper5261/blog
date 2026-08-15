import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { checkMigration, migrate } from '../tools/content-migration/migrate.mjs'

const root = process.cwd()

test('content migration inventory is reproducible and complete', async () => {
  const result = await checkMigration()
  assert.equal(result.ok, true, result.errors?.join('\n'))
  assert.deepEqual(result.inventory.counts, {
    sourceFiles: 23,
    articles: 23,
    mediaObjects: 27,
    externalObjects: 75,
    resourceReferences: 107,
    migratedStaticAssets: 27,
    excludedStaticAssets: 1
  })
})

test('migrated records use the Sx contract and retain archived status', async () => {
  const result = await migrate({ write: false })
  assert.equal(result.ok, true)
  assert.equal(result.records.length, 125)
  assert.ok(result.records.every((record) => record.status === 'archived'))
  assert.ok(result.records.filter((record) => record.kind === 'article').every((record) => typeof record.body === 'string'))
  assert.ok(result.records.filter((record) => record.kind === 'external-embed').every((record) => record.url.startsWith('https://')))
  const ids = new Set(result.records.map((record) => record.id))
  for (const article of result.records.filter((record) => record.kind === 'article')) {
    assert.ok(article.relations.every((relation) => ids.has(relation.target)), article.id)
  }
})

test('migration writes structured roots and leaves source pages in place', async () => {
  await access(path.join(root, 'source', '_posts', 'hello-world.md'))
  await access(path.join(root, 'content', 'articles'))
  await access(path.join(root, 'content', 'media'))
  await access(path.join(root, 'external', 'resources'))
  const articleFiles = await readdir(path.join(root, 'content', 'articles'))
  const externalFiles = await readdir(path.join(root, 'external', 'resources'))
  assert.equal(articleFiles.length, 23)
  assert.equal(externalFiles.length, 75)
  const inventory = JSON.parse(await readFile(path.join(root, 'source', '_data', 'content-migration.json'), 'utf8'))
  assert.equal(inventory.preservation.sourceMarkdownUnchanged, true)
  assert.equal(inventory.preservation.publishedRoutesUnchanged, true)
})
