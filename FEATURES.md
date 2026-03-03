# markdown-it-region-snippets — Feature Catalogue

## Named Snippet Extraction

Extract code from `#region` / `#endregion` markers in source files and embed them in Markdown documentation. Snippets are scanned at plugin initialization and resolved by name.

### Multi-Language Region Markers

Five comment styles are recognized, covering all major language families:

| Style | Start Marker | End Marker | Languages |
|-------|-------------|------------|-----------|
| C# | `#region name` | `#endregion` | C# |
| C-style line | `// #region name` | `// #endregion` | JS, TS, Java, Go, Rust, C++ |
| HTML/XML | `<!-- #region name -->` | `<!-- #endregion -->` | HTML, XML, SVG, Vue templates |
| Block comment | `/* #region name */` | `/* #endregion */` | CSS, C, Sass, Less |
| Hash comment | `# region name` | `# endregion` | Python, Ruby, Shell, YAML |

```csharp
// Source file: src/Example.cs
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

```markdown
<!-- Markdown file -->
snippet: sample_hello
```

### Nested Region Support

Regions can be nested. Inner region markers are automatically stripped from the output. Nesting depth is tracked correctly so overlapping regions resolve to the right boundaries.

```csharp
#region sample_class
public class UserService
{
    #region sample_method
    public async Task<User> GetUser(int id) { ... }
    #endregion
}
#endregion
```

Both `sample_class` and `sample_method` are independently addressable.

### Automatic Dedenting

Common leading whitespace is removed from extracted code, so indented regions render without unnecessary indentation in the documentation.

### Automatic Language Detection

The fence language is auto-detected from the source file extension using a built-in map of 80+ extensions. For example, `.cs` files produce `` ```csharp `` fences; `.ts` files produce `` ```ts ``.

Override on a per-project basis:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  langMap: { '.cs': 'cs' },  // use 'cs' instead of 'csharp'
})
```

### Region Name Filtering

The `include` option accepts a RegExp to limit which regions are extracted:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  include: /^sample_\w+$/,  // only regions prefixed with 'sample_'
})
```

Non-matching region names are ignored during scanning, and marker lines referencing them in Markdown are skipped (not matched by the parser).

---

## Direct File Includes

Include entire files or specific regions by path, without pre-scanning. Supports VitePress-compatible modifiers for highlights, attributes, and titles.

### Entire File

```markdown
snippet: @/src/utils/helpers.js
```

### Region by Path

```markdown
snippet: @/src/models/user.ts#sample_interface
```

### Path Resolution

| Prefix | Resolution |
|--------|------------|
| `@/path` | Relative to `rootDir` |
| `@./path` | Relative to the current Markdown file |
| `@../path` | Relative to the current Markdown file's parent |

### Language Override

Override auto-detected language with `{lang}`:

```markdown
snippet: @/scripts/deploy.sh {python}
```

### Line Highlighting (VitePress-Compatible)

Specify lines to highlight using `{line-specs}`. These are passed through to the fence info string for VitePress/Shiki rendering:

```markdown
snippet: @/src/Example.cs {5}              # highlight line 5
snippet: @/src/Example.cs {1,3,5-8}        # highlight lines 1, 3, and 5-8
```

Produces: `` ```csharp{1,3,5-8} ``

### Fence Attributes (VitePress-Compatible)

Pass `:attributes` through to the fence info for Shiki:

```markdown
snippet: @/src/Example.cs {:line-numbers}          # show line numbers
snippet: @/src/Example.cs {:line-numbers=10}       # line numbers starting at 10
```

Produces: `` ```csharp  :line-numbers ``

### Code Block Title (VitePress-Compatible)

Set a title with `[Title]`:

```markdown
snippet: @/src/Example.cs [Example.cs]
```

Produces: `` ```csharp[Example.cs] ``

### Combined Syntax

All modifiers can be combined in a single reference:

```markdown
snippet: @/src/Example.cs#sample_region{1,3,5-8 c# :line-numbers} [My Code]
```

Produces: `` ```c#{1,3,5-8}[My Code]  :line-numbers ``

The fence info follows VitePress's format: `lang{highlights}[title]  :attrs`

### Adjacent Brace Syntax

Braces can be adjacent to `#region` (no space required):

```markdown
snippet: @/src/Example.cs#my_region{1,3}
```

---

## Configurable Marker Syntax

The marker keyword that triggers snippet expansion is fully configurable.

### Built-in Presets

| Preset | Syntax | Example |
|--------|--------|---------|
| `snippet-colon` (default) | `snippet: name` | `snippet: sample_hello` |
| `triple-chevron` | `<<< #name` / `<<< @/path` | `<<< #sample_hello` |
| `at-snippet` | `@snippet name` | `@snippet sample_hello` |

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: 'triple-chevron',
})
```

### VitePress Coexistence

- **`snippet-colon` (default)** and **`at-snippet`** — use completely different prefixes (`snippet:` / `@snippet`), so there is no overlap with VitePress's built-in `<<<` file includes. Both systems work side by side with zero conflict.
- **`triple-chevron`** — takes over **all** `<<<` handling, effectively replacing VitePress's built-in `<<<` with the plugin's richer feature set (region extraction, highlights, attributes, titles). Named snippets use `<<< #name` and file includes use `<<< @/path` — the same syntax VitePress users are already familiar with.

| Syntax | Mode | Example |
|--------|------|---------|
| `<<< #name` | Named snippet | `<<< #sample_hello` |
| `<<< @/path` | File include | `<<< @/src/file.cs` |
| `<<< @/path#region` | File include with region | `<<< @/src/file.cs#my_region` |
| `<<< @/path {1,3 :line-numbers} [Title]` | File include with modifiers | `<<< @/src/file.cs {1,3} [Example]` |

The plugin registers its block rule **before** the built-in `fence` rule, so matching `<<<` lines are intercepted first.

To use `triple-chevron` for named snippets only while letting VitePress handle `<<< @/path` file includes natively, set `fileIncludes: false`:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: 'triple-chevron',
  fileIncludes: false,  // <<< @/path falls through to VitePress
})
```

### Custom Keyword

Any string not matching a preset name becomes a keyword:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: 'code',  // matches `code: my_region_name` in markdown
})
```

### Custom RegExp

For full control, pass a RegExp with one capture group:

```js
md.use(regionSnippetPlugin, {
  rootDir,
  syntax: /^include\s+(\S+)$/,  // matches `include my_name`
})
```

---

## Source Links

When `urlPrefix` is configured, each code block is wrapped with an HTML anchor and a source link pointing to the original file with line numbers.

```js
md.use(regionSnippetPlugin, {
  rootDir,
  urlPrefix: 'https://github.com/user/repo/blob/main',
})
```

**Named snippets** get:
- An anchor: `<a id='snippet-{name}'></a>`
- A source link: `<sup><a href='{urlPrefix}/{file}#L{start}-L{end}'>snippet source</a> | <a href='#snippet-{name}'>anchor</a></sup>`

**File includes** get:
- An anchor: `<a id='snippet-file-{filePath}'></a>`
- A source link: `<sup><a href='{urlPrefix}/{file}#L{start}-L{end}'>snippet source</a></sup>`

---

## Directory Scanning Controls

### Scanned Directories

```js
md.use(regionSnippetPlugin, {
  rootDir,
  dirs: ['src', 'samples'],  // only scan these directories
})
```

### File Extension Filter

```js
md.use(regionSnippetPlugin, {
  rootDir,
  extensions: ['.cs', '.ts', '.js'],  // only scan these extensions
})
```

Default: 50+ extensions covering .NET, JVM, JS/TS, Web, Systems, Scripting, Shell, and Config files.

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
  skipDirs: ['vendor', '.cache'],  // merged with 20 built-in skip dirs
})
```

Built-in skip dirs: `node_modules`, `bin`, `obj`, `.git`, `dist`, `build`, `out`, `target`, and more.

---

## Console Output

The plugin logs the number of loaded snippets at startup:

```
[region-snippets] Loaded 42 snippets
```

### Custom Prefix

```js
md.use(regionSnippetPlugin, { rootDir, logPrefix: '[docs]' })
// → [docs] Loaded 42 snippets
```

### Silent Mode

```js
md.use(regionSnippetPlugin, { rootDir, silent: true })
```

---

## Re-Exported Utilities

All internal modules are re-exported for advanced or custom workflows:

```js
import {
  // Extractor
  MARKERS, dedent, findRegion, extractSnippetsFromFile,
  // Scanner
  walkDir, loadSnippets, DEFAULT_SKIP_DIRS, DEFAULT_EXTENSIONS,
  // Language map
  DEFAULT_LANG_MAP, buildLangMap, langFromExtension,
  // Syntax
  SYNTAX_PRESETS, DEFAULT_SYNTAX, resolveSyntax,
  // File includes
  isFileRef, parseFileRef, resolveFileInclude,
} from 'markdown-it-region-snippets'
```

---

## TypeScript Support

Full type declarations are shipped in `index.d.ts`, covering all public interfaces, function signatures, and option types. No `@types/` package needed.

---

## Framework Compatibility

| Framework | Supported | Notes |
|-----------|-----------|-------|
| VitePress | Yes | Primary target; fence info is VitePress-compatible |
| VuePress | Yes | Works with any markdown-it pipeline |
| Docusaurus | Yes | Via markdown-it plugin registration |
| Plain markdown-it | Yes | Direct `md.use()` |

The plugin registers its block rule **before** the built-in `fence` rule, so `snippet:` lines are intercepted before markdown-it's default processing.
