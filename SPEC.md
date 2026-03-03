# markdown-it-region-snippets — Technical Specification

## 1. Overview

`markdown-it-region-snippets` is a [markdown-it](https://github.com/markdown-it/markdown-it) block-rule plugin that replaces marker lines in Markdown with fenced code blocks. It operates in two modes:

1. **Named snippet mode** — scans source directories at startup, extracts `#region`-delimited code blocks, and resolves `snippet: name` markers by name lookup.
2. **File include mode** — reads files on demand via `snippet: @/path` references, with optional region extraction and VitePress-compatible fence modifiers.

The plugin targets VitePress, VuePress, Docusaurus, and any markdown-it pipeline. It is a pure ES module with zero runtime dependencies (markdown-it is an optional peer dependency).

## 2. System Requirements

| Requirement | Value |
|-------------|-------|
| Node.js | >= 18.0.0 |
| Module system | ESM (`"type": "module"`) |
| markdown-it | >= 13.0.0 (optional peer) |

## 3. Architecture

```
index.mjs                  Plugin entry point & markdown-it block rule
├── lib/scanner.mjs        Directory walker & snippet loader
├── lib/extractor.mjs      Region detection, nesting, dedenting
├── lib/lang-map.mjs       File extension → fence language mapping
├── lib/syntax.mjs         Marker syntax presets & resolver
└── lib/file-include.mjs   File reference parser & resolver
```

### 3.1 Initialization Pipeline

```
regionSnippetPlugin(md, options)
  │
  ├─ Validate rootDir
  ├─ Build extension set (DEFAULT_EXTENSIONS or user-provided)
  ├─ Build skip dirs set (DEFAULT_SKIP_DIRS + user-provided)
  ├─ Build language map (DEFAULT_LANG_MAP + user overrides)
  ├─ Resolve syntax pattern (preset / keyword / RegExp)
  ├─ Scan directories → loadSnippets() → Map<name, Snippet>
  └─ Register block rule before 'fence'
```

### 3.2 Parse-Time Pipeline (per markdown line)

```
parser(state, startLine, endLine, silent)
  │
  ├─ Quick bail: indentation >= 4 → false (code block)
  ├─ Quick bail: first char doesn't match → false
  ├─ Match marker regex → extract captured value
  │
  ├─ if isFileRef(value):        ── File Include Mode ──
  │   ├─ if !fileIncludes → false (let downstream rules handle it)
  │   ├─ parseFileRef(value) → { filePath, region, highlights, lang, attrs, title }
  │   ├─ resolveFileInclude(rootDir, mdPath, parsed, langMap)
  │   │   ├─ Resolve absolute path (rootDir-relative or md-relative)
  │   │   ├─ Read file
  │   │   ├─ Extract region (if specified)
  │   │   ├─ Dedent & trim
  │   │   └─ Determine language (override or auto-detect)
  │   ├─ Emit optional anchor html_block
  │   ├─ Emit fence token (info = VitePress-format string)
  │   └─ Emit optional source link html_block
  │
  └─ else:                       ── Named Snippet Mode ──
      ├─ Check include filter → false if no match
      ├─ Lookup snippet by name → throw if missing
      ├─ Emit optional anchor html_block
      ├─ Emit fence token (info = lang from extension)
      └─ Emit optional source link html_block
```

## 4. Module Specifications

### 4.1 `lib/extractor.mjs`

#### `MARKERS: MarkerPair[]`

Five regex pairs covering all major comment styles:

| Index | Style | Start Pattern | End Pattern |
|-------|-------|---------------|-------------|
| 0 | C# | `#region name` | `#endregion` |
| 1 | JS/TS/Java/Go | `// #region name` | `// #endregion` |
| 2 | HTML/XML | `<!-- #region name -->` | `<!-- #endregion -->` |
| 3 | CSS/C | `/* #region name */` | `/* #endregion */` |
| 4 | Python/Ruby/Shell | `# region name` | `# endregion` |

Each start regex captures the region name in group 1.

#### `dedent(text: string): string`

Removes the minimum common leading whitespace from all non-empty lines. Empty lines are preserved without indentation adjustment.

#### `findRegion(lines: string[], regionName: string): Region | null`

Locates a named region in an array of lines. Handles nesting by tracking depth — increments on matching start markers, decrements on end markers. Returns `{ re, start, end }` where `start` and `end` are 0-indexed line indices (start is the first content line after the start marker, end is the end marker line).

#### `extractSnippetsFromFile(content: string, includeFilter?: RegExp | null): Map<string, FileSnippet>`

Scans file content for all region markers. For each matching region:
1. Calls `findRegion` to locate boundaries
2. Filters out nested region markers from content
3. Dedents and trims trailing whitespace
4. Records 1-based `startLine` and `endLine` (of the region markers themselves)

### 4.2 `lib/scanner.mjs`

#### `DEFAULT_SKIP_DIRS: Set<string>`

20 directory names skipped during walking: `node_modules`, `bin`, `obj`, `.git`, `.hg`, `.svn`, `dist`, `build`, `out`, `target`, `.claude`, `.cursor`, `.copilot`, `.vscode`, `.idea`, `__pycache__`, `.tox`, `.mypy_cache`, `coverage`, `.nyc_output`.

#### `DEFAULT_EXTENSIONS: Set<string>`

50+ file extensions covering .NET, JVM, JS/TS, Web, Systems, Scripting, Shell, Data/Config, Markup, and other languages.

#### `walkDir(dir, callback, extensions, skipDirs, exclude): void`

Recursive synchronous directory traversal. Skips directories by name or path substring. Invokes callback for files with matching extensions.

#### `loadSnippets(opts): Map<string, Snippet>`

Orchestrates scanning: walks configured directories, reads each file, extracts snippets, and aggregates into a Map keyed by region name. Each entry includes `code`, `file` (relative path), `ext`, `startLine`, and `endLine`.

### 4.3 `lib/lang-map.mjs`

#### `DEFAULT_LANG_MAP: Record<string, string>`

80+ extension-to-language mappings. Notable: `.cs` → `csharp`, `.ts` → `ts`, `.py` → `python`, `.rs` → `rust`.

#### `buildLangMap(overrides?): Record<string, string>`

Returns `DEFAULT_LANG_MAP` when no overrides; otherwise shallow-merges overrides on top of defaults.

#### `langFromExtension(ext, langMap): string`

Simple lookup with empty-string fallback for unknown extensions.

### 4.4 `lib/syntax.mjs`

#### `SYNTAX_PRESETS: Record<string, () => SyntaxDef>`

| Preset | Pattern | First Char |
|--------|---------|------------|
| `snippet-colon` | `/^snippet:\s*(.+)$/` | `s` (0x73) |
| `triple-chevron` | `/^<<<\s+#?(.+)$/` | `<` (0x3C) |
| `at-snippet` | `/^@snippet\s+(.+)$/` | `@` (0x40) |

#### `resolveSyntax(syntax?): SyntaxDef`

Resolution order:
1. `null`/`undefined` → default preset (`snippet-colon`)
2. `RegExp` → used directly, first literal char extracted for quick bail
3. `string` matching a preset name → that preset
4. `string` not matching → treated as keyword, builds `/^keyword:\s*(.+)$/`

### 4.5 `lib/file-include.mjs`

#### `isFileRef(value: string): boolean`

Returns `true` if the value starts with `@`.

#### `parseFileRef(ref: string): ParsedFileRef`

VitePress-compatible parsing of file reference syntax.

**Input grammar** (informal):

```
ref       = "@" filePath [ "#" region ] [ "{" modifiers "}" ] [ "[" title "]" ]
modifiers = token (" " token)*
token     = highlights | lang | attrs
highlights = /[\d,-]+/        (e.g. "1,3,5-8")
attrs      = ":" identifier   (e.g. ":line-numbers", ":line-numbers=5")
lang       = anything else    (e.g. "c#", "ts", "typescript")
```

**Parsing order:**
1. Strip `[Title]` from end
2. Strip `{...}` from end (allows adjacency to `#region`)
3. Classify tokens inside `{...}`:
   - Matches `/^[\d,-]+$/` → highlights
   - Starts with `:` → attrs
   - Otherwise → lang
4. Strip `#region` from remainder
5. Remainder = filePath

**Return:** `{ filePath, region, highlights, lang, attrs, title }` (all nullable except filePath)

#### `resolveFileInclude(rootDir, mdFilePath, parsed, langMap): FileIncludeResult`

1. Resolves absolute path (`./`/`../` = md-relative, else rootDir-relative)
2. Reads file synchronously
3. Extracts region if specified (via `findRegion` + marker filtering)
4. Dedents and trims
5. Determines language (override > auto-detect from extension)
6. Computes relative file path for source links
7. Passes through `highlights`, `attrs`, `title` unchanged

**Return:** `{ code, lang, file, startLine, endLine, highlights, attrs, title }`

### 4.6 `index.mjs` — Plugin & Fence Info Construction

The plugin registers a block rule named `region_snippet` before the built-in `fence` rule.

**Fence info construction** (file include mode):

```js
let info = result.lang
if (result.highlights) info += `{${result.highlights}}`
if (result.title)      info += `[${result.title}]`
if (result.attrs)      info += `  ${result.attrs}`
token.info = info
```

This produces VitePress-compatible fence info strings, e.g.:
- `csharp` (plain)
- `csharp{1,3,5-8}` (with highlights)
- `csharp{1,3}[My File]  :line-numbers` (all modifiers)

**Source links** (when `urlPrefix` is set):
- Named snippets: anchor `<a id='snippet-{name}'></a>` + source link with anchor back-link
- File includes: anchor `<a id='snippet-file-{filePath}'></a>` + source link (no anchor back-link)

## 5. Data Types

### `ParsedFileRef`

```ts
interface ParsedFileRef {
  filePath: string
  region: string | null
  highlights: string | null
  lang: string | null
  attrs: string | null
  title: string | null
}
```

### `FileIncludeResult`

```ts
interface FileIncludeResult {
  code: string
  lang: string
  file: string
  startLine: number
  endLine: number
  highlights: string | null
  attrs: string | null
  title: string | null
}
```

### `Snippet`

```ts
interface Snippet {
  code: string
  file: string
  ext: string
  startLine: number
  endLine: number
}
```

### `SyntaxDef`

```ts
interface SyntaxDef {
  pattern: RegExp
  firstCharCode: number
}
```

## 6. Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rootDir` | `string` | **(required)** | Absolute path to project root |
| `dirs` | `string[]` | `['.']` | Directories to scan relative to rootDir |
| `extensions` | `string[]` | 50+ common | File extensions to scan (with leading dot) |
| `include` | `RegExp \| null` | `null` | Only extract regions whose name matches |
| `exclude` | `string[]` | `[]` | Path substrings to skip when scanning |
| `skipDirs` | `string[]` | — | Additional dir names to skip (merged with defaults) |
| `urlPrefix` | `string` | `''` | Source link URL prefix (empty = disabled) |
| `langMap` | `Record<string, string>` | auto | Override extension→language mappings |
| `syntax` | `string \| RegExp` | `'snippet-colon'` | Marker syntax preset, keyword, or custom RegExp |
| `fileIncludes` | `boolean` | `true` | Enable `@/path` file includes. When `false`, file references are skipped (return `false`) so downstream rules (e.g. VitePress) can handle them |
| `logPrefix` | `string` | `'[region-snippets]'` | Console log prefix |
| `silent` | `boolean` | `false` | Suppress console output |

## 7. Error Handling

All errors are thrown synchronously during parse time:

| Condition | Error Message Pattern |
|-----------|-----------------------|
| Missing rootDir option | `rootDir option is required` |
| File not found (file include) | `cannot read file '{path}': {fs error}` |
| Region not found (file include) | `region '{name}' not found in '{path}'` |
| Snippet not found (named mode) | `Missing snippet '{name}' in {md file}` |
| Relative path without md context | `relative file path '{path}' requires md file context` |
| Invalid syntax option type | `invalid syntax option: {value}` |

## 8. Performance Characteristics

- **Startup**: Synchronous directory scan and file reads. Cost is proportional to the number of files matching the extension filter.
- **Parse time**: O(1) snippet lookup by name (Map). File includes perform synchronous file I/O per reference.
- **Quick bail optimization**: The block rule checks the first character code of each line before attempting a regex match, avoiding regex overhead for non-matching lines.
- **No caching** for file includes — each reference reads the file fresh. This ensures correctness during watch-mode rebuilds.

## 9. npm Package Contents

The `files` field limits the published package to:

```
index.mjs
index.d.ts
lib/
```

Test fixtures, SPEC.md, and FEATURES.md are excluded from the published package.
