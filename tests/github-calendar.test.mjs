import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  DEFAULT_TARGET_FILE,
  parseContributionCalendar,
  prepareGitHubCalendarData
} from '../tools/prepare-github-calendar.mjs'

test('parseContributionCalendar extracts public GitHub contribution cells', () => {
  const html = `
    <h2>12 contributions in the last year</h2>
    <table><tbody><tr>
    <td id="contribution-day-component-0-0" data-date="2026-01-01" data-level="0" class="ContributionCalendar-day"></td>
    <tool-tip for="contribution-day-component-0-0">No contributions on January 1st.</tool-tip>
    <td id="contribution-day-component-0-1" data-date="2026-01-02" data-level="3" class="ContributionCalendar-day"></td>
    <tool-tip for="contribution-day-component-0-1">8 contributions on January 2nd.</tool-tip>
    </tr></tbody></table>
  `

  const parsed = parseContributionCalendar(html, {
    username: 'Creeper5261',
    fetchedAt: '2026-06-18T00:00:00.000Z'
  })

  assert.equal(parsed.username, 'Creeper5261')
  assert.equal(parsed.total, 12)
  assert.deepEqual(parsed.days, [
    { date: '2026-01-01', count: 0, level: 0 },
    { date: '2026-01-02', count: 8, level: 3 }
  ])
})

test('prepareGitHubCalendarData writes local data from fetched GitHub HTML', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'github-calendar-'))
  const targetFile = path.join(root, 'source', 'data', 'github-calendar.json')
  const html = '<h2>1 contribution in the last year</h2><table><tbody><tr><td data-date="2026-01-03" data-level="1" class="ContributionCalendar-day"></td><tool-tip>1 contribution on January 3rd.</tool-tip></tr></tbody></table>'

  const result = await prepareGitHubCalendarData({
    username: 'Creeper5261',
    targetFile,
    fetchHtml: async () => html,
    now: () => new Date('2026-06-18T00:00:00.000Z')
  })

  const written = JSON.parse(await readFile(targetFile, 'utf8'))

  assert.equal(result.status, 'fetched')
  assert.equal(written.username, 'Creeper5261')
  assert.equal(written.days[0].date, '2026-01-03')
})

test('default GitHub calendar data target is generated static output', () => {
  const normalized = DEFAULT_TARGET_FILE.split(path.sep).join('/')

  assert.match(normalized, /\.astro-static\/data\/github-calendar\.json$/)
  assert.doesNotMatch(normalized, /source\/data/)
})
