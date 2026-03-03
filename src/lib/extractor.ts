// Region extraction from source files.
// Handles nesting, multiple comment styles, and dedenting.

export interface MarkerPair {
  start: RegExp
  end: RegExp
}

export interface Region {
  re: MarkerPair
  start: number
  end: number
}

export interface FileSnippet {
  code: string
  startLine: number
  endLine: number
}

/**
 * Marker pairs for different comment styles.
 * Each pair detects a region start and its matching end.
 */
export const MARKERS: MarkerPair[] = [
  { // C#: #region name / #endregion
    start: /^\s*#region\s+(.*?)\s*$/,
    end: /^\s*#endregion\b\s*(.*?)\s*$/
  },
  { // JS/TS/Java/Go/Rust: // #region name / // #endregion
    start: /^\s*\/\/\s*#?region\b\s*(.*?)\s*$/,
    end: /^\s*\/\/\s*#?endregion\b\s*(.*?)\s*$/
  },
  { // HTML/XML: <!-- #region name --> / <!-- #endregion -->
    start: /^\s*<!--\s*#?region\b\s*(.*?)\s*-->/,
    end: /^\s*<!--\s*#?endregion\b\s*(.*?)\s*-->/
  },
  { // CSS/C: /* #region name */ / /* #endregion */
    start: /^\s*\/\*\s*#region\b\s*(.*?)\s*\*\//,
    end: /^\s*\/\*\s*#endregion\b\s*(.*?)\s*\*\//
  },
  { // Python/Ruby/Shell: # region name / # endregion
    start: /^\s*#\s*region\b\s+(.*?)\s*$/,
    end: /^\s*#\s*endregion\b\s*(.*?)\s*$/
  }
]

/**
 * Remove common leading whitespace from all lines (adapted from VitePress).
 */
export function dedent(text: string): string {
  const lines = text.split('\n')
  const minIndent = lines.reduce((acc, line) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== ' ' && line[i] !== '\t') return Math.min(i, acc)
    }
    return acc
  }, Infinity)
  if (minIndent < Infinity) {
    return lines.map(x => x.slice(minIndent)).join('\n')
  }
  return text
}

/**
 * Find a named region in an array of lines. Handles nesting.
 */
export function findRegion(lines: string[], regionName: string): Region | null {
  let chosen: { re: MarkerPair; start: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    for (const re of MARKERS) {
      if (re.start.exec(lines[i])?.[1] === regionName) {
        chosen = { re, start: i + 1 }
        break
      }
    }
    if (chosen) break
  }
  if (!chosen) return null

  // Track nesting depth — increment on any start marker for the same
  // marker pair, decrement on any end marker. Handles C# #endregion
  // which never carries a name.
  let depth = 1
  for (let i = chosen.start; i < lines.length; i++) {
    if (chosen.re.start.test(lines[i])) {
      depth++
      continue
    }
    if (chosen.re.end.test(lines[i])) {
      if (--depth === 0) return { ...chosen, end: i }
    }
  }

  return null
}

/**
 * Extract all matching region snippets from file content.
 */
export function extractSnippetsFromFile(content: string, includeFilter?: RegExp | null): Map<string, FileSnippet> {
  const snippets = new Map<string, FileSnippet>()
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    let snippetName: string | null = null
    for (const re of MARKERS) {
      const m = re.start.exec(lines[i])
      if (m && m[1]) {
        const name = m[1]
        if (!includeFilter || includeFilter.test(name)) {
          snippetName = name
        }
        break
      }
    }
    if (!snippetName) continue

    const region = findRegion(lines, snippetName)
    if (!region) continue

    const code = dedent(
      lines
        .slice(region.start, region.end)
        .filter(l => !(region.re.start.test(l) || region.re.end.test(l)))
        .join('\n')
    ).replace(/\s+$/, '')

    snippets.set(snippetName, { code, startLine: i + 1, endLine: region.end + 1 })
  }

  return snippets
}
