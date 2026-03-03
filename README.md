# markdown-it-region-snippets

[![npm version](https://img.shields.io/npm/v/@radarleaf/markdown-it-region-snippets)](https://www.npmjs.com/package/@radarleaf/markdown-it-region-snippets)
<!-- [![npm downloads](https://img.shields.io/npm/dm/@radarleaf/markdown-it-region-snippets)](https://www.npmjs.com/package/@radarleaf/markdown-it-region-snippets) -->
[![CI](https://github.com/mysticmind/markdown-it-region-snippets/actions/workflows/ci.yml/badge.svg)](https://github.com/mysticmind/markdown-it-region-snippets/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [markdown-it](https://github.com/markdown-it/markdown-it) plugin that extracts `#region` code snippets from source files and expands `snippet: name` markers in markdown into fenced code blocks with syntax highlighting. Also supports direct file includes and inline snippet definitions.

Works with **VitePress**, **VuePress**, **Docusaurus**, or any markdown-it setup. Uses its own `snippet:` marker syntax — no conflict with VitePress's built-in `<<<` file includes.

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >= 18.0.0 |
| Module system | ESM (`"type": "module"`) |
| markdown-it | >= 13.0.0 (optional peer dependency) |

Zero runtime dependencies. Works with any markdown-it pipeline — VitePress, VuePress, Docusaurus, or standalone.

## Installation

```bash
npm install markdown-it-region-snippets
```

## Quick Start — VitePress

```ts
// docs/.vitepress/config.mts
import { defineConfig } from 'vitepress'
import { fileURLToPath, URL } from 'node:url'
import { regionSnippetPlugin } from 'markdown-it-region-snippets'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  markdown: {
    config(md) {
      md.use(regionSnippetPlugin, {
        rootDir,
        syntax: 'snippet-colon',
      })
    },
  },
})
```

## Quick Start — Plain markdown-it

```js
import MarkdownIt from 'markdown-it'
import { regionSnippetPlugin } from 'markdown-it-region-snippets'

const md = new MarkdownIt()
md.use(regionSnippetPlugin, {
  rootDir: '/path/to/project',
})

const html = md.render('snippet: my_snippet\n')
```

## How It Works

1. **Source files** contain `#region name` / `#endregion` markers around code
2. **Markdown files** reference them with `snippet: name` on its own line
3. At build time, the plugin scans source files, extracts snippet code, and replaces markers with fenced code blocks
4. The fence language is auto-detected from the source file extension

### Source file (e.g., `src/Example.cs`)

```csharp
public class Example
{
    #region sample_hello
    public void Hello()
    {
        Console.WriteLine("Hello!");
    }
    #endregion
}
```

### Markdown file

```markdown
## Example

snippet: sample_hello
```

### Rendered output

````markdown
```csharp
public void Hello()
{
    Console.WriteLine("Hello!");
}
```
````

## Region Snippets vs File Includes vs Inline Snippets

This plugin supports three ways to embed source code in your docs: **named region snippets**, **direct file includes**, and **inline snippets**. Each has its strengths — use whichever fits the situation, or mix all three.

### Named Region Snippets

Mark regions in your source code with `#region` / `#endregion`, then reference them by name in markdown.

```csharp
#region sample_auth
public async Task<bool> Authenticate(string token) { ... }
#endregion
```

```markdown
snippet: sample_auth
```

**Advantages:**

- **Decoupled from file structure** — rename or move source files without updating any markdown. The region name is the only contract between code and docs.
- **Reusable across pages** — the same named snippet can be referenced from multiple markdown files. Define once, embed everywhere.
- **Fast at parse time** — all regions are pre-scanned at startup and stored in a Map. Each lookup is O(1) with no per-reference file I/O.
- **Breakage is caught immediately** — if a region is removed from source code, the build throws a clear error (`Missing snippet 'name'`), preventing stale docs from shipping silently.
- **Namespace with filters** — use the `include` option (e.g. `/^sample_\w+$/`) to restrict which regions are extracted, keeping documentation snippets separate from other regions in your codebase.
- **Nested regions** — expose both coarse and fine-grained views of the same code. A `sample_class` region can contain a `sample_method` region; both are independently addressable.
- **Auto-dedented** — common leading whitespace is stripped, so indented regions render cleanly without extra indentation in docs.

### Direct File Includes

Reference files by path with an `@` prefix. No region markers needed in the source.

```markdown
snippet: @/src/config.json
snippet: @/src/models/user.ts#sample_interface
snippet: @/src/Example.cs {1,3,5-8 :line-numbers} [Example]
```

**Advantages:**

- **Zero footprint in source code** — no region markers to add or maintain. Good for files you don't own or don't want to annotate.
- **Include entire files** — ideal for config files, scripts, or small modules where the whole file is the example.
- **VitePress-compatible modifiers** — line highlights (`{1,3,5-8}`), attributes (`:line-numbers`), titles (`[Example]`), and language overrides are all supported using VitePress syntax.
- **On-demand loading** — files are read at parse time, so there's no startup cost for directories you never reference.
- **Relative paths** — `@./path` and `@../path` resolve relative to the markdown file, making co-located docs intuitive.

### Inline Snippets

Define snippet content directly in your markdown. When `inlineSnippets: true`, the configured marker syntax wrapped in an HTML comment (`<!-- snippet: name -->`, `<!-- <<< #name -->`, etc.) becomes an inline snippet opener — content follows the marker and is closed by `<!-- /snippet -->` or `<!-- endSnippet -->`. Both the opening and closing markers are HTML comments, so they are invisible in standard markdown renderers.

```markdown
<!-- snippet: my_func {python} -->
def hello():
    print("hello")
<!-- /snippet -->
```

**Advantages:**

- **Invisible markers** — both opening and closing markers are HTML comments, so they render cleanly in plain markdown viewers.
- **Self-contained docs** — code examples live right in the markdown file. No external source files needed.
- **VitePress-compatible modifiers** — line highlights, attributes, titles, and language overrides work the same as file includes.
- **Anchors** — each inline snippet emits a named anchor (`<a id='snippet-name'>`) for in-page linking.
- **Opt-in** — disabled by default (`inlineSnippets: false`), enable when needed. File includes still work normally.

### When to Use Which

| Scenario | Recommended approach |
|----------|---------------------|
| Code example referenced from multiple doc pages | Named region snippet |
| Source files may be renamed or reorganized | Named region snippet |
| Including an entire config/script file | File include |
| One-off reference where adding a region marker is overkill | File include |
| Need line highlights, titles, or attributes | File include or inline snippet |
| Want build-time validation that examples still exist | Named region snippet |
| Code example written directly in docs, no source file | Inline snippet |
| Docs that must render in plain markdown viewers too | Inline snippet (wrapped fence mode) |

All three approaches can be freely mixed in the same project.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rootDir` | `string` | **(required)** | Absolute path to project root |
| `dirs` | `string[]` | `['.']` | Directories to scan, relative to rootDir |
| `extensions` | `string[]` | 50+ common extensions | File extensions to scan (with leading dot) |
| `include` | `RegExp \| null` | `null` (all) | Only extract regions whose name matches |
| `exclude` | `string[]` | `[]` | Path substrings to skip when scanning |
| `skipDirs` | `string[]` | — | Additional dir names to skip (merged with defaults) |
| `urlPrefix` | `string` | `''` (disabled) | Source link URL prefix |
| `anchor` | `boolean` | `true` | Emit `<a id='...'>` anchor before each code block. Requires `urlPrefix` |
| `sourceLink` | `boolean` | `true` | Emit `<sup>` source link after each code block. Requires `urlPrefix` |
| `langMap` | `Record<string, string>` | auto | Override extension→language mappings |
| `syntax` | `string \| RegExp` | `'snippet-colon'` | Marker syntax — preset name, keyword, or custom RegExp |
| `fileIncludes` | `boolean` | `true` | Enable `@/path` file includes. Set `false` to let VitePress handle `<<<` file includes natively |
| `inlineSnippets` | `boolean` | `false` | Enable inline snippet mode. Marker syntax wrapped in HTML comments (`<!-- snippet: name -->`) becomes an inline opener; named snippet lookup is disabled. File includes still work |
| `logPrefix` | `string` | `'[region-snippets]'` | Console log prefix |
| `silent` | `boolean` | `false` | Suppress console output |
| `strict` | `boolean` | `true` | Throw on missing snippets/files. Set `false` to emit a warning fence instead |

## Scanning Controls

### Directories

```js
md.use(regionSnippetPlugin, {
  rootDir,
  dirs: ['src', 'samples'],  // only scan these directories
})
```

### File Extensions

```js
md.use(regionSnippetPlugin, {
  rootDir,
  extensions: ['.cs', '.ts', '.js'],  // only scan these extensions
})
```

The default covers 50+ extensions across .NET, JVM, JS/TS, Web, Systems, Scripting, Shell, and Config files.

### Path Exclusion

```js
md.use(regionSnippetPlugin, {
  rootDir,
  exclude: ['Generated', 'obj/Debug'],  // skip paths containing these substrings
})
```

### Skip Directories

```js
md.use(regionSnippetPlugin, {
  rootDir,
  skipDirs: ['vendor', '.cache'],  // merged with built-in skip dirs
})
```

Built-in skip dirs include `node_modules`, `bin`, `obj`, `.git`, `dist`, `build`, `out`, `target`, and more.

## Marker Syntax

The default syntax is `snippet:` followed by the region name:

```markdown
snippet: my_region_name
```

### Built-in Presets

| Preset | Markdown syntax | Example |
|--------|----------------|---------|
| `'snippet-colon'` (default) | `snippet: name` | `snippet: sample_hello` |
| `'triple-chevron'` | `<<< #name` / `<<< @/path` | `<<< #sample_hello` |
| `'at-snippet'` | `@snippet name` | `@snippet sample_hello` |

```js
// Use VitePress-compatible legacy syntax
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: 'triple-chevron',
})
```

### VitePress Coexistence

The default `snippet-colon` syntax uses a completely different prefix (`snippet:`) so there is no overlap with VitePress's built-in `<<<` file includes. Both work side by side with zero conflict.

If you choose the `triple-chevron` preset, the plugin takes over **all** `<<<` handling — both named snippets (`<<< #name`) and file includes (`<<< @/path`). This effectively replaces VitePress's built-in `<<<` with the plugin's richer feature set (region extraction, highlights, attributes, titles). The plugin's block rule runs before the built-in `fence` rule, so matching `<<<` lines are intercepted first.

| Syntax | Mode | Example |
|--------|------|---------|
| `<<< #name` | Named snippet | `<<< #sample_hello` |
| `<<< @/path` | File include | `<<< @/src/file.cs` |
| `<<< @/path#region` | File include with region | `<<< @/src/file.cs#my_region` |
| `<<< @/path {1,3 :line-numbers} [Title]` | File include with modifiers | `<<< @/src/file.cs {1,3} [Example]` |

To use `triple-chevron` for named snippets only and let VitePress handle `<<< @/path` file includes natively, disable the plugin's file include feature:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: 'triple-chevron',
  fileIncludes: false,  // <<< @/path falls through to VitePress
})
```

### Custom Keyword

Any string that isn't a preset name is treated as a keyword — builds a `keyword: name` pattern:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: 'code',  // now use `code: my_region_name` in markdown
})
```

### Custom RegExp

For full control, pass a RegExp with exactly one capture group for the snippet name:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: /^include\s+(\S+)$/,  // matches `include my_name`
})
```

## File Includes

In addition to named snippet lookup, the plugin supports **direct file includes** using an `@` prefix. This lets you include entire files or specific regions — without pre-scanning. The `{...}` block and `[Title]` use **VitePress-compatible syntax**, so highlights, attributes, and titles are passed through to the fenced code block for Shiki rendering.

> **Note:** File includes use the `@` prefix after the marker keyword. With the default syntax you write `snippet: @/path/to/file`; with `triple-chevron` you write `<<< @/path/to/file` — the same syntax as VitePress's built-in file includes, but with additional support for region extraction and modifiers. See [VitePress Coexistence](#vitepress-coexistence) for details.

### Syntax

```markdown
snippet: @/path/to/file.cs                                     # entire file
snippet: @/path/to/file.cs#region_name                         # region from file
snippet: @/path/to/file.cs {c#}                                # language override
snippet: @/path/to/file.cs {1,3,5-8}                           # line highlighting
snippet: @/path/to/file.cs {:line-numbers}                     # attributes
snippet: @/path/to/file.cs [Title]                             # title
snippet: @/path/to/file.cs#region{1,3,5-8 c# :line-numbers} [My Title]  # all combined
```

### Path Resolution

- `@/path` — relative to `rootDir`
- `@./path` or `@../path` — relative to the current markdown file's directory

### `{...}` Block

The optional `{...}` block can contain space-separated tokens:

- **Highlights**: `1,3,5-8` — digits, commas, and dashes → line highlighting (VitePress/Shiki)
- **Language**: `c#`, `ts`, etc. — override auto-detected fence language
- **Attributes**: `:line-numbers`, `:line-numbers=5` — passed through to fence info

The brace block can be space-separated from the path or adjacent to a `#region` name:

```markdown
snippet: @/file.cs#my_region{1,3}
snippet: @/file.cs#my_region {1,3}
```

### `[Title]`

An optional `[Title]` at the end sets the code block title (rendered by VitePress/Shiki):

```markdown
snippet: @/src/Example.cs [Example.cs]
```

### Fence Info Output

The plugin constructs the fence info string in VitePress format:

```
lang{highlights}[Title]  :attrs
```

For example, `snippet: @/file.cs {1,3 c# :line-numbers} [My File]` produces:

````markdown
```c#{1,3}[My File]  :line-numbers
// ... file content ...
```
````

### Examples

Include an entire JavaScript file:

```markdown
snippet: @/src/utils/helpers.js
```

Include a specific region from a TypeScript file:

```markdown
snippet: @/src/models/user.ts#sample_interface
```

Include a file with highlighted lines and line numbers:

```markdown
snippet: @/src/Example.cs {1,3,5-8 :line-numbers}
```

Include a region with a title:

```markdown
snippet: @./examples/demo.cs#sample_setup [Setup Code]
```

## Inline Snippets

When `inlineSnippets: true`, the configured marker syntax wrapped in an HTML comment (`<!-- snippet: name -->`, `<!-- <<< #name -->`, etc.) becomes an inline snippet opener. Content follows the marker line and is closed by `<!-- /snippet -->` or `<!-- endSnippet -->`. Both opening and closing markers are HTML comments, making them invisible in standard markdown renderers. Named snippet lookup from pre-scanned files is disabled. File includes (`@/path`) still work normally.

```js
md.use(regionSnippetPlugin, {
  rootDir,
  inlineSnippets: true,
})
```

### Syntax

**Opening marker** — the configured marker syntax wrapped in an HTML comment, with optional modifiers:

```markdown
<!-- snippet: name -->
<!-- snippet: name {python} -->
<!-- snippet: name {python 1,3,5-8 :line-numbers} [My Title] -->
```

With the `triple-chevron` preset:

```markdown
<!-- <<< #name {python} -->
```

**Closing marker** — two forms:

```markdown
<!-- /snippet -->
<!-- endSnippet -->
```

### Content Modes

The plugin auto-detects which mode is in use.

**Mode A — Raw content** (language specified in opening marker):

```markdown
<!-- snippet: my_func {python} -->
def hello():
    print("hello")
<!-- /snippet -->
```

**Mode B — Wrapped fenced code block** (degrades gracefully in standard renderers):

````markdown
<!-- snippet: my_func -->
```python
def hello():
    print("hello")
```
<!-- /snippet -->
````

In Mode B, the plugin unwraps the fence and emits it as a proper token. The wrapped code block also renders normally in plain markdown viewers that don't run this plugin.

### Language Priority

1. `{lang}` in the opening marker (highest)
2. Fence language from wrapped code block (Mode B)
3. Empty string (lowest)

### `{...}` Block

Same VitePress-compatible syntax as file includes:

- **Language**: `python`, `ts`, `c#` — sets the fence language
- **Highlights**: `1,3,5-8` — line highlighting
- **Attributes**: `:line-numbers` — passed through to fence info

### `[Title]`

An optional `[Title]` at the end sets the code block title:

```markdown
<!-- snippet: setup {python} [Setup Code] -->
```

### Anchors

Each inline snippet emits an anchor tag for in-page linking, gated on the `anchor` option (default: `true`):

```html
<a id='snippet-my_func'></a>
```

No source link is emitted since there is no external source file.

### Error Handling

A missing closing marker follows the same `strict` / lenient behavior as other snippet types:

- `strict: true` (default) — throws an error
- `strict: false` — emits a warning fence (`⚠ Inline snippet 'name' has no closing marker`)

## Supported Region Markers

| Language | Start | End |
|----------|-------|-----|
| C# | `#region name` | `#endregion` |
| JS/TS/Java/Go | `// #region name` | `// #endregion` |
| HTML/XML | `<!-- #region name -->` | `<!-- #endregion -->` |
| CSS/C | `/* #region name */` | `/* #endregion */` |
| Python/Ruby/Shell | `# region name` | `# endregion` |

Nested regions are handled correctly — inner region markers are stripped from the output.

## Language Map

The fence language is auto-detected from the source file extension. Common mappings include:

| Extension | Language |
|-----------|----------|
| `.cs` | `csharp` |
| `.ts`, `.mts` | `ts` |
| `.js`, `.mjs` | `js` |
| `.py` | `python` |
| `.rs` | `rust` |
| `.go` | `go` |
| `.html` | `html` |
| `.css` | `css` |

Override with the `langMap` option:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  langMap: { '.cs': 'cs' },  // use 'cs' instead of 'csharp'
})
```

## Source Links

When `urlPrefix` is set, each code block is wrapped with an HTML anchor and a source link pointing to the original file with line numbers. Use `anchor` and `sourceLink` to control each part independently.

```js
md.use(regionSnippetPlugin, {
  rootDir,
  urlPrefix: 'https://github.com/user/repo/blob/main',
})
```

To emit only the source link (no anchor):

```js
md.use(regionSnippetPlugin, {
  rootDir,
  urlPrefix: 'https://github.com/user/repo/blob/main',
  anchor: false,
})
```

To emit only the anchor (no source link):

```js
md.use(regionSnippetPlugin, {
  rootDir,
  urlPrefix: 'https://github.com/user/repo/blob/main',
  sourceLink: false,
})
```

### Named snippets

Each named snippet gets an anchor before the code block and a source link after it. The source link includes a back-link to the anchor for easy cross-referencing within the page.

```html
<!-- Before the code block -->
<a id='snippet-sample_hello'></a>

<!-- After the code block -->
<sup><a href='https://github.com/user/repo/blob/main/src/Example.cs#L3-L8'>snippet source</a> | <a href='#snippet-sample_hello'>anchor</a></sup>
```

### File includes

File includes get the same anchor and source link with a back-link.

```html
<!-- Before the code block -->
<a id='snippet-file-/src/Example.cs'></a>

<!-- After the code block -->
<sup><a href='https://github.com/user/repo/blob/main/src/Example.cs#L1-L20'>snippet source</a> | <a href='#snippet-file-/src/Example.cs'>anchor</a></sup>
```

## Error Handling

By default (`strict: true`), the plugin throws at build time when a snippet or file reference can't be resolved. This means broken documentation links are caught during the build rather than silently rendering empty or stale content.

| Condition | Error message |
|-----------|---------------|
| Named snippet not found | `Missing snippet 'name' in docs/page.md` |
| File not found (file include) | `cannot read file '/path/to/file': ENOENT` |
| Region not found in file | `region 'name' not found in '/path/to/file'` |

If a region is removed or renamed in source code, the next build fails immediately with a clear error pointing to the markdown file that references it. This makes region snippets a reliable contract between your code and your docs — stale examples can't ship unnoticed.

### Lenient mode

Set `strict: false` for development workflows where you want to write docs before the referenced code exists. Instead of throwing, the plugin renders a fenced code block with a visible warning (e.g. `⚠ Snippet not found: name`) and logs a `console.warn` (unless `silent: true`).

```js
md.use(regionSnippetPlugin, {
  rootDir,
  strict: false, // render warnings instead of crashing
})
```

## Framework Compatibility

| Framework | Supported | Notes |
|-----------|-----------|-------|
| VitePress | Yes | Primary target; fence info is VitePress/Shiki-compatible |
| VuePress | Yes | Works with any markdown-it pipeline |
| Docusaurus | Yes | Via markdown-it plugin registration |
| Plain markdown-it | Yes | Direct `md.use()` |

## TypeScript

Full type declarations ship with the package in `index.d.ts`, covering all public interfaces, function signatures, and option types. No `@types/` package needed.

## Advanced Usage

The plugin re-exports its internal utilities for custom workflows:

```js
import {
  extractSnippetsFromFile,
  loadSnippets,
  findRegion,
  dedent,
  MARKERS,
  DEFAULT_LANG_MAP,
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  SYNTAX_PRESETS,
  DEFAULT_SYNTAX,
  resolveSyntax,
  isFileRef,
  parseFileRef,
  resolveFileInclude,
  parseInlineSnippetOpen,
  parseInlineValue,
  isInlineSnippetClose,
  detectWrappedFence,
} from 'markdown-it-region-snippets'
```

## License

MIT
