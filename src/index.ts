// markdown-it-region-snippets
// A markdown-it plugin that extracts #region code snippets from source files
// and expands `snippet: name` markers in markdown into fenced code blocks.

import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import { loadSnippets, DEFAULT_SKIP_DIRS, DEFAULT_EXTENSIONS } from './lib/scanner.js'
import { buildLangMap, langFromExtension, DEFAULT_LANG_MAP } from './lib/lang-map.js'
import { MARKERS, dedent, findRegion, extractSnippetsFromFile } from './lib/extractor.js'
import { resolveSyntax, SYNTAX_PRESETS, DEFAULT_SYNTAX } from './lib/syntax.js'
import { isFileRef, parseFileRef, resolveFileInclude } from './lib/file-include.js'

export interface RegionSnippetOptions {
  /** Absolute path to project root (required). */
  rootDir: string
  /** Directories to scan, relative to rootDir (default: ['.']). */
  dirs?: string[]
  /** File extensions to scan, with leading dot (default: common set). */
  extensions?: string[]
  /** Region name filter — only extract regions whose name matches (default: null = all). */
  include?: RegExp | null
  /** Path substrings to skip when scanning. */
  exclude?: string[]
  /** Additional directory names to skip (merged with defaults). */
  skipDirs?: string[]
  /** Source link URL prefix. Empty string disables source links. */
  urlPrefix?: string
  /** Override extension→language mappings for fenced code blocks. */
  langMap?: Record<string, string>
  /** Enable @/path file includes (default: true). Set to false to let VitePress handle <<< @/path natively. */
  fileIncludes?: boolean
  /** Emit `<a id='...'>` anchor before each code block (default: true). Requires `urlPrefix` to be set. */
  anchor?: boolean
  /** Emit `<sup>` source link after each code block (default: true). Requires `urlPrefix` to be set. */
  sourceLink?: boolean
  /**
   * Marker syntax. Accepts:
   * - A preset name: `'snippet-colon'` (default), `'triple-chevron'`, `'at-snippet'`
   * - A marker keyword string (e.g. `'code'`) → builds `code: name` pattern
   * - A RegExp with one capture group for the snippet name
   */
  syntax?: string | RegExp
  /** Console log prefix (default: '[region-snippets]'). */
  logPrefix?: string
  /** Suppress console output (default: false). */
  silent?: boolean
  /** Throw on missing snippets/files (default: true). When false, emit a warning fence instead of throwing. */
  strict?: boolean
}

/**
 * markdown-it plugin that expands `snippet: name` markers into fenced
 * code blocks by extracting #region blocks from source files.
 */
export function regionSnippetPlugin(md: MarkdownIt, options: RegionSnippetOptions): void {
  const {
    rootDir,
    dirs = ['.'],
    extensions,
    include = null,
    exclude = [],
    skipDirs: extraSkipDirs,
    urlPrefix = '',
    langMap: langMapOverrides,
    syntax,
    fileIncludes: fileIncludesEnabled = true,
    anchor: anchorEnabled = true,
    sourceLink: sourceLinkEnabled = true,
    logPrefix = '[region-snippets]',
    silent = false,
    strict = true,
  } = options

  if (!rootDir) {
    throw new Error('markdown-it-region-snippets: rootDir option is required')
  }

  // Build extension set
  let extSet = DEFAULT_EXTENSIONS
  if (extensions) {
    extSet = new Set(extensions.map(e => e.startsWith('.') ? e : `.${e}`))
  }

  // Build skip dirs set
  let skipSet = DEFAULT_SKIP_DIRS
  if (extraSkipDirs) {
    skipSet = new Set([...DEFAULT_SKIP_DIRS, ...extraSkipDirs])
  }

  // Build language map
  const langMap = buildLangMap(langMapOverrides)

  // Resolve syntax pattern
  const { pattern: markerRegex, firstCharCode } = resolveSyntax(syntax)

  // Load all snippets
  const snippets = loadSnippets({
    rootDir,
    dirs,
    extensions: extSet,
    skipDirs: skipSet,
    exclude,
    include,
  })

  if (!silent) {
    console.log(`${logPrefix} Loaded ${snippets.size} snippets`)
  }

  const parser = (state: StateBlock, startLine: number, _endLine: number, silent: boolean): boolean => {
    const pos = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]

    // Indented 4+ spaces → code block, not ours
    if (state.sCount[startLine] - state.blkIndent >= 4) return false

    // Quick bail: first character must match marker (skip if unknown)
    if (firstCharCode > 0 && state.src.charCodeAt(pos) !== firstCharCode) return false

    const line = state.src.slice(pos, max).trim()
    const match = line.match(markerRegex)
    if (!match) return false

    const value = match[1].trim()

    if (isFileRef(value)) {
      if (!fileIncludesEnabled) return false
      // ── File include mode ──
      if (silent) return true

      const parsed = parseFileRef(value)
      const mdFilePath: string | null = (state.env as Record<string, unknown>)?.path as string ?? null

      let result
      try {
        result = resolveFileInclude(rootDir, mdFilePath, parsed, langMap)
      } catch (err) {
        if (strict) throw err
        if (!silent) console.warn(`${logPrefix} ${(err as Error).message}`)
        state.line = startLine + 1
        const token = state.push('fence', 'code', 0)
        token.info = ''
        token.content = `\u26A0 ${(err as Error).message}\n`
        token.markup = '```'
        token.map = [startLine, startLine + 1]
        return true
      }

      state.line = startLine + 1

      if (urlPrefix && anchorEnabled) {
        const anchor = state.push('html_block', '', 0)
        anchor.content = `<a id='snippet-file-${encodeURIComponent(parsed.filePath)}'></a>\n`
        anchor.map = [startLine, startLine + 1]
      }

      const token = state.push('fence', 'code', 0)
      // Build VitePress-compatible fence info: lang{highlights}[Title]  :attrs
      let info = result.lang
      if (result.highlights) info += `{${result.highlights}}`
      if (result.title) info += `[${result.title}]`
      if (result.attrs) info += `  ${result.attrs}`
      token.info = info
      token.content = result.code + '\n'
      token.markup = '```'
      token.map = [startLine, startLine + 1]

      if (urlPrefix && sourceLinkEnabled) {
        const link = state.push('html_block', '', 0)
        link.content = `<sup><a href='${urlPrefix}/${result.file}#L${result.startLine}-L${result.endLine}' title='Snippet source file'>snippet source</a> | <a href='#snippet-file-${encodeURIComponent(parsed.filePath)}' title='Start of snippet'>anchor</a></sup>\n`
        link.map = [startLine, startLine + 1]
      }

      return true
    }

    // ── Named snippet mode (existing) ──
    const name = value

    // If include filter is set and the name doesn't match, skip.
    if (include && !include.test(name)) return false
    if (silent) return true

    const snippet = snippets.get(name)
    if (snippet == null) {
      const msg = `${logPrefix} Missing snippet '${name}' in ${(state.env as Record<string, unknown>)?.path ?? 'unknown file'}`
      if (strict) throw new Error(msg)
      if (!silent) console.warn(msg)
      state.line = startLine + 1
      const token = state.push('fence', 'code', 0)
      token.info = ''
      token.content = `\u26A0 Snippet not found: ${name}\n`
      token.markup = '```'
      token.map = [startLine, startLine + 1]
      return true
    }

    state.line = startLine + 1

    // Determine fence language from the file extension
    const lang = langFromExtension(snippet.ext, langMap)

    if (urlPrefix && anchorEnabled) {
      const anchor = state.push('html_block', '', 0)
      anchor.content = `<a id='snippet-${name}'></a>\n`
      anchor.map = [startLine, startLine + 1]
    }

    const token = state.push('fence', 'code', 0)
    token.info = lang
    token.content = snippet.code + '\n'
    token.markup = '```'
    token.map = [startLine, startLine + 1]

    if (urlPrefix && sourceLinkEnabled) {
      const link = state.push('html_block', '', 0)
      link.content = `<sup><a href='${urlPrefix}/${snippet.file}#L${snippet.startLine}-L${snippet.endLine}' title='Snippet source file'>snippet source</a> | <a href='#snippet-${name}' title='Start of snippet'>anchor</a></sup>\n`
      link.map = [startLine, startLine + 1]
    }

    return true
  }

  // Register before 'fence' so our rule runs first.
  md.block.ruler.before('fence', 'region_snippet', parser)
}

// Default export
export default regionSnippetPlugin

// Re-export utilities for advanced use
export { MARKERS, dedent, findRegion, extractSnippetsFromFile } from './lib/extractor.js'
export type { MarkerPair, Region, FileSnippet } from './lib/extractor.js'
export { walkDir, loadSnippets, DEFAULT_SKIP_DIRS, DEFAULT_EXTENSIONS } from './lib/scanner.js'
export type { Snippet } from './lib/scanner.js'
export { DEFAULT_LANG_MAP, buildLangMap, langFromExtension } from './lib/lang-map.js'
export { resolveSyntax, SYNTAX_PRESETS, DEFAULT_SYNTAX } from './lib/syntax.js'
export type { SyntaxDef } from './lib/syntax.js'
export { isFileRef, parseFileRef, resolveFileInclude } from './lib/file-include.js'
export type { ParsedFileRef, FileIncludeResult } from './lib/file-include.js'
