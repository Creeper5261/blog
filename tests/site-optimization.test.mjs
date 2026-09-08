import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import vm from 'node:vm'
import { imageVariants, optimizeSite, subsetIcons } from '../tools/optimize-site.mjs'

test('icon subset preserves used and dynamic symbols while removing invalid paths', () => {
  const source = '<symbol id="icon-moon"><path d="M0 0h1"/></symbol><symbol id="icon-cake"><path d="MNaN NaN"></path><path d="M1 1"/></symbol><symbol id="icon-unused"></symbol>'
  const output = subsetIcons(source, new Set(['icon-moon', 'icon-cake']))
  assert.match(output, /icon-moon|icon-cake/)
  assert.match(output, /M1 1/)
  assert.doesNotMatch(output, /NaN|icon-unused/)
  assert.throws(() => subsetIcons('bad upstream response', new Set()), /Unrecognized/)
})

test('lossless variants preserve full-size decoded pixels and do not upscale', async () => {
  const original = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#cdabef88' } }).png().toBuffer()
  const variants = await imageVariants(original)
  assert.equal(variants.length, 1)
  assert.equal(variants[0].width, 120)
  assert.ok(variants[0].data.length < original.length)
  assert.deepEqual(await sharp(variants[0].data).raw().toBuffer(), await sharp(original).raw().toBuffer())
})

test('build optimizer retains originals, isolates content math, caches assets and handles failure', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'blog-optimize-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = path.join(temporary, 'dist')
  const cache = path.join(temporary, 'cache')
  await mkdir(path.join(root, 'js'), { recursive: true })
  await writeFile(path.join(root, 'js/responsive-covers.js'), await readFile('source/js/responsive-covers.js'))
  await writeFile(path.join(root, 'js/theme.js'), "const nextIcon = '#icon-moon'")
  const url = 'https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/img/test.png'
  const html = `<html><head></head><body><script src="//at.alicdn.com/t/font_test.js"></script><a href="${url}"><img class="article-cover" data-lazy-src="${url}" src="placeholder.gif"></a><div class="katex"><svg><path d="M1 1"/></svg></div><img src="${url}" alt="diagram"></body></html>`
  const input = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'red' } }).png().toBuffer()
  let requests = 0
  const fetcher = async resource => {
    requests++
    return new Response(resource.endsWith('.js') ? '<symbol id="icon-moon"><path d="M1 1"/></symbol>' : input)
  }
  await writeFile(path.join(root, 'index.html'), html)
  const report = await optimizeSite({ root, cache, fetcher })
  assert.deepEqual(report.warnings, [])
  const output = await readFile(path.join(root, 'index.html'), 'utf8')
  assert.match(output, /srcset="\/optimized\//)
  assert.match(output, /data-responsive-source/)
  assert.ok(output.includes(`<a href="${url}">`))
  assert.ok(output.includes(`<img src="${url}" alt="diagram">`))
  assert.ok(output.includes('<div class="katex"><svg><path d="M1 1"/></svg></div>'))
  await writeFile(path.join(root, 'index.html'), html)
  await optimizeSite({ root, cache, fetcher })
  assert.equal(requests, 2, 'cached build must not refetch known inputs')
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), output)
  await writeFile(path.join(root, 'index.html'), html.replaceAll('test.png', 'missing.png'))
  const failed = await optimizeSite({ root, cache, fetcher: async () => { throw new Error('offline') } })
  assert.equal(failed.warnings.length, 1)
  assert.match(await readFile(path.join(root, 'index.html'), 'utf8'), /missing.png/)
})

test('responsive covers replace cloned card srcsets and leave ordinary article images alone', async () => {
  const attributes = { src: '/old.webp', 'data-lazy-src': '/new.webp' }
  const image = {
    nodeType: 1, dataset: { responsiveSource: '/old.webp' },
    matches: () => true,
    getAttribute: key => attributes[key],
    removeAttribute: key => { delete attributes[key] },
    addEventListener() {}, querySelectorAll: () => []
  }
  let observer
  const window = { DAT_COVER_VARIANTS: { '/new.webp': { srcset: '/new-small.webp 480w, /new.webp 1200w', sizes: '480px' } } }
  vm.runInNewContext(await readFile('source/js/responsive-covers.js', 'utf8'), {
    window,
    document: { documentElement: { nodeType: 1, matches: () => false, querySelectorAll: () => [image] }, body: {} },
    MutationObserver: class { constructor(fn) { observer = fn } observe() {} }
  })
  assert.equal(image.src, '/new.webp')
  assert.equal(image.srcset, '/new-small.webp 480w, /new.webp 1200w')
  assert.equal(attributes['data-lazy-src'], undefined)
  assert.equal(image.dataset.responsiveSource, '/new.webp')
  const ordinary = { ...image, matches: () => false, getAttribute: () => { throw new Error('ordinary images must not be touched') } }
  observer([{ type: 'attributes', target: ordinary }])
})
