// Extension-to-language mapping for fenced code blocks.

export const DEFAULT_LANG_MAP: Record<string, string> = {
  // .NET / C#
  '.cs': 'csharp',
  '.csx': 'csharp',
  '.fs': 'fsharp',
  '.fsx': 'fsharp',
  '.vb': 'vb',

  // JVM
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',
  '.gradle': 'groovy',

  // JavaScript / TypeScript
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',

  // Systems
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.swift': 'swift',
  '.zig': 'zig',

  // Scripting
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.lua': 'lua',
  '.pl': 'perl',
  '.r': 'r',
  '.R': 'r',
  '.ex': 'elixir',
  '.exs': 'elixir',

  // Shell
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.bat': 'batch',
  '.cmd': 'batch',

  // Data / Config
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',

  // Markup
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.tex': 'latex',
  '.rst': 'rst',

  // Other
  '.dockerfile': 'dockerfile',
  '.tf': 'hcl',
  '.hcl': 'hcl',
  '.dart': 'dart',
  '.nim': 'nim',
}

/**
 * Build a merged lang map from defaults and user overrides.
 */
export function buildLangMap(overrides?: Record<string, string>): Record<string, string> {
  if (!overrides) return DEFAULT_LANG_MAP
  return { ...DEFAULT_LANG_MAP, ...overrides }
}

/**
 * Look up the fence language for a file extension.
 */
export function langFromExtension(ext: string, langMap: Record<string, string>): string {
  return langMap[ext] ?? ''
}
