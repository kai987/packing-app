import { useMemo } from 'react'
import { computeTypeScript, type PackingInput } from '@/engine/protocol'

export default function usePackingEngine(input: PackingInput) {
  const result = useMemo(() => computeTypeScript(input), [input])
  return { ...result, isComputing: false, error: null }
}
