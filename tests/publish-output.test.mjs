import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { publishOutput } from '../tools/publish-output.mjs'

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

test('publishOutput replaces public repo contents with generated output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'publish-output-'))
  const distDir = path.join(root, 'dist')
  const checkoutDir = path.join(root, 'public-repo')
  await mkdir(path.join(distDir, 'assets'), { recursive: true })
  await mkdir(path.join(checkoutDir, 'old'), { recursive: true })
  await writeFile(path.join(distDir, 'index.html'), '<h1>DAT</h1>')
  await writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("ok")')
  await writeFile(path.join(checkoutDir, 'old', 'stale.html'), 'stale')

  const result = await publishOutput({ distDir, checkoutDir })

  assert.equal(await exists(path.join(checkoutDir, 'index.html')), true)
  assert.equal(await exists(path.join(checkoutDir, 'assets', 'app.js')), true)
  assert.equal(await exists(path.join(checkoutDir, 'old', 'stale.html')), false)
  assert.equal(result.copiedFiles, 2)
})

test('publishOutput preserves git metadata and host files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'publish-output-preserve-'))
  const distDir = path.join(root, 'dist')
  const checkoutDir = path.join(root, 'public-repo')
  await mkdir(path.join(distDir), { recursive: true })
  await mkdir(path.join(checkoutDir, '.git'), { recursive: true })
  await writeFile(path.join(distDir, 'index.html'), '<h1>new</h1>')
  await writeFile(path.join(checkoutDir, '.git', 'HEAD'), 'ref: refs/heads/main')
  await writeFile(path.join(checkoutDir, 'CNAME'), 'www.godboy.cc')

  await publishOutput({ distDir, checkoutDir, preserve: ['.git', 'CNAME'] })

  assert.equal(await readFile(path.join(checkoutDir, '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/main')
  assert.equal(await readFile(path.join(checkoutDir, 'CNAME'), 'utf8'), 'www.godboy.cc')
  assert.equal(await exists(path.join(checkoutDir, 'index.html')), true)
})
