import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPackingClient, type WorkerLike } from '@/engine/client'
import { computeTypeScript, type EngineResponse } from '@/engine/protocol'
import { products, cartons, cushions } from '@/data'

const input = { products, cartons, cushions, orderLines: [], limit: 3 }
class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null
  onerror: WorkerLike['onerror'] = null
  requests: number[] = []
  terminated = false
  postMessage(request: { id: number }) { this.requests.push(request.id) }
  terminate() { this.terminated = true }
  reply(id: number) {
    const data: EngineResponse = { id, result: computeTypeScript(input), engine: 'rust-wasm' }
    this.onmessage?.({ data } as MessageEvent<EngineResponse>)
  }
}
test('worker client ignores stale results and resolves superseded requests', async () => {
  const worker = new FakeWorker()
  const client = createPackingClient(() => worker)
  const first = client.compute(input)
  const second = client.compute(input)
  assert.equal(await first, null)
  worker.reply(1)
  worker.reply(2)
  assert.equal((await second)?.id, 2)
  client.dispose()
  assert.equal(worker.terminated, true)
})
test('worker construction failure falls back to TypeScript', async () => {
  const client = createPackingClient(() => { throw new Error('Unavailable') })
  assert.equal((await client.compute(input))?.engine, 'typescript')
  client.dispose()
})
test('worker runtime failure falls back and does not leave a pending promise', async () => {
  const worker = new FakeWorker()
  const client = createPackingClient(() => worker)
  const response = client.compute(input)
  worker.onerror?.({} as ErrorEvent)
  assert.equal((await response)?.engine, 'typescript')
  assert.equal(worker.terminated, true)
  assert.equal((await client.compute(input))?.engine, 'typescript')
  client.dispose()
})
test('worker error messages fall back even when the error text is empty', async () => {
  const worker = new FakeWorker()
  const client = createPackingClient(() => worker)
  const pending = client.compute(input)
  worker.onmessage?.({ data: { id: 1, error: '' } } as MessageEvent<{ id: number; error: string }>)
  assert.equal((await pending)?.engine, 'typescript')
  client.dispose()
})
test('postMessage failure falls back and terminates the worker', async () => {
  const worker = new FakeWorker()
  worker.postMessage = () => { throw new Error('Cannot clone input') }
  const client = createPackingClient(() => worker)
  assert.equal((await client.compute(input))?.engine, 'typescript')
  assert.equal(worker.terminated, true)
  client.dispose()
})
test('worker timeout terminates the worker and falls back', async () => {
  const worker = new FakeWorker()
  const client = createPackingClient(() => worker, 5)
  assert.equal((await client.compute(input))?.engine, 'typescript')
  assert.equal(worker.terminated, true)
  client.dispose()
})
test('disposing the client resolves pending work and prevents future work', async () => {
  const client = createPackingClient(() => new FakeWorker())
  const pending = client.compute(input)
  client.dispose()
  assert.equal(await pending, null)
  assert.equal(await client.compute(input), null)
})
