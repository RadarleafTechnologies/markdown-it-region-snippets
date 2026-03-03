// File-include support — resolve @/path references to file content.

import { readFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { findRegion, dedent } from './extractor.js'
import { langFromExtension } from './lang-map.js'

export interface ParsedFileRef {
  filePath: string
  region: string | null
  highlights: string | null
  lang: string | null
  attrs: string | null
  title: string | null
}

export interface FileIncludeResult {
  code: string
  lang: string
  file: string
  startLine: number
  endLine: number
  highlights: string | null
  attrs: string | null
  title: string | null
}

/**
 * Check if a captured value is a file reference (starts with @).
 */
export function isFileRef(value: string): boolean {
  return value.startsWith('@')
}

/**
 * Parse a file reference string into components.
 *
 * VitePress-compatible syntax:
 *   @/path/to/file.cs
 *   @/path/to/file.cs#region_name
 *   @/path/to/file.cs {c#}
 *   @/path/to/file.cs#region_name{1,3,5-8}
 *   @/path/to/file.cs {1,3,5-8 c# :line-numbers} [Title]
 *   @./relative/file.cs
 */
export function parseFileRef(ref: string): ParsedFileRef {
  // Strip leading @
  let rest = ref.slice(1)

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

  // 2. Strip {…} block from end (may be space-separated OR adjacent to #region)
  const braceMatch = rest.match(/\s*\{([^}]*)\}\s*$/)
  if (braceMatch) {
    rest = rest.slice(0, braceMatch.index)
    const inner = braceMatch[1].trim()

    if (inner) {
      // 3. Classify tokens inside {…}
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

  // 4. Extract #region suffix if present
  let region: string | null = null
  const hashIdx = rest.indexOf('#')
  if (hashIdx !== -1) {
    region = rest.slice(hashIdx + 1)
    rest = rest.slice(0, hashIdx)
  }

  const filePath = rest

  return { filePath, region, highlights, lang, attrs, title }
}

/**
 * Read a file and extract the requested content.
 */
export function resolveFileInclude(
  rootDir: string,
  mdFilePath: string | null,
  parsed: ParsedFileRef,
  langMap: Record<string, string>,
): FileIncludeResult {
  const { filePath, region, highlights, lang: langOverride, attrs, title } = parsed

  // Resolve the absolute file path
  let absPath: string
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    // Relative to the current markdown file
    if (!mdFilePath) {
      throw new Error(`markdown-it-region-snippets: relative file path '${filePath}' requires md file context`)
    }
    absPath = resolve(dirname(mdFilePath), filePath)
  } else {
    // Relative to rootDir (leading / is conventional but stripped)
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath
    absPath = resolve(rootDir, cleanPath)
  }

  // Read the file
  let content: string
  try {
    content = readFileSync(absPath, 'utf-8')
  } catch (err) {
    throw new Error(`markdown-it-region-snippets: cannot read file '${absPath}': ${(err as Error).message}`)
  }

  let lines = content.split('\n')
  let resultStartLine = 1
  let resultEndLine = lines.length

  // Extract region if specified
  if (region) {
    const found = findRegion(lines, region)
    if (!found) {
      throw new Error(`markdown-it-region-snippets: region '${region}' not found in '${absPath}'`)
    }

    // Extract lines between region start and end (exclusive of markers)
    const regionLines = lines
      .slice(found.start, found.end)
      .filter(l => !(found.re.start.test(l) || found.re.end.test(l)))

    resultStartLine = found.start + 1 // 1-indexed
    resultEndLine = found.end // 1-indexed (end marker line)
    lines = regionLines
  }

  // Dedent and trim trailing whitespace
  const code = dedent(lines.join('\n')).replace(/\s+$/, '')

  // Determine language
  const ext = extname(absPath)
  const lang = langOverride ?? langFromExtension(ext, langMap)

  // Compute relative file path for source links
  const relFile = absPath.startsWith(rootDir)
    ? absPath.slice(rootDir.length).replace(/^\//, '')
    : filePath

  return { code, lang, file: relFile, startLine: resultStartLine, endLine: resultEndLine, highlights, attrs, title }
}
