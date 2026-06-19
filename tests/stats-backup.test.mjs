import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { backupStats } from '../tools/backup-stats.mjs'

test('backupStats exports protected stats JSON to a timestamped file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'stats-backup-'))
  const backupDir = path.join(root, 'backups')
  const calls = []

  const result = await backupStats({
    endpoint: 'https://example.test/api/stats',
    token: 'secret-token',
    backupDir,
    now: new Date('2026-06-19T06:30:00.000Z'),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return new Response(JSON.stringify({ exportedAt: 'now', site: { uv: 1, pv: 2 }, pages: { '/': 2 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://example.test/api/stats?export=1')
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-token')
  assert.equal(path.basename(result.file), 'stats-2026-06-19T06-30-00-000Z.json')
  assert.deepEqual(JSON.parse(await readFile(result.file, 'utf8')).site, { uv: 1, pv: 2 })
})

test('backupStats refuses to run without endpoint and token', async () => {
  await assert.rejects(() => backupStats({ endpoint: '', token: 'x' }), /STATS_BACKUP_URL/)
  await assert.rejects(() => backupStats({ endpoint: 'https://example.test/api/stats', token: '' }), /STATS_BACKUP_TOKEN/)
})

test('backupStats reports failed exports without writing misleading files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'stats-backup-fail-'))
  const backupDir = path.join(root, 'backups')
  await mkdir(backupDir, { recursive: true })

  await assert.rejects(() => backupStats({
    endpoint: 'https://example.test/api/stats',
    token: 'secret-token',
    backupDir,
    fetchImpl: async () => new Response('nope', { status: 503 })
  }), /stats export failed: 503/)
})
