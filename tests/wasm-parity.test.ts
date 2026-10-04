import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cartons, cushions, defaultOrderLines, products } from '@/data'
import { buildVoidFillBlocks, type Recommendation } from '@/packing'
import { computeTypeScript, type PackingInput, type PackingResult } from '@/engine/protocol'
import { computeRust } from './helpers/rust-engine'

function withoutCachedBlocks(result: PackingResult) {
  return JSON.parse(JSON.stringify(result, (key, value) => key === 'voidFillBlocks' ? undefined : value))
}
function compare(input: PackingInput) {
  const ts = computeTypeScript(input)
  const wasm = computeRust(input)
  // JSON transport normalizes signed zero; all other values and ordering must match.
  assert.deepEqual(withoutCachedBlocks(wasm), withoutCachedBlocks(ts))
  const plans = (result: PackingResult): Recommendation[] => [
    ...result.recommendations,
    ...result.splitRecommendations.flatMap(split => split.boxes.map(box => box.recommendation)),
  ]
  const tsPlans = plans(ts)
  for (const [index, plan] of plans(wasm).entries()) {
    assert.deepEqual(plan.voidFillBlocks, buildVoidFillBlocks(tsPlans[index]))
  }
}

for (const strategy of ['compact', 'stable'] as const) {
  for (const wrap of [false, true]) {
    test(`WASM parity: ${strategy}, wrap=${wrap}, all candidates and void blocks`, () => {
      compare({ products, cartons, cushions, strategy,
        orderLines: defaultOrderLines.map(line => ({ ...line, useItemWrap: wrap })) })
    })
  }
}
test('WASM parity: empty order and result limit', () => {
  compare({ products, cartons, cushions, orderLines: [] })
  compare({ products, cartons, cushions, orderLines: defaultOrderLines, limit: 3 })
})
test('WASM parity: heuristic split search over 12 items and multi-digit unit IDs', () => {
  compare({ products, cartons, cushions, orderLines: [{ productId: products[0].id, quantity: 13, useItemWrap: true }], limit: 3 })
})
test('WASM parity: fractional dimensions and weights, mixed fragile products', () => {
  compare({ products: products.map((p, index) => ({ ...p,
    size: { length: p.size.length + 0.25, width: p.size.width + 0.5, height: p.size.height + 0.75 }, weight: 100.5 + index * 20.25,
  })), cartons, cushions, orderLines: defaultOrderLines, limit: 3 })
})
