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

test('Astro build generates knowledge content before preparing static output', () => {
  const build = packageJson.scripts.build
  const contentBuildIndex = build.indexOf('build:content')
  const prepareIndex = build.indexOf('prepare:astro')
  const astroBuildIndex = build.indexOf('astro build')

  assert.notEqual(contentBuildIndex, -1)
  assert.notEqual(prepareIndex, -1)
  assert.notEqual(astroBuildIndex, -1)
  assert.ok(contentBuildIndex < prepareIndex)
  assert.ok(prepareIndex < astroBuildIndex)
})

test('data sovereignty helper scripts are exposed through package scripts', () => {
  assert.match(packageJson.scripts.writer, /tools\/writer\/server\.mjs/)
  assert.match(packageJson.scripts['publish:output'], /tools\/publish-output\.mjs/)
  assert.match(packageJson.scripts['backup:stats'], /tools\/backup-stats\.mjs/)
})
