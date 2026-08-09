const root = document.querySelector('.document-converter-page')
const modeInputs = [...document.querySelectorAll('input[name="converter-mode"]')]
const fileInput = document.querySelector('#converter-file')
const dropzone = document.querySelector('#converter-dropzone')
const fileList = document.querySelector('#converter-files')
const capability = document.querySelector('#converter-capability')
const options = document.querySelector('#converter-options')
const scaleWrap = document.querySelector('#converter-scale-wrap')
const scaleInput = document.querySelector('#converter-scale')
const mergeWrap = document.querySelector('#converter-merge-wrap')
const mergeInput = document.querySelector('#converter-merge')
const runButton = document.querySelector('#converter-run')
const downloadButton = document.querySelector('#converter-download')
const resetButton = document.querySelector('#converter-reset')
const progress = document.querySelector('#converter-progress')
const status = document.querySelector('#converter-status')
const preview = document.querySelector('#converter-preview')

const MODE_CONFIG = {
  'pdf-to-image': { accept: 'application/pdf,.pdf', multiple: false, minimum: 1, scale: true, text: 'PDF 每页导出为 PNG。' },
  'image-to-pdf': { accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', multiple: true, minimum: 1, text: '多张图片按列表顺序写入 PDF。' },
  'pdf-to-word': { accept: 'application/pdf,.pdf', multiple: false, minimum: 1, text: '提取 PDF 文本并生成 DOCX。' },
  'word-to-pdf': { accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx', multiple: true, minimum: 1, merge: true, text: '支持批量 DOCX；可分别下载或合并。' },
  'word-to-image': { accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx', multiple: false, minimum: 1, scale: true, text: 'DOCX 导出为一张长图。' },
  'image-to-word': { accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', multiple: true, minimum: 1, text: '多张图片按列表顺序写入 DOCX。' },
  'pdf-merge': { accept: 'application/pdf,.pdf', multiple: true, minimum: 2, text: '多个 PDF 按列表顺序拼接。' }
}

let files = []
let result
let previewUrls = []

function selectedMode() {
  return modeInputs.find((input) => input.checked)?.value || 'pdf-to-image'
}

function config() {
  return MODE_CONFIG[selectedMode()]
}

function setStatus(text, error = false) {
  status.textContent = text
  status.classList.toggle('error', error)
}

function setProgress(value, label) {
  progress.hidden = false
  progress.value = Math.min(1, Math.max(0, value))
  if (label) setStatus(label)
}

function clearPreview() {
  for (const url of previewUrls) URL.revokeObjectURL(url)
  previewUrls = []
  preview.replaceChildren()
  preview.hidden = true
}

function clearResult() {
  if (result?.url) URL.revokeObjectURL(result.url)
  result = null
  downloadButton.disabled = true
  clearPreview()
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function renderFiles() {
  fileList.replaceChildren()
  files.forEach((file, index) => {
    const item = document.createElement('li')
    item.className = 'converter-file'

    const order = document.createElement('span')
    order.className = 'converter-file-order'
    order.textContent = String(index + 1)
    const name = document.createElement('span')
    name.className = 'converter-file-name'
    name.textContent = file.name
    const size = document.createElement('span')
    size.className = 'converter-file-size'
    size.textContent = humanSize(file.size)

    const actions = document.createElement('span')
    actions.className = 'converter-file-actions'
    for (const [action, label, disabled] of [
      ['up', '上移', index === 0],
      ['down', '下移', index === files.length - 1],
      ['remove', '删除', false]
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.fileAction = action
      button.dataset.fileIndex = String(index)
      button.disabled = disabled
      button.textContent = label
      actions.append(button)
    }

    item.append(order, name, size, actions)
    fileList.append(item)
  })
  runButton.disabled = files.length < config().minimum
}

function matchesMode(file) {
  const mode = selectedMode()
  const name = file.name.toLowerCase()
  if (mode.startsWith('pdf-') || mode === 'pdf-merge') return file.type === 'application/pdf' || name.endsWith('.pdf')
  if (mode.startsWith('word-')) return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)
}

function addFiles(incoming) {
  const selected = [...incoming]
  const valid = selected.filter(matchesMode)
  const maxBytes = Number(root.dataset.maxBytes)
  const withinLimit = valid.filter((file) => file.size <= maxBytes)
  const rejected = selected.length - withinLimit.length
  files = config().multiple ? [...files, ...withinLimit] : withinLimit.slice(0, 1)
  clearResult()
  renderFiles()
  if (rejected) setStatus(`${rejected} 个文件不符合格式或超过 50 MB。`, true)
  else if (files.length) setStatus(`已选择 ${files.length} 个文件。`)
}

function resetFiles(message = '选择文件。') {
  files = []
  fileInput.value = ''
  clearResult()
  renderFiles()
  setStatus(message)
}

function updateMode() {
  const current = config()
  fileInput.accept = current.accept
  fileInput.multiple = current.multiple
  capability.textContent = current.text
  scaleWrap.hidden = !current.scale
  mergeWrap.hidden = !current.merge
  options.hidden = !current.scale && !current.merge
  document.querySelectorAll('[data-mode-card]').forEach((card) => {
    card.dataset.active = String(card.querySelector('input').checked)
  })
  resetFiles()
}

function safeBaseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document'
}

function showImages(blobs) {
  clearPreview()
  preview.hidden = false
  for (const [index, blob] of blobs.slice(0, 6).entries()) {
    const figure = document.createElement('figure')
    const image = document.createElement('img')
    const caption = document.createElement('figcaption')
    const url = URL.createObjectURL(blob)
    previewUrls.push(url)
    image.src = url
    image.alt = `转换结果 ${index + 1}`
    caption.textContent = `第 ${index + 1} 页`
    figure.append(image, caption)
    preview.append(figure)
  }
}

function showPdf(blob) {
  clearPreview()
  const url = URL.createObjectURL(blob)
  previewUrls.push(url)
  const frame = document.createElement('iframe')
  frame.title = 'PDF 转换结果'
  frame.src = url
  preview.append(frame)
  preview.hidden = false
}

function setResult(blob, filename, { images = [], pdf = false } = {}) {
  clearResult()
  const url = URL.createObjectURL(blob)
  result = { blob, filename, url }
  downloadButton.disabled = false
  if (images.length) showImages(images)
  else if (pdf) showPdf(blob)
  setStatus(`转换完成 · ${humanSize(blob.size)}`)
}

function canvasBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成图片')), type, quality))
}

async function imageAsPng(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await canvasBlob(canvas)
  return { blob, width: canvas.width, height: canvas.height }
}

async function loadPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
}

async function pdfToImages() {
  const documentHandle = await loadPdf(files[0])
  const images = []
  const scale = Number(scaleInput.value)
  for (let pageNumber = 1; pageNumber <= documentHandle.numPages; pageNumber += 1) {
    setProgress((pageNumber - 1) / documentHandle.numPages, `正在渲染第 ${pageNumber} 页…`)
    const page = await documentHandle.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise
    images.push(await canvasBlob(canvas))
  }
  await documentHandle.destroy?.()
  if (images.length === 1) {
    setResult(images[0], `${safeBaseName(files[0].name)}.png`, { images })
    return
  }
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  images.forEach((blob, index) => zip.file(`page-${String(index + 1).padStart(3, '0')}.png`, blob))
  setResult(await zip.generateAsync({ type: 'blob' }), `${safeBaseName(files[0].name)}-images.zip`, { images })
}

async function imagesToPdf() {
  const { PDFDocument } = await import('pdf-lib')
  const documentHandle = await PDFDocument.create()
  const a4 = [595.28, 841.89]
  for (const [index, file] of files.entries()) {
    setProgress(index / files.length, `正在写入第 ${index + 1} 张图片…`)
    const image = await imageAsPng(file)
    const embedded = await documentHandle.embedPng(await image.blob.arrayBuffer())
    const landscape = image.width > image.height
    const pageSize = landscape ? [a4[1], a4[0]] : a4
    const page = documentHandle.addPage(pageSize)
    const margin = 28
    const ratio = Math.min((pageSize[0] - margin * 2) / image.width, (pageSize[1] - margin * 2) / image.height)
    const width = image.width * ratio
    const height = image.height * ratio
    page.drawImage(embedded, { x: (pageSize[0] - width) / 2, y: (pageSize[1] - height) / 2, width, height })
  }
  const blob = new Blob([await documentHandle.save()], { type: 'application/pdf' })
  setResult(blob, 'images.pdf', { pdf: true })
}

function textLines(items) {
  const groups = []
  for (const item of items.filter((entry) => typeof entry.str === 'string')) {
    const y = item.transform?.[5] ?? 0
    let group = groups.find((entry) => Math.abs(entry.y - y) < 2)
    if (!group) {
      group = { y, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
    .sort((left, right) => right.y - left.y)
    .map((group) => group.items.sort((left, right) => (left.transform?.[4] ?? 0) - (right.transform?.[4] ?? 0)).map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

async function pdfToWord() {
  const pdf = await loadPdf(files[0])
  const { Document, Packer, PageBreak, Paragraph, TextRun } = await import('docx')
  const children = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setProgress((pageNumber - 1) / pdf.numPages, `正在提取第 ${pageNumber} 页…`)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    for (const line of textLines(content.items)) children.push(new Paragraph({ children: [new TextRun(line)] }))
    if (pageNumber < pdf.numPages) children.push(new Paragraph({ children: [new PageBreak()] }))
  }
  await pdf.destroy?.()
  const documentHandle = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(documentHandle)
  setResult(blob, `${safeBaseName(files[0].name)}.docx`)
}

async function renderDocx(file) {
  const mammothModule = await import('mammoth')
  const mammoth = mammothModule.default ?? mammothModule
  const { default: DOMPurify } = await import('dompurify')
  const conversion = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  const node = document.createElement('article')
  node.className = 'converter-render-target'
  node.innerHTML = DOMPurify.sanitize(conversion.value, { ADD_DATA_URI_TAGS: ['img'] })
  document.body.append(node)
  await Promise.all([...node.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = image.onerror = resolve })))
  await document.fonts?.ready
  return node
}

async function docxToPdfBlob(file) {
  const node = await renderDocx(file)
  try {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
    await new Promise((resolve) => pdf.html(node, {
      callback: resolve,
      margin: [12, 12, 12, 12],
      autoPaging: 'text',
      width: 186,
      windowWidth: 794,
      html2canvas: { scale: 1, backgroundColor: '#ffffff', logging: false }
    }))
    return pdf.output('blob')
  } finally {
    node.remove()
  }
}

async function mergePdfBlobs(blobs) {
  const { mergePdfBuffers } = await import('../lib/document-converter.mjs')
  const bytes = await mergePdfBuffers(await Promise.all(blobs.map((blob) => blob.arrayBuffer())))
  return new Blob([bytes], { type: 'application/pdf' })
}

async function wordToPdf() {
  const converted = []
  for (const [index, file] of files.entries()) {
    setProgress(index / files.length, `正在转换 ${file.name}…`)
    converted.push({ file, blob: await docxToPdfBlob(file) })
  }
  if (converted.length === 1 || mergeInput.checked) {
    const blob = converted.length === 1 ? converted[0].blob : await mergePdfBlobs(converted.map((entry) => entry.blob))
    setResult(blob, converted.length === 1 ? `${safeBaseName(converted[0].file.name)}.pdf` : 'word-merged.pdf', { pdf: true })
    return
  }
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  converted.forEach(({ file, blob }) => zip.file(`${safeBaseName(file.name)}.pdf`, blob))
  setResult(await zip.generateAsync({ type: 'blob' }), 'word-pdf.zip')
}

async function wordToImage() {
  const node = await renderDocx(files[0])
  try {
    const { toBlob } = await import('html-to-image')
    const blob = await toBlob(node, { pixelRatio: Number(scaleInput.value), backgroundColor: '#ffffff', cacheBust: true })
    if (!blob) throw new Error('无法生成图片')
    setResult(blob, `${safeBaseName(files[0].name)}.png`, { images: [blob] })
  } finally {
    node.remove()
  }
}

async function imagesToWord() {
  const { Document, ImageRun, Packer, Paragraph } = await import('docx')
  const children = []
  for (const [index, file] of files.entries()) {
    setProgress(index / files.length, `正在写入第 ${index + 1} 张图片…`)
    const image = await imageAsPng(file)
    const maxWidth = 620
    const maxHeight = 860
    const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height)
    children.push(new Paragraph({
      pageBreakBefore: index > 0,
      children: [new ImageRun({ type: 'png', data: new Uint8Array(await image.blob.arrayBuffer()), transformation: { width: Math.round(image.width * ratio), height: Math.round(image.height * ratio) } })]
    }))
  }
  const documentHandle = new Document({ sections: [{ children }] })
  setResult(await Packer.toBlob(documentHandle), 'images.docx')
}

async function mergePdfs() {
  const blobs = files.map((file) => file.slice(0, file.size, 'application/pdf'))
  setProgress(0.2, '正在拼接 PDF…')
  const blob = await mergePdfBlobs(blobs)
  setResult(blob, 'merged.pdf', { pdf: true })
}

async function run() {
  if (files.length < config().minimum) return
  clearResult()
  runButton.disabled = true
  progress.value = 0
  progress.hidden = false
  try {
    const handlers = {
      'pdf-to-image': pdfToImages,
      'image-to-pdf': imagesToPdf,
      'pdf-to-word': pdfToWord,
      'word-to-pdf': wordToPdf,
      'word-to-image': wordToImage,
      'image-to-word': imagesToWord,
      'pdf-merge': mergePdfs
    }
    await handlers[selectedMode()]()
    progress.value = 1
  } catch (error) {
    setStatus(`转换失败：${error.message}`, true)
  } finally {
    progress.hidden = true
    runButton.disabled = files.length < config().minimum
  }
}

modeInputs.forEach((input) => input.addEventListener('change', updateMode))
fileInput.addEventListener('change', (event) => addFiles(event.target.files))
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.dataset.active = 'true' })
dropzone.addEventListener('dragleave', () => delete dropzone.dataset.active)
dropzone.addEventListener('drop', (event) => {
  event.preventDefault()
  delete dropzone.dataset.active
  addFiles(event.dataTransfer.files)
})
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    fileInput.click()
  }
})
fileList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-file-action]')
  if (!button) return
  const index = Number(button.dataset.fileIndex)
  if (button.dataset.fileAction === 'remove') files.splice(index, 1)
  if (button.dataset.fileAction === 'up' && index > 0) [files[index - 1], files[index]] = [files[index], files[index - 1]]
  if (button.dataset.fileAction === 'down' && index < files.length - 1) [files[index], files[index + 1]] = [files[index + 1], files[index]]
  clearResult()
  renderFiles()
  setStatus(files.length ? `已选择 ${files.length} 个文件。` : '选择文件。')
})
runButton.addEventListener('click', run)
downloadButton.addEventListener('click', () => {
  if (!result) return
  const link = document.createElement('a')
  link.href = result.url
  link.download = result.filename
  link.click()
})
resetButton.addEventListener('click', () => resetFiles('已清空。'))

updateMode()
