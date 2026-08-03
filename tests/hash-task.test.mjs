import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

async function importHashTask() {
  const source = await readFile('source/js/hash-task.js', 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('SHA-256 task matches Web Crypto digests deterministically', async () => {
  const { hashTask } = await importHashTask()

  const empty = await hashTask('')
  assert.equal(empty.output, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(empty.bytes, 0)

  const hello = await hashTask('hello')
  assert.equal(hello.output, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  assert.equal(hello.bytes, 5)

  const chinese = '你好，博客'
  const expected = crypto.createHash('sha256').update(chinese, 'utf8').digest('hex')
  const result = await hashTask(chinese)
  assert.equal(result.output, expected)
  assert.equal(result.bytes, Buffer.byteLength(chinese, 'utf8'))
})
