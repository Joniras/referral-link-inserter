import {existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execSync} from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const target = (process.argv[2] || '').toLowerCase()

if (!['firefox', 'chrome'].includes(target)) {
  console.error('Usage: node scripts/package-extension.mjs <firefox|chrome>')
  process.exit(1)
}

const outDir = join(root, target === 'chrome' ? 'dist-chrome' : 'dist-firefox')
const manifestPath = join(outDir, 'manifest.json')

if (!existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath}. Run npm run build:${target} first.`)
  process.exit(1)
}

const {version, name} = JSON.parse(readFileSync(manifestPath, 'utf8'))
const slug = String(name || 'opensource-partner-support')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

const artifacts = join(root, 'artifacts')
mkdirSync(artifacts, {recursive: true})

const artifact =
  target === 'chrome'
    ? join(artifacts, `${slug}-${version}-chrome.zip`)
    : join(artifacts, `${slug}-${version}.xpi`)

rmSync(artifact, {force: true})

// bestzip paths are relative to cwd; zip contents of dist without nesting the folder.
execSync(`npx bestzip "${artifact}" *`, {cwd: outDir, stdio: 'inherit'})
console.log(`✓ Packaged ${artifact}`)
