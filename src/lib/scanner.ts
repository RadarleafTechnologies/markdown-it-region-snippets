// Directory scanning and snippet loading.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, extname } from 'node:path'
import { extractSnippetsFromFile } from './extractor.js'

export interface Snippet {
  code: string
  file: string
  ext: string
  startLine: number
  endLine: number
}

/** Default directory names to skip when walking. */
export const DEFAULT_SKIP_DIRS: Set<string> = new Set([
  'node_modules', 'bin', 'obj', '.git', '.hg', '.svn',
  'dist', 'build', 'out', 'target',
  '.claude', '.cursor', '.copilot', '.vscode', '.idea',
  '__pycache__', '.tox', '.mypy_cache',
  'coverage', '.nyc_output',
])

/** Default file extensions to scan. */
export const DEFAULT_EXTENSIONS: Set<string> = new Set([
  // .NET
  '.cs', '.csx', '.fs', '.fsx', '.vb',
  // JVM
  '.java', '.kt', '.kts', '.scala', '.groovy',
  // JS/TS
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  // Systems
  '.rs', '.go', '.c', '.h', '.cpp', '.hpp', '.cc', '.swift', '.zig',
  // Scripting
  '.py', '.rb', '.php', '.lua', '.pl', '.ex', '.exs',
  // Shell
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
  // Data/Config
  '.json', '.yaml', '.yml', '.toml', '.xml', '.sql', '.graphql', '.gql',
  // Markup
  '.md', '.mdx',
  // Other
  '.tf', '.hcl', '.dart', '.nim',
])

/**
 * Recursively walk a directory, calling `callback` for each matching file.
 */
export function walkDir(
  dir: string,
  callback: (filePath: string) => void,
  extensions: Set<string>,
  skipDirs: Set<string>,
  exclude: string[],
): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue
      if (exclude.some(ex => fullPath.includes(ex))) continue
      walkDir(fullPath, callback, extensions, skipDirs, exclude)
    } else if (extensions.has(extname(entry.name))) {
      if (exclude.some(ex => fullPath.includes(ex))) continue
      callback(fullPath)
    }
  }
}

export interface LoadSnippetsOptions {
  rootDir: string
  dirs?: string[]
  extensions?: Set<string>
  skipDirs?: Set<string>
  exclude?: string[]
  include?: RegExp | null
}

/**
 * Scan directories and load all matching snippets.
 */
export function loadSnippets({
  rootDir,
  dirs = ['.'],
  extensions = DEFAULT_EXTENSIONS,
  skipDirs = DEFAULT_SKIP_DIRS,
  exclude = [],
  include = null,
}: LoadSnippetsOptions): Map<string, Snippet> {
  const snippets = new Map<string, Snippet>()

  for (const dir of dirs) {
    walkDir(resolve(rootDir, dir), filePath => {
      const content = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n')
      const file = relative(rootDir, filePath)
      const ext = extname(filePath)
      for (const [name, { code, startLine, endLine }] of extractSnippetsFromFile(content, include)) {
        snippets.set(name, { code, file, ext, startLine, endLine })
      }
    }, extensions, skipDirs, exclude)
  }

  return snippets
}
