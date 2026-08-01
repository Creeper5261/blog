import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { updatePulseSnapshots } from '../tools/pulse/update.mjs'
import { buildSiteData } from '../tools/site-data/build.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const temporaryRoots = []

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
})

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'pulse-update-'))
  temporaryRoots.push(root)
  await Promise.all([
    mkdir(path.join(root, 'content'), { recursive: true }),
    mkdir(path.join(root, 'assets'), { recursive: true }),
    mkdir(path.join(root, 'external'), { recursive: true }),
    cp(path.join(repositoryRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  ])
  await writeJson(path.join(root, 'knowledge-site.config.json'), {
    schemaVersion: 1,
    roots: { content: 'content', assets: 'assets', schemas: 'schemas', external: 'external', generated: 'generated' },
    allowedExternalHosts: ['github.com'],
    assetPolicy: {
      metadataFile: 'metadata.json', publicPath: '/media', allowedExtensions: ['.svg'], maxBytes: 1024,
      requireAlt: true, requireRights: true
    },
    siteDataPolicy: {
      releaseRetention: 3,
      immutableCacheControl: 'public, max-age=31536000, immutable',
      mutableCacheControl: 'public, max-age=0, must-revalidate'
    }
  })
  await writeJson(path.join(root, 'assets', 'metadata.json'), { schemaVersion: 1, assets: {} })
  await writeJson(path.join(root, 'external', 'github.json'), {
    schemaVersion: 1,
    id: 'pulse.github-repositories',
    kind: 'pulse',
    title: 'GitHub repository pulse',
    status: 'evergreen',
    source: 'github-repositories',
    query: 'created:>=2026-07-25 stars:>=10',
    schedule: 'daily',
    ttlHours: 12,
    itemLimit: 2,
    accessRules: 'Official GitHub REST API; public repository metadata only.'
  })
  await writeJson(path.join(root, 'external', 'disabled.json'), {
    schemaVersion: 1,
    id: 'pulse.disabled-source',
    kind: 'pulse',
    title: 'Disabled source',
    status: 'archived',
    source: 'not-installed',
    query: 'unused',
    schedule: 'disabled',
    accessRules: 'Disabled source.',
    enabled: false
  })
  return root
}

function successfulResponse() {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        items: [
          { full_name: 'example/alpha', html_url: 'https://github.com/example/alpha', description: ' Alpha  repo ', stargazers_count: 10 },
          { full_name: 'example/alpha', html_url: 'https://github.com/example/alpha', description: 'Duplicate', stargazers_count: 12 },
          { full_name: 'example/beta', html_url: 'https://github.com/example/beta', description: null, stargazers_count: 11 }
        ]
      }
    }
  }
}

test('Pulse updater uses a reproducible official GitHub query and persists normalized history', async () => {
  const root = await createFixture()
  const requests = []
  const authorization = ['fixture', 'credential'].join('-')
  const result = await updatePulseSnapshots({
    root,
    outputRoot: 'pulse-store',
    token: authorization,
    now: () => new Date('2026-08-01T12:00:00Z'),
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return successfulResponse()
    }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.updates.map((update) => update.status), ['disabled', 'updated'])
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url.hostname, 'api.github.com')
  assert.equal(requests[0].url.pathname, '/search/repositories')
  assert.equal(requests[0].url.searchParams.get('q'), 'created:>=2026-07-25 stars:>=10')
  assert.equal(requests[0].url.searchParams.get('sort'), 'stars')
  assert.equal(requests[0].url.searchParams.get('order'), 'desc')
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${authorization}`)

  const pulseRoot = path.join(root, 'pulse-store', 'pulse.github-repositories')
  const latest = JSON.parse(await readFile(path.join(pulseRoot, 'latest.json'), 'utf8'))
  assert.equal(latest.fetchedAt, '2026-08-01T12:00:00.000Z')
  assert.equal(latest.expiresAt, '2026-08-02T00:00:00.000Z')
  assert.equal(latest.query, 'created:>=2026-07-25 stars:>=10')
  assert.deepEqual(latest.sortBasis, { field: 'stars', direction: 'descending' })
  assert.deepEqual(latest.items.map((item) => item.id), ['github:example/alpha', 'github:example/beta'])
  assert.equal(latest.items[0].score, 12)
  assert.equal((await readdir(path.join(pulseRoot, 'history'))).length, 1)
})

test('failed refresh preserves the last successful snapshot and site-data publishes it', async () => {
  const root = await createFixture()
  const options = {
    root,
    outputRoot: 'pulse-store',
    now: () => new Date('2026-08-01T12:00:00Z'),
    fetchImpl: async () => successfulResponse()
  }
  assert.equal((await updatePulseSnapshots(options)).ok, true)
  const latestFile = path.join(root, 'pulse-store', 'pulse.github-repositories', 'latest.json')
  const successfulContents = await readFile(latestFile, 'utf8')

  const failed = await updatePulseSnapshots({
    ...options,
    now: () => new Date('2026-08-01T13:00:00Z'),
    fetchImpl: async () => ({ ok: false, status: 503 })
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.updates.find((update) => update.id === 'pulse.github-repositories').status, 'failed')
  assert.equal(await readFile(latestFile, 'utf8'), successfulContents)

  const build = await buildSiteData({ root, write: true, pulseSnapshotRoot: 'pulse-store' })
  assert.equal(build.ok, true)
  const pulse = build.bundle['pulses.json'].pulses[0]
  assert.equal(pulse.snapshotStatus, 'stored')
  assert.equal(pulse.fetchedAt, '2026-08-01T12:00:00.000Z')
  assert.equal(pulse.expiresAt, '2026-08-02T00:00:00.000Z')
  assert.equal(pulse.items.length, 2)
})
