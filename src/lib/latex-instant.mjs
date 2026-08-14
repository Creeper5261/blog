const SECTION_PATTERN = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/
const STANDALONE_PATTERN = /^\s*\\(maketitle|tableofcontents|bibliography|printbibliography)\b/
const BEGIN_PATTERN = /\\begin\s*\{([^}]+)\}/g
const END_PATTERN = /\\end\s*\{([^}]+)\}/g
const DETAILS_TAG_PATTERN = /<\/?details\b[^>]*>/gi
const VERBATIM_ENVIRONMENTS = new Set(['verbatim', 'Verbatim', 'lstlisting', 'minted'])

export function hashLatexBlock(value) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  return (hash >>> 0).toString(36)
}

export function extractLatexMetadata(source) {
  const read = (name) => {
    const start = source.search(new RegExp(`\\\\${name}\\s*\\{`))
    if (start < 0) return ''
    const brace = source.indexOf('{', start)
    let depth = 0
    for (let index = brace; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      if (source[index] === '}') depth -= 1
      if (depth === 0) return plainLatexText(source.slice(brace + 1, index))
    }
    return ''
  }
  return { title: read('title'), author: read('author'), date: read('date') }
}

export function plainLatexText(value) {
  let text = String(value)
  let previous = ''
  while (text !== previous) {
    previous = text
    text = text.replace(/\\(?:textbf|textit|textrm|textsf|texttt|emph|underline|mathrm|mathbf|mathit)\s*\{([^{}]*)\}/g, '$1')
  }
  return text
    .replace(/\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/g, '')
    .replace(/\\{1,2}(?:\[[^\]]*\])?/g, ' ')
    .replace(/\\today\b/g, '__DAT_TODAY__')
    .replace(/\\[A-Za-z@]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace('__DAT_TODAY__', '\\today')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractLatexBody(source) {
  const begin = /\\begin\s*\{document\}/.exec(source)
  if (!begin) return { body: source, startLine: 1 }
  const start = begin.index + begin[0].length
  const endMatch = [...source.matchAll(/\\end\s*\{document\}/g)].at(-1)
  const end = endMatch && endMatch.index > start ? endMatch.index : source.length
  const rawBody = source.slice(start, end)
  const leadingBreak = /^\s*\n/.exec(rawBody)
  return {
    body: leadingBreak ? rawBody.slice(leadingBreak[0].length) : rawBody,
    startLine: source.slice(0, start).split('\n').length + (leadingBreak?.[0].match(/\n/g)?.length || 0),
  }
}

function environmentDelta(line, stack) {
  for (const match of line.matchAll(BEGIN_PATTERN)) {
    if (match[1] !== 'document') stack.push(match[1])
  }
  for (const match of line.matchAll(END_PATTERN)) {
    if (match[1] === 'document') continue
    const index = stack.lastIndexOf(match[1])
    if (index >= 0) stack.splice(index, 1)
  }
}

function detailsDelta(line, depth) {
  for (const match of line.matchAll(DETAILS_TAG_PATTERN)) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth < 0) depth = 0
  }
  return depth
}

function isVerbatimEnvironment(stack) {
  return stack.some((environment) => VERBATIM_ENVIRONMENTS.has(environment))
}

export function splitLatexBlocks(source) {
  const { body, startLine } = extractLatexBody(source)
  const lines = body.split('\n')
  const rawBlocks = []
  let pending = []
  let pendingStart = startLine
  let environmentStack = []
  let detailsDepth = 0

  const flush = () => {
    const raw = pending.join('\n').trimEnd()
    if (raw.trim()) rawBlocks.push({ source: raw, startLine: pendingStart, endLine: pendingStart + pending.length - 1 })
    pending = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = startLine + index
    const topLevel = environmentStack.length === 0 && detailsDepth === 0
    const startsStructure = topLevel && (SECTION_PATTERN.test(line) || STANDALONE_PATTERN.test(line))
    const startsEnvironment = topLevel && /\\begin\s*\{(?!document\})[^}]+\}/.test(line)

    if (!pending.length) pendingStart = lineNumber
    if (startsStructure) {
      flush()
      rawBlocks.push({ source: line.trimEnd(), startLine: lineNumber, endLine: lineNumber })
      continue
    }
    if (startsEnvironment) flush()
    if (!pending.length) pendingStart = lineNumber
    pending.push(line)
    const insideVerbatim = isVerbatimEnvironment(environmentStack)
    environmentDelta(line, environmentStack)
    if (!insideVerbatim) detailsDepth = detailsDelta(line, detailsDepth)

    if (environmentStack.length === 0 && detailsDepth === 0 && (startsEnvironment || !line.trim())) flush()
  }
  flush()

  const occurrences = new Map()
  return rawBlocks.map((block) => {
    const hash = hashLatexBlock(block.source)
    const ordinal = occurrences.get(hash) || 0
    occurrences.set(hash, ordinal + 1)
    return { ...block, id: `${hash}-${ordinal}` }
  })
}

export function diffLatexBlocks(previous, next) {
  const previousIds = new Set(previous.map((block) => block.id))
  const nextIds = new Set(next.map((block) => block.id))
  return {
    reused: next.filter((block) => previousIds.has(block.id)).length,
    rendered: next.filter((block) => !previousIds.has(block.id)).length,
    removed: previous.filter((block) => !nextIds.has(block.id)).length,
  }
}
