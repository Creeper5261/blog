import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { listPostMarkdownFiles, parsePostMarkdown, savePostMarkdown, slugifyPostFilename } from '../tools/writer/core.mjs'

const SAMPLE = `---
title: 新文章
date: 2026-06-19 14:30:00
categories: 随想
tags:
  - blog
---

# 新文章

正文。
`

test('parsePostMarkdown extracts front matter and body', () => {
  const parsed = parsePostMarkdown(SAMPLE)

  assert.equal(parsed.title, '新文章')
  assert.equal(parsed.date, '2026-06-19 14:30:00')
  assert.equal(parsed.body.trim(), '# 新文章\n\n正文。')
  assert.deepEqual(parsed.tags, ['blog'])
})

test('parsePostMarkdown requires title and date front matter', () => {
  assert.throws(() => parsePostMarkdown('# no front matter'), /front matter/)
  assert.throws(() => parsePostMarkdown('---\ntitle: x\n---\nbody'), /date/)
})

test('slugifyPostFilename keeps Chinese titles and blocks traversal', () => {
  assert.equal(slugifyPostFilename('新文章.md'), '新文章.md')
  assert.equal(slugifyPostFilename('hello world'), 'hello-world.md')
  assert.throws(() => slugifyPostFilename('../secret.md'), /invalid filename/)
})

test('savePostMarkdown writes validated posts inside source posts directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'writer-core-'))
  const postsDir = path.join(root, 'source', '_posts')
  await mkdir(postsDir, { recursive: true })

  const result = await savePostMarkdown({
    postsDir,
    filename: '新文章.md',
    markdown: SAMPLE
  })

  assert.equal(result.filename, '新文章.md')
  assert.equal(result.title, '新文章')
  assert.equal(await readFile(path.join(postsDir, '新文章.md'), 'utf8'), SAMPLE)
})

test('savePostMarkdown refuses to overwrite unless explicitly allowed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'writer-core-overwrite-'))
  const postsDir = path.join(root, 'source', '_posts')
  await mkdir(postsDir, { recursive: true })

  await savePostMarkdown({ postsDir, filename: 'post.md', markdown: SAMPLE })
  await assert.rejects(() => savePostMarkdown({ postsDir, filename: 'post.md', markdown: SAMPLE }), /already exists/)
  await savePostMarkdown({ postsDir, filename: 'post.md', markdown: SAMPLE, overwrite: true })
})

test('listPostMarkdownFiles returns manageable post metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'writer-core-list-'))
  const postsDir = path.join(root, 'source', '_posts')
  await mkdir(postsDir, { recursive: true })
  await writeFile(path.join(postsDir, 'post.md'), SAMPLE)
  await writeFile(path.join(postsDir, 'notes.txt'), 'ignore')

  assert.deepEqual(await listPostMarkdownFiles({ postsDir }), [{
    filename: 'post.md',
    title: '新文章',
    date: '2026-06-19 14:30:00'
  }])
})
