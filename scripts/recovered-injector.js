'use strict'

const fs = require('fs')
const path = require('path')

const injectorPath = path.join(hexo.base_dir, 'source', '_data', 'recovered-injector.json')

const singleScriptWithGitCalendar = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:GitCalendarInit|gitcalendar_injector_config)(?:(?!<\/script>)[\s\S])*?<\/script>/gi
const singleScriptWithLegacyTwikoo = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:twikoo\.init|twikoo@1\.6\.8)(?:(?!<\/script>)[\s\S])*?<\/script>/gi

function sanitizeRecoveredSnippet(html) {
  return html
    .replace(/<link\b[^>]*hexo-filter-gitcalendar\/lib\/gitcalendar\.css[^>]*>/gi, '')
    .replace(/<script\b[^>]*hexo-filter-gitcalendar\/lib\/gitcalendar\.js[^>]*><\/script>/gi, '')
    .replace(singleScriptWithGitCalendar, '')
    .replace(/^\s*twikoo\.init\(\{[^}]*\}\)\s*;?\s*$/gim, '')
    .replace(singleScriptWithLegacyTwikoo, '')
}

if (fs.existsSync(injectorPath)) {
  const snippets = JSON.parse(fs.readFileSync(injectorPath, 'utf8'))
  for (const slot of ['head_end', 'body_end']) {
    if (typeof snippets[slot] === 'string' && snippets[slot].trim()) {
      hexo.extend.injector.register(slot, sanitizeRecoveredSnippet(snippets[slot]), 'default')
    }
  }
} else {
  hexo.log.warn(`Recovered injector data not found: ${injectorPath}`)
}
