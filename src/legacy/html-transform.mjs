const PLACEHOLDERS = {
  algoliaAppId: '__DAT_PUBLIC_ALGOLIA_APP_ID__',
  algoliaSearchKey: '__DAT_PUBLIC_ALGOLIA_SEARCH_KEY__',
  algoliaIndexName: '__DAT_PUBLIC_ALGOLIA_INDEX_NAME__',
  twikooEnvId: '__DAT_PUBLIC_TWIKOO_ENV_ID__',
  qweatherKey: '__DAT_PUBLIC_QWEATHER_KEY__',
  gaudMapKey: '__DAT_PUBLIC_GAUD_MAP_KEY__',
  baiduMapAk: '__DAT_PUBLIC_BAIDU_MAP_AK__',
  tencentMapKey: '__DAT_PUBLIC_TENCENT_MAP_KEY__'
}

const DEFAULT_SERVICES = {
  algoliaAppId: '',
  algoliaSearchKey: '',
  algoliaIndexName: 'blog',
  twikooEnvId: '',
  qweatherKey: '',
  gaudMapKey: '',
  baiduMapAk: '',
  tencentMapKey: ''
}

export function getPublicServices(env = process.env) {
  return {
    algoliaAppId: env.PUBLIC_ALGOLIA_APP_ID ?? DEFAULT_SERVICES.algoliaAppId,
    algoliaSearchKey: env.PUBLIC_ALGOLIA_SEARCH_KEY ?? DEFAULT_SERVICES.algoliaSearchKey,
    algoliaIndexName: env.PUBLIC_ALGOLIA_INDEX_NAME ?? DEFAULT_SERVICES.algoliaIndexName,
    twikooEnvId: env.PUBLIC_TWIKOO_ENV_ID ?? DEFAULT_SERVICES.twikooEnvId,
    qweatherKey: env.PUBLIC_QWEATHER_KEY ?? DEFAULT_SERVICES.qweatherKey,
    gaudMapKey: env.PUBLIC_GAUD_MAP_KEY ?? DEFAULT_SERVICES.gaudMapKey,
    baiduMapAk: env.PUBLIC_BAIDU_MAP_AK ?? DEFAULT_SERVICES.baiduMapAk,
    tencentMapKey: env.PUBLIC_TENCENT_MAP_KEY ?? DEFAULT_SERVICES.tencentMapKey
  }
}

export function sanitizeLegacyHtml(html) {
  return html
    .replace(/"appId":"[^"]*"/g, `"appId":"${PLACEHOLDERS.algoliaAppId}"`)
    .replace(/"apiKey":"[^"]*"/g, `"apiKey":"${PLACEHOLDERS.algoliaSearchKey}"`)
    .replace(/"indexName":"[^"]*"/g, `"indexName":"${PLACEHOLDERS.algoliaIndexName}"`)
    .replace(/envId:\s*(['"])[^'"]*\1/g, `envId: '${PLACEHOLDERS.twikooEnvId}'`)
    .replace(/envId:\s*'https:\/\/twikoo\.godboy\.cc\/'/g, `envId: '${PLACEHOLDERS.twikooEnvId}'`)
    .replace(/var qweather_key = '[^']*'/g, `var qweather_key = '${PLACEHOLDERS.qweatherKey}'`)
    .replace(/var gaud_map_key = '[^']*'/g, `var gaud_map_key = '${PLACEHOLDERS.gaudMapKey}'`)
    .replace(/var baidu_ak_key = '[^']*'/g, `var baidu_ak_key = '${PLACEHOLDERS.baiduMapAk}'`)
}

export function sanitizeLegacyScript(script) {
  const bootstrap = [
    'window.DAT_PUBLIC_SERVICES = window.DAT_PUBLIC_SERVICES || {};',
    `window.DAT_PUBLIC_SERVICES.tencentMapKey = window.DAT_PUBLIC_SERVICES.tencentMapKey || '${PLACEHOLDERS.tencentMapKey}';`
  ].join('\n')

  const rewritten = script.replace(/key:\s*['"][^'"]*['"]/g, 'key: window.DAT_PUBLIC_SERVICES.tencentMapKey')
  return `${bootstrap}\n${rewritten}`
}

export function applyPublicServices(html, services = getPublicServices()) {
  return Object.entries(PLACEHOLDERS).reduce((result, [key, placeholder]) => {
    const value = services[key] ?? DEFAULT_SERVICES[key] ?? ''
    return result.replaceAll(placeholder, value)
  }, html)
}
