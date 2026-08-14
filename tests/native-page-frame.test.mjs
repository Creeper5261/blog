import assert from 'node:assert/strict'
import test from 'node:test'

import { applyPublicServices } from '../src/legacy/html-transform.mjs'
import { loadNativePageShell } from '../src/legacy/native-page.mjs'

test('shared legacy shell always carries tool styles across PJAX navigation', () => {
  const html = applyPublicServices('<html><head><title>DAT</title></head><body></body></html>')
  assert.match(html, /<link rel="stylesheet" href="\/css\/tools-native\.css">/)
  assert.equal(html.match(/href="\/css\/tools-native\.css"/g)?.length, 1)

  const existing = applyPublicServices('<html><head><link rel="stylesheet" href="/css/tools-native.css"></head><body></body></html>')
  assert.equal(existing.match(/href="\/css\/tools-native\.css"/g)?.length, 1)
})

test('native page frame keeps Butterfly chrome while replacing toolbox article content', async () => {
  const shell = await loadNativePageShell({
    title: '实验场 | DAT',
    pageName: '实验场',
    description: '原生视觉实验场',
    route: '/tools/'
  })
  const html = `${shell.before}<section class="replacement">实验内容</section>${shell.after}`

  assert.match(html, /id="nav"/)
  assert.match(html, /id="page-header"/)
  assert.match(html, /id="aside-content"/)
  assert.match(html, /id="footer"/)
  assert.match(html, /href="\/css\/tools-native\.css"/)
  assert.match(html, /实验内容/)
  assert.doesNotMatch(html, /常用工具放这里方便下载/)
})

test('interactive native frame removes recovered head blockers', async () => {
  const shell = await loadNativePageShell({
    title: '工具 | DAT',
    pageName: '工具',
    description: '工具',
    route: '/tools/',
    fastInteractive: true
  })
  const html = `${shell.before}${shell.after}`

  assert.match(html, /#loading-box\{display:none!important\}/)
  assert.doesNotMatch(html, /carousel-touch\.js/)
  assert.doesNotMatch(html, /local-search\.js/)
})
