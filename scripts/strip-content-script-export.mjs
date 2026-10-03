import {readFileSync, writeFileSync, existsSync} from 'node:fs'
import {resolve} from 'node:path'

const targetDir = process.argv[2] ? resolve(process.argv[2]) : resolve('dist')
const path = resolve(targetDir, 'content-script.js')

if (!existsSync(path)) {
  console.error(`strip-content-script-export: missing ${path}`)
  process.exit(1)
}

let source = readFileSync(path, 'utf8')
source = source.replace(/\r?\nexport\s*\{\s*\};?\s*(?:\/\/.*)?\s*$/m, '\n')
writeFileSync(path, source)
