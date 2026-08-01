(function () {
  window.__DAT_WRITER_CLIENT_LOADED__ = true

  const elements = {
    file: document.querySelector('#file'),
    title: document.querySelector('#title'),
    date: document.querySelector('#date'),
    filename: document.querySelector('#filename'),
    description: document.querySelector('#description'),
    cover: document.querySelector('#cover'),
    categories: document.querySelector('#categories'),
    tags: document.querySelector('#tags'),
    comments: document.querySelector('#comments'),
    mathjax: document.querySelector('#mathjax'),
    toc: document.querySelector('#toc'),
    overwrite: document.querySelector('#overwrite'),
    status: document.querySelector('#status'),
    assets: document.querySelector('#assets'),
    dropzone: document.querySelector('#dropzone'),
    commands: document.querySelector('#commands'),
    picbedCheckout: document.querySelector('#picbedCheckout'),
    posts: document.querySelector('#posts'),
    taxonomy: document.querySelector('#taxonomy'),
    postMetaDialog: document.querySelector('#postMetaDialog'),
    postsDialog: document.querySelector('#postsDialog'),
    opsDialog: document.querySelector('#opsDialog')
  }

  let editor
  let assetSequence = 1

  function splitList(value) {
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
  }

  function setStatus(payload) {
    const fullStatus = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    let summary = fullStatus

    if (payload && typeof payload === 'object') {
      if (payload.error) summary = payload.error
      else if (payload.relativePath) summary = `已缓存图片 ${payload.relativePath}`
      else if (payload.path) summary = `已保存 ${payload.path}`
      else if (payload.filename) summary = `已生成 ${payload.filename}`
      else if (Array.isArray(payload.commands)) summary = '命令计划已生成'
      else if (payload.ok) summary = '操作完成'
    }

    elements.status.value = summary
    elements.status.title = fullStatus
    elements.status.dataset.fullStatus = fullStatus
  }

  function openDialog(dialog) {
    if (!dialog) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }

  function closeDialog(dialog) {
    if (!dialog) return
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }

  function getMarkdown() {
    if (!editor) return ''
    if (typeof editor.getMarkdown === 'function') return editor.getMarkdown()
    if (typeof editor.getValue === 'function') return editor.getValue()
    return ''
  }

  function setMarkdown(markdown) {
    if (!editor) return
    if (typeof editor.setMarkdown === 'function') editor.setMarkdown(markdown)
    else if (typeof editor.setValue === 'function') editor.setValue(markdown)
  }

  function insertMarkdown(markdown) {
    if (editor && typeof editor.insert === 'function') editor.insert(markdown)
    else if (editor && typeof editor.insertValue === 'function') editor.insertValue(markdown)
    else setMarkdown(`${getMarkdown()}\n${markdown}\n`)
  }

  function metadata() {
    return {
      title: elements.title.value,
      date: elements.date.value,
      description: elements.description.value,
      cover: elements.cover.value,
      categories: splitList(elements.categories.value),
      tags: splitList(elements.tags.value),
      comments: elements.comments.checked,
      mathjax: elements.mathjax.checked,
      toc: elements.toc.checked
    }
  }

  async function postJson(endpoint, body) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'request failed')
    return payload
  }

  function readAsDataUrl(selected) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(selected)
    })
  }

  function addAssetItem(payload) {
    const item = document.createElement('li')
    item.textContent = payload.relativePath
    elements.assets.appendChild(item)
  }

  async function stageImageFile(selected, customName) {
    const imageName = customName ?? window.prompt('图片命名，可留空自动编号', '')
    const payload = await postJson('/api/assets/stage', {
      dataUrl: await readAsDataUrl(selected),
      originalName: selected.name || 'image.png',
      imageName: imageName || '',
      postFilename: elements.filename.value || elements.title.value || 'draft.md',
      categories: splitList(elements.categories.value),
      sequence: assetSequence++
    })
    addAssetItem(payload)
    setStatus(payload)
    return payload
  }

  async function validate() {
    const parsed = await postJson('/api/validate', {
      filename: elements.filename.value,
      markdown: getMarkdown()
    })
    setStatus(parsed)
  }

  async function save() {
    const saved = await postJson('/api/save', {
      filename: elements.filename.value,
      markdown: getMarkdown(),
      overwrite: elements.overwrite.checked
    })
    setStatus(saved)
  }

  async function createTemplate() {
    const payload = await postJson('/api/template', metadata())
    setMarkdown(payload.markdown)
    elements.filename.value = elements.filename.value || payload.filename
    setStatus(payload)
  }

  async function showPublishPlan() {
    const payload = await postJson('/api/publish-plan', {
      message: `post: add ${elements.title.value || elements.filename.value || 'blog post'}`
    })
    elements.commands.textContent = payload.commands.map((item) => item.command).join('\n')
    setStatus(payload)
  }

  async function showAssetPublishPlan() {
    const payload = await postJson('/api/assets/publish-plan', {
      picbedCheckout: elements.picbedCheckout.value,
      message: 'chore: add blog assets'
    })
    elements.commands.textContent = payload.commands.join('\n')
    setStatus(payload)
  }

  async function loadLists() {
    const [postsPayload, taxonomyPayload] = await Promise.all([
      fetch('/api/posts').then((response) => response.json()),
      fetch('/api/taxonomy').then((response) => response.json())
    ])

    elements.posts.textContent = ''
    for (const post of postsPayload.posts || []) {
      const item = document.createElement('li')
      item.textContent = `${post.date} ${post.title} (${post.filename})`
      elements.posts.appendChild(item)
    }

    elements.taxonomy.textContent = ''
    for (const item of [...taxonomyPayload.categories || [], ...taxonomyPayload.tags || []]) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.textContent = `${item.name} ${item.count}`
      elements.taxonomy.appendChild(chip)
    }
  }

  function setupFileInput() {
    elements.file.addEventListener('change', async () => {
      for (const selected of elements.file.files) {
        if (selected.type.startsWith('image/')) {
          const payload = await stageImageFile(selected)
          insertMarkdown(`\n${payload.markdown}\n`)
        } else {
          elements.filename.value = selected.name
          setMarkdown(await selected.text())
        }
      }
    })
  }

  function setupDropzone() {
    elements.dropzone.addEventListener('dragover', (event) => {
      event.preventDefault()
      elements.dropzone.classList.add('active')
    })
    elements.dropzone.addEventListener('dragleave', () => elements.dropzone.classList.remove('active'))
    elements.dropzone.addEventListener('drop', async (event) => {
      event.preventDefault()
      elements.dropzone.classList.remove('active')
      for (const selected of event.dataTransfer.files) {
        if (selected.type.startsWith('image/')) {
          const payload = await stageImageFile(selected)
          insertMarkdown(`\n${payload.markdown}\n`)
        }
      }
    })
  }

  function setupButtons() {
    document.querySelector('#openPostMetaDialog').addEventListener('click', () => openDialog(elements.postMetaDialog))
    document.querySelector('#openPostsDialog').addEventListener('click', () => {
      openDialog(elements.postsDialog)
      loadLists().catch((error) => setStatus({ ok: false, error: error.message }))
    })
    document.querySelector('#openOpsDialog').addEventListener('click', () => openDialog(elements.opsDialog))
    document.querySelectorAll('.close-dialog').forEach((button) => {
      button.addEventListener('click', () => closeDialog(document.querySelector(`#${button.dataset.closeDialog}`)))
    })
    document.querySelector('#reloadLists').addEventListener('click', () => loadLists().catch((error) => setStatus({ ok: false, error: error.message })))
    document.querySelector('#template').addEventListener('click', () => createTemplate().catch((error) => setStatus({ ok: false, error: error.message })))
    document.querySelector('#validate').addEventListener('click', () => validate().catch((error) => setStatus({ ok: false, error: error.message })))
    document.querySelector('#save').addEventListener('click', () => save().catch((error) => setStatus({ ok: false, error: error.message })))
    document.querySelector('#publishPlan').addEventListener('click', () => showPublishPlan().catch((error) => setStatus({ ok: false, error: error.message })))
    document.querySelector('#assetPublishPlan').addEventListener('click', () => showAssetPublishPlan().catch((error) => setStatus({ ok: false, error: error.message })))
  }

  function setupEditor() {
    setStatus('正在加载 Cherry Markdown...')
    const CherryCtor = window.Cherry?.default || window.Cherry
    if (typeof CherryCtor !== 'function') {
      setStatus({ ok: false, error: 'Cherry Markdown failed to load' })
      return
    }

    editor = new CherryCtor({
      id: 'markdownEditor',
      value: '',
      editor: {
        defaultModel: 'edit&preview',
        height: '100%',
        fileUpload: async (file, callback) => {
          try {
            const payload = await stageImageFile(file)
            callback(payload.url)
          } catch (error) {
            setStatus({ ok: false, error: error.message })
          }
        }
      }
    })
    window.__DAT_CHERRY_READY__ = true
    setStatus('Cherry Markdown 已就绪')
  }

  try {
    setupEditor()
    setupButtons()
    setupFileInput()
    setupDropzone()
    loadLists().catch(() => {})
  } catch (error) {
    setStatus({ ok: false, error: error.message })
  }
})()
