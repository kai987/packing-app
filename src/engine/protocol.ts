import {
  recommendPacking,
  recommendSplitPacking,
  type Recommendation,
  type SplitPackingRecommendation,
} from '@/packing'

export type PackingInput = Parameters<typeof recommendPacking>[0] & { limit?: number }
export type PackingResult = {
  recommendations: Recommendation[]
  splitRecommendations: SplitPackingRecommendation[]
}
export type EngineKind = 'rust-wasm' | 'typescript'
export type EngineResponse = {
  id: number
  result: PackingResult
  engine: EngineKind
}
export type EngineRequest = { id: number; input: PackingInput }
export type EngineMessage = EngineResponse | { id: number; error: string }

export function computeTypeScript(input: PackingInput): PackingResult {
  return {
    recommendations: recommendPacking(input).slice(0, input.limit),
    splitRecommendations: recommendSplitPacking(input).slice(0, input.limit),
  }
}

export function serializeRustInput(input: PackingInput): string {
  const productIds = [...new Set(input.products.map(product => product.id))]
  const unitIds = input.orderLines.flatMap(line =>
    Array.from({ length: line.quantity }, (_, index) => `${line.productId}-${index + 1}`),
  )
  return JSON.stringify({
    ...input,
    unitOrder: [...new Set(unitIds)].sort((a, b) => a.localeCompare(b)),
    productOrder: productIds.sort((a, b) => a.localeCompare(b)),
  })
}
