const PLACEHOLDERS = {
  algoliaAppId: '__DAT_PUBLIC_ALGOLIA_APP_ID__',
  algoliaSearchKey: '__DAT_PUBLIC_ALGOLIA_SEARCH_KEY__',
  algoliaIndexName: '__DAT_PUBLIC_ALGOLIA_INDEX_NAME__',
  giscusRepo: '__DAT_PUBLIC_GISCUS_REPO__',
  giscusRepoId: '__DAT_PUBLIC_GISCUS_REPO_ID__',
  giscusCategory: '__DAT_PUBLIC_GISCUS_CATEGORY__',
  giscusCategoryId: '__DAT_PUBLIC_GISCUS_CATEGORY_ID__',
  giscusMapping: '__DAT_PUBLIC_GISCUS_MAPPING__',
  qweatherKey: '__DAT_PUBLIC_QWEATHER_KEY__',
  gaudMapKey: '__DAT_PUBLIC_GAUD_MAP_KEY__',
  baiduMapAk: '__DAT_PUBLIC_BAIDU_MAP_AK__',
  tencentMapKey: '__DAT_PUBLIC_TENCENT_MAP_KEY__'
}

const DEFAULT_SERVICES = {
  algoliaAppId: '',
  algoliaSearchKey: '',
  algoliaIndexName: 'blog',
  giscusRepo: 'Creeper5261/Creeper5261.github.io',
  giscusRepoId: 'R_kgDOJjHleA',
  giscusCategory: 'Announcements',
  giscusCategoryId: 'DIC_kwDOJjHleM4C_aiF',
  giscusMapping: 'pathname',
  qweatherKey: '',
  gaudMapKey: '',
  baiduMapAk: '',
  tencentMapKey: ''
}

const SERVER_ONLY_SERVICES = new Set([
  'qweatherKey',
  'gaudMapKey',
  'baiduMapAk',
  'tencentMapKey'
])

const RUNTIME_SCRIPTS = [
  '/js/github-calendar.js',
  '/js/comments-runtime.js',
  '/js/stats-runtime.js',
  '/js/service-fallbacks.js'
]

const SINGLE_SCRIPT_WITH_GITCALENDAR = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:GitCalendarInit|gitcalendar_injector_config)(?:(?!<\/script>)[\s\S])*?<\/script>/gi
const SINGLE_SCRIPT_WITH_LEGACY_TWIKOO = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:twikoo\.init|twikoo@1\.6\.8)(?:(?!<\/script>)[\s\S])*?<\/script>/gi

function normalizeServices(services = getPublicServices()) {
  return Object.fromEntries(
    Object.keys(DEFAULT_SERVICES).map((key) => [
      key,
      SERVER_ONLY_SERVICES.has(key) ? '' : services[key] ?? DEFAULT_SERVICES[key] ?? ''
    ])
  )
}

function serializeForInlineScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export function renderPublicServicesScript(services = getPublicServices()) {
  const payload = serializeForInlineScript(normalizeServices(services))

  return `<script>window.DAT_PUBLIC_SERVICES=Object.assign(window.DAT_PUBLIC_SERVICES||{},${payload});</script>`
}

function injectBeforeClosingTag(html, tagName, content) {
  const closingTag = new RegExp(`</${tagName}>`, 'i')
  if (closingTag.test(html)) {
    return html.replace(closingTag, `${content}</${tagName}>`)
  }

  return `${content}${html}`
}

export function injectRuntimeSupport(html, services = getPublicServices()) {
  let result = html

  if (!result.includes('window.DAT_PUBLIC_SERVICES')) {
    result = injectBeforeClosingTag(result, 'head', renderPublicServicesScript(services))
  }

  for (const script of RUNTIME_SCRIPTS) {
    if (!result.includes(script)) {
      result = injectBeforeClosingTag(result, 'body', `<script defer src="${script}"></script>`)
    }
  }

  return result
}

export function getPublicServices(env = process.env) {
  return {
    algoliaAppId: env.PUBLIC_ALGOLIA_APP_ID ?? DEFAULT_SERVICES.algoliaAppId,
    algoliaSearchKey: env.PUBLIC_ALGOLIA_SEARCH_KEY ?? DEFAULT_SERVICES.algoliaSearchKey,
    algoliaIndexName: env.PUBLIC_ALGOLIA_INDEX_NAME ?? DEFAULT_SERVICES.algoliaIndexName,
    giscusRepo: env.PUBLIC_GISCUS_REPO ?? DEFAULT_SERVICES.giscusRepo,
    giscusRepoId: env.PUBLIC_GISCUS_REPO_ID ?? DEFAULT_SERVICES.giscusRepoId,
    giscusCategory: env.PUBLIC_GISCUS_CATEGORY ?? DEFAULT_SERVICES.giscusCategory,
    giscusCategoryId: env.PUBLIC_GISCUS_CATEGORY_ID ?? DEFAULT_SERVICES.giscusCategoryId,
    giscusMapping: env.PUBLIC_GISCUS_MAPPING ?? DEFAULT_SERVICES.giscusMapping,
    qweatherKey: env.PUBLIC_QWEATHER_KEY ?? DEFAULT_SERVICES.qweatherKey,
    gaudMapKey: env.PUBLIC_GAUD_MAP_KEY ?? DEFAULT_SERVICES.gaudMapKey,
    baiduMapAk: env.PUBLIC_BAIDU_MAP_AK ?? DEFAULT_SERVICES.baiduMapAk,
    tencentMapKey: env.PUBLIC_TENCENT_MAP_KEY ?? DEFAULT_SERVICES.tencentMapKey
  }
}

function removeDeadGitCalendar(html) {
  return html
    .replace(/<link\b[^>]*hexo-filter-gitcalendar\/lib\/gitcalendar\.css[^>]*>/gi, '')
    .replace(/<script\b[^>]*hexo-filter-gitcalendar\/lib\/gitcalendar\.js[^>]*><\/script>/gi, '')
    .replace(SINGLE_SCRIPT_WITH_GITCALENDAR, '')
}

function removeLegacyTwikoo(html) {
  return html
    .replace(/^\s*twikoo\.init\(\{[^}]*\}\)\s*;?\s*$/gim, '')
    .replace(SINGLE_SCRIPT_WITH_LEGACY_TWIKOO, '')
}

function removeLegacyWeatherBootstraps(html) {
  return html
    .replace(/<script\b[^>]*widget\.qweather\.net\/simple\/static\/js\/he-simple-common\.js[^>]*><\/script>/gi, '')
    .replace(/<script\b[^>]*hexo-butterfly-clock-anzhiyu\/lib\/clock\.min\.js[^>]*><\/script>/gi, '')
}

function repairLegacyReferences(html) {
  return html
    .replaceAll('/js/search/local-search.js.js', '/js/search/local-search.js')
    .replace(/href=(["'])\/movies\/\1/gi, 'href=$1/movie/$1')
}

function removeDeadRuntimeBootstraps(html) {
  return repairLegacyReferences(removeLegacyWeatherBootstraps(removeLegacyTwikoo(removeDeadGitCalendar(html))))
}

export function sanitizeLegacyHtml(html) {
  return removeDeadRuntimeBootstraps(html)
    .replace(/"appId":"[^"]*"/g, `"appId":"${PLACEHOLDERS.algoliaAppId}"`)
    .replace(/"apiKey":"[^"]*"/g, `"apiKey":"${PLACEHOLDERS.algoliaSearchKey}"`)
    .replace(/"indexName":"[^"]*"/g, `"indexName":"${PLACEHOLDERS.algoliaIndexName}"`)
    .replace(/var qweather_key = '[^']*'/g, `var qweather_key = '${PLACEHOLDERS.qweatherKey}'`)
    .replace(/var gaud_map_key = '[^']*'/g, `var gaud_map_key = '${PLACEHOLDERS.gaudMapKey}'`)
    .replace(/var baidu_ak_key = '[^']*'/g, `var baidu_ak_key = '${PLACEHOLDERS.baiduMapAk}'`)
}

export function sanitizeLegacyScript(script) {
  return script.replace(/key:\s*['"][^'"]*['"]/g, "key: ''")
}

export function applyPublicServices(html, services = getPublicServices()) {
  const cleanedHtml = removeDeadRuntimeBootstraps(html)
  const rendered = Object.entries(PLACEHOLDERS).reduce((result, [key, placeholder]) => {
    const value = SERVER_ONLY_SERVICES.has(key) ? '' : services[key] ?? DEFAULT_SERVICES[key] ?? ''
    return result.replaceAll(placeholder, value)
  }, cleanedHtml)

  return injectRuntimeSupport(rendered, services)
}
