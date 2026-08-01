import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildKnowledgeContent } from '../tools/content-build/build.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20"/></svg>'
const temporaryRoots = []

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
})

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function createFixture({ maxBytes = 1024 * 1024, allowedExtensions = ['.pdf', '.svg'] } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'content-build-'))
  temporaryRoots.push(root)
  await Promise.all([
    mkdir(path.join(root, 'content', 'articles'), { recursive: true }),
    mkdir(path.join(root, 'assets', 'articles'), { recursive: true }),
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
      allowedExtensions,
      maxBytes,
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
  return root
}

async function writeArticle(root, body) {
  await writeFile(path.join(root, 'content', 'articles', 'article.md'), `---
schemaVersion: 1
id: test.article
kind: article
title: Asset article
status: draft
relations:
  - type: follows
    target: test.target
---

${body}
`)
  await writeJson(path.join(root, 'content', 'target.json'), {
    schemaVersion: 1,
    id: 'test.target',
    kind: 'note',
    title: 'Target',
    status: 'draft',
    body: 'Target body'
  })
}

test('content build writes deterministic records, manifest, media, and reports', async () => {
  const root = await createFixture()
  await writeArticle(root, `![Diagram](../../assets/articles/diagram.svg)

[Attachment](../../assets/articles/guide.pdf)

[Target](knowledge:test.target)

\`\`\`js
console.log('deterministic')
\`\`\``)
  await writeFile(path.join(root, 'assets', 'articles', 'diagram.svg'), SVG)
  await writeFile(path.join(root, 'assets', 'articles', 'guide.pdf'), '%PDF-1.4\n%%EOF\n')
  await writeFile(path.join(root, 'assets', 'articles', 'unused.svg'), SVG.replace('width="10"', 'width="11"'))
  await writeJson(path.join(root, 'assets', 'metadata.json'), {
    schemaVersion: 1,
    assets: {
      'articles/diagram.svg': { rights: 'original', source: 'test fixture' },
      'articles/guide.pdf': { rights: 'original', source: 'test fixture' },
      'articles/unused.svg': { rights: 'original', source: 'test fixture' }
    }
  })

  const first = await buildKnowledgeContent({ root })
  assert.equal(first.ok, true)
  assert.equal(first.objectCount, 2)
  assert.equal(first.assetCount, 2)
  assert.deepEqual(first.report.unreferencedAssets, ['articles/unused.svg'])

  const manifestFile = path.join(root, 'generated', 'site-data', 'asset-manifest.json')
  const recordsFile = path.join(root, 'generated', 'site-data', 'content-records.json')
  const firstManifest = await readFile(manifestFile, 'utf8')
  const firstRecords = await readFile(recordsFile, 'utf8')
  const manifest = JSON.parse(firstManifest)
  const image = manifest.assets.find((asset) => asset.extension === '.svg')
  assert.equal(image.width, 10)
  assert.equal(image.height, 20)
  assert.equal(image.references[0].contentId, 'test.article')
  assert.match(image.url, /^\/media\/[a-f0-9]{64}\.svg$/)
  await stat(path.join(root, 'generated', 'media', image.filename))

  const article = JSON.parse(firstRecords).records.find((record) => record.id === 'test.article')
  assert.deepEqual(article.knowledgeLinks, ['test.target'])
  assert.deepEqual(article.codeBlocks.map((block) => block.language), ['js'])
  assert.equal(article.assets.length, 2)
  assert.match(article.body, new RegExp(image.url.replaceAll('.', '\\.')))
  assert.doesNotMatch(article.body, /\.\.\/\.\.\/assets\/articles\/diagram\.svg/)

  const second = await buildKnowledgeContent({ root })
  assert.equal(second.ok, true)
  assert.equal(await readFile(manifestFile, 'utf8'), firstManifest)
  assert.equal(await readFile(recordsFile, 'utf8'), firstRecords)
})

test('identical asset bytes publish one hashed object with reverse references', async () => {
  const root = await createFixture({ allowedExtensions: ['.svg'] })
  await writeArticle(root, `![First](../../assets/articles/first.svg)
![Second](../../assets/articles/second.svg)`)
  await writeFile(path.join(root, 'assets', 'articles', 'first.svg'), SVG)
  await writeFile(path.join(root, 'assets', 'articles', 'second.svg'), SVG)
  await writeJson(path.join(root, 'assets', 'metadata.json'), {
    schemaVersion: 1,
    assets: {
      'articles/first.svg': { rights: 'original' },
      'articles/second.svg': { rights: 'original' }
    }
  })

  const result = await buildKnowledgeContent({ root, write: false })
  assert.equal(result.ok, true)
  assert.equal(result.assetCount, 1)
  assert.equal(result.manifest.assets[0].references.length, 2)
  assert.deepEqual(result.report.duplicateContent[0].sourcePaths, ['articles/first.svg', 'articles/second.svg'])
})

test('content build blocks missing, unsafe, unlicensed, invalid, and oversized assets', async () => {
  const root = await createFixture({ maxBytes: 8, allowedExtensions: ['.pdf', '.svg'] })
  await writeArticle(root, `![ ](../../assets/articles/no-alt.svg)
![No rights](../../assets/articles/no-rights.svg)
[Missing](../../assets/articles/missing.pdf)
[Disallowed](../../assets/articles/file.txt)
[Large](../../assets/articles/large.pdf)`)
  await writeFile(path.join(root, 'assets', 'articles', 'no-alt.svg'), SVG)
  await writeFile(path.join(root, 'assets', 'articles', 'no-rights.svg'), SVG)
  await writeFile(path.join(root, 'assets', 'articles', 'file.txt'), 'text')
  await writeFile(path.join(root, 'assets', 'articles', 'large.pdf'), 'larger than eight bytes')
  await writeJson(path.join(root, 'assets', 'metadata.json'), {
    schemaVersion: 1,
    assets: {
      'articles/no-alt.svg': { rights: 'original' },
      'articles/large.pdf': { rights: 'original' }
    }
  })

  const result = await buildKnowledgeContent({ root })
  const codes = new Set(result.errors.map((error) => error.code))
  assert.equal(result.ok, false)
  for (const code of ['missing-asset-alt', 'missing-asset-rights', 'missing-asset', 'asset-extension-not-allowed', 'asset-too-large']) {
    assert.equal(codes.has(code), true, `expected ${code}; received ${[...codes].join(', ')}`)
  }
  await assert.rejects(stat(path.join(root, 'generated')), { code: 'ENOENT' })

  await writeArticle(root, '[Outside](../../../private.pdf)')
  const unsafe = await buildKnowledgeContent({ root, write: false })
  assert.equal(unsafe.ok, false)
  assert.equal(unsafe.errors.some((error) => error.code === 'unsafe-asset-path'), true)
})

test('structured JSON media references use the same hashed asset pipeline', async () => {
  const root = await createFixture({ allowedExtensions: ['.svg'] })
  await writeJson(path.join(root, 'content', 'media.json'), {
    schemaVersion: 1,
    id: 'test.media',
    kind: 'media',
    title: 'Structured image',
    status: 'draft',
    asset: { path: '../assets/articles/diagram.svg', alt: 'Structured diagram', rights: 'original' }
  })
  await writeFile(path.join(root, 'assets', 'articles', 'diagram.svg'), SVG)
  await writeJson(path.join(root, 'assets', 'metadata.json'), { schemaVersion: 1, assets: {} })

  const result = await buildKnowledgeContent({ root, write: false })
  assert.equal(result.ok, true)
  assert.equal(result.assetCount, 1)
  assert.equal(result.content.records[0].assets[0].alt, 'Structured diagram')
  assert.equal(result.manifest.assets[0].rights, 'original')
})

test('moving content does not change the published asset URL', async () => {
  const root = await createFixture({ allowedExtensions: ['.svg'] })
  await writeArticle(root, '![Diagram](../../assets/articles/diagram.svg)')
  await writeFile(path.join(root, 'assets', 'articles', 'diagram.svg'), SVG)
  await writeJson(path.join(root, 'assets', 'metadata.json'), {
    schemaVersion: 1,
    assets: { 'articles/diagram.svg': { rights: 'original' } }
  })

  const before = await buildKnowledgeContent({ root, write: false })
  await mkdir(path.join(root, 'content', 'moved', 'deeper'), { recursive: true })
  await rename(
    path.join(root, 'content', 'articles', 'article.md'),
    path.join(root, 'content', 'moved', 'deeper', 'article.md')
  )
  const movedFile = path.join(root, 'content', 'moved', 'deeper', 'article.md')
  await writeFile(movedFile, (await readFile(movedFile, 'utf8')).replace('../../assets/', '../../../assets/'))
  const afterMove = await buildKnowledgeContent({ root, write: false })

  assert.equal(before.ok, true)
  assert.equal(afterMove.ok, true)
  assert.equal(afterMove.manifest.assets[0].url, before.manifest.assets[0].url)
})

test('relative content links must exist and stay inside the content root', async () => {
  const root = await createFixture()
  await writeArticle(root, `[Missing](./missing.mdx)
[Outside](../../outside.md)`)
  await writeJson(path.join(root, 'assets', 'metadata.json'), { schemaVersion: 1, assets: {} })

  const result = await buildKnowledgeContent({ root, write: false })
  const codes = new Set(result.errors.map((error) => error.code))
  assert.equal(result.ok, false)
  assert.equal(codes.has('missing-content-link'), true)
  assert.equal(codes.has('content-link-outside-root'), true)
})
