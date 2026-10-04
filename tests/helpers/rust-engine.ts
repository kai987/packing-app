import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, URL } from 'node:url'
import { serializeRustInput, type PackingInput, type PackingResult } from '@/engine/protocol'

const require = createRequire(import.meta.url)
const url = pathToFileURL(require.resolve('../../public/packing-engine/packing_core.js'))
const wasm = await import(url.href)
wasm.initSync({ module: readFileSync(new URL('../../public/packing-engine/packing_core_bg.wasm', import.meta.url)) })

export function computeRust(input: PackingInput): PackingResult {
  return JSON.parse(wasm.compute(serializeRustInput(input)))
}
