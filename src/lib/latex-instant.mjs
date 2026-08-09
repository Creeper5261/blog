const SECTION_PATTERN = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/
const STANDALONE_PATTERN = /^\s*\\(maketitle|tableofcontents|bibliography|printbibliography)\b/
const BEGIN_PATTERN = /\\begin\s*\{([^}]+)\}/g
const END_PATTERN = /\\end\s*\{([^}]+)\}/g

export function hashLatexBlock(value) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  return (hash >>> 0).toString(36)
}

export function extractLatexMetadata(source) {
  const read = (name) => {
    const match = new RegExp(`\\\\${name}\\s*\\{([^}]*)\\}`).exec(source)
    return match?.[1]?.trim() || ''
  }
  return { title: read('title'), author: read('author'), date: read('date') }
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

export function splitLatexBlocks(source) {
  const { body, startLine } = extractLatexBody(source)
  const lines = body.split('\n')
  const rawBlocks = []
  let pending = []
  let pendingStart = startLine
  let environmentStack = []

  const flush = () => {
    const raw = pending.join('\n').trimEnd()
    if (raw.trim()) rawBlocks.push({ source: raw, startLine: pendingStart, endLine: pendingStart + pending.length - 1 })
    pending = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = startLine + index
    const startsStructure = environmentStack.length === 0 && (SECTION_PATTERN.test(line) || STANDALONE_PATTERN.test(line))
    const startsEnvironment = environmentStack.length === 0 && /\\begin\s*\{(?!document\})[^}]+\}/.test(line)

    if (!pending.length) pendingStart = lineNumber
    if (startsStructure) {
      flush()
      rawBlocks.push({ source: line.trimEnd(), startLine: lineNumber, endLine: lineNumber })
      continue
    }
    if (startsEnvironment) flush()
    if (!pending.length) pendingStart = lineNumber
    pending.push(line)
    environmentDelta(line, environmentStack)

    if (environmentStack.length === 0 && (startsEnvironment || !line.trim())) flush()
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
