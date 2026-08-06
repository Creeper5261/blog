import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { codeFolding, defaultHighlightStyle, foldEffect, foldKeymap, foldService, foldedRanges, syntaxHighlighting, unfoldEffect } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, StateField } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, WidgetType, drawSelection, gutter, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'

const page = document.querySelector('.markdown-editor-page')
const source = document.querySelector('#markdown-input')
const preview = document.querySelector('#markdown-preview')
const previewPane = document.querySelector('.markdown-preview-pane')
const loading = document.querySelector('#markdown-preview-loading')
const status = document.querySelector('#markdown-status')
const workbench = document.querySelector('.markdown-workbench')
const svgNamespace = 'http://www.w3.org/2000/svg'

const createFoldMarker = (open) => {
  const marker = document.createElement('span')
  marker.className = 'markdown-fold-marker'
  const icon = document.createElementNS(svgNamespace, 'svg')
  icon.setAttribute('viewBox', '0 0 12 12')
  icon.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(svgNamespace, 'path')
  path.setAttribute('d', open ? 'M2.5 4 6 7.5 9.5 4' : 'M4 2.5 7.5 6 4 9.5')
  icon.append(path)
  marker.append(icon)
  return marker
}

class HeadingFoldMarker extends GutterMarker {
  constructor(open) {
    super()
    this.open = open
  }

  eq(other) { return this.open === other.open }

  toDOM() { return createFoldMarker(this.open) }
}

const openHeadingMarker = new HeadingFoldMarker(true)
const closedHeadingMarker = new HeadingFoldMarker(false)

class FoldEllipsisWidget extends WidgetType {
  toDOM(view) {
    const marker = document.createElement('span')
    marker.className = 'markdown-fold-ellipsis'
    marker.setAttribute('aria-label', '展开折叠内容')
    const icon = document.createElementNS(svgNamespace, 'svg')
    icon.setAttribute('viewBox', '0 0 16 8')
    icon.setAttribute('aria-hidden', 'true')
    for (const x of [3, 8, 13]) {
      const circle = document.createElementNS(svgNamespace, 'circle')
      circle.setAttribute('cx', String(x))
      circle.setAttribute('cy', '4')
      circle.setAttribute('r', '1.15')
      icon.append(circle)
    }
    marker.append(icon)
    const expand = () => {
      const position = view.posAtDOM(marker)
      let range
      foldedRanges(view.state).between(position, position + 1, (from, to) => {
        if (from === position) range = { from, to }
      })
      if (range) view.dispatch({ effects: unfoldEffect.of(range) })
      view.focus()
    }
    marker.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      expand()
    })
    return marker
  }
}

const foldEllipsisWidget = new FoldEllipsisWidget()

const createFoldPlaceholder = (_view, onclick) => {
  const placeholder = document.createElement('span')
  placeholder.className = 'cm-foldPlaceholder markdown-fold-placeholder'
  placeholder.setAttribute('aria-label', '展开折叠内容')
  placeholder.title = '展开'
  placeholder.onclick = onclick
  return placeholder
}

const setStatus = (text, error = false) => {
  status.textContent = text
  status.dataset.error = String(error)
}

const wrapSelection = (before, after = before, placeholder = '') => (view) => {
  const range = view.state.selection.main
  const selected = view.state.sliceDoc(range.from, range.to) || placeholder
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
    selection: { anchor: range.from + before.length, head: range.from + before.length + selected.length },
    scrollIntoView: true
  })
  view.focus()
  return true
}

if (page && source && preview && previewPane && loading && status && workbench) {
  let renderTimer
  let requestedRender = 0
  let rendererStarted = false
  let paneHeightFrame
  let editor
  const getSource = () => editor.state.doc.toString()
  const setSource = (value) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  const headingFoldRange = (state, lineStart) => {
    const line = state.doc.lineAt(lineStart)
    const heading = /^(#{1,6})\s+\S/.exec(line.text)
    if (!heading) return null
    const level = heading[1].length
    let end = state.doc.length
    for (let number = line.number + 1; number <= state.doc.lines; number += 1) {
      const candidate = state.doc.line(number)
      const nextHeading = /^(#{1,6})\s+\S/.exec(candidate.text)
      if (nextHeading && nextHeading[1].length <= level) {
        end = state.doc.line(number - 1).to
        break
      }
    }
    return end > line.to ? { from: line.to, to: end } : null
  }
  const headingFold = foldService.of(headingFoldRange)
  const foldedHeadingLines = StateField.define({
    create: () => Decoration.none,
    update: (_decorations, transaction) => {
      const ranges = []
      foldedRanges(transaction.state).between(0, transaction.state.doc.length, (from) => {
        const line = transaction.state.doc.lineAt(from)
        if (/^(#{1,6})\s+\S/.test(line.text)) {
          ranges.push(Decoration.line({ class: 'cm-folded-heading' }).range(line.from))
          ranges.push(Decoration.widget({ widget: foldEllipsisWidget, side: -1 }).range(line.to))
        }
      })
      return Decoration.set(ranges, true)
    },
    provide: (field) => EditorView.decorations.from(field)
  })
  const headingFoldGutter = gutter({
    class: 'cm-headingFoldGutter',
    initialSpacer: () => closedHeadingMarker,
    lineMarker: (view, line) => {
      const range = headingFoldRange(view.state, line.from)
      if (!range) return null
      let folded = false
      foldedRanges(view.state).between(range.from, range.from + 1, (from) => { folded ||= from === range.from })
      return folded ? closedHeadingMarker : openHeadingMarker
    },
    lineMarkerChange: () => true,
    domEventHandlers: {
      click: (view, line) => {
        const range = headingFoldRange(view.state, line.from)
        if (!range) return false
        let foldedRange
        foldedRanges(view.state).between(range.from, range.from + 1, (from, to) => {
          if (from === range.from) foldedRange = { from, to }
        })
        view.dispatch({ effects: foldedRange ? unfoldEffect.of(foldedRange) : foldEffect.of(range) })
        return true
      }
    }
  })
  const previewOptions = () => {
    const dark = document.documentElement.dataset.theme === 'dark'
    return {
      cdn: '/vendor/vditor',
      lang: 'zh_CN',
      icon: 'material',
      mode: dark ? 'dark' : 'light',
      theme: { current: dark ? 'dark' : 'light', path: '/vendor/vditor/dist/css/content-theme' },
      hljs: { style: dark ? 'github-dark' : 'github' },
      math: { engine: 'KaTeX', inlineDigit: false },
      markdown: { codeBlockPreview: false, mathBlockPreview: false }
    }
  }
  const syncPaneHeight = () => {
    cancelAnimationFrame(paneHeightFrame)
    paneHeightFrame = requestAnimationFrame(() => {
      const sourceLabel = document.querySelector('.markdown-source-pane .markdown-pane-label')
      const previewLabel = document.querySelector('.markdown-preview-pane .markdown-pane-label')
      const previewStyle = getComputedStyle(preview)
      const previewTop = preview.getBoundingClientRect().top + Number.parseFloat(previewStyle.paddingTop)
      const previewBottom = [...preview.children].reduce((bottom, child) => {
        const childStyle = getComputedStyle(child)
        return Math.max(bottom, child.getBoundingClientRect().bottom + Number.parseFloat(childStyle.marginBottom))
      }, previewTop)
      const sourceHeight = (sourceLabel?.offsetHeight || 0) + editor.contentHeight + 2
      const previewHeight = (previewLabel?.offsetHeight || 0) + Number.parseFloat(previewStyle.paddingTop) + (previewBottom - previewTop) + Number.parseFloat(previewStyle.paddingBottom) + 2
      const workbenchStyle = getComputedStyle(workbench)
      const frameHeight = Number.parseFloat(workbenchStyle.paddingTop) + Number.parseFloat(workbenchStyle.paddingBottom) + 2
      const heightDifference = sourceHeight - previewHeight
      const contentHeight = Math.abs(heightDifference) <= 2 ? Math.max(sourceHeight, previewHeight) : Math.min(sourceHeight, previewHeight)
      const minimumHeight = Math.min(window.innerHeight * 0.68, 760)
      const targetHeight = Math.max(minimumHeight, contentHeight + frameHeight)
      const fitsBoth = targetHeight >= Math.max(sourceHeight, previewHeight) + frameHeight - 2
      const overflow = fitsBoth || Math.abs(heightDifference) <= 2 ? 'none' : heightDifference > 0 ? 'source' : 'preview'
      workbench.dataset.overflow = overflow
      workbench.style.setProperty('--markdown-workbench-height', `${Math.ceil(targetHeight)}px`)
    })
  }
  const render = async (initial = false) => {
    const id = ++requestedRender
    if (initial) setStatus('正在加载 Markdown 渲染器…')
    previewPane.setAttribute('aria-busy', 'true')
    try {
      await window.Vditor.preview(preview, getSource(), previewOptions())
      if (id !== requestedRender) return
      workbench.dataset.ready = 'true'
      previewPane.setAttribute('aria-busy', 'false')
      setStatus('本地编辑；内容不会上传。')
      syncPaneHeight()
    } catch (error) {
      if (id !== requestedRender) return
      previewPane.setAttribute('aria-busy', 'false')
      loading.textContent = '预览加载失败，请刷新后重试。'
      setStatus(`预览加载失败：${error.message}`, true)
    }
  }
  const queueRender = () => {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => render(), 80)
  }

  const initializeRenderer = () => {
    if (rendererStarted || !window.Vditor?.preview) return false
    rendererStarted = true
    render(true)
    return true
  }
  editor = new EditorView({
    parent: source,
    state: EditorState.create({
      doc: source.dataset.initialValue || '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        headingFoldGutter,
        codeFolding({ placeholderDOM: createFoldPlaceholder }),
        foldedHeadingLines,
        history(),
        drawSelection(),
        markdown(),
        headingFold,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          { key: 'Mod-b', run: wrapSelection('**') },
          { key: 'Mod-i', run: wrapSelection('*') },
          { key: 'Mod-k', run: wrapSelection('[', '](https://)') },
          { key: 'Mod-Shift-x', run: wrapSelection('~~') },
          indentWithTab,
          ...foldKeymap,
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && rendererStarted) queueRender()
          if (update.geometryChanged) syncPaneHeight()
        })
      ]
    })
  })
  if (!initializeRenderer()) setStatus('正在加载 Markdown 渲染器…')
  document.addEventListener('vditor:ready', initializeRenderer, { once: true })
  document.addEventListener('vditor:error', () => {
    loading.textContent = '预览加载失败，请刷新后重试。'
    setStatus('Markdown 渲染器未加载。', true)
  }, { once: true })

  const fileInput = document.querySelector('#markdown-file')
  document.querySelector('#markdown-open')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async (event) => {
    const [file] = event.target.files
    if (!file) return
    setSource(await file.text())
    page.dataset.format = file.name.toLowerCase().endsWith('.mdx') ? 'mdx' : 'markdown'
    render()
  })
  document.querySelector('#markdown-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(getSource())
    setStatus('Markdown 已复制。')
  })
  document.querySelector('#markdown-download')?.addEventListener('click', () => {
    const blob = new Blob([getSource()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = page.dataset.format === 'mdx' ? 'document.mdx' : 'document.md'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })
  document.querySelector('#markdown-clear')?.addEventListener('click', () => {
    setSource('')
    render()
    editor.focus()
  })
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  window.addEventListener('resize', syncPaneHeight, { passive: true })
}
