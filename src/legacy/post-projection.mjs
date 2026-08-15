import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parsePostMarkdown } from '../../tools/writer/core.mjs'

const POSTS_ROOT = path.resolve('source', '_posts')
const DEFAULT_COVER = 'https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/cover/75509590_p1.webp'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isoDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid post date: ${value}`)
  return date.toISOString()
}

function displayDate(value) {
  return isoDate(value).slice(0, 10)
}

function routeFor(post) {
  if (post.permalink) return `/${String(post.permalink).replace(/^\/+|\/+$/g, '')}/`
  const date = new Date(post.date)
  return `/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${encodeURIComponent(post.title)}/`
}

export async function listPublishedPosts() {
  const entries = await readdir(POSTS_ROOT, { withFileTypes: true })
  const posts = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const parsed = parsePostMarkdown(await readFile(path.join(POSTS_ROOT, entry.name), 'utf8'))
    posts.push({
      ...parsed,
      route: routeFor(parsed),
      publishedAt: isoDate(parsed.date)
    })
  }

  return posts.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.title.localeCompare(right.title, 'zh-CN'))
}

function renderPostCard(post) {
  const title = escapeHtml(post.title)
  const route = escapeHtml(post.route)
  const description = escapeHtml(post.description || '')
  const category = escapeHtml(post.categories[0] || '未分类')
  const cover = escapeHtml(post.cover || DEFAULT_COVER)
  const date = displayDate(post.date)
  const publishedAt = escapeHtml(post.publishedAt)

  return `<div class="recent-post-item" data-projected-post="${route}"><div class="recent-post-content left"><div class="recent-post-cover"><img class="article-cover" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-lazy-src="${cover}" onerror="this.onerror=null;this.src='/img/404.jpg'" alt="${title}"></div><div class="recent-post-info"><a class="article-title" href="${route}" title="${title}"><div class="article-title-link">${title}</div></a><div class="recent-post-meta"><div class="article-meta-wrap"><span class="post-meta-date"><span class="article-meta-label">发表于</span><time class="post-meta-date-created" datetime="${publishedAt}">${date}</time></span><span class="article-meta"><span class="article-meta-separator"> | </span><a class="article-meta__categories" href="/categories/${encodeURIComponent(post.categories[0] || '未分类')}/">${category}</a></span></div></div><div class="article-meta-wrap"><div class="post-categories">${description}</div></div><div class="content">${description}</div></div></div></div>`
}

function renderCategoryEntry(post) {
  const title = escapeHtml(post.title)
  const route = escapeHtml(post.route)
  const cover = escapeHtml(post.cover || DEFAULT_COVER)
  const date = displayDate(post.date)
  const publishedAt = escapeHtml(post.publishedAt)
  const year = date.slice(0, 4)
  return `<div class="article-sort-item year" data-projected-post-year="${route}">${year}</div><div class="article-sort-item" data-projected-post="${route}"><a class="article-sort-item-img" href="${route}" title="${title}"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-lazy-src="${cover}" alt="${title}" onerror="this.onerror=null;this.src='/img/404.jpg'"></a><div class="article-sort-item-info"><div class="article-sort-item-time"><i class="far fa-calendar-alt"></i><time class="post-meta-date-created" datetime="${publishedAt}">${date}</time></div><a class="article-sort-item-title" href="${route}" title="${title}">${title}</a></div></div>`
}

export function injectMissingPostCards(html, posts) {
  const marker = '<div class="recent-posts" id="recent-posts">'
  if (!html.includes(marker)) throw new Error('Legacy page is missing the recent-posts container')
  const missing = posts.filter((post) => !html.includes(`href="${post.route}"`))
  if (!missing.length) return html
  return html.replace(marker, `${marker}${missing.map(renderPostCard).join('')}`)
}

export function injectMissingCategoryEntries(html, posts) {
  const marker = '<div class="article-sort">'
  if (!html.includes(marker)) throw new Error('Legacy category page is missing the article-sort container')
  const missing = posts.filter((post) => !html.includes(`href="${post.route}"`))
  if (!missing.length) return html
  return html.replace(marker, `${marker}${missing.map(renderCategoryEntry).join('')}`)
}

export function injectCategoryCounts(html, posts) {
  return html.replace(/(<a class="category-list-link" href="\/categories\/([^/]+)\/">[\s\S]*?<span class="category-list-count">)(\d+)(<\/span>)/gu, (match, before, encodedCategory, _count, after) => {
    const category = decodeURIComponent(encodedCategory)
    const count = posts.filter((post) => post.categories.includes(category)).length
    return `${before}${count}${after}`
  })
}
