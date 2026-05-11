import { getIntlLocale, type SupportedLocale } from '@/locale'

export type Dimensions = {
  length: number
  width: number
  height: number
}

export type Product = {
  id: string
  brand: string
  name: string
  category: string
  size: Dimensions
  priceYen?: number
  weight: number
  fragility: 'low' | 'medium' | 'high'
  color: string
  note: string
}

export type Carton = {
  id: string
  code: string
  label: string
  service: string
  inner: Dimensions
  outer?: Dimensions
  maxWeight: number | null
  priceYen?: number
  note: string
}

export type CushionProfile = {
  id: string
  name: string
  sidePadding: number
  topPadding: number
  bottomPadding: number
  stabilityBonus: number
  voidFillUnitVolume: number
  note: string
}

export type OrderLine = {
  productId: string
  quantity: number
  useItemWrap: boolean
}

export type PackedPlacement = {
  instanceId: string
  productId: string
  name: string
  brand: string
  category: string
  color: string
  useItemWrap: boolean
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  weight: number
  layerIndex: number
  rowIndex: number
}

export type PackedLayer = {
  index: number
  z: number
  height: number
}

export type VoidFillBlock = {
  id: string
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  layerIndex?: number
}

export type Recommendation = {
  key: string
  carton: Carton
  cushion: CushionProfile
  strategy: PackingStrategy
  score: number
  totalWeight: number
  itemVolume: number
  emptyVolume: number
  fillRate: number
  effectiveFillRate: number
  stabilityScore: number
  voidFillUnits: number
  recommendedVoidFillVolume: number
  bottomFillHeight: number
  topVoidFillHeight: number
  topEmptyHeight: number
  unusedTopHeight: number
  unusedVolume: number
  effectiveInner: Dimensions
  placements: PackedPlacement[]
  layers: PackedLayer[]
  reasons: string[]
}

export type SplitPackingBox = {
  boxIndex: number
  recommendation: Recommendation
  items: Array<{
    productId: string
    brand: string
    name: string
    category: string
    color: string
    quantity: number
  }>
}

export type SplitPackingRecommendation = {
  key: string
  strategy: PackingStrategy
  score: number
  boxCount: number
  totalWeight: number
  itemVolume: number
  totalEmptyVolume: number
  totalRecommendedVoidFillVolume: number
  totalUnusedVolume: number
  fillRate: number
  effectiveFillRate: number
  stabilityScore: number
  boxes: SplitPackingBox[]
  reasons: string[]
}

type OrderUnit = {
  instanceId: string
  productId: string
  brand: string
  name: string
  category: string
  size: Dimensions
  weight: number
  fragility: Product['fragility']
  color: string
  useItemWrap: boolean
}

type RowFrame = {
  y: number
  depth: number
  cursor: number
}

type LayerFrame = {
  z: number
  height: number
  rows: RowFrame[]
}

type PlacementCandidate = {
  mode: 'existing-row' | 'new-row' | 'new-layer'
  layerIndex: number
  rowIndex: number
  x: number
  y: number
  z: number
  orientation: Dimensions
  score: number
  rowDepthDelta: number
}

export type PackingStrategy = 'compact' | 'stable'

const MAX_LAYERS = 2
export const LAYER_SEPARATOR_HEIGHT = 10
const LOCAL_SUPPORT_MIN_COVERAGE = 0.72
const MAX_SPLIT_BOXES = 5
const MAX_SPLIT_PARTITIONS_PER_GROUP = 6
const MAX_MULTI_BOX_GROUPINGS = 24

export function recommendPacking({
  products,
  cartons,
  cushions,
  orderLines,
  strategy = 'compact',
}: {
  products: Product[]
  cartons: Carton[]
  cushions: CushionProfile[]
  orderLines: OrderLine[]
  strategy?: PackingStrategy
}): Recommendation[] {
  const units = expandOrderUnits(products, orderLines)

  return buildRecommendationsFromUnits({
    units,
    cartons,
    cushions,
    strategy,
  })
}

export function recommendSplitPacking({
  products,
  cartons,
  cushions,
  orderLines,
  strategy = 'compact',
}: {
  products: Product[]
  cartons: Carton[]
  cushions: CushionProfile[]
  orderLines: OrderLine[]
  strategy?: PackingStrategy
}): SplitPackingRecommendation[] {
  const units = expandOrderUnits(products, orderLines)

  if (units.length < 2) {
    return []
  }

  const recommendations = new Map<string, SplitPackingRecommendation>()
  const maxBoxCount = Math.min(MAX_SPLIT_BOXES, units.length)

  for (let boxCount = 2; boxCount <= maxBoxCount; boxCount += 1) {
    const groupings = generateMultiBoxGroupings(units, boxCount)

    for (const groups of groupings) {
      const recommendationSets = groups.map((group) =>
        buildRecommendationsFromUnits({
          units: group,
          cartons,
          cushions,
          strategy,
        }).slice(0, 2),
      )

      if (recommendationSets.some((set) => set.length === 0)) {
        continue
      }

      for (const combination of buildRecommendationCombinations(recommendationSets)) {
        const boxes = combination
          .map((recommendation, index) => ({
            boxIndex: index + 1,
            recommendation,
            items: summarizeUnits(groups[index]),
          }))
          .sort((left, right) => {
            const volumeDiff =
              volume(right.recommendation.carton.inner) -
              volume(left.recommendation.carton.inner)

            if (volumeDiff !== 0) {
              return volumeDiff
            }

            return right.recommendation.totalWeight - left.recommendation.totalWeight
          })

        const combined = buildSplitRecommendation(boxes, strategy)
        const current = recommendations.get(combined.key)

        if (!current || combined.score > current.score) {
          recommendations.set(combined.key, combined)
        }
      }
    }
  }

  return [...recommendations.values()]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.effectiveFillRate !== left.effectiveFillRate) {
        return right.effectiveFillRate - left.effectiveFillRate
      }

      if (left.boxCount !== right.boxCount) {
        return left.boxCount - right.boxCount
      }

      return left.totalEmptyVolume - right.totalEmptyVolume
    })
}

function buildRecommendationsFromUnits({
  units,
  cartons,
  cushions,
  strategy,
}: {
  units: OrderUnit[]
  cartons: Carton[]
  cushions: CushionProfile[]
  strategy: PackingStrategy
}): Recommendation[] {
  const maxFragility = getMaxFragility(units)

  if (units.length === 0) {
    return []
  }

  const itemVolume = units.reduce((sum, unit) => sum + volume(unit.size), 0)
  const totalWeight = units.reduce((sum, unit) => sum + unit.weight, 0)
  const recommendations: Recommendation[] = []

  for (const carton of cartons) {
    if (carton.maxWeight !== null && totalWeight > carton.maxWeight) {
      continue
    }

    for (const cushion of cushions) {
      const bottomFillHeight = getRecommendedBottomFillHeight({
        cushion,
        totalWeight,
      })
      const effectiveInner = {
        length: carton.inner.length - cushion.sidePadding * 2,
        width: carton.inner.width - cushion.sidePadding * 2,
        height: carton.inner.height - cushion.topPadding - bottomFillHeight,
      }
      const topVoidFillHeight = getRecommendedTopVoidFillHeight({
        cushion,
        totalWeight,
        maxFragility,
        strategy,
      })

      if (
        effectiveInner.length <= 0 ||
        effectiveInner.width <= 0 ||
        effectiveInner.height <= 0
      ) {
        continue
      }

      const packed = packUnits(units, effectiveInner, strategy)

      if (!packed) {
        continue
      }

      const scoreProfile = getStrategyScoreProfile(strategy)
      const effectiveVolume = volume(effectiveInner)
      const emptyVolume = Math.max(effectiveVolume - itemVolume, 0)
      const topEmptyHeight = getTopEmptyHeight({
        effectiveInner,
        placements: packed.placements,
      })
      const appliedTopVoidFillHeight = Math.min(topVoidFillHeight, topEmptyHeight)
      const recommendedVoidFillVolume = calculateRecommendedVoidFillVolume({
        effectiveInner,
        placements: packed.placements,
        layers: packed.layers.map((layer, index) => ({
          index,
          z: layer.z,
          height: layer.height,
        })),
        topVoidFillHeight: appliedTopVoidFillHeight,
      })
      const unusedTopHeight = Math.max(topEmptyHeight - appliedTopVoidFillHeight, 0)
      const unusedVolume = Math.max(emptyVolume - recommendedVoidFillVolume, 0)
      const fillRate = itemVolume / volume(carton.inner)
      const effectiveFillRate = itemVolume / effectiveVolume
      const stabilityScore = scoreStability({
        cushion,
        effectiveInner,
        placements: packed.placements,
        layers: packed.layers,
        totalWeight,
      })
      const voidFillUnits = Math.ceil(
        recommendedVoidFillVolume / cushion.voidFillUnitVolume,
      )
      const protectionPenalty = getOverProtectionPenalty({
        cushion,
        totalWeight,
        maxFragility,
        strategy,
      })
      const score = Math.round(
        effectiveFillRate * scoreProfile.fillWeight +
          stabilityScore * scoreProfile.stabilityWeight -
          emptyVolume / 1_000_000 * scoreProfile.emptyVolumePenalty -
          Math.max(packed.layers.length - 1, 0) * scoreProfile.extraLayerPenalty -
          protectionPenalty,
      )

      recommendations.push({
        key: `${carton.id}:${cushion.id}`,
        carton,
        cushion,
        strategy,
        score,
        totalWeight,
        itemVolume,
        emptyVolume,
        fillRate,
        effectiveFillRate,
        stabilityScore,
        voidFillUnits,
        recommendedVoidFillVolume,
        bottomFillHeight,
        topVoidFillHeight: appliedTopVoidFillHeight,
        topEmptyHeight,
        unusedTopHeight,
        unusedVolume,
        effectiveInner,
        placements: packed.placements,
        layers: packed.layers.map((layer, index) => ({
          index,
          z: layer.z,
          height: layer.height,
        })),
        reasons: [],
      })
    }
  }

  return recommendations.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    const leftVolume = volume(left.carton.inner)
    const rightVolume = volume(right.carton.inner)

    if (leftVolume !== rightVolume) {
      return leftVolume - rightVolume
    }

    return right.stabilityScore - left.stabilityScore
  })
}

export function formatDimensions(
  dimensions: Dimensions,
  locale: SupportedLocale = 'ja',
): string {
  return `${formatCentimetersValue(dimensions.length, locale)} x ${formatCentimetersValue(dimensions.width, locale)} x ${formatCentimetersValue(dimensions.height, locale)} cm`
}

export function formatLength(
  lengthInMm: number,
  locale: SupportedLocale = 'ja',
): string {
  return `${formatCentimetersValue(lengthInMm, locale)} cm`
}

export function formatWeight(
  weight: number,
  locale: SupportedLocale = 'ja',
): string {
  if (weight >= 1000) {
    return `${formatNumber(weight / 1000, locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} kg`
  }

  return `${formatNumber(weight, locale, {
    maximumFractionDigits: 0,
  })} g`
}

export function formatVolumeLiters(
  volumeInMm3: number,
  locale: SupportedLocale = 'ja',
): string {
  return `${formatNumber(volumeInMm3 / 1_000_000, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} L`
}

export function formatPercent(
  value: number,
  locale: SupportedLocale = 'ja',
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatPackingStrategy(
  strategy: PackingStrategy,
  locale: SupportedLocale = 'ja',
): string {
  if (locale === 'zh') {
    return strategy === 'compact' ? '优先小箱' : '优先稳定'
  }

  if (locale === 'en') {
    return strategy === 'compact' ? 'Compact First' : 'Stability First'
  }

  return strategy === 'compact' ? '省箱優先' : '安定性優先'
}

export type DisplayItemWrapKind = 'wrap' | 'paper-fill'

export function getDisplayItemWrapPadding(cushion: CushionProfile) {
  return {
    side: clamp(Math.round(cushion.sidePadding * 0.55), 2, 6),
    vertical: clamp(
      Math.round(Math.min(cushion.topPadding, cushion.bottomPadding) * 0.5),
      2,
      6,
    ),
  }
}

export function getDisplayItemWrapKind(
  cushion: CushionProfile,
): DisplayItemWrapKind {
  return cushion.id === 'paper-pad' ? 'paper-fill' : 'wrap'
}

export function formatDisplayItemWrapKind(
  kind: DisplayItemWrapKind,
  locale: SupportedLocale = 'ja',
): string {
  if (locale === 'zh') {
    return kind === 'paper-fill' ? '纸质填充材' : '包裹类缓冲材'
  }

  if (locale === 'en') {
    return kind === 'paper-fill' ? 'Paper fill' : 'Wrapping'
  }

  return kind === 'paper-fill' ? '紙の詰め材' : '包み材'
}

export function getRecommendationReasons(
  recommendation: Recommendation,
  locale: SupportedLocale = 'ja',
): string[] {
  return buildRecommendationReasons({
    strategy: recommendation.strategy,
    carton: recommendation.carton,
    cushion: recommendation.cushion,
    effectiveInner: recommendation.effectiveInner,
    packedLayers: recommendation.layers.length,
    effectiveFillRate: recommendation.effectiveFillRate,
    stabilityScore: recommendation.stabilityScore,
    totalWeight: recommendation.totalWeight,
    emptyVolume: recommendation.emptyVolume,
    recommendedVoidFillVolume: recommendation.recommendedVoidFillVolume,
    bottomFillHeight: recommendation.bottomFillHeight,
    topVoidFillHeight: recommendation.topVoidFillHeight,
    topEmptyHeight: recommendation.topEmptyHeight,
    unusedTopHeight: recommendation.unusedTopHeight,
    voidFillUnits: recommendation.voidFillUnits,
    locale,
  })
}

export function getSplitRecommendationReasons(
  recommendation: SplitPackingRecommendation,
  locale: SupportedLocale = 'ja',
): string[] {
  const effectiveFillRateText = formatPercent(recommendation.effectiveFillRate, locale)
  const totalEmptyVolumeText = formatVolumeLiters(
    recommendation.totalEmptyVolume,
    locale,
  )
  const totalRecommendedVoidFillText = formatVolumeLiters(
    recommendation.totalRecommendedVoidFillVolume,
    locale,
  )
  const totalUnusedVolumeText = formatVolumeLiters(
    recommendation.totalUnusedVolume,
    locale,
  )

  if (locale === 'zh') {
    return [
      `拆分为 ${recommendation.boxCount} 箱后，总填充率为 ${effectiveFillRateText}。`,
      `总空余体积为 ${totalEmptyVolumeText}，建议追加填充材为 ${totalRecommendedVoidFillText}。`,
      `未使用体积为 ${totalUnusedVolumeText}，前提是 ${recommendation.boxCount} 个箱子都不过度填满。`,
    ]
  }

  if (locale === 'en') {
    return [
      `Splitting into ${recommendation.boxCount} boxes results in a combined fill rate of ${effectiveFillRateText}.`,
      `Combined empty volume is ${totalEmptyVolumeText}, and the suggested extra void fill is ${totalRecommendedVoidFillText}.`,
      `Unused volume remains ${totalUnusedVolumeText}, assuming none of the ${recommendation.boxCount} boxes are overfilled.`,
    ]
  }

  return [
    `${recommendation.boxCount}箱に分けることで、合計の充填率は ${effectiveFillRateText} です。`,
    `合計空き容積は ${totalEmptyVolumeText}、推奨する追加充填材は ${totalRecommendedVoidFillText} です。`,
    `未使用の空き容積は ${totalUnusedVolumeText} で、${recommendation.boxCount}箱とも必要以上に埋めない前提です。`,
  ]
}

export function buildVoidFillBlocks(recommendation: Recommendation): VoidFillBlock[] {
  return buildVoidFillBlocksFromLayout({
    effectiveInner: recommendation.effectiveInner,
    placements: recommendation.placements,
    layers: recommendation.layers,
    topVoidFillHeight: recommendation.topVoidFillHeight,
  })
}

function buildVoidFillBlocksFromLayout({
  effectiveInner,
  placements,
  layers,
  topVoidFillHeight,
}: {
  effectiveInner: Dimensions
  placements: PackedPlacement[]
  layers: Array<{ index: number; z: number; height: number }>
  topVoidFillHeight: number
}): VoidFillBlock[] {
  const blocks: VoidFillBlock[] = []
  const sortedLayers = [...layers].sort((left, right) => left.index - right.index)

  for (const layer of sortedLayers) {
    const layerPlacements = placements
      .filter((placement) => placement.layerIndex === layer.index)
      .sort((left, right) => {
        if (left.rowIndex !== right.rowIndex) {
          return left.rowIndex - right.rowIndex
        }

        return left.x - right.x
      })

    const rows = new Map<
      number,
      { y: number; depth: number; placements: PackedPlacement[] }
    >()

    for (const placement of layerPlacements) {
      const row = rows.get(placement.rowIndex)

      if (!row) {
        rows.set(placement.rowIndex, {
          y: placement.y,
          depth: placement.width,
          placements: [placement],
        })
        continue
      }

      row.depth = Math.max(row.depth, placement.width)
      row.placements.push(placement)
    }

    const sortedRows = [...rows.entries()]
      .sort((left, right) => left[1].y - right[1].y)
      .map(([, row]) => row)

    for (const row of sortedRows) {
      let cursor = 0

      for (const placement of row.placements.sort((left, right) => left.x - right.x)) {
        if (placement.x > cursor) {
          blocks.push({
            id: `${placement.instanceId}-front-gap`,
            layerIndex: layer.index,
            x: cursor,
            y: row.y,
            z: layer.z,
            length: placement.x - cursor,
            width: row.depth,
            height: layer.height,
          })
        }

        if (placement.width < row.depth) {
          blocks.push({
            id: `${placement.instanceId}-depth-gap`,
            layerIndex: layer.index,
            x: placement.x,
            y: placement.y + placement.width,
            z: layer.z,
            length: placement.length,
            width: row.depth - placement.width,
            height: layer.height,
          })
        }

        cursor = placement.x + placement.length
      }

      if (cursor < effectiveInner.length) {
        blocks.push({
          id: `layer-${layer.index}-row-${row.y}-tail-gap`,
          layerIndex: layer.index,
          x: cursor,
          y: row.y,
          z: layer.z,
          length: effectiveInner.length - cursor,
          width: row.depth,
          height: layer.height,
        })
      }
    }

    let widthCursor = 0

    for (const row of sortedRows) {
      if (row.y > widthCursor) {
        blocks.push({
          id: `layer-${layer.index}-row-gap-${widthCursor}`,
          layerIndex: layer.index,
          x: 0,
          y: widthCursor,
          z: layer.z,
          length: effectiveInner.length,
          width: row.y - widthCursor,
          height: layer.height,
        })
      }

      widthCursor = Math.max(widthCursor, row.y + row.depth)
    }

    if (widthCursor < effectiveInner.width) {
      blocks.push({
        id: `layer-${layer.index}-rear-gap`,
        layerIndex: layer.index,
        x: 0,
        y: widthCursor,
        z: layer.z,
        length: effectiveInner.length,
        width: effectiveInner.width - widthCursor,
        height: layer.height,
      })
    }
  }

  const usedHeight = sortedLayers.reduce(
    (max, layer) => Math.max(max, layer.z + layer.height),
    0,
  )

  const topFillHeight = Math.min(topVoidFillHeight, Math.max(effectiveInner.height - usedHeight, 0))

  if (topFillHeight > 0) {
    blocks.push({
      id: 'top-void-gap',
      x: 0,
      y: 0,
      z: usedHeight,
      length: effectiveInner.length,
      width: effectiveInner.width,
      height: topFillHeight,
    })
  }

  return blocks.filter(
    (block) => block.length > 0 && block.width > 0 && block.height > 0,
  )
}

function buildRecommendationReasons({
  strategy,
  carton,
  cushion,
  effectiveInner,
  packedLayers,
  effectiveFillRate,
  stabilityScore,
  totalWeight,
  emptyVolume,
  recommendedVoidFillVolume,
  bottomFillHeight,
  topVoidFillHeight,
  topEmptyHeight,
  unusedTopHeight,
  voidFillUnits,
  locale,
}: {
  strategy: PackingStrategy
  carton: Carton
  cushion: CushionProfile
  effectiveInner: Dimensions
  packedLayers: number
  effectiveFillRate: number
  stabilityScore: number
  totalWeight: number
  emptyVolume: number
  recommendedVoidFillVolume: number
  bottomFillHeight: number
  topVoidFillHeight: number
  topEmptyHeight: number
  unusedTopHeight: number
  voidFillUnits: number
  locale: SupportedLocale
}): string[] {
  const packingStrategy = formatPackingStrategy(strategy, locale)
  const effectiveInnerText = formatDimensions(effectiveInner, locale)
  const fillRateText = formatPercent(effectiveFillRate, locale)
  const totalWeightText = formatWeight(totalWeight, locale)
  const bottomFillText = formatLength(bottomFillHeight, locale)
  const emptyVolumeText = formatVolumeLiters(emptyVolume, locale)
  const recommendedVoidFillText = formatVolumeLiters(
    recommendedVoidFillVolume,
    locale,
  )
  const topEmptyHeightText = formatLength(topEmptyHeight, locale)
  const topVoidFillHeightText = formatLength(topVoidFillHeight, locale)
  const unusedTopHeightText = formatLength(unusedTopHeight, locale)

  if (locale === 'zh') {
    const layerSummary =
      packedLayers === 1
        ? '当前为单层结构，不易在运输中散乱。'
        : `当前为 ${packedLayers} 层结构，本次设置最多允许 2 层。`

    return [
      `当前包装策略为“${packingStrategy}”。`,
      `${carton.code} 的有效内尺寸为 ${effectiveInnerText}。`,
      `即使使用 ${cushion.name}，仍可确保 ${fillRateText} 的填充率。`,
      `${layerSummary} 总重量为 ${totalWeightText}。`,
      `箱底整体铺设了 ${bottomFillText} 的填充材。`,
      `空余体积为 ${emptyVolumeText}，建议追加填充材 ${recommendedVoidFillText}，约 ${voidFillUnits} 个单位。`,
      `顶部空余高度为 ${topEmptyHeightText}，其中建议顶部填充 ${topVoidFillHeightText}，未使用高度为 ${unusedTopHeightText}。`,
      `稳定性评分为 ${stabilityScore} / 100。`,
    ]
  }

  if (locale === 'en') {
    const layerSummary =
      packedLayers === 1
        ? 'Everything fits in a single layer, which helps reduce shifting.'
        : `The layout uses ${packedLayers} layers. This prototype currently caps the layout at two layers.`

    return [
      `The selected packing strategy is "${packingStrategy}".`,
      `The effective inner dimensions of ${carton.code} are ${effectiveInnerText}.`,
      `Even with ${cushion.name}, the layout keeps a fill rate of ${fillRateText}.`,
      `${layerSummary} Total shipment weight is ${totalWeightText}.`,
      `The carton base is fully covered with ${bottomFillText} of fill material.`,
      `Empty volume is ${emptyVolumeText}, and the suggested extra void fill is ${recommendedVoidFillText}, or about ${voidFillUnits} units.`,
      `Top empty height is ${topEmptyHeightText}; suggested top fill is ${topVoidFillHeightText}; unused height is ${unusedTopHeightText}.`,
      `The stability score is ${stabilityScore} / 100.`,
    ]
  }

  const layerSummary =
    packedLayers === 1
      ? '1段で収まり、荷崩れしにくい構成です。'
      : `${packedLayers}段構成です。今回の設定では最大2段までで組んでいます。`

  return [
    `梱包方針は「${packingStrategy}」です。`,
    `${carton.code} の有効内寸は ${effectiveInnerText} です。`,
    `${cushion.name} を使っても ${fillRateText} の充填率を確保します。`,
    `${layerSummary} 総重量は ${totalWeightText} です。`,
    `箱底全体には ${bottomFillText} の充填材を敷いています。`,
    `空き容積は ${emptyVolumeText}、推奨する追加充填材は ${recommendedVoidFillText} / 目安 ${voidFillUnits} ユニットです。`,
    `上部空き高さは ${topEmptyHeightText}、そのうち推奨する上面充填は ${topVoidFillHeightText}、未使用高さは ${unusedTopHeightText} です。`,
    `安定性スコアは ${stabilityScore} / 100 です。`,
  ]
}

function expandOrderUnits(products: Product[], orderLines: OrderLine[]): OrderUnit[] {
  const productMap = new Map(products.map((product) => [product.id, product]))
  const units: OrderUnit[] = []

  for (const line of orderLines) {
    const product = productMap.get(line.productId)

    if (!product || line.quantity <= 0) {
      continue
    }

    for (let index = 0; index < line.quantity; index += 1) {
      units.push({
        instanceId: `${product.id}-${index + 1}`,
        productId: product.id,
        brand: product.brand,
        name: product.name,
        category: product.category,
        size: product.size,
        weight: product.weight,
        fragility: product.fragility,
        color: product.color,
        useItemWrap: line.useItemWrap,
      })
    }
  }

  return units.sort((left, right) => {
    const rightMaxFootprint = maxFaceArea(right.size)
    const leftMaxFootprint = maxFaceArea(left.size)

    if (rightMaxFootprint !== leftMaxFootprint) {
      return rightMaxFootprint - leftMaxFootprint
    }

    const rightVolume = volume(right.size)
    const leftVolume = volume(left.size)

    if (rightVolume !== leftVolume) {
      return rightVolume - leftVolume
    }

    if (right.weight !== left.weight) {
      return right.weight - left.weight
    }

    return getFragilityRank(left.fragility) - getFragilityRank(right.fragility)
  })
}

function packUnits(
  units: OrderUnit[],
  bounds: Dimensions,
  strategy: PackingStrategy,
) {
  const layers: LayerFrame[] = []
  const placements: PackedPlacement[] = []

  for (const unit of units) {
    let bestCandidate = findBestPlacementCandidate({
      unit,
      layers,
      placements,
      bounds,
      strategy,
      allowNewLayer: false,
    })

    if (!bestCandidate) {
      bestCandidate = findBestPlacementCandidate({
        unit,
        layers,
        placements,
        bounds,
        strategy,
        allowNewLayer: true,
      })
    }

    if (!bestCandidate) {
      return null
    }

    if (bestCandidate.mode === 'new-layer') {
      layers.push({
        z: bestCandidate.z,
        height: bestCandidate.orientation.height,
        rows: [
          {
            y: 0,
            depth: bestCandidate.orientation.width,
            cursor: bestCandidate.orientation.length,
          },
        ],
      })
    } else if (bestCandidate.mode === 'new-row') {
      const layer = layers[bestCandidate.layerIndex]

      layer.rows.push({
        y: bestCandidate.y,
        depth: bestCandidate.orientation.width,
        cursor: bestCandidate.orientation.length,
      })
    } else {
      if (bestCandidate.rowDepthDelta > 0) {
        expandRowDepth({
          layers,
          placements,
          layerIndex: bestCandidate.layerIndex,
          rowIndex: bestCandidate.rowIndex,
          delta: bestCandidate.rowDepthDelta,
        })
      }

      const row = layers[bestCandidate.layerIndex].rows[bestCandidate.rowIndex]
      row.cursor += bestCandidate.orientation.length
    }

    placements.push({
      instanceId: unit.instanceId,
      productId: unit.productId,
      name: unit.name,
      brand: unit.brand,
      category: unit.category,
      color: unit.color,
      useItemWrap: unit.useItemWrap,
      x: bestCandidate.x,
      y: bestCandidate.y,
      z: bestCandidate.z,
      length: bestCandidate.orientation.length,
      width: bestCandidate.orientation.width,
      height: bestCandidate.orientation.height,
      weight: unit.weight,
      layerIndex: bestCandidate.layerIndex,
      rowIndex: bestCandidate.rowIndex,
    })
  }

  return centerPackedContent({ placements, layers }, bounds)
}

function findBestPlacementCandidate({
  unit,
  layers,
  placements,
  bounds,
  strategy,
  allowNewLayer,
}: {
  unit: OrderUnit
  layers: LayerFrame[]
  placements: PackedPlacement[]
  bounds: Dimensions
  strategy: PackingStrategy
  allowNewLayer: boolean
}) {
  let bestCandidate: PlacementCandidate | null = null

  for (const orientation of getOrientations(unit, strategy)) {
    const candidate = findPlacementCandidate({
      layers,
      placements,
      bounds,
      orientation,
      fragility: unit.fragility,
      strategy,
      productId: unit.productId,
      allowNewLayer,
    })

    if (!candidate) {
      continue
    }

    if (!bestCandidate || candidate.score < bestCandidate.score) {
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

function getPlacementFootprintOverlap(
  left: Pick<PackedPlacement, 'x' | 'y' | 'length' | 'width'>,
  right: Pick<PackedPlacement, 'x' | 'y' | 'length' | 'width'>,
) {
  const startX = Math.max(left.x, right.x)
  const endX = Math.min(left.x + left.length, right.x + right.length)
  const startY = Math.max(left.y, right.y)
  const endY = Math.min(left.y + left.width, right.y + right.width)

  if (endX <= startX || endY <= startY) {
    return null
  }

  return {
    x: startX,
    y: startY,
    length: endX - startX,
    width: endY - startY,
  }
}

function findPlacementCandidate({
  layers,
  placements,
  bounds,
  orientation,
  fragility,
  strategy,
  productId,
  allowNewLayer,
}: {
  layers: LayerFrame[]
  placements: PackedPlacement[]
  bounds: Dimensions
  orientation: Dimensions
  fragility: Product['fragility']
  strategy: PackingStrategy
  productId: string
  allowNewLayer: boolean
}): PlacementCandidate | null {
  let bestCandidate: PlacementCandidate | null = null
  const tuning = getStrategyPlacementTuning(strategy)

  for (const [layerIndex, layer] of layers.entries()) {
    if (orientation.height !== layer.height) {
      continue
    }

    const layerPlacements = placements.filter(
      (placement) => placement.layerIndex === layerIndex,
    )
    const sameProductLayerCount = layerPlacements.filter(
      (placement) => placement.productId === productId,
    ).length

    for (const [rowIndex, row] of layer.rows.entries()) {
      const rowPlacements = layerPlacements.filter(
        (placement) => placement.rowIndex === rowIndex,
      )
      const sameProductRowCount = rowPlacements.filter(
        (placement) => placement.productId === productId,
      ).length
      const rowDepthDelta = Math.max(orientation.width - row.depth, 0)
      const usedWidth =
        layer.rows.reduce((sum, currentRow) => sum + currentRow.depth, 0) + rowDepthDelta

      if (
        usedWidth <= bounds.width &&
        row.cursor + orientation.length <= bounds.length
      ) {
        if (
          !hasValidSupportBase({
            placements,
            layerIndex,
            x: row.cursor,
            y: row.y,
            orientation,
          })
        ) {
          continue
        }

        const remainingLength = bounds.length - (row.cursor + orientation.length)
        const depthSlack = Math.max(row.depth, orientation.width) - orientation.width
        const candidate: PlacementCandidate = {
          mode: 'existing-row' as const,
          layerIndex,
          rowIndex,
          x: row.cursor,
          y: row.y,
          z: layer.z,
          orientation,
          rowDepthDelta,
          score:
            layerIndex * tuning.layerIndexPenalty +
            stackingFootprintPenalty(orientation, layerIndex, tuning) +
            remainingLength * tuning.lengthPenalty +
            depthSlack * tuning.depthSlackPenalty +
            row.y * 2 +
            rowDepthDelta * tuning.rowDepthPenalty +
            mixedProductPenalty(layerPlacements, sameProductLayerCount, tuning) -
            productGroupingBonus(sameProductLayerCount, sameProductRowCount, tuning) +
            layerSupportPenalty(fragility, layerIndex, strategy) +
            fragilityPenalty(fragility, orientation, strategy),
        }

        const currentScore = bestCandidate?.score ?? Number.POSITIVE_INFINITY

        if (candidate.score < currentScore) {
          bestCandidate = candidate
        }
      }
    }

    const usedWidth = layer.rows.reduce((sum, row) => sum + row.depth, 0)

    if (
      usedWidth + orientation.width <= bounds.width &&
      orientation.length <= bounds.length
    ) {
      if (
        !hasValidSupportBase({
          placements,
          layerIndex,
          x: 0,
          y: usedWidth,
          orientation,
        })
      ) {
        continue
      }

      const remainingWidth = bounds.width - (usedWidth + orientation.width)
      const remainingLength = bounds.length - orientation.length
      const candidate: PlacementCandidate = {
        mode: 'new-row' as const,
        layerIndex,
        rowIndex: layer.rows.length,
        x: 0,
        y: usedWidth,
        z: layer.z,
        orientation,
        rowDepthDelta: 0,
        score:
          layerIndex * tuning.layerIndexPenalty +
          stackingFootprintPenalty(orientation, layerIndex, tuning) +
          tuning.newRowBase +
          remainingWidth * tuning.widthPenalty +
          remainingLength * tuning.lengthPenalty +
          usedWidth * 4 +
          mixedProductPenalty(layerPlacements, sameProductLayerCount, tuning) -
          productGroupingBonus(sameProductLayerCount, 0, tuning) +
          layerSupportPenalty(fragility, layerIndex, strategy) +
          fragilityPenalty(fragility, orientation, strategy),
      }

      const currentScore = bestCandidate?.score ?? Number.POSITIVE_INFINITY

      if (candidate.score < currentScore) {
        bestCandidate = candidate
      }
    }
  }

  const nextLayerZ = getNextLayerZ(layers)

  if (
    allowNewLayer &&
    layers.length < MAX_LAYERS &&
    nextLayerZ + orientation.height <= bounds.height &&
    orientation.length <= bounds.length &&
    orientation.width <= bounds.width
  ) {
    if (
      hasValidSupportBase({
        placements,
        layerIndex: layers.length,
        x: 0,
        y: 0,
        orientation,
      })
    ) {
      const remainingLength = bounds.length - orientation.length
      const remainingWidth = bounds.width - orientation.width
      const candidate: PlacementCandidate = {
        mode: 'new-layer' as const,
        layerIndex: layers.length,
        rowIndex: 0,
        x: 0,
        y: 0,
        z: nextLayerZ,
        orientation,
        rowDepthDelta: 0,
        score:
          layers.length * tuning.layerIndexPenalty +
          stackingFootprintPenalty(orientation, layers.length, tuning) +
          tuning.newLayerBase +
          remainingWidth * tuning.widthPenalty +
          remainingLength * tuning.lengthPenalty +
          layerSupportPenalty(fragility, layers.length, strategy) +
          fragilityPenalty(fragility, orientation, strategy),
      }

      const currentScore = bestCandidate?.score ?? Number.POSITIVE_INFINITY

      if (candidate.score < currentScore) {
        bestCandidate = candidate
      }
    }
  }

  return bestCandidate
}

function hasValidSupportBase({
  placements,
  layerIndex,
  x,
  y,
  orientation,
}: {
  placements: PackedPlacement[]
  layerIndex: number
  x: number
  y: number
  orientation: Dimensions
}) {
  if (layerIndex === 0) {
    return true
  }

  const lowerPlacements = placements.filter(
    (placement) => placement.layerIndex === layerIndex - 1,
  )
  if (lowerPlacements.length === 0) {
    return false
  }

  const candidateFootprint = orientation.length * orientation.width
  let coveredArea = 0

  for (const placement of lowerPlacements) {
    const overlap = getPlacementFootprintOverlap(
      {
        x,
        y,
        length: orientation.length,
        width: orientation.width,
      },
      placement,
    )

    if (!overlap) {
      continue
    }

    coveredArea += overlap.length * overlap.width
  }

  if (coveredArea / candidateFootprint < LOCAL_SUPPORT_MIN_COVERAGE) {
    return false
  }

  const lowerLayerArea = getLayerFootprintArea(placements, layerIndex - 1)
  const nextLayerArea =
    getLayerFootprintArea(placements, layerIndex) + candidateFootprint

  return lowerLayerArea > nextLayerArea
}

function centerPackedContent(
  packed: { placements: PackedPlacement[]; layers: LayerFrame[] },
  bounds: Dimensions,
) {
  if (packed.placements.length === 0) {
    return packed
  }

  const usedLength = packed.placements.reduce(
    (max, placement) => Math.max(max, placement.x + placement.length),
    0,
  )
  const usedWidth = packed.placements.reduce(
    (max, placement) => Math.max(max, placement.y + placement.width),
    0,
  )
  const xOffset = Math.max((bounds.length - usedLength) / 2, 0)
  const yOffset = Math.max((bounds.width - usedWidth) / 2, 0)

  return {
    placements: packed.placements.map((placement) => ({
      ...placement,
      x: placement.x + xOffset,
      y: placement.y + yOffset,
    })),
    layers: packed.layers.map((layer) => ({
      ...layer,
      z: layer.z,
    })),
  }
}

function expandRowDepth({
  layers,
  placements,
  layerIndex,
  rowIndex,
  delta,
}: {
  layers: LayerFrame[]
  placements: PackedPlacement[]
  layerIndex: number
  rowIndex: number
  delta: number
}) {
  if (delta <= 0) {
    return
  }

  const rows = layers[layerIndex].rows
  rows[rowIndex].depth += delta

  for (let index = rowIndex + 1; index < rows.length; index += 1) {
    rows[index].y += delta
  }

  for (const placement of placements) {
    if (placement.layerIndex === layerIndex && placement.rowIndex > rowIndex) {
      placement.y += delta
    }
  }
}

function getOrientations(unit: OrderUnit, strategy: PackingStrategy): Dimensions[] {
  const { length, width, height } = unit.size
  const options: Dimensions[] = [
    { length, width, height },
    { length, width: height, height: width },
    { length: width, width: length, height },
    { length: width, width: height, height: length },
    { length: height, width: length, height: width },
    { length: height, width, height: length },
  ]

  const unique = Array.from(
    new Map(options.map((option) => [dimensionKey(option), option])).values(),
  )

  return unique.sort((left, right) => {
    const leftPenalty = fragilityPenalty(unit.fragility, left, strategy)
    const rightPenalty = fragilityPenalty(unit.fragility, right, strategy)

    if (leftPenalty !== rightPenalty) {
      return leftPenalty - rightPenalty
    }

    if (left.height !== right.height) {
      return right.height - left.height
    }

    return left.length * left.width - right.length * right.width
  })
}

function scoreStability({
  cushion,
  effectiveInner,
  placements,
  layers,
  totalWeight,
}: {
  cushion: CushionProfile
  effectiveInner: Dimensions
  placements: PackedPlacement[]
  layers: LayerFrame[]
  totalWeight: number
}): number {
  const weightedCenterHeight =
    placements.reduce((sum, placement) => {
      const centerHeight = placement.z + placement.height / 2
      return sum + placement.weight * (centerHeight / effectiveInner.height)
    }, 0) / totalWeight

  const lowerHalfWeight = placements
    .filter((placement) => placement.z + placement.height / 2 <= effectiveInner.height / 2)
    .reduce((sum, placement) => sum + placement.weight, 0)

  const lowerHalfRatio = lowerHalfWeight / totalWeight
  const fillRatio = placements.reduce(
    (sum, placement) => sum + placement.length * placement.width * placement.height,
    0,
  ) / volume(effectiveInner)

  const stability = Math.round(
    58 +
      cushion.stabilityBonus +
      lowerHalfRatio * 18 -
      weightedCenterHeight * 22 -
      Math.max(layers.length - 1, 0) * 5 -
      Math.max(0, (0.58 - fillRatio) * 42),
  )

  return clamp(stability, 1, 99)
}

function fragilityPenalty(
  fragility: Product['fragility'],
  orientation: Dimensions,
  strategy: PackingStrategy,
): number {
  const fragilityRank = getFragilityRank(fragility)
  const verticalBonusFactor = strategy === 'compact' ? 11 : 9
  const flatPenaltyFactor = strategy === 'compact' ? 14 : 16
  const footprintPenaltyFactor = strategy === 'compact' ? 0.05 : 0.07
  const tallestBaseEdge = Math.max(orientation.length, orientation.width)
  const heightDeficit = Math.max(tallestBaseEdge - orientation.height, 0)
  const heightBonus = orientation.height * verticalBonusFactor
  const flatPenalty = heightDeficit * flatPenaltyFactor * fragilityRank
  const footprintPenalty =
    orientation.length * orientation.width * footprintPenaltyFactor

  return flatPenalty + footprintPenalty - heightBonus
}

function layerSupportPenalty(
  fragility: Product['fragility'],
  layerIndex: number,
  strategy: PackingStrategy,
): number {
  const isCompact = strategy === 'compact'

  if (fragility === 'high') {
    return layerIndex === 0
      ? isCompact
        ? 135_000
        : 260_000
      : isCompact
        ? 20_000
        : 8_000
  }

  if (fragility === 'medium') {
    return layerIndex * (isCompact ? 45_000 : 65_000)
  }

  return layerIndex * (isCompact ? 80_000 : 110_000)
}

function volume(dimensions: Dimensions): number {
  return dimensions.length * dimensions.width * dimensions.height
}

function getFragilityRank(level: Product['fragility']): number {
  return fragilityRankMap[level]
}

const fragilityRankMap: Record<Product['fragility'], number> = {
  low: 1,
  medium: 2,
  high: 3,
}

function dimensionKey(dimensions: Dimensions): string {
  return `${dimensions.length}:${dimensions.width}:${dimensions.height}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function maxFaceArea(dimensions: Dimensions): number {
  const { length, width, height } = dimensions
  return Math.max(length * width, length * height, width * height)
}

function getStrategyScoreProfile(strategy: PackingStrategy) {
  if (strategy === 'stable') {
    return {
      fillWeight: 54,
      stabilityWeight: 0.55,
      emptyVolumePenalty: 0.3,
      extraLayerPenalty: 4,
    }
  }

  return {
    fillWeight: 78,
    stabilityWeight: 0.2,
    emptyVolumePenalty: 0.82,
    extraLayerPenalty: 1,
  }
}

function getStrategyPlacementTuning(strategy: PackingStrategy) {
  if (strategy === 'stable') {
    return {
      layerIndexPenalty: 180_000,
      upperLayerFootprintPenalty: 9,
      lengthPenalty: 10,
      widthPenalty: 14,
      depthSlackPenalty: 6,
      rowDepthPenalty: 36,
      layerHeightPenalty: 42,
      newRowBase: 150_000,
      newLayerBase: 600_000,
      sameProductLayerBonus: 8_500,
      sameProductRowBonus: 5_000,
      mixedProductLayerPenalty: 4_200,
    }
  }

  return {
    layerIndexPenalty: 150_000,
    upperLayerFootprintPenalty: 7,
    lengthPenalty: 14,
    widthPenalty: 18,
    depthSlackPenalty: 8,
    rowDepthPenalty: 20,
    layerHeightPenalty: 24,
    newRowBase: 120_000,
    newLayerBase: 520_000,
    sameProductLayerBonus: 6_500,
    sameProductRowBonus: 3_500,
    mixedProductLayerPenalty: 2_400,
  }
}

function stackingFootprintPenalty(
  orientation: Dimensions,
  layerIndex: number,
  tuning: ReturnType<typeof getStrategyPlacementTuning>,
) {
  if (layerIndex === 0) {
    return 0
  }

  return orientation.length * orientation.width * tuning.upperLayerFootprintPenalty
}

function getStackTop(layers: LayerFrame[]) {
  if (layers.length === 0) {
    return 0
  }

  const topLayer = layers[layers.length - 1]

  return topLayer.z + topLayer.height
}

function getNextLayerZ(layers: LayerFrame[]) {
  if (layers.length === 0) {
    return 0
  }

  return getStackTop(layers) + LAYER_SEPARATOR_HEIGHT
}

function getLayerFootprintArea(placements: PackedPlacement[], layerIndex: number) {
  return placements.reduce((sum, placement) => {
    if (placement.layerIndex !== layerIndex) {
      return sum
    }

    return sum + placement.length * placement.width
  }, 0)
}

function productGroupingBonus(
  sameProductLayerCount: number,
  sameProductRowCount: number,
  tuning: ReturnType<typeof getStrategyPlacementTuning>,
) {
  return (
    sameProductLayerCount * tuning.sameProductLayerBonus +
    sameProductRowCount * tuning.sameProductRowBonus
  )
}

function mixedProductPenalty(
  layerPlacements: PackedPlacement[],
  sameProductLayerCount: number,
  tuning: ReturnType<typeof getStrategyPlacementTuning>,
) {
  return layerPlacements.length > 0 && sameProductLayerCount === 0
    ? tuning.mixedProductLayerPenalty
    : 0
}

function buildSplitRecommendation(
  boxes: SplitPackingBox[],
  strategy: PackingStrategy,
): SplitPackingRecommendation {
  const normalizedBoxes = boxes.map((box, index) => ({
    ...box,
    boxIndex: index + 1,
  }))
  const totalWeight = normalizedBoxes.reduce(
    (sum, box) => sum + box.recommendation.totalWeight,
    0,
  )
  const itemVolume = normalizedBoxes.reduce(
    (sum, box) => sum + box.recommendation.itemVolume,
    0,
  )
  const totalEffectiveVolume = normalizedBoxes.reduce(
    (sum, box) => sum + volume(box.recommendation.effectiveInner),
    0,
  )
  const totalCartonVolume = normalizedBoxes.reduce(
    (sum, box) => sum + volume(box.recommendation.carton.inner),
    0,
  )
  const totalEmptyVolume = normalizedBoxes.reduce(
    (sum, box) => sum + box.recommendation.emptyVolume,
    0,
  )
  const totalRecommendedVoidFillVolume = normalizedBoxes.reduce(
    (sum, box) => sum + box.recommendation.recommendedVoidFillVolume,
    0,
  )
  const totalUnusedVolume = normalizedBoxes.reduce(
    (sum, box) => sum + box.recommendation.unusedVolume,
    0,
  )
  const effectiveFillRate =
    totalEffectiveVolume > 0 ? itemVolume / totalEffectiveVolume : 0
  const fillRate = totalCartonVolume > 0 ? itemVolume / totalCartonVolume : 0
  const stabilityScore =
    totalWeight > 0
      ? Math.round(
          normalizedBoxes.reduce((sum, box) => {
            return sum + box.recommendation.stabilityScore * box.recommendation.totalWeight
          }, 0) / totalWeight,
        )
      : 0
  const scoreProfile = getStrategyScoreProfile(strategy)
  const splitPenalty = Math.max(normalizedBoxes.length - 1, 0) * 1.6
  const score = Math.round(
    effectiveFillRate * scoreProfile.fillWeight +
      stabilityScore * scoreProfile.stabilityWeight -
      totalEmptyVolume / 1_000_000 * scoreProfile.emptyVolumePenalty -
      splitPenalty,
  )
  const boxCount = normalizedBoxes.length

  return {
    key: normalizedBoxes
      .map((box) => {
        return [
          box.recommendation.carton.id,
          box.recommendation.cushion.id,
          buildUnitCountSignatureFromItems(box.items),
        ].join(':')
      })
      .join('|'),
    strategy,
    score,
    boxCount,
    totalWeight,
    itemVolume,
    totalEmptyVolume,
    totalRecommendedVoidFillVolume,
    totalUnusedVolume,
    fillRate,
    effectiveFillRate,
    stabilityScore,
    boxes: normalizedBoxes,
    reasons: [],
  }
}

function buildRecommendationCombinations(recommendationSets: Recommendation[][]) {
  const combinations: Recommendation[][] = []
  const current: Recommendation[] = []

  const visit = (index: number) => {
    if (index >= recommendationSets.length) {
      combinations.push([...current])
      return
    }

    for (const recommendation of recommendationSets[index]) {
      current.push(recommendation)
      visit(index + 1)
      current.pop()
    }
  }

  visit(0)

  return combinations
}

function generateMultiBoxGroupings(
  units: OrderUnit[],
  targetBoxCount: number,
): OrderUnit[][][] {
  if (targetBoxCount < 2 || targetBoxCount > units.length) {
    return []
  }

  let frontier: OrderUnit[][][] = [[normalizeUnitGroup(units)]]

  for (let step = 1; step < targetBoxCount; step += 1) {
    const next = new Map<string, OrderUnit[][]>()

    for (const grouping of frontier) {
      for (const [groupIndex, group] of grouping.entries()) {
        if (group.length < 2) {
          continue
        }

        const partitions = rankSplitPartitions(generateSplitPartitions(group)).slice(
          0,
          MAX_SPLIT_PARTITIONS_PER_GROUP,
        )

        for (const [left, right] of partitions) {
          const candidate = normalizeUnitGrouping([
            ...grouping.slice(0, groupIndex),
            left,
            right,
            ...grouping.slice(groupIndex + 1),
          ])
          next.set(buildGroupingSignature(candidate), candidate)
        }
      }
    }

    frontier = [...next.values()]
      .sort((left, right) => scoreUnitGrouping(left) - scoreUnitGrouping(right))
      .slice(0, MAX_MULTI_BOX_GROUPINGS)

    if (frontier.length === 0) {
      return []
    }
  }

  return frontier.filter((grouping) => grouping.length === targetBoxCount)
}

function generateSplitPartitions(units: OrderUnit[]): Array<[OrderUnit[], OrderUnit[]]> {
  if (units.length < 2) {
    return []
  }

  if (units.length <= 12) {
    return generateEnumeratedSplitPartitions(units)
  }

  return generateHeuristicSplitPartitions(units)
}

function generateEnumeratedSplitPartitions(
  units: OrderUnit[],
): Array<[OrderUnit[], OrderUnit[]]> {
  const partitions: Array<[OrderUnit[], OrderUnit[]]> = []
  const seen = new Set<string>()
  const fixedRightIndex = units.length - 1
  const variantCount = 1 << fixedRightIndex

  for (let mask = 1; mask < variantCount; mask += 1) {
    const left: OrderUnit[] = []
    const right: OrderUnit[] = [units[fixedRightIndex]]

    for (let index = 0; index < fixedRightIndex; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        left.push(units[index])
      } else {
        right.push(units[index])
      }
    }

    if (left.length === 0 || right.length === 0) {
      continue
    }

    const signature = buildUnitGroupSignature(left, right)

    if (seen.has(signature)) {
      continue
    }

    seen.add(signature)
    partitions.push([left, right])
  }

  return partitions
}

function generateHeuristicSplitPartitions(
  units: OrderUnit[],
): Array<[OrderUnit[], OrderUnit[]]> {
  const candidates: Array<[OrderUnit[], OrderUnit[]]> = []
  const seen = new Set<string>()
  const sortedByVolume = [...units].sort(
    (left, right) => volume(right.size) - volume(left.size),
  )

  const strategies = [
    (unit: OrderUnit, left: OrderUnit[], right: OrderUnit[]) => {
      void unit
      return totalUnitVolume(left) <= totalUnitVolume(right)
    },
    (unit: OrderUnit, left: OrderUnit[], right: OrderUnit[]) => {
      void unit
      return totalUnitWeight(left) <= totalUnitWeight(right)
    },
    (unit: OrderUnit) => unit.fragility === 'high',
  ]

  for (const strategy of strategies) {
    const left: OrderUnit[] = []
    const right: OrderUnit[] = []

    for (const unit of sortedByVolume) {
      const assignLeft = strategy(unit, left, right)

      if (assignLeft) {
        left.push(unit)
      } else {
        right.push(unit)
      }
    }

    rebalanceEmptySplit(left, right, sortedByVolume)

    const signature = buildUnitGroupSignature(left, right)

    if (!seen.has(signature) && left.length > 0 && right.length > 0) {
      seen.add(signature)
      candidates.push([left, right])
    }
  }

  return candidates
}

function rebalanceEmptySplit(
  left: OrderUnit[],
  right: OrderUnit[],
  fallback: OrderUnit[],
) {
  if (left.length === 0 && fallback.length > 1) {
    left.push(fallback[0])
    const index = right.findIndex((unit) => unit.instanceId === fallback[0].instanceId)
    if (index >= 0) {
      right.splice(index, 1)
    }
  }

  if (right.length === 0 && fallback.length > 1) {
    right.push(fallback[0])
    const index = left.findIndex((unit) => unit.instanceId === fallback[0].instanceId)
    if (index >= 0) {
      left.splice(index, 1)
    }
  }
}

function summarizeUnits(units: OrderUnit[]) {
  const summary = new Map<
    string,
    {
      productId: string
      brand: string
      name: string
      category: string
      color: string
      quantity: number
    }
  >()

  for (const unit of units) {
    const current = summary.get(unit.productId)

    if (current) {
      current.quantity += 1
      continue
    }

    summary.set(unit.productId, {
      productId: unit.productId,
      brand: unit.brand,
      name: unit.name,
      category: unit.category,
      color: unit.color,
      quantity: 1,
    })
  }

  return [...summary.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeUnitGroup(units: OrderUnit[]): OrderUnit[] {
  return [...units].sort((left, right) => left.instanceId.localeCompare(right.instanceId))
}

function normalizeUnitGrouping(groups: OrderUnit[][]): OrderUnit[][] {
  return groups
    .map((group) => normalizeUnitGroup(group))
    .sort((left, right) => {
      const volumeDiff = totalUnitVolume(right) - totalUnitVolume(left)

      if (volumeDiff !== 0) {
        return volumeDiff
      }

      const weightDiff = totalUnitWeight(right) - totalUnitWeight(left)

      if (weightDiff !== 0) {
        return weightDiff
      }

      return buildUnitCountSignature(left).localeCompare(buildUnitCountSignature(right))
    })
}

function buildUnitGroupSignature(left: OrderUnit[], right: OrderUnit[]): string {
  return [buildUnitCountSignature(left), buildUnitCountSignature(right)].sort().join('|')
}

function buildGroupingSignature(groups: OrderUnit[][]): string {
  return groups.map((group) => buildUnitCountSignature(group)).sort().join('|')
}

function buildUnitCountSignature(units: OrderUnit[]): string {
  const counts = new Map<string, number>()

  for (const unit of units) {
    counts.set(unit.productId, (counts.get(unit.productId) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([productId, quantity]) => `${productId}:${quantity}`)
    .join(',')
}

function buildUnitCountSignatureFromItems(items: SplitPackingBox['items']): string {
  return items
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort()
    .join(',')
}

function rankSplitPartitions(partitions: Array<[OrderUnit[], OrderUnit[]]>) {
  return partitions.sort((left, right) => {
    const scoreDiff = scoreUnitGrouping(left) - scoreUnitGrouping(right)

    if (scoreDiff !== 0) {
      return scoreDiff
    }

    return buildUnitGroupSignature(left[0], left[1]).localeCompare(
      buildUnitGroupSignature(right[0], right[1]),
    )
  })
}

function scoreUnitGrouping(groups: OrderUnit[][]): number {
  const volumes = groups.map((group) => totalUnitVolume(group))
  const weights = groups.map((group) => totalUnitWeight(group))
  const counts = groups.map((group) => group.length)
  const volumeSpread = Math.max(...volumes) - Math.min(...volumes)
  const weightSpread = Math.max(...weights) - Math.min(...weights)
  const countSpread = Math.max(...counts) - Math.min(...counts)

  return volumeSpread / 10_000 + weightSpread / 50 + countSpread * 10
}

function totalUnitVolume(units: OrderUnit[]): number {
  return units.reduce((sum, unit) => sum + volume(unit.size), 0)
}

function totalUnitWeight(units: OrderUnit[]): number {
  return units.reduce((sum, unit) => sum + unit.weight, 0)
}

function calculateRecommendedVoidFillVolume({
  effectiveInner,
  placements,
  layers,
  topVoidFillHeight,
}: {
  effectiveInner: Dimensions
  placements: PackedPlacement[]
  layers: Array<{ index: number; z: number; height: number }>
  topVoidFillHeight: number
}) {
  return buildVoidFillBlocksFromLayout({
    effectiveInner,
    placements,
    layers,
    topVoidFillHeight,
  }).reduce((sum, block) => sum + volume(block), 0)
}

function getTopEmptyHeight({
  effectiveInner,
  placements,
}: {
  effectiveInner: Dimensions
  placements: PackedPlacement[]
}) {
  const usedHeight = placements.reduce(
    (max, placement) => Math.max(max, placement.z + placement.height),
    0,
  )

  return Math.max(effectiveInner.height - usedHeight, 0)
}

function getRecommendedTopVoidFillHeight({
  cushion,
  totalWeight,
  maxFragility,
  strategy,
}: {
  cushion: CushionProfile
  totalWeight: number
  maxFragility: Product['fragility']
  strategy: PackingStrategy
}) {
  let baseHeight = strategy === 'compact' ? 12 : 18

  if (totalWeight > 4000) {
    baseHeight += 8
  } else if (totalWeight > 2500) {
    baseHeight += 4
  }

  if (maxFragility === 'high') {
    baseHeight += 6
  } else if (maxFragility === 'medium') {
    baseHeight += 3
  }

  return Math.max(baseHeight, cushion.topPadding)
}

function getRecommendedBottomFillHeight({
  cushion,
  totalWeight,
}: {
  cushion: CushionProfile
  totalWeight: number
}) {
  let baseHeight = cushion.bottomPadding

  if (totalWeight > 4500) {
    baseHeight += 8
  } else if (totalWeight > 3000) {
    baseHeight += 6
  } else if (totalWeight > 1800) {
    baseHeight += 4
  } else if (totalWeight > 700) {
    baseHeight += 2
  }

  return baseHeight
}

function getOverProtectionPenalty({
  cushion,
  totalWeight,
  maxFragility,
  strategy,
}: {
  cushion: CushionProfile
  totalWeight: number
  maxFragility: Product['fragility']
  strategy: PackingStrategy
}) {
  if (strategy === 'stable' || totalWeight > 2500) {
    return 0
  }

  let penalty = 0

  if (cushion.stabilityBonus >= 15) {
    penalty = 4
  } else if (cushion.stabilityBonus >= 10) {
    penalty = 1
  }

  if (maxFragility === 'high') {
    penalty = Math.max(0, penalty - 1)
  }

  return penalty
}

function getMaxFragility(units: OrderUnit[]): Product['fragility'] {
  return units.reduce<Product['fragility']>((current, unit) => {
    return getFragilityRank(unit.fragility) > getFragilityRank(current)
      ? unit.fragility
      : current
  }, 'low')
}

function formatCentimetersValue(
  lengthInMm: number,
  locale: SupportedLocale,
): string {
  const valueInCm = lengthInMm / 10

  if (Number.isInteger(valueInCm)) {
    return formatNumber(valueInCm, locale, {
      maximumFractionDigits: 0,
    })
  }

  return formatNumber(valueInCm, locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function formatNumber(
  value: number,
  locale: SupportedLocale,
  options: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value)
}
