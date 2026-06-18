'use strict'

const fs = require('fs')
const path = require('path')

const injectorPath = path.join(hexo.base_dir, 'source', '_data', 'recovered-injector.json')

if (fs.existsSync(injectorPath)) {
  const snippets = JSON.parse(fs.readFileSync(injectorPath, 'utf8'))
  for (const slot of ['head_end', 'body_end']) {
    if (typeof snippets[slot] === 'string' && snippets[slot].trim()) {
      hexo.extend.injector.register(slot, snippets[slot], 'default')
    }
  }
} else {
  hexo.log.warn(`Recovered injector data not found: ${injectorPath}`)
}
