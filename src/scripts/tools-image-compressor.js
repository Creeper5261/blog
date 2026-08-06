import Compressor from 'compressorjs'

const page = document.querySelector('.image-tool-page')
const fileInput = document.querySelector('#image-file')
const zone = document.querySelector('#image-dropzone')
const quality = document.querySelector('#image-quality')
const qualityValue = document.querySelector('#image-quality-value')
const format = document.querySelector('#image-format')
const maxWidth = document.querySelector('#image-width')
const before = document.querySelector('#image-before')
const after = document.querySelector('#image-after')
const status = document.querySelector('#image-status')
const compressButton = document.querySelector('#image-compress')
const download = document.querySelector('#image-download')
let selectedFile
let resultFile
let beforeUrl
let afterUrl

if (!page || !fileInput || !zone || !quality || !qualityValue || !format || !maxWidth || !before || !after || !status || !compressButton || !download) throw new Error('图片工具未完成初始化')

const setStatus = (text, error = false) => { status.textContent = text; status.dataset.error = String(error) }
const revoke = (url) => { if (url) URL.revokeObjectURL(url) }
const formatName = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[mime] || 'bin'

const compress = (file = selectedFile) => {
  if (!file) return
  const maxBytes = Number(page.dataset.maxBytes)
  if (file.size > maxBytes) { setStatus('图片超过 16 MB 限制。', true); return }
  selectedFile = file
  revoke(beforeUrl); beforeUrl = URL.createObjectURL(file); before.src = beforeUrl; before.hidden = false
  compressButton.disabled = true; download.disabled = true; setStatus('处理中…')
  const mimeType = format.value === 'auto' ? undefined : format.value
  new Compressor(file, {
    quality: Number(quality.value),
    mimeType,
    maxWidth: Math.min(8192, Math.max(320, Number(maxWidth.value) || 2400)),
    maxHeight: 8192,
    checkOrientation: true,
    success(blob) {
      resultFile = blob
      revoke(afterUrl); afterUrl = URL.createObjectURL(blob); after.src = afterUrl; after.hidden = false
      const ratio = file.size ? Math.round((1 - blob.size / file.size) * 100) : 0
      setStatus(`完成：${(file.size / 1024).toFixed(0)} KB → ${(blob.size / 1024).toFixed(0)} KB，${ratio >= 0 ? `减少 ${ratio}%` : '结果更大'}。`)
      compressButton.disabled = false
      download.disabled = false
    },
    error(error) { compressButton.disabled = false; setStatus(`处理失败：${error.message}`, true) }
  })
}

quality.addEventListener('input', () => { qualityValue.value = quality.value; qualityValue.textContent = quality.value })
const selectFile = (file) => {
  if (!file) return
  const maxBytes = Number(page.dataset.maxBytes)
  if (file.size > maxBytes) { setStatus('图片超过 16 MB 限制。', true); return }
  selectedFile = file
  resultFile = undefined
  revoke(beforeUrl); revoke(afterUrl)
  beforeUrl = URL.createObjectURL(file); afterUrl = undefined
  before.src = beforeUrl; before.hidden = false; after.hidden = true
  compressButton.disabled = false; download.disabled = true
  setStatus(`已选择 ${file.name}，点击“开始压缩”。`)
}
fileInput.addEventListener('change', (event) => selectFile(event.target.files[0]))
zone.addEventListener('click', () => fileInput.click())
zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.dataset.active = 'true' })
zone.addEventListener('dragleave', () => delete zone.dataset.active)
zone.addEventListener('drop', (event) => { event.preventDefault(); delete zone.dataset.active; selectFile(event.dataTransfer.files[0]) })
zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click() } })
compressButton.addEventListener('click', () => compress())
download.addEventListener('click', () => {
  if (!resultFile || !selectedFile) return
  const url = URL.createObjectURL(resultFile)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedFile.name.replace(/\.[^.]+$/, '')}-compressed.${formatName(resultFile.type)}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
})
document.querySelector('#image-reset').addEventListener('click', () => {
  selectedFile = undefined; resultFile = undefined; revoke(beforeUrl); revoke(afterUrl); beforeUrl = undefined; afterUrl = undefined
  before.hidden = true; after.hidden = true; compressButton.disabled = true; download.disabled = true; fileInput.value = ''; setStatus('已清空。')
})
