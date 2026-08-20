import test from 'node:test'
import assert from 'node:assert/strict'
import matter from 'gray-matter'
import { updateMarkdownText } from '../tools/update-post-metadata.mjs'

test('updated metadata changes on real Markdown edits and remains stable afterward', () => {
  const original = matter.stringify('正文 A', { title: '普通文章', date: '2026-01-01', updated: '2026-01-01', permalink: '/普通文章/' })
  const first = updateMarkdownText(original, '2026-08-20T00:00:00.000Z')
  assert.equal(first.changed, true)
  const second = updateMarkdownText(first.text, '2026-08-21T00:00:00.000Z')
  assert.equal(second.changed, false)
  assert.equal(matter(first.text).data.updated, '2026-08-20T00:00:00.000Z')
  assert.equal(matter(first.text).data.date, '2026-01-01')
  assert.equal(matter(first.text).data.permalink, '/普通文章/')
})

test('LaTeX placeholder Markdown is excluded from the Markdown hash pipeline', () => {
  const placeholder = matter.stringify('<div class="latex-document-rendered" data-render-fragment="RMSNorm"></div>', { title: 'RMSNorm', date: '2026-01-01', updated: '2026-01-01', permalink: '/rmsnorm/' })
  const result = updateMarkdownText(placeholder, '2026-08-20T00:00:00.000Z')
  assert.equal(result.changed, false)
  assert.equal(result.reason, 'latex-placeholder')
})
