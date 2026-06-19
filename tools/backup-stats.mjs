import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required`)
  return value
}

function timestampForFile(now) {
  return now.toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

export async function backupStats({
  endpoint = process.env.STATS_BACKUP_URL,
  token = process.env.STATS_BACKUP_TOKEN,
  backupDir = path.resolve('.local', 'stats-backups'),
  now = new Date(),
  fetchImpl = fetch
} = {}) {
  const exportEndpoint = new URL(requireValue(endpoint, 'STATS_BACKUP_URL'))
  requireValue(token, 'STATS_BACKUP_TOKEN')
  exportEndpoint.searchParams.set('export', '1')

  const response = await fetchImpl(exportEndpoint, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  })

  if (!response.ok) throw new Error(`stats export failed: ${response.status}`)

  const payload = await response.json()
  const file = path.join(backupDir, `stats-${timestampForFile(now)}.json`)
  await mkdir(backupDir, { recursive: true })
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`)

  return {
    file,
    exportedAt: payload.exportedAt || null,
    site: payload.site || null
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const result = await backupStats()
  console.log(JSON.stringify(result, null, 2))
}
