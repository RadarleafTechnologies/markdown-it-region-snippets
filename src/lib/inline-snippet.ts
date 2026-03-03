// Inline snippet support — define snippet content directly in markdown
// using HTML comment markers.

export interface InlineSnippetOpen {
  name: string
  lang: string | null
  highlights: string | null
  attrs: string | null
  title: string | null
}

export interface DetectedFence {
  isFenced: boolean
  lang: string
  content: string
}

/**
 * Matches `<!-- snippet: name -->` with optional VitePress-compatible modifiers.
 *
 * Examples:
 *   <!-- snippet: my_func -->
 *   <!-- snippet: my_func {python} -->
 *   <!-- snippet: my_func {python 1,3,5-8 :line-numbers} [My Title] -->
 */
const INLINE_SNIPPET_OPEN = /^<!--\s*snippet:\s*(\S+)(.*?)-->$/

/**
 * Matches `<!-- /snippet -->` or `<!-- endSnippet -->`.
 */
const INLINE_SNIPPET_CLOSE = /^<!--\s*(?:\/snippet|endSnippet)\s*-->$/

/**
 * Parse modifiers from a string: `{lang highlights :attrs} [Title]`.
 * Returns the extracted components and the remaining string (before the modifiers).
 */
function parseModifiers(input: string): { rest: string; lang: string | null; highlights: string | null; attrs: string | null; title: string | null } {
  let rest = input
  let lang: string | null = null
  let highlights: string | null = null
  let attrs: string | null = null
  let title: string | null = null

  // 1. Strip [Title] from end
  const titleMatch = rest.match(/\s*\[([^\]]+)\]\s*$/)
  if (titleMatch) {
    title = titleMatch[1]
    rest = rest.slice(0, titleMatch.index)
  }

  // 2. Strip {…} block
  const braceMatch = rest.match(/\s*\{([^}]*)\}\s*$/)
  if (braceMatch) {
    rest = rest.slice(0, braceMatch.index)
    const inner = braceMatch[1].trim()

    if (inner) {
      const parts = inner.split(/\s+/)
      const highlightParts: string[] = []
      const attrParts: string[] = []

      for (const part of parts) {
        if (/^[\d,-]+$/.test(part)) {
          highlightParts.push(part)
        } else if (part.startsWith(':')) {
          attrParts.push(part)
        } else {
          lang = part
        }
      }

      if (highlightParts.length > 0) {
        highlights = highlightParts.join(',')
      }
      if (attrParts.length > 0) {
        attrs = attrParts.join(' ')
      }
    }
  }

  return { rest, lang, highlights, attrs, title }
}

/**
 * Parse an inline snippet opening marker (HTML comment form).
 * Returns parsed components or null if the line doesn't match.
 */
export function parseInlineSnippetOpen(line: string): InlineSnippetOpen | null {
  const trimmed = line.trim()
  const m = INLINE_SNIPPET_OPEN.exec(trimmed)
  if (!m) return null

  const name = m[1]
  if (!name) return null

  const { lang, highlights, attrs, title } = parseModifiers(m[2].trim())
  return { name, lang, highlights, attrs, title }
}

/**
 * Parse a marker value string into snippet name and optional modifiers.
 *
 * Accepts values like:
 *   `my_func`
 *   `my_func {python}`
 *   `my_func {python 1,3,5-8 :line-numbers} [My Title]`
 *
 * Returns parsed components or null if the value is empty.
 */
export function parseInlineValue(value: string): InlineSnippetOpen | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const { rest, lang, highlights, attrs, title } = parseModifiers(trimmed)

  const name = rest.trim()
  if (!name) return null

  return { name, lang, highlights, attrs, title }
}

/**
 * Check if a line is an inline snippet closing marker.
 */
export function isInlineSnippetClose(line: string): boolean {
  return INLINE_SNIPPET_CLOSE.test(line.trim())
}

/**
 * Detect if the content lines are wrapped in a fenced code block.
 *
 * If the first non-empty line starts with ``` or ~~~ and a matching closing
 * fence is found as the last non-empty line, returns the fence language and
 * the inner content. Otherwise returns the raw content.
 */
export function detectWrappedFence(lines: string[]): DetectedFence {
  // Find first and last non-empty lines
  let firstIdx = -1
  let lastIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      if (firstIdx === -1) firstIdx = i
      lastIdx = i
    }
  }

  if (firstIdx === -1 || firstIdx === lastIdx) {
    return { isFenced: false, lang: '', content: lines.join('\n') }
  }

  const firstLine = lines[firstIdx].trim()
  const lastLine = lines[lastIdx].trim()

  // Check for ``` or ~~~ opening fence
  const fenceMatch = firstLine.match(/^(`{3,}|~{3,})(.*)$/)
  if (!fenceMatch) {
    return { isFenced: false, lang: '', content: lines.join('\n') }
  }

  const fenceChar = fenceMatch[1][0]
  const fenceLen = fenceMatch[1].length
  const fenceLang = fenceMatch[2].trim()

  // Closing fence must use the same character and be at least as long
  const closePattern = new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLen},}$`)
  if (!closePattern.test(lastLine)) {
    return { isFenced: false, lang: '', content: lines.join('\n') }
  }

  // Extract inner content (between the fences)
  const inner = lines.slice(firstIdx + 1, lastIdx)
  return { isFenced: true, lang: fenceLang, content: inner.join('\n') }
}
