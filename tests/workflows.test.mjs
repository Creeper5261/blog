import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

async function readWorkflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')
}

test('publish workflow builds private source and pushes generated output to public repository', async () => {
  const workflow = await readWorkflow('publish.yml')

  assert.match(workflow, /pnpm run check/)
  assert.match(workflow, /pnpm run build/)
  assert.match(workflow, /Creeper5261\/Creeper5261\.github\.io/)
  assert.match(workflow, /PUBLIC_REPO_DEPLOY_KEY/)
  assert.match(workflow, /pnpm run publish:output/)
  assert.doesNotMatch(workflow, /PUBLIC_TENCENT_MAP_KEY|PUBLIC_QWEATHER_KEY|UPSTASH_REDIS_REST_TOKEN/)
})

test('stats backup workflow exports protected stats as a private artifact', async () => {
  const workflow = await readWorkflow('stats-backup.yml')

  assert.match(workflow, /schedule:/)
  assert.match(workflow, /contents: write/)
  assert.match(workflow, /STATS_BACKUP_URL/)
  assert.match(workflow, /STATS_BACKUP_TOKEN/)
  assert.match(workflow, /pnpm run backup:stats/)
  assert.match(workflow, /actions\/upload-artifact/)
  assert.match(workflow, /stats-backups/)
  assert.match(workflow, /git push origin stats-backups/)
})
