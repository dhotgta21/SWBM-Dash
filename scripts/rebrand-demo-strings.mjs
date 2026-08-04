import fs from 'fs'
import path from 'path'

const roots = ['app', 'components', 'lib']
const skipDirs = new Set(['node_modules', 'content'])

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p)
  }
  return out
}

let files = []
for (const r of roots) {
  if (fs.existsSync(r)) files = files.concat(walk(r))
}

const replacements = [
  [/Star Hawk Builders Merchant Ltd\./g, 'Demo Builder Merchant'],
  [/Star Hawk Builders Merchant/g, 'Demo Builder Merchant'],
  [/Star Hawk Blog/g, 'Demo Builder Merchant Blog'],
  [/Why builders choose Star Hawk\b/g, 'Why builders choose Demo Builder Merchant'],
  [/from Star Hawk\b/g, 'from Demo Builder Merchant'],
  [/contact Star Hawk\b/g, 'contact Demo Builder Merchant'],
  [/using Star Hawk\b/g, 'using Demo Builder Merchant'],
  [/at Star Hawk\b/g, 'at Demo Builder Merchant'],
  [/by Star Hawk\b/g, 'by Demo Builder Merchant'],
  [/with Star Hawk\b/g, 'with Demo Builder Merchant'],
  [/the Star Hawk /g, 'the Demo Builder Merchant '],
  [/your Star Hawk /g, 'your Demo Builder Merchant '],
  [/Star Hawk trade/g, 'Demo Builder Merchant trade'],
  [/Star Hawk account/g, 'Demo Builder Merchant account'],
  [/Star Hawk client/g, 'Demo Builder Merchant client'],
  [/Star Hawk product/g, 'Demo Builder Merchant product'],
  [/Star Hawk supplies/g, 'Demo Builder Merchant supplies'],
  [/Star Hawk has on file/g, 'Demo Builder Merchant has on file'],
  [/Operator sign-in for the Star Hawk/g, 'Operator sign-in for the Demo Builder Merchant'],
  [/supplied by Star Hawk/g, 'supplied by Demo Builder Merchant'],
  [/\| Star Hawk'/g, "| Demo Builder Merchant'"],
  [/\| Star Hawk"/g, '| Demo Builder Merchant"'],
  [/\| Star Hawk`/g, '| Demo Builder Merchant`'],
  [/\| Star Hawk /g, '| Demo Builder Merchant '],
  [/Page \$\{currentPage\} \| Star Hawk/g, 'Page ${currentPage} | Demo Builder Merchant'],
]

let changed = 0
for (const file of files) {
  const rel = file.replace(/\\/g, '/')
  if (rel.endsWith('lib/demo/brand.ts')) continue
  if (rel.includes('.test.')) continue
  let c = fs.readFileSync(file, 'utf8')
  const orig = c
  for (const [re, to] of replacements) {
    c = c.replace(re, to)
  }
  if (c !== orig) {
    fs.writeFileSync(file, c)
    changed++
    console.log('updated', rel)
  }
}
console.log('files changed', changed)
