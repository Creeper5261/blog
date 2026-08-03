import assert from 'node:assert/strict'
import test from 'node:test'

import { loadNativePageShell } from '../src/legacy/native-page.mjs'

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
