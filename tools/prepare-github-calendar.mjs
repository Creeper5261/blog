import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as cheerio from 'cheerio'

const DEFAULT_USERNAME = 'Creeper5261'
export const DEFAULT_TARGET_FILE = path.resolve('.astro-static', 'data', 'github-calendar.json')

function parseCountFromTooltip(text) {
  if (/no contributions/i.test(text)) return 0
  const match = text.match(/([\d,]+)\s+contributions?/i)
  return match ? Number(match[1].replaceAll(',', '')) : 0
}

function parseTotal(text) {
  const match = text.match(/([\d,]+)\s+contributions?/i)
  return match ? Number(match[1].replaceAll(',', '')) : 0
}

export function parseContributionCalendar(html, {
  username = DEFAULT_USERNAME,
  fetchedAt = new Date().toISOString()
} = {}) {
  const $ = cheerio.load(html)
  const tooltipsByTarget = new Map()
  const tooltipTexts = []

  $('tool-tip').each((_, element) => {
    const tooltip = $(element)
    const text = tooltip.text().trim()
    const target = tooltip.attr('for')
    if (target) tooltipsByTarget.set(target, text)
    tooltipTexts.push(text)
  })

  const days = []

  $('.ContributionCalendar-day[data-date], [data-date][data-level]').each((index, element) => {
    const cell = $(element)
    const date = cell.attr('data-date')
    if (!date) return

    const level = Number(cell.attr('data-level') ?? 0)
    const tooltipText = tooltipsByTarget.get(cell.attr('id')) ?? tooltipTexts[index] ?? ''

    days.push({
      date,
      count: parseCountFromTooltip(tooltipText),
      level: Number.isFinite(level) ? level : 0
    })
  })

  days.sort((a, b) => a.date.localeCompare(b.date))

  return {
    username,
    fetchedAt,
    total: parseTotal($('h2').first().text()),
    source: `https://github.com/users/${username}/contributions`,
    days
  }
}

async function fetchGitHubContributionsHtml(username) {
  const response = await fetch(`https://github.com/users/${username}/contributions`, {
    headers: {
      'User-Agent': 'Creeper5261-blog-recovery'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub contributions request failed with ${response.status}`)
  }

  return response.text()
}

async function readCachedData(targetFile) {
  try {
    return JSON.parse(await readFile(targetFile, 'utf8'))
  } catch {
    return null
  }
}

export async function prepareGitHubCalendarData({
  username = DEFAULT_USERNAME,
  targetFile = DEFAULT_TARGET_FILE,
  fetchHtml = () => fetchGitHubContributionsHtml(username),
  now = () => new Date()
} = {}) {
  try {
    const html = await fetchHtml()
    const data = parseContributionCalendar(html, {
      username,
      fetchedAt: now().toISOString()
    })

    await mkdir(path.dirname(targetFile), { recursive: true })
    await writeFile(targetFile, `${JSON.stringify(data, null, 2)}\n`)

    return {
      status: 'fetched',
      targetFile,
      days: data.days.length,
      total: data.total
    }
  } catch (error) {
    const cached = await readCachedData(targetFile)
    if (cached?.days?.length) {
      return {
        status: 'cached',
        targetFile,
        days: cached.days.length,
        total: cached.total ?? 0,
        reason: error.message
      }
    }

    const empty = {
      username,
      fetchedAt: now().toISOString(),
      total: 0,
      source: `https://github.com/users/${username}/contributions`,
      days: [],
      error: error.message
    }

    await mkdir(path.dirname(targetFile), { recursive: true })
    await writeFile(targetFile, `${JSON.stringify(empty, null, 2)}\n`)

    return {
      status: 'empty',
      targetFile,
      days: 0,
      total: 0,
      reason: error.message
    }
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const result = await prepareGitHubCalendarData()
  console.log(JSON.stringify(result, null, 2))
}
