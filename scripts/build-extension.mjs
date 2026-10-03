import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execSync} from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const target = (process.argv[2] || 'firefox').toLowerCase()

if (!['firefox', 'chrome', 'all'].includes(target)) {
  console.error('Usage: node scripts/build-extension.mjs <firefox|chrome|all>')
  process.exit(1)
}

const targets = target === 'all' ? ['firefox', 'chrome'] : [target]

function run(cmd) {
  execSync(cmd, {cwd: root, stdio: 'inherit'})
}

function copyAssets(outDir) {
  const srcRoot = join(root, 'src')
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, relPath)
        continue
      }

      if (!/\.(html|png|woff2)$/i.test(entry.name)) {
        continue
      }

      // Skip JSON manifests / partner JSON from blanket copy — handled separately.
      const dest = join(outDir, relPath)
      mkdirSync(dirname(dest), {recursive: true})
      cpSync(full, dest)
    }
  }

  walk(srcRoot)
}

function mergeManifest(browser) {
  const shared = JSON.parse(readFileSync(join(root, 'src/manifest.shared.json'), 'utf8'))
  const overlay = JSON.parse(
    readFileSync(join(root, `src/manifest.${browser}.json`), 'utf8'),
  )
  return {...shared, ...overlay}
}

function buildOne(browser) {
  const outDir = join(root, browser === 'chrome' ? 'dist-chrome' : 'dist-firefox')
  console.log(`\n→ Building ${browser} → ${outDir}`)
  rmSync(outDir, {recursive: true, force: true})
  mkdirSync(outDir, {recursive: true})

  run(`npx tsc --outDir "${outDir}"`)
  rmSync(join(outDir, 'tests'), {recursive: true, force: true})
  copyAssets(outDir)

  const manifest = mergeManifest(browser)
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  run(`node scripts/strip-content-script-export.mjs "${outDir}"`)

  if (!existsSync(join(outDir, 'background.js')) || !existsSync(join(outDir, 'content-script.js'))) {
    throw new Error(`Build incomplete for ${browser}: missing JS entry`)
  }

  console.log(`✓ ${browser} build ready (${manifest.version})`)
}

for (const browser of targets) {
  buildOne(browser)
}
