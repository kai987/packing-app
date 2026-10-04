import { useEffect, useRef, useState } from 'react'
import { createPackingClient, type PackingClient } from '@/engine/client'
import type { PackingInput, PackingResult } from '@/engine/protocol'

const empty: PackingResult = { recommendations: [], splitRecommendations: [] }

export default function usePackingEngine(input: PackingInput) {
  const client = useRef<PackingClient | null>(null)
  const [state, setState] = useState<{
    input: PackingInput | null; result: PackingResult; error: string | null
  }>({ input: null, result: empty, error: null })

  useEffect(() => {
    // Expo serves public assets at / in development, ignoring the export base path.
    const base = __DEV__ ? '' : process.env.EXPO_BASE_URL ?? ''
    const engine = createPackingClient(() => new Worker(`${base}/packing-engine/packing.worker.js`, { type: 'module' }))
    client.current = engine
    return () => { engine.dispose(); client.current = null }
  }, [])

  useEffect(() => {
    let active = true
    void client.current?.compute(input).then(response => {
      if (active && response) setState({ input, result: response.result, error: null })
    }).catch(error => {
      if (active) setState({ input, result: empty, error: error instanceof Error ? error.message : String(error) })
    })
    return () => { active = false }
  }, [input])

  const isComputing = state.input !== input
  return { ...(isComputing ? empty : state.result), isComputing, error: isComputing ? null : state.error }
}
