import { computeTypeScript, serializeRustInput, type EngineRequest, type EngineResponse } from './protocol'

type WasmModule = { default: () => Promise<unknown>; compute: (json: string) => string }
type WorkerScope = {
  location: { href: string }
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null
  postMessage: (message: EngineResponse | { id: number; error: string }) => void
}
const scope = globalThis as unknown as WorkerScope
let wasm: WasmModule | null = null
let latest: EngineRequest | null = null
let running = false
const ready = (async () => {
  try {
    const url = new URL('./packing_core.js', scope.location.href).href
    const module: WasmModule = await import(url)
    await module.default()
    wasm = module
  } catch (error) {
    console.warn('Rust packing engine unavailable; using TypeScript in the worker.', error)
  }
})()

async function processLatest() {
  if (running) return
  running = true
  await ready
  while (latest) {
    const { id, input } = latest
    latest = null
    try {
      if (wasm) {
        try {
          const result = JSON.parse(wasm.compute(serializeRustInput(input)))
          scope.postMessage({ id, result, engine: 'rust-wasm' })
          continue
        } catch (error) {
          console.warn('Rust packing engine failed; using TypeScript in the worker.', error)
          wasm = null
        }
      }
      scope.postMessage({ id, result: computeTypeScript(input), engine: 'typescript' })
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  running = false
}

scope.onmessage = event => {
  latest = event.data
  void processLatest()
}
