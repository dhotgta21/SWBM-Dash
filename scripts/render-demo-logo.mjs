import sharp from 'sharp'
import fs from 'fs'

const svgPath = 'public/logo-demo-mark.svg'
const svg = fs.readFileSync(svgPath)

async function writeAll() {
  const base = () =>
    sharp(svg, { density: 300 }).resize(512, 512, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })

  await base().png().toFile('public/Logo.png')
  await base().webp({ quality: 95 }).toFile('public/Logo.webp')
  await sharp(svg).resize(192, 192).png().toFile('public/logo-square.png')
  await sharp(svg).resize(192, 192).webp({ quality: 95 }).toFile('public/logo-square.webp')
  await sharp(svg).resize(128, 128).png().toFile('public/logo-email.png')

  const svgDark = fs
    .readFileSync(svgPath, 'utf8')
    .replace(/#b91c1c/gi, '#0f172a')
  await sharp(Buffer.from(svgDark)).resize(256, 256).png().toFile('public/logo-mono-dark.png')

  const svgMonoLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0f172a"/>
  <text x="256" y="286" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="210" font-weight="900" letter-spacing="-8" fill="#ffffff">DB</text>
</svg>`
  await sharp(Buffer.from(svgMonoLight)).resize(256, 256).png().toFile('public/logo-mono-light.png')

  for (const s of [16, 32, 48, 192, 512]) {
    await sharp(svg).resize(s, s).png().toFile(`public/icon-${s}x${s}.png`)
    await sharp(svg).resize(s, s).webp({ quality: 95 }).toFile(`public/icon-${s}x${s}.webp`)
  }
  await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png')
  console.log('DB monogram logos written')
}

writeAll().catch((e) => {
  console.error(e)
  process.exit(1)
})
