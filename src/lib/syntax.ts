// Syntax presets and resolver for marker line matching.

export interface SyntaxDef {
  /** Regex with exactly one capture group for the snippet name. */
  pattern: RegExp
  /** Char code of the first character for quick bail (-1 if unknown). */
  firstCharCode: number
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Built-in syntax presets.
 *
 * Each preset value is a function that returns a SyntaxDef, to allow
 * lazy compilation and parameterization in the future.
 */
export const SYNTAX_PRESETS: Record<string, () => SyntaxDef> = {
  /** `snippet: name` or `snippet:name` — the default, mdsnippets-style. */
  'snippet-colon': () => ({
    pattern: /^snippet:\s*(.+)$/,
    firstCharCode: 0x73, // 's'
  }),

  /** `<<< #name` or `<<< @/path` — VitePress-compatible syntax. `#` is optional. */
  'triple-chevron': () => ({
    pattern: /^<<<\s+#?(.+)$/,
    firstCharCode: 0x3C, // '<'
  }),

  /** `@snippet name` — directive-style with @ prefix. */
  'at-snippet': () => ({
    pattern: /^@snippet\s+(.+)$/,
    firstCharCode: 0x40, // '@'
  }),
}

/** The default preset name. */
export const DEFAULT_SYNTAX = 'snippet-colon'

/**
 * Resolve a syntax option into a { pattern, firstCharCode } pair.
 */
export function resolveSyntax(syntax?: string | RegExp | null): SyntaxDef {
  // Default
  if (syntax == null) {
    return SYNTAX_PRESETS[DEFAULT_SYNTAX]()
  }

  // RegExp — custom escape hatch
  if (syntax instanceof RegExp) {
    const srcMatch = syntax.source.match(/^\^?([^\\.*+?^${}()|[\]])/)
    const firstCharCode = srcMatch ? srcMatch[1].charCodeAt(0) : -1
    return { pattern: syntax, firstCharCode }
  }

  // String — check if it's a preset name
  if (typeof syntax === 'string') {
    if (SYNTAX_PRESETS[syntax]) {
      return SYNTAX_PRESETS[syntax]()
    }

    // Treat as a marker keyword → `keyword: name`
    const escaped = escapeRegExp(syntax)
    return {
      pattern: new RegExp(`^${escaped}:\\s*(.+)$`),
      firstCharCode: syntax.charCodeAt(0),
    }
  }

  throw new Error(`markdown-it-region-snippets: invalid syntax option: ${syntax}`)
}
