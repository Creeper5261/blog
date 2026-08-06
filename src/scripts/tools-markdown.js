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

const wrapSelection = (before, after = before, placeholder = '') => {
  const start = source.selectionStart
  const end = source.selectionEnd
  const selected = source.value.slice(start, end) || placeholder
  source.setRangeText(`${before}${selected}${after}`, start, end, 'select')
  source.selectionStart = start + before.length
  source.selectionEnd = source.selectionStart + selected.length
  source.focus()
  source.dispatchEvent(new Event('input', { bubbles: true }))
}

if (page && source && preview && previewPane && loading && status && workbench) {
  let renderTimer
  let requestedRender = 0
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
      await window.Vditor.preview(preview, source.value, previewOptions())
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

  if (!window.Vditor?.preview) {
    loading.textContent = '渲染器加载失败，请刷新后重试。'
    setStatus('Markdown 渲染器未加载。', true)
  } else {
    render(true)
  }

  source.addEventListener('input', queueRender)
  source.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); wrapSelection('**') }
    if (modifier && event.key.toLowerCase() === 'i') { event.preventDefault(); wrapSelection('*') }
    if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); wrapSelection('[', '](https://)') }
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); wrapSelection('~~') }
    if (event.key === 'Tab') {
      event.preventDefault()
      const start = source.selectionStart
      source.setRangeText('  ', start, source.selectionEnd, 'end')
      queueRender()
    }
  })

  const fileInput = document.querySelector('#markdown-file')
  document.querySelector('#markdown-open')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async (event) => {
    const [file] = event.target.files
    if (!file) return
    source.value = await file.text()
    page.dataset.format = file.name.toLowerCase().endsWith('.mdx') ? 'mdx' : 'markdown'
    render()
  })
  document.querySelector('#markdown-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(source.value)
    setStatus('Markdown 已复制。')
  })
  document.querySelector('#markdown-download')?.addEventListener('click', () => {
    const blob = new Blob([source.value], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = page.dataset.format === 'mdx' ? 'document.mdx' : 'document.md'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })
  document.querySelector('#markdown-clear')?.addEventListener('click', () => {
    source.value = ''
    render()
    source.focus()
  })
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}
