import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { URL } from 'node:url'
import { products, cartons, cushions, defaultOrderLines } from '@/data'
import { computeTypeScript, type EngineResponse } from '@/engine/protocol'

for (const failWasm of [false, true]) {
  test(`actual worker: ${failWasm ? 'WASM fetch failure uses TypeScript' : 'Rust/WASM executes off the main thread'}`, async () => {
    const worker = new Worker(new URL('./helpers/worker-host.mjs', import.meta.url), {
      workerData: { failWasm, url: new URL('../public/packing-engine/packing.worker.js', import.meta.url).href },
    })
    try {
      await once(worker, 'message')
      const input = { products, cartons, cushions, orderLines: defaultOrderLines, limit: 3 }
      const received = once(worker, 'message')
      worker.postMessage({ id: 7, input })
      const [response]: [EngineResponse] = await received as [EngineResponse]
      assert.equal(response.id, 7)
      assert.equal(response.engine, failWasm ? 'typescript' : 'rust-wasm')
      const clean = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === 'voidFillBlocks' ? undefined : item))
      assert.deepEqual(clean(response.result), clean(computeTypeScript(input)))
    } finally { await worker.terminate() }
  })
}
