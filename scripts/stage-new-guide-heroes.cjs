// One-shot helper: download generated PNG hero images from the matrix
// CDN, then re-encode them to webp and move into public/guides/.
//
// Re-run by passing --force to overwrite existing webp targets.
//
// Mapping (slug → CDN URL) is hard-coded here because the matrix MCP
// only returns a public CDN URL — downloading and renaming is what
// ties each generation back to a deterministic /public/guides/{slug}
// path that the markdown frontmatter expects.

const path = require('node:path')
const fs = require('node:fs')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const STAGING = path.join(ROOT, '.guide-hero-staging')
fs.mkdirSync(STAGING, { recursive: true })
fs.mkdirSync(path.join(ROOT, 'public', 'guides'), { recursive: true })

const PAIRS = [
  { slug: 'lay-a-brick-wall', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202349_dc3d5220.png' },
  { slug: 'mix-concrete', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202350_dd0c75c1.png' },
  { slug: 'lay-a-concrete-base', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202353_3e4b33cd.png' },
  { slug: 'build-a-timber-deck', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202350_548b374a.png' },
  { slug: 'tile-a-wall', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202348_a6eea355.png' },
  { slug: 'plaster-a-wall', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202385_5934fda9.png' },
  { slug: 'install-an-outdoor-tap', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202387_e8b4e231.png' },
  { slug: 'fit-guttering', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202389_669e6898.png' },
  { slug: 'build-a-fence-panel', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202386_7835ddd6.png' },
  { slug: 'insulate-a-loft', url: 'https://agent-cdn.minimax.io/mcp/u524132598012665858/image_tool/output/1783202386_9947af76.png' },
]

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

async function main() {
  for (const { slug, url } of PAIRS) {
    const tmpPng = path.join(STAGING, `${slug}.png`)
    const webpDest = path.join(ROOT, 'public', 'guides', `${slug}-hero.webp`)
    console.log(`downloading ${slug}…`)
    await download(url, tmpPng)
    await sharp(tmpPng)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toFile(webpDest)
    const size = fs.statSync(webpDest).size
    console.log(`  wrote ${path.relative(ROOT, webpDest)} (${(size / 1024).toFixed(1)} KB)`)
  }
  // Cleanup staging PNGs.
  fs.rmSync(STAGING, { recursive: true, force: true })
  console.log('cleaned staging')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
