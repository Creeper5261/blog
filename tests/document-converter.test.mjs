import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { PDFDocument } from 'pdf-lib'

import { mergePdfBuffers } from '../src/lib/document-converter.mjs'
import { TOOL_MANIFESTS } from '../tools/capabilities/manifests.mjs'

const converter = TOOL_MANIFESTS.find((tool) => tool.id === 'tool.document-converter')

test('document converter uses one local-only manifest for all conversion modes', () => {
  assert.ok(converter)
  assert.equal(converter.route, '/tools/converter/')
  assert.equal(converter.privacy.mode, 'local-only')
  assert.equal(converter.privacy.uploads, false)
  assert.equal(converter.privacy.thirdPartyProcessing, false)
  assert.deepEqual(converter.modes.map((mode) => mode.id), [
    'pdf-to-image',
    'image-to-pdf',
    'pdf-to-word',
    'word-to-pdf',
    'word-to-image',
    'image-to-word',
    'pdf-merge'
  ])
})

test('document converter page exposes ordered batch conversion without comments', async () => {
  const page = await readFile(new URL('../src/pages/tools/converter/index.astro', import.meta.url), 'utf8')
  const script = await readFile(new URL('../src/scripts/tools-document-converter.js', import.meta.url), 'utf8')
  assert.match(page, /comments=\{false\}/)
  assert.match(page, /converter-merge/)
  assert.match(script, /data-file-action/)
  assert.match(script, /word-pdf\.zip/)
  assert.match(script, /word-merged\.pdf/)
  assert.match(script, /pdf-merge/)
  assert.match(script, /file\.size > 52_428_800|file\.size <= maxBytes/)
})

test('PDF merge preserves input order and page count', async () => {
  const first = await PDFDocument.create()
  first.addPage([200, 300])
  const second = await PDFDocument.create()
  second.addPage([300, 200])
  second.addPage([400, 500])

  const merged = await mergePdfBuffers([await first.save(), await second.save()])
  const output = await PDFDocument.load(merged)
  assert.equal(output.getPageCount(), 3)
  assert.deepEqual(output.getPage(0).getSize(), { width: 200, height: 300 })
  assert.deepEqual(output.getPage(1).getSize(), { width: 300, height: 200 })
  assert.deepEqual(output.getPage(2).getSize(), { width: 400, height: 500 })
})
