import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(here, 'checkout-image.svg'))

const out = join(here, '..', 'public', 'checkout-image.png')
mkdirSync(join(here, '..', 'public'), { recursive: true })

await sharp(svg, { density: 300 })
  .resize(1024, 1024)
  .png({ quality: 95, compressionLevel: 9 })
  .toFile(out)

console.log('wrote', out)
