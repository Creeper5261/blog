import { PDFDocument } from 'pdf-lib'

export async function mergePdfBuffers(buffers) {
  const output = await PDFDocument.create()
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer)
    const pages = await output.copyPages(source, source.getPageIndices())
    pages.forEach((page) => output.addPage(page))
  }
  return output.save()
}
