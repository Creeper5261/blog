import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { applyPublicServices, getPublicServices } from './html-transform.mjs'

const DEFAULT_TEMPLATE = path.resolve('src', 'legacy', 'pages', 'tools', 'index.html')
const ARTICLE_MARKER = '<div id="article-container">'
const ARTICLE_END_MARKER = '</div><hr/><div id="post-comment">'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function replaceFirst(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Native page template is missing ${label}`)
  return html.replace(pattern, replacement)
}

export async function loadNativePageShell({
  title,
  pageName,
  description,
  route = '/tools/',
  comments = true,
  layoutClass = '',
  fastInteractive = false,
  templatePath = DEFAULT_TEMPLATE,
  stylesheet = '/css/tools-native.css',
  services = getPublicServices()
}) {
  const safeTitle = escapeHtml(title)
  const safePageName = escapeHtml(pageName)
  const safeDescription = escapeHtml(description)
  const safeLayoutClass = String(layoutClass).trim()
  if (safeLayoutClass && !/^[a-zA-Z0-9_-]+$/.test(safeLayoutClass)) throw new Error('Native page layout class is invalid')
  let html = await readFile(templatePath, 'utf8')

  if (fastInteractive) {
    html = html.replace(/<script src="https:\/\/npm\.elemecdn\.com\/hexo-butterfly-tag-plugins-plus@latest\/lib\/assets\/carousel-touch\.js"><\/script>/i, '')
  }

  html = replaceFirst(html, /<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`, 'title')
  html = replaceFirst(html, /(<meta name="description" content=")[^"]*(")/i, `$1${safeDescription}$2`, 'description')
  html = replaceFirst(html, /(<meta property="og:title" content=")[^"]*(")/i, `$1${safePageName}$2`, 'og:title')
  html = replaceFirst(html, /(<meta property="og:url" content=")[^"]*(")/i, `$1${route}index.html$2`, 'og:url')
  html = replaceFirst(html, /(<meta property="og:description" content=")[^"]*(")/i, `$1${safeDescription}$2`, 'og:description')
  html = replaceFirst(html, /(title: ')[^']*(')/i, `$1${safePageName}$2`, 'site config title')
  html = html.replaceAll('PAGE_NAME', safePageName)
  html = replaceFirst(html, /(<h1 id="site-title">)[^<]*(<\/h1>)/i, `$1${safePageName}$2`, 'page heading')
  if (safeLayoutClass) {
    html = replaceFirst(html, /<main class="layout" id="content-inner">/i, `<main class="layout ${safeLayoutClass}" id="content-inner">`, 'page layout')
  }

  const interactionStyles = fastInteractive ? '<style>#loading-box{display:none!important}</style>' : ''
  const withNativeStyles = html.replace(
    /<\/head>/i,
    `<link rel="stylesheet" href="${stylesheet}">${interactionStyles}</head>`
  )
  const rendered = applyPublicServices(withNativeStyles, services)
  const articleStart = rendered.indexOf(ARTICLE_MARKER)
  const articleContentStart = articleStart + ARTICLE_MARKER.length
  const articleEnd = rendered.indexOf(ARTICLE_END_MARKER, articleContentStart)
  if (articleStart < 0 || articleEnd < 0) {
    throw new Error('Native page template is missing its article content boundary')
  }

  let after = rendered.slice(articleEnd)
  if (!comments) {
    const commentStart = after.indexOf('<hr/><div id="post-comment">')
    const asideStart = after.indexOf('<div class="aside-content" id="aside-content">', commentStart)
    if (commentStart < 0 || asideStart < 0) throw new Error('Native page template is missing its comment boundary')
    after = after.slice(0, commentStart) + after.slice(asideStart)
  }

  return {
    before: rendered.slice(0, articleContentStart),
    after
  }
}
