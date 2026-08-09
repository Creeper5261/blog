import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildToolManifestPayload } from '../tools/capabilities/manifests.mjs'
import { buildSiteData } from '../tools/site-data/build.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('tools share one manifest channel with codec, editor, and image utilities', async () => {
  const payload = buildToolManifestPayload()
  const tool = payload.tools.find((entry) => entry.id === 'tool.codec')

  assert.equal(payload.tools.length, 4)
  assert.equal(tool.route, '/tools/codec/')
  assert.equal(tool.task, 'text-transform')
  assert.ok(tool.modes.some((entry) => entry.id === 'hash-sha256'))
  assert.ok(tool.modes.some((entry) => entry.id === 'base64-encode'))
  assert.ok(tool.modes.some((entry) => entry.id === 'mdx-source'))
  assert.equal(tool.privacy.mode, 'local-only')
  assert.equal(tool.privacy.uploads, false)
  assert.equal(tool.offline.supported, true)
  assert.equal(tool.runtime.shell, 's3-local-task-runner')
  assert.equal(tool.runtime.mainThreadFallback, true)

  const result = await buildSiteData({ root: repositoryRoot, write: false })
  assert.equal(result.ok, true)
  const featuresTool = result.bundle['features.json'].tools.find((entry) => entry.id === 'tool.codec')
  assert.equal(featuresTool.slug, 'codec')
  assert.equal(featuresTool.privacy, 'local-only')
  const routesTool = result.bundle['routes.json'].items.find((entry) => entry.route === '/tools/codec/')
  assert.equal(routesTool.source, 'tool-manifest')
  assert.ok(result.bundle['tool-manifests.json'].tools.some((entry) => entry.id === 'tool.codec'))
  assert.ok(result.bundle['tool-manifests.json'].tools.some((entry) => entry.id === 'tool.markdown-editor'))
  assert.ok(result.bundle['tool-manifests.json'].tools.some((entry) => entry.id === 'tool.image-compressor'))
  assert.ok(result.bundle['tool-manifests.json'].tools.some((entry) => entry.id === 'tool.document-converter'))
})

test('codec page reuses the S3 task shell for all text modes', async () => {
  const source = await readFile(path.join(repositoryRoot, 'src', 'pages', 'tools', 'codec', 'index.astro'), 'utf8')
  for (const pattern of ['tool-manifests.json', 'createTaskRunner', 'text-transform', 'hash-sha256', 'registerRuntimeServiceWorker', "scope: '/tools/codec/'", '文件上传', '<noscript>']) {
    assert.match(source, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  const script = source.match(/<script is:inline type="module">([\s\S]*?)<\/script>/)
  assert.ok(script)
  assert.doesNotMatch(script[1], /generated\/|content\/|external\//)
  assert.ok(script[1].indexOf("$('#run').addEventListener") < script[1].indexOf('initializeRuntime().catch'), 'codec controls bind before background runtime initialization')
  assert.doesNotMatch(script[1], /^\s*const (worker|sw) = await/m)
})

test('markdown and image tools use mature local browser integrations', async () => {
  const markdown = await readFile(path.join(repositoryRoot, 'src', 'pages', 'tools', 'markdown', 'index.astro'), 'utf8')
  assert.match(markdown, /comments=\{false\}/)
  assert.match(markdown, /layoutClass="tool-workspace-layout"/)
  assert.match(markdown, /id="markdown-input" class="markdown-source-editor"/)
  assert.match(markdown, /defer src="\/vendor\/vditor\/dist\/index\.min\.js"/)
  const markdownScript = await readFile(path.join(repositoryRoot, 'src', 'scripts', 'tools-markdown.js'), 'utf8')
  assert.match(markdownScript, /window\.Vditor\.preview/)
  assert.match(markdownScript, /cm-headingFoldGutter/)
  assert.match(markdownScript, /foldService/)
  assert.match(markdownScript, /class HeadingFoldMarker extends GutterMarker/)
  assert.match(markdownScript, /placeholderDOM: createFoldPlaceholder/)
  assert.match(markdownScript, /class: 'cm-folded-heading'/)
  assert.match(markdownScript, /class FoldEllipsisWidget extends WidgetType/)
  assert.match(markdownScript, /effects: unfoldEffect\.of\(range\)/)
  assert.match(markdownScript, /Math\.min\(sourceHeight, previewHeight\)/)
  assert.match(markdownScript, /Math\.min\(window\.innerHeight \* 0\.68, 760\)/)
  assert.match(markdownScript, /workbench\.dataset\.overflow = overflow/)
  assert.match(markdownScript, /nextHeading\[1\]\.length <= level/)
  assert.match(markdownScript, /KaTeX/)
  const image = await readFile(path.join(repositoryRoot, 'src', 'pages', 'tools', 'image-compressor', 'index.astro'), 'utf8')
  assert.match(image, /image-compressor/)
  assert.match(image, /comments=\{false\}/)
  assert.match(image, /layoutClass="tool-workspace-layout"/)
  const imageScript = await readFile(path.join(repositoryRoot, 'src', 'scripts', 'tools-image-compressor.js'), 'utf8')
  assert.match(imageScript, /Compressor/)
  assert.match(imageScript, /new Compressor/)
})
