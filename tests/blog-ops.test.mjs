import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createPostMarkdown, listTaxonomy } from '../tools/blog-ops/posts.mjs'
import { copyStagedAssetsToPicbed, createPicbedPublishPlan, planAssetTarget, stageAsset } from '../tools/blog-ops/assets.mjs'

test('createPostMarkdown builds writer-friendly front matter', () => {
  const markdown = createPostMarkdown({
    title: '可视化写作',
    date: '2026-06-19T20:30:00+08:00',
    updated: '2026-06-19T20:30:00+08:00',
    description: '给博客加一个本地后台',
    cover: 'https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/cover/writer.webp',
    comments: true,
    mathjax: false,
    toc: true,
    categories: ['博客', '工程'],
    tags: ['writer', 'blog-ops'],
    body: '# 正文\n\n从这里开始写。'
  })

  assert.match(markdown, /^---\n/)
  assert.match(markdown, /title: '可视化写作'/)
  assert.match(markdown, /categories:\n  - '博客'\n  - '工程'/)
  assert.match(markdown, /tags:\n  - 'writer'\n  - 'blog-ops'/)
  assert.match(markdown, /\n---\n\n# 正文\n\n从这里开始写。\n$/)
})

test('listTaxonomy counts categories and tags from posts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'blog-ops-taxonomy-'))
  const postsDir = path.join(root, 'source', '_posts')
  await mkdir(postsDir, { recursive: true })
  await writeFile(path.join(postsDir, 'one.md'), `---
title: one
date: 2026-06-19
categories:
  - 博客
  - 工程
tags:
  - writer
---
body`)
  await writeFile(path.join(postsDir, 'two.md'), `---
title: two
date: 2026-06-20
categories: 博客
tags:
  - writer
  - ops
---
body`)

  assert.deepEqual(await listTaxonomy({ postsDir }), {
    categories: [
      { name: '博客', count: 2 },
      { name: '工程', count: 1 }
    ],
    tags: [
      { name: 'writer', count: 2 },
      { name: 'ops', count: 1 }
    ]
  })
})

test('planAssetTarget nests image targets by categories and post filename', () => {
  assert.deepEqual(planAssetTarget({
    categories: ['随想', '恢复'],
    postFilename: '新文章.md',
    originalName: 'clipboard image.png',
    imageName: '开头图',
    sequence: 2,
    now: new Date('2026-06-19T12:34:56Z')
  }), {
    filename: '开头图.png',
    relativePath: 'img/posts/随想/恢复/新文章/开头图.png',
    url: 'https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/posts/随想/恢复/新文章/开头图.png',
    markdown: '![开头图](https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/posts/随想/恢复/新文章/开头图.png)'
  })
})

test('planAssetTarget uses uncategorized and deterministic names when unnamed', () => {
  const planned = planAssetTarget({
    categories: [],
    postFilename: 'draft.md',
    originalName: 'screen shot.webp',
    sequence: 3,
    now: new Date('2026-06-19T12:34:56Z')
  })

  assert.equal(planned.filename, '20260619-123456-003.webp')
  assert.equal(planned.relativePath, 'img/posts/未分类/draft/20260619-123456-003.webp')
  assert.equal(planned.markdown, '![20260619-123456-003](https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/posts/未分类/draft/20260619-123456-003.webp)')
})

test('stageAsset writes image bytes to the local cache and returns markdown', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'blog-ops-assets-'))
  const result = await stageAsset({
    assetsDir: root,
    data: Buffer.from('fake image bytes'),
    categories: ['博客'],
    postFilename: '可视化写作.md',
    originalName: 'paste.png',
    imageName: '截图',
    sequence: 1,
    now: new Date('2026-06-19T12:34:56Z')
  })

  assert.equal(result.relativePath, 'img/posts/博客/可视化写作/截图.png')
  assert.equal(await readFile(path.join(root, result.relativePath), 'utf8'), 'fake image bytes')
  assert.equal(result.markdown, '![截图](https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/posts/博客/可视化写作/截图.png)')
})

test('copyStagedAssetsToPicbed copies staged files into a picbed checkout', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'blog-ops-picbed-'))
  const assetsDir = path.join(root, 'assets')
  const picbedCheckout = path.join(root, 'picbed')

  const staged = await stageAsset({
    assetsDir,
    data: Buffer.from('asset bytes'),
    categories: ['博客'],
    postFilename: '可视化写作.md',
    originalName: 'paste.png',
    imageName: '截图',
    sequence: 1,
    now: new Date('2026-06-19T12:34:56Z')
  })

  const copied = await copyStagedAssetsToPicbed({ assetsDir, picbedCheckout })

  assert.deepEqual(copied, [staged.relativePath])
  assert.equal(await readFile(path.join(picbedCheckout, staged.relativePath), 'utf8'), 'asset bytes')
})

test('createPicbedPublishPlan documents local checkout based upload commands', () => {
  assert.deepEqual(createPicbedPublishPlan({
    picbedCheckout: 'D:/Projects/picbed',
    message: 'chore: add blog assets'
  }), {
    ok: true,
    checkout: 'D:/Projects/picbed',
    commands: [
      'git -C "D:/Projects/picbed" add img/posts',
      'git -C "D:/Projects/picbed" commit -m "chore: add blog assets"',
      'git -C "D:/Projects/picbed" push origin main'
    ]
  })
})
