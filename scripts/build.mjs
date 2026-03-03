// Build script: uses oxc-transform to compile .ts → .mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname, relative, extname } from 'node:path'
import { transform } from 'oxc-transform'

const SRC = 'src'
const DIST = 'dist'

// Clean dist
rmSync(DIST, { recursive: true, force: true })

// Recursively find all .ts files in src/
function findTs(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findTs(full))
    } else if (extname(entry.name) === '.ts') {
      results.push(full)
    }
  }
  return results
}

const files = findTs(SRC)

for (const file of files) {
  const source = readFileSync(file, 'utf-8')

  // Transform: strip TypeScript types
  const result = transform(file, source, { typescript: { declaration: false } })

  if (result.errors.length > 0) {
    console.error(`Error transforming ${file}:`)
    for (const err of result.errors) {
      console.error(`  ${err.message}`)
    }
    process.exit(1)
  }

  let code = result.code

  // Rewrite import/export extensions: .js → .mjs
  code = code.replace(
    /(from\s+['"])([^'"]+)(\.js)(['"])/g,
    '$1$2.mjs$4'
  )

  // Also rewrite .mjs imports that were already .mjs (e.g. markdown-it types)
  // No-op since they're already .mjs, but handle any .ts → .mjs needed
  // The regex above handles .js → .mjs; oxc-transform strips type-only imports

  // Compute output path: src/foo.ts → dist/foo.mjs
  const rel = relative(SRC, file)
  const outPath = join(DIST, rel.replace(/\.ts$/, '.mjs'))

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, code)
}

console.log(`Built ${files.length} files → ${DIST}/`)
