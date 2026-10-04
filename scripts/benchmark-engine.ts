import { performance } from 'node:perf_hooks'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { URL } from 'node:url'
import { products, cartons, cushions, defaultOrderLines } from '../src/data'
import { computeTypeScript } from '../src/engine/protocol'
import { computeRust } from '../tests/helpers/rust-engine'

const input = { products, cartons, cushions, orderLines: defaultOrderLines, limit: 3 }
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
for (const [engine, compute] of [['typescript', computeTypeScript], ['rust-wasm', computeRust]] as const) {
  compute(input)
  const values = Array.from({ length: 15 }, () => {
    const start = performance.now()
    compute(input)
    return performance.now() - start
  })
  console.log(JSON.stringify({ engine, medianMs: median(values), runs: values.length }))
}
const started = performance.now()
const worker = new Worker(new URL('../tests/helpers/worker-host.mjs', import.meta.url), {
  workerData: { url: new URL('../public/packing-engine/packing.worker.js', import.meta.url).href },
})
try {
  await once(worker, 'message')
  const request = async (id: number) => {
    const result = once(worker, 'message')
    worker.postMessage({ id, input })
    await result
  }
  await request(0)
  console.log(JSON.stringify({ engine: 'worker-cold-start', milliseconds: performance.now() - started }))
  const values = []
  for (let i = 1; i <= 15; i += 1) {
    const start = performance.now()
    await request(i)
    values.push(performance.now() - start)
  }
  console.log(JSON.stringify({ engine: 'rust-wasm-worker-roundtrip', medianMs: median(values), runs: values.length }))
} finally { await worker.terminate() }
