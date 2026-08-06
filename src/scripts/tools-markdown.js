const page = document.querySelector('.markdown-editor-page')
const editorHost = document.querySelector('#markdown-editor')
const initial = document.querySelector('#markdown-initial')?.value || ''
const status = document.querySelector('#markdown-status')
const setStatus = (text, error = false) => { status.textContent = text; status.dataset.error = String(error) }
const prefersDark = document.documentElement.dataset.theme === 'dark'

if (page && editorHost && window.Vditor) {
  const editor = new window.Vditor(editorHost, {
    value: initial,
    mode: 'sv',
    theme: prefersDark ? 'dark' : 'classic',
    lang: 'zh_CN',
    cdn: '/vendor/vditor',
    height: 'min(68vh, 760px)',
    cache: { enable: true, id: 'dat-markdown-editor' },
    toolbarConfig: { pin: true },
    toolbar: ['headings', 'bold', 'italic', 'strike', 'link', 'list', 'ordered-list', 'check', 'quote', 'line', 'code', 'inline-code', 'table', 'undo', 'redo', 'fullscreen', 'edit-mode'],
    preview: {
      theme: { current: prefersDark ? 'dark' : 'light', path: '/vendor/vditor/dist/css/content-theme' },
      hljs: { style: prefersDark ? 'github-dark' : 'github' },
      math: { engine: 'KaTeX', inlineDigit: false }
    },
    input: () => setStatus('已修改；内容保存在当前浏览器。'),
    after: () => setStatus('就绪；支持 Markdown、GFM、LaTeX 和常用快捷键。')
  })

  const fileInput = document.querySelector('#markdown-file')
  document.querySelector('#markdown-open')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async (event) => {
    const [file] = event.target.files
    if (!file) return
    editor.setValue(await file.text())
    page.dataset.format = file.name.toLowerCase().endsWith('.mdx') ? 'mdx' : 'markdown'
    setStatus(`已打开 ${file.name}；内容仍只在当前浏览器处理。`)
  })
  document.querySelector('#markdown-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(editor.getValue())
    setStatus('Markdown 已复制。')
  })
  document.querySelector('#markdown-download')?.addEventListener('click', () => {
    const blob = new Blob([editor.getValue()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = page.dataset.format === 'mdx' ? 'document.mdx' : 'document.md'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })
  document.querySelector('#markdown-clear')?.addEventListener('click', () => { editor.setValue(''); setStatus('已清空。') })

  const applyTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark'
    editor.setTheme(dark ? 'dark' : 'classic', dark ? 'dark' : 'light', dark ? 'github-dark' : 'github', '/vendor/vditor/dist/css/content-theme')
  }
  applyTheme()
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}
