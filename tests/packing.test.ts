import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cartons, cushions, defaultOrderLines, products } from '@/data'
import {
  getAppText,
  getLocalizedCatalog,
  getLocalizedCatalogMaps,
  localizeRecommendation,
} from '@/localization'
import {
  buildVoidFillBlocks,
  getRecommendationReasons,
  recommendPacking,
  recommendSplitPacking,
  type Carton,
  type CushionProfile,
  type Dimensions,
  type Product,
  type Recommendation,
} from '@/packing'

const cushion: CushionProfile = {
  id: 'air-cap-light',
  name: 'Test cushion',
  sidePadding: 5,
  topPadding: 8,
  bottomPadding: 8,
  stabilityBonus: 8,
  voidFillUnitVolume: 300_000,
  note: '',
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product',
    brand: 'Test',
    name: 'Test product',
    category: 'Test',
    size: { length: 100, width: 80, height: 60 },
    weight: 100,
    fragility: 'low',
    color: '#5698d4',
    note: '',
    ...overrides,
  }
}

function makeCarton(overrides: Partial<Carton> = {}): Carton {
  return {
    id: 'test-carton',
    code: 'TEST',
    label: 'Test carton',
    service: 'Test service',
    inner: { length: 250, width: 200, height: 160 },
    maxWeight: null,
    volumetricWeight: 1500,
    note: '',
    ...overrides,
  }
}

function makeInput(
  overrides: Partial<Parameters<typeof recommendPacking>[0]> = {},
): Parameters<typeof recommendPacking>[0] {
  return {
    products: [makeProduct()],
    cartons: [makeCarton()],
    cushions: [cushion],
    orderLines: [{ productId: 'test-product', quantity: 1, useItemWrap: false }],
    ...overrides,
  }
}

function volume(size: Dimensions) {
  return size.length * size.width * size.height
}

function overlaps(
  left: Dimensions & { x: number; y: number; z: number },
  right: Dimensions & { x: number; y: number; z: number },
) {
  return (
    left.x < right.x + right.length && right.x < left.x + left.length &&
    left.y < right.y + right.width && right.y < left.y + left.width &&
    left.z < right.z + right.height && right.z < left.z + left.height
  )
}

function assertValidLayout(plan: Recommendation) {
  for (const placement of plan.placements) {
    assert.ok(placement.x >= 0 && placement.y >= 0 && placement.z >= 0)
    assert.ok(placement.x + placement.length <= plan.effectiveInner.length)
    assert.ok(placement.y + placement.width <= plan.effectiveInner.width)
    assert.ok(placement.z + placement.height <= plan.effectiveInner.height)
    assert.ok(placement.contentSize.length <= placement.length)
    assert.ok(placement.contentSize.width <= placement.width)
    assert.ok(placement.contentSize.height <= placement.height)
  }

  for (let i = 0; i < plan.placements.length; i += 1) {
    for (let j = i + 1; j < plan.placements.length; j += 1) {
      assert.equal(overlaps(plan.placements[i], plan.placements[j]), false)
    }
  }

  assert.equal(plan.itemVolume, plan.placements.reduce((sum, item) => sum + volume(item), 0))
  assert.equal(plan.itemVolume + plan.emptyVolume, volume(plan.effectiveInner))
  assert.ok(Number.isFinite(plan.score))
  assert.ok(plan.effectiveFillRate > 0 && plan.effectiveFillRate <= 1)

  for (const block of buildVoidFillBlocks(plan)) {
    for (const placement of plan.placements) {
      assert.equal(overlaps(block, placement), false, 'Void fill must not occupy wrapped items')
    }
  }
}

for (const strategy of ['compact', 'stable'] as const) {
  test(`${strategy}: item wrapping rejects a carton that only fits the bare product`, () => {
    const input = makeInput({
      strategy,
      cartons: [makeCarton({ inner: { length: 110, width: 90, height: 76 } })],
    })
    assert.equal(recommendPacking(input).length, 1)
    const orderLines = input.orderLines.map(line => ({ ...line, useItemWrap: true }))
    assert.deepEqual(recommendPacking({ ...input, orderLines }), [])
  })
}

test('item wrapping occupies extra volume while preserving the product dimensions', () => {
  const plain = recommendPacking(makeInput())[0]
  const wrapped = recommendPacking(makeInput({
    orderLines: [{ productId: 'test-product', quantity: 1, useItemWrap: true }],
  }))[0]
  assert.ok(plain && wrapped)
  const placement = wrapped.placements[0]
  assert.deepEqual(
    [placement.length, placement.width, placement.height].sort((a, b) => a - b),
    [68, 86, 106],
  )
  assert.deepEqual(
    Object.values(placement.contentSize).sort((a, b) => a - b),
    [60, 80, 100],
  )
  assert.equal(plain.itemVolume, 100 * 80 * 60)
  assert.equal(wrapped.itemVolume, 106 * 86 * 68)
  assert.ok(wrapped.effectiveFillRate > plain.effectiveFillRate)
  assert.ok(wrapped.emptyVolume < plain.emptyVolume)
  assert.equal(wrapped.totalWeight, plain.totalWeight)
  assertValidLayout(wrapped)
})

test('rotation keeps packaging thickness aligned with the product axes', () => {
  const plans = recommendPacking(makeInput({
    cartons: [makeCarton({ inner: { length: 78, width: 96, height: 122 } })],
    orderLines: [{ productId: 'test-product', quantity: 1, useItemWrap: true }],
  }))
  assert.equal(plans.length, 1)
  const placement = plans[0].placements[0]
  assert.deepEqual(placement.contentSize, { length: 60, width: 80, height: 100 })
  assert.equal(placement.length, 68)
  assert.equal(placement.width, 86)
  assert.equal(placement.height, 106)
  assertValidLayout(plans[0])
})

test('wrapping thickness follows each cushioning profile', () => {
  const plans = recommendPacking(makeInput({
    cushions,
    orderLines: [{ productId: 'test-product', quantity: 1, useItemWrap: true }],
  }))
  const expectedVolumes: Record<string, number> = {
    'air-cap-light': 106 * 86 * 68,
    'paper-pad': 108 * 88 * 70,
    'epe-foam': 112 * 92 * 72,
  }
  assert.equal(plans.length, cushions.length)
  for (const plan of plans) {
    assert.equal(plan.itemVolume, expectedVolumes[plan.cushion.id])
    assertValidLayout(plan)
  }
})

test('split packing reserves packaging around every product', () => {
  const input = makeInput({
    products: [makeProduct({ size: { length: 100, width: 100, height: 100 } })],
    cartons: [makeCarton({ inner: { length: 218, width: 118, height: 124 } })],
    orderLines: [{ productId: 'test-product', quantity: 2, useItemWrap: false }],
  })
  assert.equal(recommendPacking(input)[0]?.placements.length, 2)
  const wrappedInput = {
    ...input,
    orderLines: input.orderLines.map(line => ({ ...line, useItemWrap: true })),
  }
  assert.deepEqual(recommendPacking(wrappedInput), [])
  const splits = recommendSplitPacking(wrappedInput)
  assert.ok(splits.length > 0)
  for (const split of splits) {
    assert.equal(split.boxCount, 2)
    assert.equal(split.itemVolume, 2 * 106 * 106 * 108)
    for (const box of split.boxes) {
      assert.equal(box.recommendation.placements.length, 1)
      assert.equal(box.recommendation.placements[0].useItemWrap, true)
      assertValidLayout(box.recommendation)
    }
  }
})

test('volumetric weight does not reject a shipment with a higher actual weight', () => {
  const plans = recommendPacking(makeInput({
    products: [makeProduct({ weight: 500 })],
    cartons: [makeCarton({ volumetricWeight: 100, maxWeight: null })],
  }))
  assert.equal(plans.length, 1)
  assert.equal(plans[0].totalWeight, 500)
})

test('the catalog 1.5kg volumetric weight does not exclude a fitting 1.6kg product', () => {
  const plans = recommendPacking(makeInput({
    products: [makeProduct({ weight: 1600 })],
    cartons: [cartons[0]],
  }))
  assert.equal(plans.length, 1)
  assert.equal(plans[0].totalWeight, 1600)
  assert.equal(plans[0].carton.volumetricWeight, 1500)
})

test('a confirmed maximum weight rejects overload but allows the exact limit', () => {
  const carton = makeCarton({ volumetricWeight: 10_000, maxWeight: 500 })
  assert.equal(recommendPacking(makeInput({
    cartons: [carton], products: [makeProduct({ weight: 500 })],
  })).length, 1)
  assert.deepEqual(recommendPacking(makeInput({
    cartons: [carton], products: [makeProduct({ weight: 501 })],
  })), [])
})

test('split packing applies confirmed weight limits to each box', () => {
  const input = makeInput({
    products: [makeProduct({ weight: 300 })],
    cartons: [makeCarton({ volumetricWeight: 100, maxWeight: 500 })],
    orderLines: [{ productId: 'test-product', quantity: 2, useItemWrap: false }],
  })
  assert.deepEqual(recommendPacking(input), [])
  const splits = recommendSplitPacking(input)
  assert.ok(splits.length > 0)
  for (const split of splits) {
    assert.equal(split.boxCount, 2)
    assert.equal(split.totalWeight, 600)
    for (const box of split.boxes) {
      assert.equal(box.recommendation.totalWeight, 300)
    }
  }
})

test('catalog weight values are retained as volumetric weights with unknown limits', () => {
  assert.deepEqual(cartons.map(carton => carton.volumetricWeight), [
    1500, 2200, 3200, 4300, 4300, 6800, 6900, 9500, 11900,
    12200, 19100, 20300, 15700, 11400, 7400, 4200, 5600,
  ])
  assert.ok(cartons.every(carton => carton.maxWeight === null))
})

test('unknown weight limits remain explicit after localization', () => {
  const plan = recommendPacking(makeInput({ cartons: [cartons[0]] }))[0]
  assert.ok(plan)
  const unknownLabels = { ja: '未確認', zh: '未确认', en: 'Unverified' }
  for (const locale of ['ja', 'zh', 'en'] as const) {
    const catalog = getLocalizedCatalog(locale)
    const localized = localizeRecommendation(plan, locale, getLocalizedCatalogMaps(catalog))
    assert.equal(localized.carton.volumetricWeight, 1500)
    assert.equal(localized.carton.maxWeight, null)
    assert.ok(getRecommendationReasons(localized, locale).some(reason =>
      reason.toLowerCase().includes(unknownLabels[locale].toLowerCase()),
    ))
    assert.equal(getAppText(locale).catalog.unknownWeightLimit, unknownLabels[locale])
  }
})

for (const strategy of ['compact', 'stable'] as const) {
  for (const useItemWrap of [false, true]) {
    test(`${strategy}, wrap=${useItemWrap}: catalog layouts fit and preserve order quantities`, () => {
      const orderLines = defaultOrderLines.map(line => ({ ...line, useItemWrap }))
      const input = { products, cartons, cushions, orderLines, strategy }
      const singles = recommendPacking(input)
      const splits = recommendSplitPacking(input)
      assert.ok(singles.length > 0)
      assert.ok(splits.length > 0)
      const expectedUnits = orderLines.reduce((sum, line) => sum + line.quantity, 0)
      const expectedWeight = orderLines.reduce((sum, line) => {
        const product = products.find(item => item.id === line.productId)
        assert.ok(product)
        return sum + product.weight * line.quantity
      }, 0)
      for (const plan of singles) {
        assert.equal(plan.placements.length, expectedUnits)
        assert.equal(plan.totalWeight, expectedWeight)
        assertValidLayout(plan)
      }
      for (const split of splits) {
        const placements = split.boxes.flatMap(box => box.recommendation.placements)
        assert.equal(new Set(placements.map(item => item.instanceId)).size, expectedUnits)
        assert.equal(split.totalWeight, expectedWeight)
        assert.equal(split.itemVolume, placements.reduce((sum, item) => sum + volume(item), 0))
        for (const line of orderLines) {
          assert.equal(placements.filter(item => item.productId === line.productId).length, line.quantity)
        }
        for (const box of split.boxes) assertValidLayout(box.recommendation)
      }
    })
  }
}
