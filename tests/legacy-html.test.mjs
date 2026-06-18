import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyPublicServices,
  sanitizeLegacyHtml,
  sanitizeLegacyScript
} from '../src/legacy/html-transform.mjs'

test('sanitizeLegacyHtml replaces browser service values with placeholders', () => {
  const html = `
    <script>
      const GLOBAL_CONFIG = {
        algolia: {"appId":"OLD_APP","apiKey":"OLD_SEARCH","indexName":"old_index"}
      }
      twikoo.init({ envId: 'https://old-comment.example/' })
      var qweather_key = 'OLD_QWEATHER';
      var gaud_map_key = 'OLD_GAUD';
      var baidu_ak_key = 'OLD_BAIDU';
    </script>
  `

  const sanitized = sanitizeLegacyHtml(html)

  assert.doesNotMatch(sanitized, /OLD_APP|OLD_SEARCH|old_index|old-comment|OLD_QWEATHER|OLD_GAUD|OLD_BAIDU/)
  assert.match(sanitized, /__DAT_PUBLIC_ALGOLIA_APP_ID__/)
  assert.doesNotMatch(sanitized, /twikoo\.init/)
  assert.doesNotMatch(sanitized, /__DAT_PUBLIC_TWIKOO_ENV_ID__/)
  assert.match(sanitized, /__DAT_PUBLIC_QWEATHER_KEY__/)
})

test('sanitizeLegacyHtml removes dead GitCalendar and legacy Twikoo bootstraps', () => {
  const html = `
    <link rel="stylesheet" href="https://npm.elemecdn.com/hexo-filter-gitcalendar/lib/gitcalendar.css">
    <div id="gitZone"></div>
    <div id="twikoo-wrap"></div>
    <script data-pjax src="https://npm.elemecdn.com/hexo-filter-gitcalendar/lib/gitcalendar.js"></script>
    <script data-pjax>
      GitCalendarInit("https://gitcalendar.fomal.cc/api?Creeper5261", [], 'Creeper5261')
    </script>
    <script>
      const loadTwikoo = () => getScript('https://cdn.jsdelivr.net/npm/twikoo@1.6.8/dist/twikoo.all.min.js')
      twikoo.init({ envId: 'https://twikoo.godboy.cc/' })
    </script>
  `

  const sanitized = sanitizeLegacyHtml(html)

  assert.match(sanitized, /id="gitZone"/)
  assert.match(sanitized, /id="twikoo-wrap"/)
  assert.doesNotMatch(sanitized, /gitcalendar\.fomal\.cc/)
  assert.doesNotMatch(sanitized, /hexo-filter-gitcalendar/)
  assert.doesNotMatch(sanitized, /twikoo@1\.6\.8/)
  assert.doesNotMatch(sanitized, /twikoo\.init/)
  assert.doesNotMatch(sanitized, /twikoo\.godboy\.cc/)
})

test('sanitizeLegacyScript removes Tencent map key literals from copied scripts', () => {
  const script = `
    $.ajax({
      data: {
        key: 'OLD_TENCENT_MAP',
        output: 'jsonp'
      }
    })
  `

  const sanitized = sanitizeLegacyScript(script)

  assert.doesNotMatch(sanitized, /OLD_TENCENT_MAP/)
  assert.match(sanitized, /key: ''/)
  assert.doesNotMatch(sanitized, /DAT_PUBLIC_SERVICES/)
  assert.doesNotMatch(sanitized, /__DAT_PUBLIC_TENCENT_MAP_KEY__/)
})

test('applyPublicServices injects environment-backed values into placeholders', () => {
  const html = `
    <script>
      const GLOBAL_CONFIG = {
        algolia: {"appId":"__DAT_PUBLIC_ALGOLIA_APP_ID__","apiKey":"__DAT_PUBLIC_ALGOLIA_SEARCH_KEY__","indexName":"__DAT_PUBLIC_ALGOLIA_INDEX_NAME__"}
      }
      <div id="twikoo-wrap"></div>
    </script>
  `

  const rendered = applyPublicServices(html, {
    algoliaAppId: 'APP_FROM_ENV',
    algoliaSearchKey: 'SEARCH_FROM_ENV',
    algoliaIndexName: 'INDEX_FROM_ENV',
    giscusRepo: 'Creeper5261/Creeper5261.github.io',
    giscusRepoId: 'R_repo',
    giscusCategory: 'Announcements',
    giscusCategoryId: 'DIC_category'
  })

  assert.match(rendered, /APP_FROM_ENV/)
  assert.match(rendered, /SEARCH_FROM_ENV/)
  assert.match(rendered, /INDEX_FROM_ENV/)
  assert.match(rendered, /R_repo/)
  assert.match(rendered, /DIC_category/)
  assert.doesNotMatch(rendered, /__DAT_PUBLIC_/)
})

test('applyPublicServices injects browser-safe runtime config and service fallback loader', () => {
  const rendered = applyPublicServices(`
    <html>
      <head></head>
      <body>
        <script>
          var qweather_key = '__DAT_PUBLIC_QWEATHER_KEY__';
          var gaud_map_key = '__DAT_PUBLIC_GAUD_MAP_KEY__';
          var baidu_ak_key = '__DAT_PUBLIC_BAIDU_MAP_AK__';
        </script>
        <main>DAT</main>
      </body>
    </html>
  `, {
    algoliaAppId: 'APP_FROM_ENV',
    algoliaSearchKey: 'SEARCH_FROM_ENV',
    algoliaIndexName: 'INDEX_FROM_ENV',
    giscusRepo: 'Creeper5261/Creeper5261.github.io',
    giscusRepoId: 'R_repo',
    giscusCategory: 'Announcements',
    giscusCategoryId: 'DIC_category',
    giscusMapping: 'pathname',
    qweatherKey: 'QWEATHER_FROM_ENV',
    gaudMapKey: 'GAUD_FROM_ENV',
    baiduMapAk: 'BAIDU_FROM_ENV',
    tencentMapKey: 'TENCENT_FROM_ENV'
  })

  assert.match(rendered, /window\.DAT_PUBLIC_SERVICES/)
  assert.doesNotMatch(rendered, /QWEATHER_FROM_ENV|GAUD_FROM_ENV|BAIDU_FROM_ENV|TENCENT_FROM_ENV/)
  assert.match(rendered, /var qweather_key = ''/)
  assert.match(rendered, /var gaud_map_key = ''/)
  assert.match(rendered, /var baidu_ak_key = ''/)
  assert.match(rendered, /\/js\/github-calendar\.js/)
  assert.match(rendered, /\/js\/comments-runtime\.js/)
  assert.match(rendered, /\/js\/service-fallbacks\.js/)
  assert.ok(
    rendered.indexOf('window.DAT_PUBLIC_SERVICES') < rendered.indexOf('/js/github-calendar.js'),
    'service config should be available before service runtime scripts load'
  )
})
