import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function walkJsonFiles(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await walkJsonFiles(target))
    if (entry.isFile() && entry.name.endsWith('.json')) files.push(target)
  }
  return files
}

export async function compileExplainUnits({ root = process.cwd(), sourceRoot = 'source/explain' } = {}) {
  const repositoryRoot = path.resolve(root)
  const absoluteSourceRoot = path.resolve(repositoryRoot, sourceRoot)
  const schemaFile = path.join(repositoryRoot, 'schemas', 'v1', 'explain.schema.json')
  const schema = JSON.parse(await readFile(schemaFile, 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  const errors = []
  const units = []
  for (const file of await walkJsonFiles(absoluteSourceRoot)) {
    const relative = path.relative(repositoryRoot, file).split(path.sep).join('/')
    let unit
    try {
      unit = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      errors.push({ file: relative, code: 'invalid-json', message: error.message })
      continue
    }
    if (!validate(unit)) {
      for (const error of validate.errors ?? []) {
        errors.push({ file: relative, code: 'schema', pointer: error.instancePath, message: error.message ?? 'schema validation failed' })
      }
      continue
    }
    units.push(unit)
  }
  const ids = new Set()
  for (const unit of units) {
    if (ids.has(unit.id)) errors.push({ file: sourceRoot, code: 'duplicate-id', message: `duplicate explain id ${unit.id}` })
    ids.add(unit.id)
    if (!unit.actions.some((action) => action.type === 'advance') || !unit.actions.some((action) => action.type === 'reset')) {
      errors.push({ file: sourceRoot, code: 'missing-controls', message: `${unit.id} must declare advance and reset actions` })
    }
  }
  errors.sort((left, right) => `${left.file}:${left.code}:${left.pointer ?? ''}`.localeCompare(`${right.file}:${right.code}:${right.pointer ?? ''}`))
  if (errors.length) return { ok: false, errors, units: [] }
  return { ok: true, errors: [], units: units.sort((left, right) => left.id.localeCompare(right.id)), payload: { schemaVersion: 1, units: units.sort((left, right) => left.id.localeCompare(right.id)) } }
}

export function serializeExplainPayload(payload) {
  return json(payload)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await compileExplainUnits()
  process.stdout.write(json(result))
  if (!result.ok) process.exitCode = 1
}
