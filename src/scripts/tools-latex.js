import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { environmentInfo, macroInfo } from '@unified-latex/unified-latex-ctan'
import { getParser } from '@unified-latex/unified-latex-util-parse'
import { printRaw } from '@unified-latex/unified-latex-util-print-raw'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import { diffLatexBlocks, extractLatexMetadata, splitLatexBlocks } from '../lib/latex-instant.mjs'

const page = document.querySelector('.latex-editor-page')
const input = document.querySelector('#latex-input')
const preview = document.querySelector('#latex-preview')
const previewPane = document.querySelector('.latex-preview-pane')
const loading = document.querySelector('#latex-preview-loading')
const status = document.querySelector('#latex-status')
const workbench = document.querySelector('.latex-workbench')
const fileInput = document.querySelector('#latex-file')
const openButton = document.querySelector('#latex-open')
const copyButton = document.querySelector('#latex-copy')
const downloadButton = document.querySelector('#latex-download')
const resetButton = document.querySelector('#latex-reset')
const resizeHandle = document.querySelector('#latex-resize-handle')
const pdfStyle = document.querySelector('#latex-pdf-style')
const exportPdfButton = document.querySelector('#latex-export-pdf')
const referenceSearch = document.querySelector('#latex-reference-search')
const referenceFilters = [...document.querySelectorAll('[data-reference-filter]')]
const referenceGroups = [...document.querySelectorAll('[data-reference-group]')]
const referenceCodes = [...document.querySelectorAll('[data-latex-snippet]')]
const referencePanel = document.querySelector('#latex-reference-panel')
const referenceCollapse = document.querySelector('#latex-reference-collapse')
const referenceExpand = document.querySelector('#latex-reference-expand')
const referenceResize = document.querySelector('#latex-reference-resize')

const parser = getParser({
  macros: { ...macroInfo.latex2e, ...macroInfo.mathtools, ...macroInfo.hyperref },
  environments: { ...environmentInfo.latex2e, ...environmentInfo.mathtools },
})
const mathCache = new Map()
const elementCache = new Map()
const storageKey = 'dat.tools.latex.source.v1'
const blockMacros = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'maketitle', 'tableofcontents'])
const headingLevels = { part: 1, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6 }
const mathEnvironments = new Set(['equation', 'equation*', 'align', 'align*', 'aligned', 'gather', 'gather*', 'multline', 'multline*', 'split', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix'])
const theoremNames = { theorem: '定理', lemma: '引理', proposition: '命题', corollary: '推论', definition: '定义', proof: '证明', example: '例', remark: '注' }

const textOf = (nodes = []) => nodes.map((node) => {
  if (node.type === 'string') return node.content
  if (node.type === 'whitespace') return ' '
  if (node.content && Array.isArray(node.content)) return textOf(node.content)
  if (node.args) return node.args.map((argument) => textOf(argument.content)).join('')
  return ''
}).join('')

const meaningfulArguments = (node) => (node.args || []).filter((argument) => argument.content?.length)
const lastArgument = (node) => meaningfulArguments(node).at(-1)?.content || []

function safeUrl(value) {
  const source = value.trim()
  if (/^(https?:|mailto:|#|\/)/i.test(source)) return source
  return '#'
}

function cachedMath(source, displayMode) {
  const key = `${displayMode ? 'd' : 'i'}:${source}`
  if (mathCache.has(key)) return mathCache.get(key)
  const html = katex.renderToString(source, { displayMode, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' })
  mathCache.set(key, html)
  if (mathCache.size > 300) mathCache.delete(mathCache.keys().next().value)
  return html
}

function mathElement(source, displayMode = false) {
  const element = document.createElement(displayMode ? 'div' : 'span')
  element.className = displayMode ? 'latex-math latex-math-display' : 'latex-math'
  element.innerHTML = cachedMath(source, displayMode)
  return element
}

function renderReferenceMath() {
  for (const element of document.querySelectorAll('[data-latex]')) {
    element.innerHTML = cachedMath(element.dataset.latex || '', element.dataset.display === 'true')
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const area = document.createElement('textarea')
  area.value = value
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

function setupReferencePanel() {
  renderReferenceMath()
  let activeFilter = 'all'

  const update = () => {
    const query = referenceSearch?.value.trim().toLocaleLowerCase() || ''
    for (const group of referenceGroups) {
      const matchesFilter = activeFilter === 'all' || group.dataset.referenceGroup === activeFilter
      let visibleEntries = 0
      for (const entry of group.querySelectorAll('[data-reference-entry]')) {
        const matchesQuery = !query || (entry.dataset.search || '').toLocaleLowerCase().includes(query)
        entry.hidden = !(matchesFilter && matchesQuery)
        if (!entry.hidden) visibleEntries += 1
      }
      group.hidden = visibleEntries === 0
    }
  }

  referenceFilters.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.referenceFilter || 'all'
    referenceFilters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    update()
  }))
  referenceSearch?.addEventListener('input', update)
  referenceCodes.forEach((button) => button.addEventListener('click', async () => {
    await copyText(button.dataset.latexSnippet || '')
    status.textContent = '已复制语法'
  }))
}

function setupReferenceDrawer() {
  if (!referencePanel || !referenceCollapse || !referenceExpand || !referenceResize) return

  const setOpen = (open) => {
    referencePanel.dataset.open = String(open)
    referencePanel.setAttribute('aria-hidden', String(!open))
    referenceCollapse.setAttribute('aria-expanded', String(open))
    referenceExpand.setAttribute('aria-expanded', String(open))
    referenceExpand.hidden = open
  }

  const setWidth = (value) => {
    const maximum = Math.max(260, Math.min(520, window.innerWidth - 48))
    const width = Math.max(Math.min(260, maximum), Math.min(maximum, value))
    referencePanel.style.setProperty('--latex-reference-width', `${width}px`)
    referenceResize.setAttribute('aria-valuemax', String(Math.round(maximum)))
    referenceResize.setAttribute('aria-valuenow', String(Math.round(width)))
  }

  referenceCollapse.addEventListener('click', () => setOpen(false))
  referenceExpand.addEventListener('click', () => setOpen(true))
  referenceResize.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    referenceResize.setPointerCapture(event.pointerId)
    referencePanel.dataset.resizing = 'true'
  })
  referenceResize.addEventListener('pointermove', (event) => {
    if (!referenceResize.hasPointerCapture(event.pointerId)) return
    setWidth(referencePanel.getBoundingClientRect().right - event.clientX)
  })
  const finishResize = (event) => {
    if (referenceResize.hasPointerCapture(event.pointerId)) referenceResize.releasePointerCapture(event.pointerId)
    delete referencePanel.dataset.resizing
  }
  referenceResize.addEventListener('pointerup', finishResize)
  referenceResize.addEventListener('pointercancel', finishResize)
  referenceResize.addEventListener('dblclick', () => setWidth(320))
  window.addEventListener('resize', () => setWidth(Number(referenceResize.getAttribute('aria-valuenow')) || 320), { passive: true })
  setOpen(true)
  setWidth(320)
}

async function exportPreviewPdf() {
  if (!preview.children.length || exportPdfButton.disabled) return
  exportPdfButton.disabled = true
  status.textContent = '正在生成 PDF…'
  const style = pdfStyle?.value === 'blog' ? 'blog' : 'plain'
  const stage = document.createElement('div')
  stage.className = `latex-pdf-stage is-${style}`
  stage.setAttribute('aria-hidden', 'true')
  const documentClone = preview.cloneNode(true)
  documentClone.removeAttribute('id')
  documentClone.scrollTop = 0
  stage.append(documentClone)
  document.body.append(stage)

  try {
    await document.fonts?.ready
    const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
    const pixelRatio = Math.max(1, Math.min(2, 12000 / stage.scrollHeight))
    const canvas = await toCanvas(stage, {
      backgroundColor: getComputedStyle(stage).backgroundColor,
      cacheBust: true,
      pixelRatio,
      width: stage.scrollWidth,
      height: stage.scrollHeight,
      style: {
        position: 'static',
        inset: 'auto',
        zIndex: 'auto',
      },
    })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
    const pageWidth = 210
    const pageHeight = 297
    const pagePixelHeight = Math.floor(canvas.width * (pageHeight / pageWidth))
    const background = getComputedStyle(stage).backgroundColor || '#ffffff'
    let offset = 0
    let pageIndex = 0

    while (offset < canvas.height) {
      const remaining = canvas.height - offset
      if (pageIndex > 0 && remaining <= Math.max(4, Math.ceil(pixelRatio * 2))) break
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - offset)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      const context = pageCanvas.getContext('2d')
      context.fillStyle = background
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', .95), 'JPEG', 0, 0, pageWidth, (sliceHeight / canvas.width) * pageWidth, undefined, 'FAST')
      offset += sliceHeight
      pageIndex += 1
    }

    pdf.save(style === 'blog' ? 'latex-blog-preview.pdf' : 'latex-document.pdf')
    status.textContent = `PDF 已导出 · ${pageIndex} 页`
  } catch (error) {
    console.error(error)
    status.textContent = 'PDF 导出失败'
  } finally {
    stage.remove()
    exportPdfButton.disabled = false
  }
}

function renderArgument(node, metadata) {
  const fragment = document.createDocumentFragment()
  appendInline(fragment, lastArgument(node), metadata)
  return fragment
}

function renderMacro(node, metadata) {
  const name = node.content
  if (headingLevels[name]) {
    const heading = document.createElement(`h${headingLevels[name]}`)
    heading.append(renderArgument(node, metadata))
    return heading
  }
  if (name === 'maketitle') {
    const header = document.createElement('header')
    header.className = 'latex-title-block'
    const title = document.createElement('h1')
    title.textContent = metadata.title || 'Untitled'
    const byline = document.createElement('p')
    const date = metadata.date === '\\today' ? new Intl.DateTimeFormat('zh-CN').format(new Date()) : metadata.date
    byline.textContent = [metadata.author, date || ''].filter(Boolean).join(' · ')
    header.append(title)
    if (byline.textContent) header.append(byline)
    return header
  }
  if (name === 'tableofcontents') {
    const box = document.createElement('div')
    box.className = 'latex-placeholder'
    box.textContent = '目录'
    return box
  }
  if (['textbf', 'mathbf'].includes(name)) {
    const element = document.createElement('strong')
    element.append(renderArgument(node, metadata))
    return element
  }
  if (['emph', 'textit'].includes(name)) {
    const element = document.createElement('em')
    element.append(renderArgument(node, metadata))
    return element
  }
  if (name === 'underline') {
    const element = document.createElement('u')
    element.append(renderArgument(node, metadata))
    return element
  }
  if (['texttt', 'verb'].includes(name)) {
    const element = document.createElement('code')
    element.append(renderArgument(node, metadata))
    return element
  }
  if (name === 'href') {
    const args = meaningfulArguments(node)
    const element = document.createElement('a')
    element.href = safeUrl(textOf(args.at(-2)?.content || []))
    element.append(...renderInlineNodes(args.at(-1)?.content || [], metadata))
    return element
  }
  if (name === 'url') {
    const value = textOf(lastArgument(node))
    const element = document.createElement('a')
    element.href = safeUrl(value)
    element.textContent = value
    return element
  }
  if (name === 'footnote') {
    const element = document.createElement('span')
    element.className = 'latex-footnote'
    element.textContent = textOf(lastArgument(node))
    return element
  }
  if (['ref', 'eqref', 'autoref', 'cref', 'cite', 'citet', 'citep'].includes(name)) {
    const element = document.createElement('span')
    element.className = 'latex-reference'
    const value = textOf(lastArgument(node))
    element.textContent = name.includes('cite') ? `[${value}]` : name === 'eqref' ? `(${value})` : value
    return element
  }
  if (name === 'includegraphics') {
    const element = document.createElement('span')
    element.className = 'latex-image-placeholder'
    element.textContent = textOf(lastArgument(node)) || '图片'
    return element
  }
  if (['LaTeX', 'TeX'].includes(name)) return document.createTextNode(name === 'LaTeX' ? 'LaTeX' : 'TeX')
  if (name === 'today') return document.createTextNode(new Intl.DateTimeFormat('zh-CN').format(new Date()))
  if (['\\', 'newline', 'linebreak'].includes(name)) return document.createElement('br')
  if ([',', ';', ':', 'quad', 'qquad', 'enspace'].includes(name)) return document.createTextNode(name.includes('qquad') ? '    ' : '  ')
  if (['label', 'documentclass', 'usepackage', 'title', 'author', 'date', 'begin', 'end'].includes(name)) return document.createDocumentFragment()

  const element = document.createElement('span')
  element.className = 'latex-unknown-command'
  element.textContent = `\\${name}`
  if (meaningfulArguments(node).length) element.append(renderArgument(node, metadata))
  return element
}

function splitItems(nodes) {
  const items = []
  let current = []
  for (const node of nodes) {
    if (node.type === 'macro' && node.content === 'item') {
      if (current.length) items.push(current)
      current = [...lastArgument(node)]
      continue
    }
    current.push(node)
  }
  if (current.some((node) => node.type !== 'whitespace')) items.push(current)
  return items
}

function renderEnvironment(node, metadata) {
  const name = typeof node.env === 'string' ? node.env : node.env?.content || ''
  if (mathEnvironments.has(name) || node.type === 'mathenv') {
    let source = printRaw(node.content)
    if (/^align\*?$/.test(name)) source = `\\begin{aligned}${source}\\end{aligned}`
    if (/^gather\*?$/.test(name)) source = `\\begin{gathered}${source}\\end{gathered}`
    return mathElement(source, true)
  }
  if (name === 'itemize' || name === 'enumerate') {
    const list = document.createElement(name === 'itemize' ? 'ul' : 'ol')
    for (const item of splitItems(node.content)) {
      const entry = document.createElement('li')
      appendFlow(entry, item, metadata)
      list.append(entry)
    }
    return list
  }
  if (theoremNames[name]) {
    const element = document.createElement('section')
    element.className = `latex-environment latex-${name}`
    const label = document.createElement('strong')
    label.textContent = `${theoremNames[name]}。`
    element.append(label)
    appendFlow(element, node.content, metadata)
    return element
  }
  if (name === 'abstract') {
    const element = document.createElement('section')
    element.className = 'latex-abstract'
    const label = document.createElement('strong')
    label.textContent = '摘要'
    element.append(label)
    appendFlow(element, node.content, metadata)
    return element
  }
  if (name === 'quote' || name === 'quotation') {
    const element = document.createElement('blockquote')
    appendFlow(element, node.content, metadata)
    return element
  }
  if (name === 'center') {
    const element = document.createElement('div')
    element.className = 'latex-center'
    appendFlow(element, node.content, metadata)
    return element
  }
  if (name === 'tabular') {
    const table = document.createElement('table')
    const body = document.createElement('tbody')
    const raw = printRaw(node.content)
    for (const rowSource of raw.split(/\\\\/).map((row) => row.trim()).filter(Boolean)) {
      const row = document.createElement('tr')
      for (const cellSource of rowSource.split('&')) {
        const cell = document.createElement('td')
        appendFlow(cell, parser.parse(cellSource).content, metadata)
        row.append(cell)
      }
      body.append(row)
    }
    table.append(body)
    return table
  }
  if (name === 'figure' || name === 'table') {
    const element = document.createElement(name === 'figure' ? 'figure' : 'div')
    element.className = `latex-${name}`
    appendFlow(element, node.content, metadata)
    return element
  }

  const element = document.createElement('section')
  element.className = 'latex-environment latex-environment-generic'
  element.dataset.environment = name
  appendFlow(element, node.content, metadata)
  return element
}

function renderInlineNode(node, metadata) {
  if (node.type === 'string') return document.createTextNode(node.content)
  if (node.type === 'whitespace') return document.createTextNode(' ')
  if (node.type === 'comment') return document.createDocumentFragment()
  if (node.type === 'macro') return renderMacro(node, metadata)
  if (node.type === 'inlinemath') return mathElement(printRaw(node.content), false)
  if (node.type === 'displaymath') return mathElement(printRaw(node.content), true)
  if (node.type === 'group' || node.type === 'argument') {
    const fragment = document.createDocumentFragment()
    appendInline(fragment, node.content, metadata)
    return fragment
  }
  if (node.type === 'verb') {
    const element = document.createElement('code')
    element.textContent = node.content
    return element
  }
  if (node.type === 'verbatim') {
    const element = document.createElement('pre')
    element.textContent = node.content
    return element
  }
  if (node.type === 'environment' || node.type === 'mathenv') return renderEnvironment(node, metadata)
  return document.createTextNode('')
}

function renderInlineNodes(nodes, metadata) {
  return nodes.map((node) => renderInlineNode(node, metadata))
}

function appendInline(parent, nodes, metadata) {
  parent.append(...renderInlineNodes(nodes, metadata))
}

function isBlockNode(node) {
  return node.type === 'environment' || node.type === 'mathenv' || node.type === 'displaymath' || node.type === 'verbatim' || (node.type === 'macro' && blockMacros.has(node.content))
}

function appendFlow(parent, nodes, metadata) {
  let paragraph
  const flush = () => {
    if (paragraph?.textContent.trim() || paragraph?.querySelector('.katex, br, a, code')) parent.append(paragraph)
    paragraph = undefined
  }
  for (const node of nodes) {
    if (node.type === 'parbreak') {
      flush()
      continue
    }
    if (isBlockNode(node)) {
      flush()
      parent.append(renderInlineNode(node, metadata))
      continue
    }
    paragraph ||= document.createElement('p')
    paragraph.append(renderInlineNode(node, metadata))
  }
  flush()
}

function renderBlock(block, metadata) {
  const element = document.createElement('section')
  element.className = 'latex-preview-block'
  element.dataset.blockId = block.id
  element.dataset.startLine = String(block.startLine)
  element.dataset.endLine = String(block.endLine)
  try {
    appendFlow(element, parser.parse(block.source).content, metadata)
  } catch (error) {
    element.classList.add('latex-preview-block-error')
    const source = document.createElement('pre')
    source.textContent = block.source
    const message = document.createElement('span')
    message.textContent = error.message
    element.append(source, message)
  }
  element.addEventListener('dblclick', () => focusLine(block.startLine))
  return element
}

let editor
let blocks = []
let renderTimer
let rendering = false
let pendingRender = false
let syncing = false
let metadataSignature = ''

function focusLine(number) {
  const line = editor.state.doc.line(Math.max(1, Math.min(number, editor.state.doc.lines)))
  editor.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
  editor.focus()
}

function render() {
  if (rendering) {
    pendingRender = true
    return
  }
  rendering = true
  const started = performance.now()
  const source = editor.state.doc.toString()
  const metadata = extractLatexMetadata(source)
  const nextBlocks = splitLatexBlocks(source)
  const diff = diffLatexBlocks(blocks, nextBlocks)
  const nextMetadataSignature = JSON.stringify(metadata)
  if (metadataSignature && metadataSignature !== nextMetadataSignature) {
    for (const block of nextBlocks) {
      if (/\\maketitle\b/.test(block.source)) elementCache.delete(block.id)
    }
  }
  const scrollTop = preview.scrollTop
  const nextElements = []
  for (const block of nextBlocks) {
    let element = elementCache.get(block.id)
    if (!element) {
      element = renderBlock(block, metadata)
      elementCache.set(block.id, element)
    }
    element.dataset.startLine = String(block.startLine)
    element.dataset.endLine = String(block.endLine)
    nextElements.push(element)
  }
  const nextIds = new Set(nextBlocks.map((block) => block.id))
  for (const id of elementCache.keys()) if (!nextIds.has(id)) elementCache.delete(id)
  preview.replaceChildren(...nextElements)
  if (!nextElements.length) {
    const empty = document.createElement('p')
    empty.className = 'latex-preview-empty'
    empty.textContent = '空文档'
    preview.append(empty)
  }
  preview.scrollTop = scrollTop
  blocks = nextBlocks
  metadataSignature = nextMetadataSignature
  const elapsed = Math.round((performance.now() - started) * 10) / 10
  status.textContent = `即时 · ${elapsed} ms · 更新 ${diff.rendered} 块`
  loading.hidden = true
  previewPane.setAttribute('aria-busy', 'false')
  workbench.dataset.ready = 'true'
  localStorage.setItem(storageKey, source)
  rendering = false
  if (pendingRender) {
    pendingRender = false
    render()
  }
}

function scheduleRender() {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 80)
}

const wrapSelection = (before, after = before, placeholder = '') => (view) => {
  const range = view.state.selection.main
  const selected = view.state.sliceDoc(range.from, range.to) || placeholder
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
    selection: { anchor: range.from + before.length, head: range.from + before.length + selected.length },
  })
  return true
}

function setSource(value) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
}

if (page && input && preview && previewPane && loading && status && workbench) {
  setupReferencePanel()
  setupReferenceDrawer()
  const initial = localStorage.getItem(storageKey) || input.dataset.initialValue || ''
  editor = new EditorView({
    parent: input,
    state: EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        bracketMatching(),
        StreamLanguage.define(stex),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          { key: 'Mod-b', run: wrapSelection('\\textbf{', '}', 'text') },
          { key: 'Mod-i', run: wrapSelection('\\emph{', '}', 'text') },
          { key: 'Mod-e', run: wrapSelection('$', '$', 'x') },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) scheduleRender()
        }),
      ],
    }),
  })

  editor.scrollDOM.addEventListener('scroll', () => {
    if (syncing || !blocks.length) return
    const line = editor.state.doc.lineAt(editor.lineBlockAtHeight(editor.scrollDOM.scrollTop).from).number
    const target = [...preview.children].reverse().find((element) => Number(element.dataset.startLine) <= line)
    if (!target) return
    syncing = true
    const targetTop = target.getBoundingClientRect().top - preview.getBoundingClientRect().top + preview.scrollTop
    preview.scrollTop = Math.max(0, targetTop - 24)
    requestAnimationFrame(() => { syncing = false })
  }, { passive: true })

  const setSourceWidth = (value) => {
    const percentage = Math.max(24, Math.min(68, value))
    workbench.style.setProperty('--latex-source-width', `${percentage}%`)
    resizeHandle?.setAttribute('aria-valuenow', String(Math.round(percentage)))
  }

  resizeHandle?.addEventListener('pointerdown', (event) => {
    if (matchMedia('(max-width: 800px)').matches) return
    event.preventDefault()
    resizeHandle.setPointerCapture(event.pointerId)
    workbench.dataset.resizing = 'true'
  })
  resizeHandle?.addEventListener('pointermove', (event) => {
    if (!resizeHandle.hasPointerCapture(event.pointerId)) return
    const bounds = workbench.getBoundingClientRect()
    setSourceWidth(((event.clientX - bounds.left) / bounds.width) * 100)
  })
  const finishResize = (event) => {
    if (resizeHandle?.hasPointerCapture(event.pointerId)) resizeHandle.releasePointerCapture(event.pointerId)
    delete workbench.dataset.resizing
  }
  resizeHandle?.addEventListener('pointerup', finishResize)
  resizeHandle?.addEventListener('pointercancel', finishResize)
  resizeHandle?.addEventListener('dblclick', () => setSourceWidth(38))
  resizeHandle?.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const current = Number(resizeHandle.getAttribute('aria-valuenow')) || 38
    setSourceWidth(current + (event.key === 'ArrowRight' ? 2 : -2))
  })

  openButton.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files
    if (!file) return
    if (file.size > 2_097_152) {
      status.textContent = '文件超过 2 MB'
      return
    }
    setSource(await file.text())
    status.textContent = file.name
  })
  copyButton.addEventListener('click', async () => {
    await copyText(editor.state.doc.toString())
    status.textContent = '已复制'
  })
  downloadButton.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([editor.state.doc.toString()], { type: 'application/x-tex;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'main.tex'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })
  resetButton.addEventListener('click', () => setSource(input.dataset.initialValue || ''))
  exportPdfButton?.addEventListener('click', exportPreviewPdf)
  render()
}
