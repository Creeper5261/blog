const summaryPattern = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i

export function splitHtmlDetails(source) {
  const segments = []
  let cursor = 0
  const tags = /<\/?details\b[^>]*>/gi
  let match

  while ((match = tags.exec(source))) {
    if (match[0].startsWith('</')) continue
    const start = match.index
    const attributes = match[0]
    let depth = 1
    let bodyEnd = source.length
    let end = source.length
    let nested

    while ((nested = tags.exec(source))) {
      if (nested[0].startsWith('</')) depth -= 1
      else depth += 1
      if (depth === 0) {
        bodyEnd = nested.index
        end = nested.index + nested[0].length
        break
      }
    }

    if (start > cursor) segments.push({ type: 'latex', source: source.slice(cursor, start) })
    const body = source.slice(match.index + match[0].length, bodyEnd)
    const summary = summaryPattern.exec(body)
    segments.push({
      type: 'details',
      open: /\bopen\b/i.test(attributes),
      summary: summary?.[1]?.trim() || '展开内容',
      source: (summary ? body.slice(0, summary.index) + body.slice(summary.index + summary[0].length) : body).trim(),
    })
    cursor = end
    tags.lastIndex = end
  }

  if (cursor < source.length) segments.push({ type: 'latex', source: source.slice(cursor) })
  return segments.length ? segments : [{ type: 'latex', source }]
}

export function parseLatexTable(source) {
  const hasBooktabs = /\\(?:toprule|midrule|bottomrule)\b/.test(source)
  const rows = source
    .split(/\\\\(?:\[[^\]]*\])?|\\\s*\n/)
    .map((row) => row.replace(/\\(?:toprule|midrule|bottomrule|hline|cline)\b(?:\{[^}]*\})?/g, '').trim())
    .filter(Boolean)
    .map((row, index) => ({ cells: row.split('&').map((cell) => cell.trim()), header: hasBooktabs && index === 0 }))
  return { hasBooktabs, rows }
}

export function latexFontSizeClass(name) {
  return {
    tiny: 'latex-size-tiny',
    scriptsize: 'latex-size-scriptsize',
    footnotesize: 'latex-size-footnotesize',
    small: 'latex-size-small',
    normalsize: 'latex-size-normalsize',
    large: 'latex-size-large',
    Large: 'latex-size-large-1',
    LARGE: 'latex-size-large-2',
    huge: 'latex-size-huge',
    Huge: 'latex-size-huge-1',
  }[name] || ''
}

export function isSafeCssColor(value) {
  return /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|rgb\([^)]{1,32}\)|hsl\([^)]{1,32}\))$/i.test(value.trim())
}
