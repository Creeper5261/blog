import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('txmap welcome script guards missing Tencent location data', async () => {
  const script = await readFile('source/js/txmap.js', 'utf8')

  assert.match(script, /renderWelcomeFallback/)
  assert.match(script, /\/api\/location/)
  assert.match(script, /resolvedOptions\(\)\.timeZone/)
  assert.match(script, /encodeURIComponent\(timeZone\)/)
  assert.match(script, /ipLoacation.*result.*location/s)
  assert.match(script, /getDistance\(116\.290663,40\.158009/)
  assert.doesNotMatch(script, /和站长在同一个城市/)
  assert.doesNotMatch(script, /等风穿过沙河也算打过招呼/)
  assert.match(script, /很喜欢南湖边的风/)
  assert.doesNotMatch(script, /apis\.map\.qq\.com/)
  assert.doesNotMatch(script, /tencentMapKey/)
})

test('service fallback script covers recovered external widgets', async () => {
  const script = await readFile('source/js/service-fallbacks.js', 'utf8')

  assert.match(script, /#welcome-info/)
  assert.match(script, /#busuanzi_value_site_uv/)
  assert.match(script, /#busuanzi_value_site_pv/)
  assert.match(script, /\.card-clock/)
  assert.match(script, /\/api\/weather/)
  assert.match(script, /resolvedOptions\(\)\.timeZone/)
  assert.match(script, /encodeURIComponent\(timeZone\)/)
  assert.match(script, /#twikoo-wrap/)
  assert.match(script, /#gitZone/)
})

test('comments runtime loads Giscus only', async () => {
  const script = await readFile('source/js/comments-runtime.js', 'utf8')

  assert.match(script, /https:\/\/giscus\.app\/client\.js/)
  assert.match(script, /data-repo-id/)
  assert.match(script, /data-category-id/)
  assert.doesNotMatch(script, /twikoo\.init|twikoo@|utterances|github\.com\/issues|issues\.js/i)
})

test('GitHub calendar runtime renders local contribution data', async () => {
  const script = await readFile('source/js/github-calendar.js', 'utf8')

  assert.match(script, /\/data\/github-calendar\.json/)
  assert.match(script, /#gitZone/)
  assert.match(script, /dat-github-calendar/)
  assert.doesNotMatch(script, /gitcalendar\.fomal\.cc|GitCalendarInit/)
})

test('service fallback preserves the local GitHub calendar renderer', async () => {
  const script = await readFile('source/js/service-fallbacks.js', 'utf8')

  assert.match(script, /dat-github-calendar/)
  assert.match(script, /dataset\.datGithubCalendarRendered/)
})
