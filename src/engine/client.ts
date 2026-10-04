import { computeTypeScript, type EngineMessage, type EngineRequest, type EngineResponse, type PackingInput } from './protocol'

export type WorkerLike = {
  onmessage: ((event: MessageEvent<EngineMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage: (request: EngineRequest) => void
  terminate: () => void
}
export type PackingClient = {
  compute: (input: PackingInput) => Promise<EngineResponse | null>
  dispose: () => void
}

export function createPackingClient(createWorker: () => WorkerLike, timeoutMs = 30_000): PackingClient {
  let worker: WorkerLike | null = null
  let disposed = false
  let nextId = 0
  let pending: {
    id: number
    input: PackingInput
    resolve: (response: EngineResponse | null) => void
    reject: (error: unknown) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  function settle(response: EngineResponse | null) {
    if (!pending) return
    clearTimeout(pending.timer)
    const { resolve } = pending
    pending = null
    resolve(response)
  }
  function fallback() {
    worker?.terminate()
    worker = null
    if (!pending) return
    const { id, input, reject } = pending
    try {
      settle({ id, result: computeTypeScript(input), engine: 'typescript' })
    } catch (error) {
      clearTimeout(pending.timer)
      pending = null
      reject(error)
    }
  }
  try {
    worker = createWorker()
    worker.onmessage = event => {
      if (!pending || event.data.id !== pending.id) return
      if ('error' in event.data) fallback()
      else settle(event.data)
    }
    worker.onerror = event => {
      event.preventDefault?.()
      fallback()
    }
  } catch {
    worker = null
  }
  return {
    compute(input) {
      if (disposed) return Promise.resolve(null)
      settle(null)
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending = { id, input, resolve, reject, timer: setTimeout(fallback, timeoutMs) }
        if (worker) {
          try { worker.postMessage({ id, input }) } catch { fallback() }
        } else fallback()
      })
    },
    dispose() {
      disposed = true
      settle(null)
      worker?.terminate()
      worker = null
    },
  }
}
