import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseMarkdownContent, rewriteMarkdownAssetUrls } from '../tools/content-build/markdown.mjs'

test('parseMarkdownContent extracts frontmatter, references, and code blocks', () => {
  const parsed = parseMarkdownContent(`---
schemaVersion: 1
id: test.markdown
kind: article
title: Markdown contract
status: draft
publishedAt: 2026-08-01
---

![Architecture](../../assets/examples/architecture.svg "Diagram")

[Related](knowledge:test.related)
[Source](https://github.com/Creeper5261)
[About](/about/)
[Attachment](../../assets/examples/example.pdf)
[Next](./next.mdx)

\`\`\`js
console.log('content')
\`\`\`
`)

  assert.equal(parsed.document.id, 'test.markdown')
  assert.equal(parsed.document.publishedAt, '2026-08-01')
  assert.match(parsed.document.body, /Architecture/)
  assert.deepEqual(parsed.references.assets.map(({ path, kind, alt }) => ({ path, kind, alt })), [
    { path: '../../assets/examples/architecture.svg', kind: 'image', alt: 'Architecture' },
    { path: '../../assets/examples/example.pdf', kind: 'file', alt: null }
  ])
  assert.equal(parsed.references.knowledgeIds[0].target, 'test.related')
  assert.equal(parsed.references.externalUrls[0].url, 'https://github.com/Creeper5261')
  assert.equal(parsed.references.routes[0].path, '/about/')
  assert.equal(parsed.references.contentPaths[0].path, './next.mdx')
  assert.deepEqual(parsed.codeBlocks.map((block) => block.language), ['js'])
  assert.ok(parsed.references.assets[0].line > 7, 'locations should use original file line numbers')
})

test('rewriteMarkdownAssetUrls changes generated Markdown without changing unrelated text', () => {
  const source = '![Diagram](./diagram.svg)\n\nMention ./diagram.svg in prose.\n'
  const rewritten = rewriteMarkdownAssetUrls(source, [{ path: './diagram.svg', url: '/media/hash.svg' }])

  assert.match(rewritten, /!\[Diagram\]\(\/media\/hash\.svg\)/)
  assert.match(rewritten, /Mention \.\/diagram\.svg in prose\./)
})

test('parseMarkdownContent accepts MDX while keeping declarative metadata', () => {
  const parsed = parseMarkdownContent(`---
schemaVersion: 1
id: test.mdx
kind: note
title: MDX contract
status: draft
---

<Callout tone="info">Local component content</Callout>

![MDX image](../../assets/examples/mdx.png)
`, { extension: '.mdx' })

  assert.equal(parsed.document.id, 'test.mdx')
  assert.equal(parsed.references.assets[0].alt, 'MDX image')
})
