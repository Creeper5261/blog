import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { diffLatexBlocks, extractLatexMetadata, splitLatexBlocks } from '../src/lib/latex-instant.mjs'
import { latexFontSizeClass, parseLatexTable, splitHtmlDetails } from '../src/lib/latex-compat.mjs'
import { buildToolManifestPayload } from '../tools/capabilities/manifests.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

const sample = String.raw`\documentclass{article}
\title{Instant LaTeX}
\author{DAT}
\begin{document}
\maketitle

\section{Introduction}
One paragraph with $E=mc^2$.

\begin{itemize}
  \item First
  \item Second
\end{itemize}
\end{document}`

test('instant LaTeX splitter keeps structural blocks and source lines', () => {
  const blocks = splitLatexBlocks(sample)
  assert.deepEqual(blocks.map((block) => block.source.split('\n')[0]), [
    '\\maketitle',
    '\\section{Introduction}',
    'One paragraph with $E=mc^2$.',
    '\\begin{itemize}',
  ])
  assert.equal(blocks[0].startLine, 5)
  assert.equal(blocks[3].source.includes('\\item Second'), true)
  assert.deepEqual(extractLatexMetadata(sample), { title: 'Instant LaTeX', author: 'DAT', date: '' })
})

test('editing one paragraph preserves stable IDs for every other block', () => {
  const previous = splitLatexBlocks(sample)
  const next = splitLatexBlocks(sample.replace('One paragraph', 'Changed paragraph'))
  assert.deepEqual(diffLatexBlocks(previous, next), { reused: 3, rendered: 1, removed: 1 })
})

test('metadata strips common visual macros without losing title text', () => {
  const metadata = extractLatexMetadata(String.raw`\title{\Huge RMSNorm\\[.35em]\Large Transformer 中的特征尺度控制}
\author{\textbf{DAT}}`)
  assert.equal(metadata.title, 'RMSNorm Transformer 中的特征尺度控制')
  assert.equal(metadata.author, 'DAT')
})

test('compatibility helpers preserve collapsible blocks and booktabs rows', () => {
  const segments = splitHtmlDetails('前言\n<details open><summary>注释 $x$</summary>正文</details>\n结尾')
  assert.deepEqual(segments.map((item) => item.type), ['latex', 'details', 'latex'])
  assert.equal(segments[1].open, true)
  assert.equal(segments[1].summary, '注释 $x$')
  const unfinished = splitHtmlDetails('<details><summary>还在输入</summary>正文')
  assert.deepEqual(unfinished, [{ type: 'details', open: false, summary: '还在输入', source: '正文' }])
  const nested = splitHtmlDetails('<details><summary>外层</summary><details><summary>内层</summary>正文</details></details>')
  assert.equal(nested.length, 1)
  assert.equal(nested[0].source.includes('<details>'), true)

  const table = parseLatexTable(String.raw`\toprule
方法 & 输出 \\
\midrule
RMSNorm & $0.913$ \\
\bottomrule`)
  assert.equal(table.hasBooktabs, true)
  assert.deepEqual(table.rows, [
    { cells: ['方法', '输出'], header: true },
    { cells: ['RMSNorm', '$0.913$'], header: false },
  ])
  assert.equal(parseLatexTable('左 & 右 \\\n下 & 上').rows.length, 2)
  assert.equal(latexFontSizeClass('Huge'), 'latex-size-huge-1')
})

test('LaTeX splitter keeps details bodies together across blank lines', () => {
  const source = `前言

<details open>
<summary>展开说明</summary>

第一段正文。

第二段正文。
</details>

结尾`
  const blocks = splitLatexBlocks(source)

  assert.deepEqual(blocks.map((block) => block.source.split('\n')[0]), ['前言', '<details open>', '结尾'])
  assert.match(blocks[1].source, /第一段正文。/)
  assert.match(blocks[1].source, /第二段正文。/)
  assert.equal(splitHtmlDetails(blocks[1].source)[0].source.includes('第二段正文。'), true)
})

test('large documents only invalidate the edited paragraph', () => {
  const paragraphs = Array.from({ length: 2_000 }, (_, index) => `Paragraph ${index} with $x_${index}$.`).join('\n\n')
  const previous = splitLatexBlocks(paragraphs)
  const next = splitLatexBlocks(paragraphs.replace('Paragraph 1000 ', 'Paragraph 1000 changed '))
  const diff = diffLatexBlocks(previous, next)
  assert.equal(previous.length, 2_000)
  assert.deepEqual(diff, { reused: 1_999, rendered: 1, removed: 1 })
})

test('LaTeX tool exposes an incremental local preview instead of a compile action', async () => {
  const manifest = buildToolManifestPayload().tools.find((entry) => entry.id === 'tool.latex-instant')
  assert.equal(manifest.route, '/tools/latex/')
  assert.equal(manifest.privacy.mode, 'local-only')
  assert.equal(manifest.runtime.shell, 'incremental-latex-html')

  const page = await readFile(path.join(repositoryRoot, 'src', 'pages', 'tools', 'latex', 'index.astro'), 'utf8')
  const script = await readFile(path.join(repositoryRoot, 'src', 'scripts', 'tools-latex.js'), 'utf8')
  const styles = await readFile(path.join(repositoryRoot, 'source', 'css', 'tools-native.css'), 'utf8')
  assert.match(page, /comments=\{false\}/)
  assert.match(page, /layoutClass="latex-tool-layout"/)
  assert.match(page, /即时预览/)
  assert.match(page, /id="latex-resize-handle"/)
  assert.match(page, /id="latex-export-pdf"/)
  assert.match(page, /data-reference-group=\{group\.id\}/)
  assert.match(page, /id="latex-reference-collapse"/)
  assert.match(page, /id="latex-reference-expand"/)
  assert.match(page, /id="latex-reference-resize"/)
  assert.match(page, />原始排版</)
  assert.match(page, />博客预览</)
  assert.doesNotMatch(page, />\s*编译\s*</)
  assert.match(script, /splitLatexBlocks/)
  assert.match(script, /diffLatexBlocks/)
  assert.match(script, /StreamLanguage\.define\(stex\)/)
  assert.match(script, /autocompletion\(\{ override: \[latexCompletionSource\]/)
  assert.match(script, /snippetCompletion\('\\\\begin\{equation\}/)
  assert.match(script, /closeBrackets\(\{ brackets:/)
  assert.match(script, /completeBeginEnvironment/)
  assert.match(script, /insertMathPair/)
  assert.match(script, /katex\.renderToString/)
  assert.match(script, /更新 \$\{diff\.rendered\} 块/)
  assert.match(script, /setPointerCapture/)
  assert.match(script, /window\.innerWidth \* \.78/)
  assert.match(script, /window\.innerWidth \* \.46/)
  assert.match(script, /manualState = true/)
  assert.match(script, /window\.addEventListener\('scroll', scheduleAutomaticState/)
  assert.match(script, /--latex-source-width/)
  assert.match(script, /import\('html-to-image'\)/)
  assert.match(script, /import\('jspdf'\)/)
  assert.match(script, /pdf\.save/)
  assert.match(script, /setupReferenceDrawer/)
  assert.match(script, /referenceResize\.setPointerCapture/)
  assert.match(script, /splitHtmlDetails/)
  assert.match(script, /parseLatexTable/)
  assert.match(script, /preview\.addEventListener\('scroll'/)
  assert.match(script, /lstlisting/)
  assert.match(script, /latex-command-fallback/)
  assert.match(styles, /\.latex-tool-layout[\s\S]*?#aside-content[\s\S]*?display: none/)
  assert.match(styles, /\.latex-reference-panel/)
  assert.match(styles, /\.latex-reference-panel\[data-open="false"\]/)
  assert.match(styles, /\.latex-reference-toggle\.is-expand/)
  assert.match(styles, /white-space: pre;/)
  assert.match(styles, /\.latex-pdf-stage\.is-plain/)
  assert.match(styles, /\.latex-details/)
  assert.match(styles, /\.latex-code-block/)
  assert.match(styles, /\.latex-table-booktabs/)
})
