import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  MARKERS,
  dedent,
  findRegion,
  extractSnippetsFromFile,
} from '../src/lib/extractor.js'
import { DEFAULT_LANG_MAP, buildLangMap, langFromExtension } from '../src/lib/lang-map.js'
import { loadSnippets, DEFAULT_SKIP_DIRS, DEFAULT_EXTENSIONS } from '../src/lib/scanner.js'
import { regionSnippetPlugin } from '../src/index.js'
import { resolveSyntax, SYNTAX_PRESETS, DEFAULT_SYNTAX } from '../src/lib/syntax.js'
import { isFileRef, parseFileRef, resolveFileInclude } from '../src/lib/file-include.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures')

// ── dedent ──────────────────────────────────────────────────────────────

describe('dedent', () => {
  it('removes common leading whitespace', () => {
    const input = '    line1\n    line2\n    line3'
    assert.equal(dedent(input), 'line1\nline2\nline3')
  })

  it('preserves relative indentation', () => {
    const input = '    line1\n        line2\n    line3'
    assert.equal(dedent(input), 'line1\n    line2\nline3')
  })

  it('handles empty lines', () => {
    const input = '    line1\n\n    line3'
    assert.equal(dedent(input), 'line1\n\nline3')
  })

  it('returns text unchanged if no common indent', () => {
    const input = 'line1\n  line2'
    assert.equal(dedent(input), 'line1\n  line2')
  })
})

// ── findRegion ──────────────────────────────────────────────────────────

describe('findRegion', () => {
  it('finds a C# region', () => {
    const lines = [
      'using System;',
      '#region my_region',
      'var x = 1;',
      '#endregion',
    ]
    const result = findRegion(lines, 'my_region')
    assert.ok(result)
    assert.equal(result.start, 2)
    assert.equal(result.end, 3)
  })

  it('handles nested regions', () => {
    const lines = [
      '#region outer',
      'line1',
      '#region inner',
      'line2',
      '#endregion',
      'line3',
      '#endregion',
    ]
    const result = findRegion(lines, 'outer')
    assert.ok(result)
    assert.equal(result.start, 1)
    assert.equal(result.end, 6)
  })

  it('finds JS/TS region markers', () => {
    const lines = [
      '// #region my_func',
      'function foo() {}',
      '// #endregion',
    ]
    const result = findRegion(lines, 'my_func')
    assert.ok(result)
    assert.equal(result.start, 1)
    assert.equal(result.end, 2)
  })

  it('finds HTML region markers', () => {
    const lines = [
      '<!-- #region my_html -->',
      '<div>Hello</div>',
      '<!-- #endregion -->',
    ]
    const result = findRegion(lines, 'my_html')
    assert.ok(result)
  })

  it('finds CSS region markers', () => {
    const lines = [
      '/* #region my_css */',
      '.btn { color: red; }',
      '/* #endregion */',
    ]
    const result = findRegion(lines, 'my_css')
    assert.ok(result)
  })

  it('returns null for missing region', () => {
    const lines = ['some code']
    assert.equal(findRegion(lines, 'nonexistent'), null)
  })
})

// ── extractSnippetsFromFile ─────────────────────────────────────────────

describe('extractSnippetsFromFile', () => {
  it('extracts all regions without a filter', () => {
    const content = [
      '#region alpha',
      'line1',
      '#endregion',
      '#region beta',
      'line2',
      '#endregion',
    ].join('\n')
    const snippets = extractSnippetsFromFile(content, null)
    assert.equal(snippets.size, 2)
    assert.equal(snippets.get('alpha')!.code, 'line1')
    assert.equal(snippets.get('beta')!.code, 'line2')
  })

  it('filters with include regex', () => {
    const content = [
      '#region sample_foo',
      'code1',
      '#endregion',
      '#region other_bar',
      'code2',
      '#endregion',
    ].join('\n')
    const snippets = extractSnippetsFromFile(content, /^sample_\w+$/)
    assert.equal(snippets.size, 1)
    assert.ok(snippets.has('sample_foo'))
    assert.ok(!snippets.has('other_bar'))
  })

  it('strips nested region markers from output', () => {
    const content = [
      '#region outer',
      'before',
      '#region inner',
      'middle',
      '#endregion',
      'after',
      '#endregion',
    ].join('\n')
    const snippets = extractSnippetsFromFile(content, null)
    const outer = snippets.get('outer')
    assert.ok(outer)
    assert.equal(outer.code, 'before\nmiddle\nafter')
  })

  it('dedents extracted code', () => {
    const content = [
      '#region sample_indented',
      '        var x = 42;',
      '        var y = 43;',
      '#endregion',
    ].join('\n')
    const snippets = extractSnippetsFromFile(content, null)
    assert.equal(snippets.get('sample_indented')!.code, 'var x = 42;\nvar y = 43;')
  })

  it('records correct line numbers (1-based)', () => {
    const content = [
      'line 1',
      '#region my_region',
      'code here',
      '#endregion',
      'line 5',
    ].join('\n')
    const snippets = extractSnippetsFromFile(content, null)
    const s = snippets.get('my_region')!
    assert.equal(s.startLine, 2) // 1-based line of #region
    assert.equal(s.endLine, 4)   // 1-based line of #endregion
  })
})

// ── lang-map ────────────────────────────────────────────────────────────

describe('lang-map', () => {
  it('maps .cs to csharp', () => {
    assert.equal(langFromExtension('.cs', DEFAULT_LANG_MAP), 'csharp')
  })

  it('maps .ts to ts', () => {
    assert.equal(langFromExtension('.ts', DEFAULT_LANG_MAP), 'ts')
  })

  it('maps .html to html', () => {
    assert.equal(langFromExtension('.html', DEFAULT_LANG_MAP), 'html')
  })

  it('maps .css to css', () => {
    assert.equal(langFromExtension('.css', DEFAULT_LANG_MAP), 'css')
  })

  it('returns empty string for unknown extension', () => {
    assert.equal(langFromExtension('.unknown', DEFAULT_LANG_MAP), '')
  })

  it('buildLangMap merges overrides', () => {
    const map = buildLangMap({ '.cs': 'cs', '.custom': 'custom' })
    assert.equal(map['.cs'], 'cs')
    assert.equal(map['.custom'], 'custom')
    assert.equal(map['.ts'], 'ts') // still has defaults
  })

  it('buildLangMap returns defaults when no overrides', () => {
    const map = buildLangMap()
    assert.equal(map, DEFAULT_LANG_MAP)
  })
})

// ── scanner / loadSnippets ──────────────────────────────────────────────

describe('loadSnippets', () => {
  it('loads snippets from fixtures directory', () => {
    const snippets = loadSnippets({
      rootDir: fixturesDir,
      dirs: ['.'],
    })
    // Should find snippets from .cs, .ts, .html, .css, .py files
    assert.ok(snippets.size > 0)
    assert.ok(snippets.has('sample_hello_world'))
    assert.ok(snippets.has('sample_greet_function'))
    assert.ok(snippets.has('sample_html_greeting'))
    assert.ok(snippets.has('sample_button_styles'))
    assert.ok(snippets.has('sample_python_hello'))
  })

  it('records file extension per snippet', () => {
    const snippets = loadSnippets({ rootDir: fixturesDir, dirs: ['.'] })
    assert.equal(snippets.get('sample_hello_world')!.ext, '.cs')
    assert.equal(snippets.get('sample_greet_function')!.ext, '.ts')
    assert.equal(snippets.get('sample_html_greeting')!.ext, '.html')
    assert.equal(snippets.get('sample_button_styles')!.ext, '.css')
  })

  it('records relative file path', () => {
    const snippets = loadSnippets({ rootDir: fixturesDir, dirs: ['.'] })
    assert.equal(snippets.get('sample_hello_world')!.file, 'sample.cs')
  })

  it('respects include filter', () => {
    const snippets = loadSnippets({
      rootDir: fixturesDir,
      dirs: ['.'],
      include: /^sample_hello/,
    })
    assert.ok(snippets.has('sample_hello_world'))
    assert.ok(!snippets.has('sample_greet_function'))
  })

  it('respects extensions filter', () => {
    const snippets = loadSnippets({
      rootDir: fixturesDir,
      dirs: ['.'],
      extensions: new Set(['.cs']),
    })
    assert.ok(snippets.has('sample_hello_world'))
    assert.ok(!snippets.has('sample_greet_function')) // .ts excluded
  })
})

// ── plugin integration ──────────────────────────────────────────────────

describe('regionSnippetPlugin', () => {
  // Minimal markdown-it mock for testing the plugin registration and parsing
  function createMockMd() {
    const rules: any[] = []
    return {
      block: {
        ruler: {
          __rules__: [{ name: 'fence' }],
          before(refName: string, name: string, fn: any) {
            rules.push({ refName, name, fn })
          },
        },
      },
      _registeredRules: rules,
    }
  }

  it('throws if rootDir is not provided', () => {
    const md = createMockMd()
    assert.throws(() => regionSnippetPlugin(md as any, {} as any), /rootDir option is required/)
  })

  it('registers the region_snippet rule', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, { rootDir: fixturesDir, dirs: ['.'], silent: true })
    assert.equal(md._registeredRules.length, 1)
    assert.equal(md._registeredRules[0].name, 'region_snippet')
    assert.equal(md._registeredRules[0].refName, 'fence')
  })

  it('parser recognizes snippet: name and produces tokens', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, { rootDir: fixturesDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    const result = parserFn(state as any, 0, 1, false)
    assert.equal(result, true)
    assert.equal(state.line, 1)

    // Should have a fence token
    const fence = tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'csharp')
    assert.ok(fence.content.includes('Console.WriteLine("Hello, World!")'))
  })

  it('parser returns false for non-matching lines', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, { rootDir: fixturesDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'just some text\n'
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
    }

    assert.equal(parserFn(state as any, 0, 1, false), false)
  })

  it('parser throws for missing snippet', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: nonexistent_snippet\n'
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: { path: 'test.md' },
      push(type: string) { return { type } as any },
    }

    assert.throws(() => parserFn(state as any, 0, 1, false), /Missing snippet 'nonexistent_snippet'/)
  })

  it('strict: false emits warning fence for missing named snippet', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      strict: false,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: nonexistent_snippet\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: { path: 'test.md' },
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    assert.equal(parserFn(state as any, 0, 1, false), true)
    assert.equal(state.line, 1)

    const fence = tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.ok(fence.content.includes('\u26A0 Snippet not found: nonexistent_snippet'))
  })

  it('emits source links when urlPrefix is set', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    parserFn(state as any, 0, 1, false)

    // Should have anchor + fence + source link = 3 tokens
    assert.equal(tokens.length, 3)
    assert.equal(tokens[0].type, 'html_block')
    assert.ok(tokens[0].content.includes("id='snippet-sample_hello_world'"))
    assert.equal(tokens[1].type, 'fence')
    assert.equal(tokens[2].type, 'html_block')
    assert.ok(tokens[2].content.includes('https://github.com/example/repo/blob/main/sample.cs'))
    assert.ok(tokens[2].content.includes('snippet source'))
  })

  it('anchor: false suppresses anchor but keeps source link', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
      anchor: false,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    parserFn(state as any, 0, 1, false)

    // fence + source link = 2 tokens (no anchor)
    assert.equal(tokens.length, 2)
    assert.equal(tokens[0].type, 'fence')
    assert.equal(tokens[1].type, 'html_block')
    assert.ok(tokens[1].content.includes('snippet source'))
  })

  it('sourceLink: false suppresses source link but keeps anchor', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
      sourceLink: false,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    parserFn(state as any, 0, 1, false)

    // anchor + fence = 2 tokens (no source link)
    assert.equal(tokens.length, 2)
    assert.equal(tokens[0].type, 'html_block')
    assert.ok(tokens[0].content.includes("id='snippet-sample_hello_world'"))
    assert.equal(tokens[1].type, 'fence')
  })

  it('anchor: false and sourceLink: false suppresses both', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
      anchor: false,
      sourceLink: false,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    parserFn(state as any, 0, 1, false)

    // fence only = 1 token
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].type, 'fence')
  })

  it('uses custom langMap overrides', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      langMap: { '.cs': 'cs' },
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    parserFn(state as any, 0, 1, false)
    const fence = tokens.find(t => t.type === 'fence')
    assert.equal(fence!.info, 'cs') // overridden from 'csharp'
  })

  it('respects include filter in parser matching', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      include: /^sample_hello/,
    })

    const parserFn = md._registeredRules[0].fn

    // This snippet was not loaded due to include filter
    const src = 'snippet: sample_greet_function\n'
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string) { return { type } as any },
    }

    // Should not match because the name doesn't match the include pattern
    assert.equal(parserFn(state as any, 0, 1, false), false)
  })

  it('matches without space after colon', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, { rootDir: fixturesDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet:sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }

    assert.equal(parserFn(state as any, 0, 1, false), true)
  })

  it('syntax: triple-chevron preset matches <<< #name', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      syntax: 'triple-chevron',
    })

    const parserFn = md._registeredRules[0].fn

    // Default snippet: should NOT match
    const src1 = 'snippet: sample_hello_world\n'
    const state1 = {
      src: src1,
      bMarks: [0],
      tShift: [0],
      eMarks: [src1.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
    }
    assert.equal(parserFn(state1 as any, 0, 1, false), false)

    // <<< #name SHOULD match
    const src2 = '<<< #sample_hello_world\n'
    const tokens: any[] = []
    const state2 = {
      src: src2,
      bMarks: [0],
      tShift: [0],
      eMarks: [src2.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }
    assert.equal(parserFn(state2 as any, 0, 1, false), true)
    assert.ok(tokens.find(t => t.type === 'fence'))
  })

  it('syntax: triple-chevron preset matches <<< @/path for file includes', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, {
      rootDir,
      dirs: ['.'],
      silent: true,
      syntax: 'triple-chevron',
    })

    const parserFn = md._registeredRules[0].fn
    const src = '<<< @/fixtures/full-file.js\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }
    assert.equal(parserFn(state as any, 0, 1, false), true)
    const fence = tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'js')
    assert.ok(fence.content.includes('function greet'))
  })

  it('syntax: at-snippet preset matches @snippet name', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      syntax: 'at-snippet',
    })

    const parserFn = md._registeredRules[0].fn
    const src = '@snippet sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }
    assert.equal(parserFn(state as any, 0, 1, false), true)
    assert.ok(tokens.find(t => t.type === 'fence'))
  })

  it('syntax: custom keyword string builds keyword: name pattern', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      syntax: 'code',
    })

    const parserFn = md._registeredRules[0].fn

    // snippet: should NOT match
    const src1 = 'snippet: sample_hello_world\n'
    const state1 = {
      src: src1,
      bMarks: [0],
      tShift: [0],
      eMarks: [src1.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
    }
    assert.equal(parserFn(state1 as any, 0, 1, false), false)

    // code: SHOULD match
    const src2 = 'code: sample_hello_world\n'
    const tokens: any[] = []
    const state2 = {
      src: src2,
      bMarks: [0],
      tShift: [0],
      eMarks: [src2.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }
    assert.equal(parserFn(state2 as any, 0, 1, false), true)
    assert.ok(tokens.find(t => t.type === 'fence'))
  })

  it('syntax: custom RegExp escape hatch', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, {
      rootDir: fixturesDir,
      dirs: ['.'],
      silent: true,
      syntax: /^include\s+(\S+)$/,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'include sample_hello_world\n'
    const tokens: any[] = []
    const state = {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env: {},
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
    }
    assert.equal(parserFn(state as any, 0, 1, false), true)
    assert.ok(tokens.find(t => t.type === 'fence'))
  })
})

// ── resolveSyntax ───────────────────────────────────────────────────────

describe('resolveSyntax', () => {
  it('returns snippet-colon preset by default', () => {
    const def = resolveSyntax()
    assert.ok(def.pattern.test('snippet: my_name'))
    assert.ok(def.pattern.test('snippet:my_name'))
    assert.ok(!def.pattern.test('<<< #my_name'))
    assert.equal(def.firstCharCode, 's'.charCodeAt(0))
  })

  it('resolves snippet-colon preset by name', () => {
    const def = resolveSyntax('snippet-colon')
    assert.ok(def.pattern.test('snippet: foo'))
  })

  it('resolves triple-chevron preset by name', () => {
    const def = resolveSyntax('triple-chevron')
    assert.ok(def.pattern.test('<<< #foo'))
    assert.ok(def.pattern.test('<<< @/path/to/file.cs'))
    assert.ok(!def.pattern.test('snippet: foo'))
    assert.equal(def.firstCharCode, '<'.charCodeAt(0))
  })

  it('resolves at-snippet preset by name', () => {
    const def = resolveSyntax('at-snippet')
    assert.ok(def.pattern.test('@snippet foo'))
    assert.ok(!def.pattern.test('snippet: foo'))
    assert.equal(def.firstCharCode, '@'.charCodeAt(0))
  })

  it('treats unknown string as keyword → keyword: name', () => {
    const def = resolveSyntax('code')
    assert.ok(def.pattern.test('code: my_name'))
    assert.ok(def.pattern.test('code:my_name'))
    assert.ok(!def.pattern.test('snippet: my_name'))
    assert.equal(def.firstCharCode, 'c'.charCodeAt(0))
  })

  it('accepts a custom RegExp directly', () => {
    const def = resolveSyntax(/^embed\s+(\S+)$/)
    assert.ok(def.pattern.test('embed my_name'))
    assert.equal(def.pattern.exec('embed my_name')![1], 'my_name')
  })

  it('DEFAULT_SYNTAX is snippet-colon', () => {
    assert.equal(DEFAULT_SYNTAX, 'snippet-colon')
  })

  it('SYNTAX_PRESETS has expected keys', () => {
    assert.ok(SYNTAX_PRESETS['snippet-colon'])
    assert.ok(SYNTAX_PRESETS['triple-chevron'])
    assert.ok(SYNTAX_PRESETS['at-snippet'])
  })
})

// ── isFileRef ────────────────────────────────────────────────────────────

describe('isFileRef', () => {
  it('returns true for @/ paths', () => {
    assert.equal(isFileRef('@/path/to/file.cs'), true)
  })

  it('returns true for @./ relative paths', () => {
    assert.equal(isFileRef('@./relative/file.cs'), true)
  })

  it('returns true for @../ relative paths', () => {
    assert.equal(isFileRef('@../parent/file.cs'), true)
  })

  it('returns false for named snippets', () => {
    assert.equal(isFileRef('sample_hello_world'), false)
  })
})

// ── parseFileRef ─────────────────────────────────────────────────────────

describe('parseFileRef', () => {
  it('parses simple file path', () => {
    const result = parseFileRef('@/path/file.cs')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: null,
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses file path with region', () => {
    const result = parseFileRef('@/path/file.cs#my_region')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: 'my_region',
      highlights: null,
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses file path with language override', () => {
    const result = parseFileRef('@/path/file.cs {ts}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: null,
      lang: 'ts',
      attrs: null,
      title: null,
    })
  })

  it('parses relative path with ./', () => {
    const result = parseFileRef('@./relative/file.cs')
    assert.deepEqual(result, {
      filePath: './relative/file.cs',
      region: null,
      highlights: null,
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses relative path with ../', () => {
    const result = parseFileRef('@../parent/file.ts')
    assert.deepEqual(result, {
      filePath: '../parent/file.ts',
      region: null,
      highlights: null,
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses highlights {1,3,5-8}', () => {
    const result = parseFileRef('@/path/file.cs {1,3,5-8}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: '1,3,5-8',
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses highlights with language {1,3 c#}', () => {
    const result = parseFileRef('@/path/file.cs {1,3 c#}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: '1,3',
      lang: 'c#',
      attrs: null,
      title: null,
    })
  })

  it('parses language with attrs {c# :line-numbers}', () => {
    const result = parseFileRef('@/path/file.cs {c# :line-numbers}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: null,
      lang: 'c#',
      attrs: ':line-numbers',
      title: null,
    })
  })

  it('parses all combined {1,3,5-8 c# :line-numbers}', () => {
    const result = parseFileRef('@/path/file.cs {1,3,5-8 c# :line-numbers}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: '1,3,5-8',
      lang: 'c#',
      attrs: ':line-numbers',
      title: null,
    })
  })

  it('parses [Title]', () => {
    const result = parseFileRef('@/path/file.cs [My Title]')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: null,
      lang: null,
      attrs: null,
      title: 'My Title',
    })
  })

  it('parses all modifiers with region', () => {
    const result = parseFileRef('@/path/file.cs#my_region {1,3,5-8 c# :line-numbers} [My Title]')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: 'my_region',
      highlights: '1,3,5-8',
      lang: 'c#',
      attrs: ':line-numbers',
      title: 'My Title',
    })
  })

  it('parses adjacent braces after region #region{1,3}', () => {
    const result = parseFileRef('@/path/file.cs#my_region{1,3}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: 'my_region',
      highlights: '1,3',
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses single highlight {5}', () => {
    const result = parseFileRef('@/path/file.cs {5}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: '5',
      lang: null,
      attrs: null,
      title: null,
    })
  })

  it('parses attrs with value {:line-numbers=5}', () => {
    const result = parseFileRef('@/path/file.cs {:line-numbers=5}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: null,
      lang: null,
      attrs: ':line-numbers=5',
      title: null,
    })
  })

  it('parses empty braces {}', () => {
    const result = parseFileRef('@/path/file.cs {}')
    assert.deepEqual(result, {
      filePath: '/path/file.cs',
      region: null,
      highlights: null,
      lang: null,
      attrs: null,
      title: null,
    })
  })
})

// ── resolveFileInclude ───────────────────────────────────────────────────

describe('resolveFileInclude', () => {
  it('includes an entire file', () => {
    const parsed = parseFileRef('@/fixtures/full-file.js')
    const result = resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP)
    assert.equal(result.lang, 'js')
    assert.ok(result.code.includes('function greet(name)'))
    assert.ok(result.code.includes('function farewell(name)'))
    assert.equal(result.startLine, 1)
  })

  it('extracts a region from a file', () => {
    const parsed = parseFileRef('@/fixtures/with-regions.ts#sample_interface')
    const result = resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP)
    assert.equal(result.lang, 'ts')
    assert.ok(result.code.includes('export interface User'))
    assert.ok(result.code.includes('email: string'))
    assert.ok(!result.code.includes('export class UserService'))
  })

  it('extracts a nested region from a file', () => {
    const parsed = parseFileRef('@/fixtures/with-regions.ts#sample_method')
    const result = resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP)
    assert.ok(result.code.includes('async getUser'))
    assert.ok(!result.code.includes('export class UserService'))
  })

  it('overrides language', () => {
    const parsed = parseFileRef('@/fixtures/full-file.js {csharp}')
    const result = resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP)
    assert.equal(result.lang, 'csharp')
  })

  it('resolves relative path from md file', () => {
    const mdPath = join(fixturesDir, '..', 'fake.md')
    const parsed = parseFileRef('@./fixtures/full-file.js')
    const result = resolveFileInclude(fixturesDir + '/..', mdPath, parsed, DEFAULT_LANG_MAP)
    assert.ok(result.code.includes('function greet'))
  })

  it('throws for missing file', () => {
    const parsed = parseFileRef('@/nonexistent/file.js')
    assert.throws(
      () => resolveFileInclude(fixturesDir, null, parsed, DEFAULT_LANG_MAP),
      /cannot read file/,
    )
  })

  it('throws for missing region', () => {
    const parsed = parseFileRef('@/fixtures/with-regions.ts#nonexistent_region')
    assert.throws(
      () => resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP),
      /region 'nonexistent_region' not found/,
    )
  })

  it('passes through highlights, attrs, and title', () => {
    const parsed = parseFileRef('@/fixtures/full-file.js {1,3,5-8 c# :line-numbers} [My Title]')
    const result = resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP)
    assert.equal(result.lang, 'c#')
    assert.equal(result.highlights, '1,3,5-8')
    assert.equal(result.attrs, ':line-numbers')
    assert.equal(result.title, 'My Title')
  })

  it('returns null for unset highlights/attrs/title', () => {
    const parsed = parseFileRef('@/fixtures/full-file.js')
    const result = resolveFileInclude(fixturesDir + '/..', null, parsed, DEFAULT_LANG_MAP)
    assert.equal(result.highlights, null)
    assert.equal(result.attrs, null)
    assert.equal(result.title, null)
  })
})

// ── plugin file-include integration ──────────────────────────────────────

describe('regionSnippetPlugin (file includes)', () => {
  function createMockMd() {
    const rules: any[] = []
    return {
      block: {
        ruler: {
          __rules__: [{ name: 'fence' }],
          before(refName: string, name: string, fn: any) {
            rules.push({ refName, name, fn })
          },
        },
      },
      _registeredRules: rules,
    }
  }

  function createState(src: string, env: Record<string, unknown> = {}) {
    const tokens: any[] = []
    return {
      src,
      bMarks: [0],
      tShift: [0],
      eMarks: [src.indexOf('\n')],
      sCount: [0],
      blkIndent: 0,
      line: 0,
      env,
      push(type: string, tag: string, nesting: number) {
        const t ={ type, tag, nesting, info: '', content: '', markup: '', map: null }
        tokens.push(t)
        return t
      },
      _tokens: tokens,
    }
  }

  it('handles file include with snippet: @/path syntax', () => {
    const md = createMockMd()
    // rootDir is the parent of test/fixtures
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'js')
    assert.ok(fence.content.includes('function greet'))
  })

  it('handles file include with region', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/with-regions.ts#sample_interface\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'ts')
    assert.ok(fence.content.includes('export interface User'))
    assert.ok(!fence.content.includes('export class UserService'))
  })

  it('handles file include with language override', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js {typescript}\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'typescript')
  })

  it('emits source links for file includes when urlPrefix set', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, {
      rootDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    parserFn(state as any, 0, 1, false)

    // anchor + fence + source link = 3 tokens
    assert.equal(state._tokens.length, 3)
    assert.equal(state._tokens[0].type, 'html_block')
    assert.equal(state._tokens[1].type, 'fence')
    assert.equal(state._tokens[2].type, 'html_block')
    assert.ok(state._tokens[2].content.includes('fixtures/full-file.js'))
    assert.ok(state._tokens[2].content.includes('snippet source'))
  })

  it('anchor: false suppresses anchor for file includes', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, {
      rootDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
      anchor: false,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    parserFn(state as any, 0, 1, false)

    // fence + source link = 2 tokens (no anchor)
    assert.equal(state._tokens.length, 2)
    assert.equal(state._tokens[0].type, 'fence')
    assert.equal(state._tokens[1].type, 'html_block')
    assert.ok(state._tokens[1].content.includes('snippet source'))
  })

  it('sourceLink: false suppresses source link for file includes', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, {
      rootDir,
      dirs: ['.'],
      silent: true,
      urlPrefix: 'https://github.com/example/repo/blob/main',
      sourceLink: false,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    parserFn(state as any, 0, 1, false)

    // anchor + fence = 2 tokens (no source link)
    assert.equal(state._tokens.length, 2)
    assert.equal(state._tokens[0].type, 'html_block')
    assert.ok(state._tokens[0].content.includes("id='snippet-file-"))
    assert.equal(state._tokens[1].type, 'fence')
  })

  it('file includes bypass the include filter', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, {
      rootDir,
      dirs: ['.'],
      silent: true,
      include: /^sample_hello/,
    })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    // File includes should work regardless of include filter
    assert.equal(parserFn(state as any, 0, 1, false), true)
  })

  it('returns true for silent mode on file includes', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, true), true)
  })

  it('named snippets still work alongside file includes', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, { rootDir: fixturesDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'csharp')
  })

  it('builds fence info with highlights', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js {1,3,5-8}\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'js{1,3,5-8}')
  })

  it('builds fence info with all modifiers', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js {1,3 typescript :line-numbers} [My File]\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'typescript{1,3}[My File]  :line-numbers')
  })

  it('builds fence info with title only', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js [My Title]\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'js[My Title]')
  })

  it('fileIncludes: false skips file references', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true, fileIncludes: false })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/full-file.js\n'
    const state = createState(src)

    // Should return false so downstream rules can handle it
    assert.equal(parserFn(state as any, 0, 1, false), false)
  })

  it('fileIncludes: false still allows named snippets', () => {
    const md = createMockMd()
    regionSnippetPlugin(md as any, { rootDir: fixturesDir, dirs: ['.'], silent: true, fileIncludes: false })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: sample_hello_world\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)
    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'csharp')
  })

  it('strict: false emits warning fence for missing file', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true, strict: false })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/nonexistent/file.js\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.ok(fence.content.includes('\u26A0'))
    assert.ok(fence.content.includes('cannot read file'))
  })

  it('strict: false emits warning fence for missing region', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, { rootDir, dirs: ['.'], silent: true, strict: false })

    const parserFn = md._registeredRules[0].fn
    const src = 'snippet: @/fixtures/with-regions.ts#nonexistent_region\n'
    const state = createState(src)

    assert.equal(parserFn(state as any, 0, 1, false), true)

    const fence = state._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.ok(fence.content.includes('\u26A0'))
    assert.ok(fence.content.includes("region 'nonexistent_region' not found"))
  })

  it('fileIncludes: false with triple-chevron skips <<< @/path', () => {
    const md = createMockMd()
    const rootDir = join(fixturesDir, '..')
    regionSnippetPlugin(md as any, {
      rootDir,
      dirs: ['.'],
      silent: true,
      syntax: 'triple-chevron',
      fileIncludes: false,
    })

    const parserFn = md._registeredRules[0].fn

    // <<< @/path should be skipped
    const src1 = '<<< @/fixtures/full-file.js\n'
    const state1 = createState(src1)
    assert.equal(parserFn(state1 as any, 0, 1, false), false)

    // <<< #name should still work
    const src2 = '<<< #sample_hello_world\n'
    const state2 = createState(src2)
    assert.equal(parserFn(state2 as any, 0, 1, false), true)
    const fence = state2._tokens.find(t => t.type === 'fence')
    assert.ok(fence)
    assert.equal(fence.info, 'csharp')
  })
})
