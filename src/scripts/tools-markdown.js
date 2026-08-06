import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { defaultHighlightStyle, foldGutter, foldKeymap, foldService, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'

const page = document.querySelector('.markdown-editor-page')
const source = document.querySelector('#markdown-input')
const preview = document.querySelector('#markdown-preview')
const previewPane = document.querySelector('.markdown-preview-pane')
const loading = document.querySelector('#markdown-preview-loading')
const status = document.querySelector('#markdown-status')
const workbench = document.querySelector('.markdown-workbench')

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
  let editor
  const getSource = () => editor.state.doc.toString()
  const setSource = (value) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  const headingFold = foldService.of((state, lineStart) => {
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
        foldGutter(),
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
}
