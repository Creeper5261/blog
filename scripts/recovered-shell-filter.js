'use strict'

const fs = require('fs')
const path = require('path')

const shellPath = path.join(hexo.base_dir, 'source', '_data', 'recovered-shell.json')
let shell = null

function loadShell() {
  if (shell) return shell
  if (!fs.existsSync(shellPath)) {
    hexo.log.warn(`Recovered shell data not found: ${shellPath}`)
    shell = {}
    return shell
  }

  shell = JSON.parse(fs.readFileSync(shellPath, 'utf8'))
  return shell
}

function findElementById(html, tag, id) {
  const startRe = new RegExp(`<${tag}\\b(?=[^>]*\\bid=(["'])${id}\\1)[^>]*>`, 'i')
  const startMatch = startRe.exec(html)
  if (!startMatch) return null

  const tokenRe = new RegExp(`</?${tag}\\b[^>]*>`, 'gi')
  tokenRe.lastIndex = startMatch.index

  let depth = 0
  let match
  while ((match = tokenRe.exec(html))) {
    if (match[0][1] === '/') {
      depth -= 1
      if (depth === 0) return { start: startMatch.index, end: tokenRe.lastIndex }
    } else {
      depth += 1
    }
  }

  return null
}

function replaceElementById(html, tag, id, replacement) {
  if (!replacement) return html
  const range = findElementById(html, tag, id)
  if (!range) return html
  return `${html.slice(0, range.start)}${replacement}${html.slice(range.end)}`
}

function replaceLoading(html, replacement) {
  if (!replacement) return html
  const range = findElementById(html, 'div', 'loading-box')
  if (!range) return html

  const scriptEnd = html.indexOf('</script>', range.end)
  if (scriptEnd === -1) return `${html.slice(0, range.start)}${replacement}${html.slice(range.end)}`
  return `${html.slice(0, range.start)}${replacement}${html.slice(scriptEnd + '</script>'.length)}`
}

function findElementByClass(html, tag, className) {
  const tokenRe = new RegExp(`</?${tag}\\b[^>]*>`, 'gi')
  let start = -1
  let depth = 0
  let match

  while ((match = tokenRe.exec(html))) {
    const token = match[0]
    if (token[1] === '/') continue

    const classMatch = token.match(/\bclass=(["'])(.*?)\1/i)
    const classes = classMatch ? classMatch[2].split(/\s+/) : []
    if (!classes.includes(className)) continue

    start = match.index
    depth = 1
    break
  }

  if (start === -1) return null

  while ((match = tokenRe.exec(html))) {
    if (match[0][1] === '/') {
      depth -= 1
      if (depth === 0) return { start, end: tokenRe.lastIndex }
    } else {
      depth += 1
    }
  }

  return null
}

function replaceElementByClass(html, tag, className, replacement) {
  if (!replacement) return html
  const range = findElementByClass(html, tag, className)
  if (!range) return html
  return `${html.slice(0, range.start)}${replacement}${html.slice(range.end)}`
}

function findElementByClassAfter(html, tag, className, afterIndex) {
  const tokenRe = new RegExp(`</?${tag}\\b[^>]*>`, 'gi')
  tokenRe.lastIndex = afterIndex

  let start = -1
  let depth = 0
  let match

  while ((match = tokenRe.exec(html))) {
    const token = match[0]
    if (token[1] === '/') continue

    const classMatch = token.match(/\bclass=(["'])(.*?)\1/i)
    const classes = classMatch ? classMatch[2].split(/\s+/) : []
    if (!classes.includes(className)) continue

    start = match.index
    depth = 1
    break
  }

  if (start === -1) return null

  while ((match = tokenRe.exec(html))) {
    if (match[0][1] === '/') {
      depth -= 1
      if (depth === 0) return { start, end: tokenRe.lastIndex }
    } else {
      depth += 1
    }
  }

  return null
}

function replaceBottomJsPjax(html, replacement) {
  if (!replacement) return html
  const marker = "document.addEventListener('DOMContentLoaded', panguInit)</script>"
  const markerIndex = html.indexOf(marker)
  if (markerIndex === -1) return html
  const range = findElementByClassAfter(html, 'div', 'js-pjax', markerIndex + marker.length)
  if (!range) return html
  return `${html.slice(0, range.start)}${replacement}${html.slice(range.end)}`
}

function replaceHeadExtras(html, replacement) {
  if (!replacement) return html
  return html.replace(
    /(<link rel="stylesheet" href="\/css\/progress_bar\.css"[^>]*>)([\s\S]*?)(<!-- hexo injector head_end start -->)/,
    `$1${replacement}$3`
  )
}

function replaceHeadMeta(html, data) {
  const route = routeFromCanonical(html)
  const variantId = data.headMetaRoutes && data.headMetaRoutes[route]
  const replacement = variantId && data.headMetaVariants && data.headMetaVariants[variantId]
  if (!replacement) return html
  return html.replace(/(<\/title>)([\s\S]*?)(<link rel="shortcut icon")/, `$1${replacement}$3`)
}

function replaceHeadRuntime(html, data) {
  if (!data || !data.config || !data.noscript || !data.bootstrap) return html

  let next = html.replace(/<script>const GLOBAL_CONFIG = [\s\S]*?<\/script>/, data.config)
  next = next.replace(/<script>\(win=>\{[\s\S]*?win\.saveToLocal[\s\S]*?<\/script>/, `${data.noscript}${data.bootstrap}`)
  return next
}

function replaceHeadSiteConfig(html, data) {
  const route = routeFromCanonical(html)
  const variantId = data.headSiteConfigRoutes && data.headSiteConfigRoutes[route]
  const replacement = variantId && data.headSiteConfigVariants && data.headSiteConfigVariants[variantId]
  if (!replacement) return html
  return html.replace(/<script id="config-diff">[\s\S]*?<\/script>/, replacement)
}

function ensureWebBg(html, replacement) {
  if (!replacement) return html

  let next = html.replace(/(<script>const preloader = [\s\S]*?<\/script>)(?!<div id="web_bg"><\/div>)/, `$1${replacement}`)
  next = next.replace(/(<\/body>)(?!<div id="web_bg"><\/div>)/, `$1${replacement}`)
  return next
}

function replaceBodyRuntime(html, data) {
  if (!data) return html
  let next = html

  if (data.pangu) {
    next = next.replace(/<script>function panguFn \(\) \{[\s\S]*?DOMContentLoaded', panguInit\)<\/script>/, data.pangu)
  }

  if (data.pjax) {
    next = next.replace(/<script>let pjaxSelectors = [\s\S]*?<\/script>(?=<script async data-pjax src="\/\/busuanzi\.ibruce\.info\/busuanzi\/2\.3\/busuanzi\.pure\.mini\.js")/, data.pjax)
  }

  if (data.live2d) {
    const live2dRe = /<script src="\/live2dw\/lib\/L2Dwidget\.min\.js\?094cbace49a39548bed64abff5988b05"><\/script><script>L2Dwidget\.init\([\s\S]*?\);<\/script>/
    next = next.replace(live2dRe, '')
    if (!next.includes('/live2dw/lib/L2Dwidget.min.js')) {
      next = next.replace(/(<\/body><div id="web_bg"><\/div>)/, `${data.live2d}$1`)
    }
  }

  return next
}

function routeFromCanonical(html) {
  const match = html.match(/<link\b(?=[^>]*\brel=(["'])canonical\1)[^>]*\bhref=(["'])(.*?)\2[^>]*>/i)
  if (!match) return 'index.html'

  try {
    const url = new URL(match[3])
    let route = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!route) return 'index.html'
    if (route.endsWith('/')) route += 'index.html'
    return route
  } catch (error) {
    return 'index.html'
  }
}

function rightsideForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.rightsideRoutes && data.rightsideRoutes[route]
  if (variantId && data.rightsideVariants && data.rightsideVariants[variantId]) {
    return data.rightsideVariants[variantId]
  }
  return data.rightside
}

function pageHeaderForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.pageHeaderRoutes && data.pageHeaderRoutes[route]
  if (variantId && data.pageHeaderVariants && data.pageHeaderVariants[variantId]) {
    return data.pageHeaderVariants[variantId]
  }
  return null
}

function homeRecentPostsForRoute(data, html) {
  return routeFromCanonical(html) === 'index.html' ? data.homeRecentPosts : null
}

function postCopyrightForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.postCopyrightRoutes && data.postCopyrightRoutes[route]
  if (variantId && data.postCopyrightVariants && data.postCopyrightVariants[variantId]) {
    return data.postCopyrightVariants[variantId]
  }
  return null
}

function postForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.postRoutes && data.postRoutes[route]
  if (variantId && data.postVariants && data.postVariants[variantId]) {
    return data.postVariants[variantId]
  }
  return null
}

function pageBodyForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.pageBodyRoutes && data.pageBodyRoutes[route]
  if (variantId && data.pageBodyVariants && data.pageBodyVariants[variantId]) {
    return data.pageBodyVariants[variantId]
  }
  return null
}

function postPaginationForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.postPaginationRoutes && data.postPaginationRoutes[route]
  if (variantId && data.postPaginationVariants && data.postPaginationVariants[variantId]) {
    return data.postPaginationVariants[variantId]
  }
  return null
}

function articleSortForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.articleSortRoutes && data.articleSortRoutes[route]
  if (variantId && data.articleSortVariants && data.articleSortVariants[variantId]) {
    return data.articleSortVariants[variantId]
  }
  return null
}

function jsPjaxForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.jsPjaxRoutes && data.jsPjaxRoutes[route]
  if (variantId && data.jsPjaxVariants && data.jsPjaxVariants[variantId]) {
    return data.jsPjaxVariants[variantId]
  }
  return null
}

function relatedPostsForRoute(data, html) {
  const route = routeFromCanonical(html)
  const variantId = data.relatedPostsRoutes && data.relatedPostsRoutes[route]
  if (variantId && data.relatedPostsVariants && data.relatedPostsVariants[variantId]) {
    return data.relatedPostsVariants[variantId]
  }
  return null
}

function trimArticleContainerTail(html) {
  const route = routeFromCanonical(html)
  if (route === '2023/10/14/Classifications/index.html') {
    return html.replace(/(<article class="post-content" id="article-container">[\s\S]*?)\n(<\/article>)/, '$1$2')
  }

  if (['about/index.html', 'comments/index.html', 'link/index.html'].includes(route)) {
    return html.replace(/(<div id="article-container">[\s\S]*?)\n(<\/div>(?:<\/div>)?<hr class="custom-hr"\/>)/, '$1$2')
  }

  return html
}

function restoreCommentDivider(html) {
  return html.replace(/<hr class="custom-hr"\/?>(?=<div id="post-comment">)/, '<hr/>')
}

function removeNestedLazyloadPlaceholder(html) {
  return html.replace(/\sdata-lazy-src= "data:image\/gif;base64,R0lGODlhAQABAIAAAAAAAP\/\/\/yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"(?=\sdata-lazy-src=)/g, '')
}

hexo.extend.filter.register('after_render:html', function recoveredShellFilter(html) {
  const data = loadShell()
  let next = html

  next = replaceHeadMeta(next, data)
  next = replaceHeadExtras(next, data.headExtras)
  next = replaceHeadRuntime(next, data.headRuntime)
  next = replaceHeadSiteConfig(next, data)
  next = replaceLoading(next, data.loading)
  next = ensureWebBg(next, data.webBg)
  next = replaceElementById(next, 'div', 'sidebar', data.sidebar)
  next = replaceElementById(next, 'header', 'page-header', pageHeaderForRoute(data, next))
  next = replaceElementById(next, 'nav', 'nav', data.nav)
  next = replaceElementById(next, 'div', 'page', pageBodyForRoute(data, next))
  next = replaceElementById(next, 'div', 'recent-posts', homeRecentPostsForRoute(data, next))
  next = replaceElementByClass(next, 'div', 'article-sort', articleSortForRoute(data, next))
  next = replaceElementByClass(next, 'div', 'card-info', data.asideCards && data.asideCards.cardInfo)
  next = replaceElementByClass(next, 'div', 'card-announcement', data.asideCards && data.asideCards.cardAnnouncement)
  next = replaceElementByClass(next, 'div', 'card-webinfo', data.asideCards && data.asideCards.cardWebinfo)
  next = replaceElementById(next, 'div', 'post', postForRoute(data, next))
  next = replaceElementByClass(next, 'div', 'post-copyright', postCopyrightForRoute(data, next))
  next = replaceElementById(next, 'nav', 'pagination', postPaginationForRoute(data, next))
  next = replaceElementByClass(next, 'div', 'relatedPosts', relatedPostsForRoute(data, next))
  next = replaceBottomJsPjax(next, jsPjaxForRoute(data, next))
  next = replaceBodyRuntime(next, data.bodyRuntime)
  next = replaceElementById(next, 'footer', 'footer', data.footer)
  next = replaceElementById(next, 'div', 'rightside', rightsideForRoute(data, next))
  next = trimArticleContainerTail(next)
  next = restoreCommentDivider(next)
  next = removeNestedLazyloadPlaceholder(next)

  return next
}, 99)
