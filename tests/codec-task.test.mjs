import assert from 'node:assert/strict'
import { test } from 'node:test'

import { transformResult } from '../source/js/codec-task.js'

test('codec task handles JSON, text encodings, and MDX source locally', () => {
  assert.equal(transformResult('{"ready":true}', 'json-format').output, '{\n  "ready": true\n}')
  assert.equal(transformResult('你好 DAT 🙂', 'base64-encode').output, '5L2g5aW9IERBVCDwn5mC')
  assert.equal(transformResult('5L2g5aW9IERBVCDwn5mC', 'base64-decode').output, '你好 DAT 🙂')
  assert.equal(transformResult('a b+c', 'url-encode').output, 'a%20b%2Bc')
  assert.equal(transformResult('a%20b%2Bc', 'url-decode').output, 'a b+c')
  assert.equal(transformResult('你好🙂', 'unicode-escape').output, '\\u4f60\\u597d\\u{1f642}')
  assert.equal(transformResult('\\u4f60\\u597d\\u{1f642}', 'unicode-restore').output, '你好🙂')
  assert.equal(transformResult('# Hello <Badge />', 'mdx-source').output, '# Hello <Badge />')
})
