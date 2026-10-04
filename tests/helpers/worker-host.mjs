import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'

// Run the actual browser worker bundle under Node with only its host APIs shimmed.
globalThis.location = { href: workerData.url }
globalThis.postMessage = message => parentPort.postMessage(message)
globalThis.fetch = async url => {
  if (workerData.failWasm) throw new Error('Simulated WASM fetch failure')
  return new Response(await readFile(new URL(url)), { headers: { 'Content-Type': 'application/wasm' } })
}
await import(workerData.url)
parentPort.on('message', data => globalThis.onmessage({ data }))
parentPort.postMessage({ ready: true })
