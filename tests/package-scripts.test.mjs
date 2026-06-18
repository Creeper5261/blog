import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('normal Astro preparation does not regenerate tracked legacy pages', () => {
  const prepareAstro = packageJson.scripts['prepare:astro']

  assert.ok(prepareAstro, 'prepare:astro script is required')
  assert.doesNotMatch(prepareAstro, /prepare-astro-legacy-pages/)
  assert.match(packageJson.scripts['recovery:prepare-legacy-pages'], /prepare-astro-legacy-pages/)
})

test('normal Astro preparation writes generated calendar data after static assets', () => {
  const prepareAstro = packageJson.scripts['prepare:astro']
  const assetsIndex = prepareAstro.indexOf('prepare-astro-assets.mjs')
  const calendarIndex = prepareAstro.indexOf('prepare-github-calendar.mjs')

  assert.notEqual(assetsIndex, -1)
  assert.notEqual(calendarIndex, -1)
  assert.ok(assetsIndex < calendarIndex, 'calendar data must be generated after .astro-static is refreshed')
})
