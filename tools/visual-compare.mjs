import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pages = ['home', 'about', 'post', 'comments', '404']

async function fileSize(filePath) {
  try {
    return (await stat(filePath)).size
  } catch {
    return 0
  }
}

export async function summarizeVisualCaptures({
  captureDir = path.resolve('.local', 'visual-compare'),
  outputFile = path.resolve('.local', 'visual-compare', 'screenshot-report.json')
} = {}) {
  const rows = []

  for (const page of pages) {
    const hexo = path.join(captureDir, `${page}-hexo.png`)
    const astro = path.join(captureDir, `${page}-astro.png`)
    const hexoBytes = await fileSize(hexo)
    const astroBytes = await fileSize(astro)
    rows.push({
      page,
      hexo,
      astro,
      hexoBytes,
      astroBytes,
      byteRatio: hexoBytes && astroBytes ? Number((astroBytes / hexoBytes).toFixed(3)) : 0,
      status: hexoBytes && astroBytes ? 'captured' : 'missing'
    })
  }

  await writeFile(outputFile, JSON.stringify(rows, null, 2))
  return rows
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await summarizeVisualCaptures(), null, 2))
}
