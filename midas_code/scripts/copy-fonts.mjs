import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'fonts')
mkdirSync(dest, { recursive: true })

const files = [
  ['@fontsource/archivo/files/archivo-latin-400-normal.woff2', 'archivo-latin-400-normal.woff2'],
  ['@fontsource/archivo/files/archivo-latin-600-normal.woff2', 'archivo-latin-600-normal.woff2'],
  ['@fontsource/archivo/files/archivo-latin-800-normal.woff2', 'archivo-latin-800-normal.woff2'],
  ['@fontsource/inter/files/inter-latin-400-normal.woff2', 'inter-latin-400-normal.woff2'],
  ['@fontsource/inter/files/inter-latin-500-normal.woff2', 'inter-latin-500-normal.woff2'],
  ['@fontsource/inter/files/inter-latin-600-normal.woff2', 'inter-latin-600-normal.woff2'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2', 'space-grotesk-latin-500-normal.woff2'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2', 'space-grotesk-latin-600-normal.woff2'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2', 'space-grotesk-latin-700-normal.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jetbrains-mono-latin-500-normal.woff2'],
]

for (const [srcRel, name] of files) {
  copyFileSync(join(root, 'node_modules', srcRel), join(dest, name))
}