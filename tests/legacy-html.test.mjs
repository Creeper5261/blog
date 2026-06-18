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
  assert.match(sanitized, /__DAT_PUBLIC_TWIKOO_ENV_ID__/)
  assert.match(sanitized, /__DAT_PUBLIC_QWEATHER_KEY__/)
})

test('sanitizeLegacyScript replaces Tencent map key literals with runtime config', () => {
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
  assert.match(sanitized, /DAT_PUBLIC_SERVICES/)
  assert.match(sanitized, /tencentMapKey/)
})

test('applyPublicServices injects environment-backed values into placeholders', () => {
  const html = `
    <script>
      const GLOBAL_CONFIG = {
        algolia: {"appId":"__DAT_PUBLIC_ALGOLIA_APP_ID__","apiKey":"__DAT_PUBLIC_ALGOLIA_SEARCH_KEY__","indexName":"__DAT_PUBLIC_ALGOLIA_INDEX_NAME__"}
      }
      twikoo.init({ envId: '__DAT_PUBLIC_TWIKOO_ENV_ID__' })
    </script>
  `

  const rendered = applyPublicServices(html, {
    algoliaAppId: 'APP_FROM_ENV',
    algoliaSearchKey: 'SEARCH_FROM_ENV',
    algoliaIndexName: 'INDEX_FROM_ENV',
    twikooEnvId: 'https://comment.example/'
  })

  assert.match(rendered, /APP_FROM_ENV/)
  assert.match(rendered, /SEARCH_FROM_ENV/)
  assert.match(rendered, /INDEX_FROM_ENV/)
  assert.match(rendered, /https:\/\/comment\.example\//)
  assert.doesNotMatch(rendered, /__DAT_PUBLIC_/)
})
