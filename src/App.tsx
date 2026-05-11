import { useMemo, useState, type ReactNode } from 'react'
import {
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import {
  cartons as packingCartons,
  cushions as packingCushions,
  defaultOrderLines,
  products as packingProducts,
} from '@/data'
import PackingScene3D from '@/PackingScene3D'
import {
  getAppText,
  getLocalizedCatalog,
  getLocalizedCatalogMaps,
  localizeRecommendation,
  localizeSplitRecommendation,
} from '@/localization'
import {
  formatCurrencyYen,
  localeNames,
  type SupportedLocale,
} from '@/locale'
import {
  buildVoidFillBlocks,
  formatDimensions,
  formatDisplayItemWrapKind,
  formatLength,
  formatPackingStrategy,
  formatPercent,
  formatVolumeLiters,
  formatWeight,
  getDisplayItemWrapKind,
  getDisplayItemWrapPadding,
  recommendPacking,
  recommendSplitPacking,
  type PackedLayer,
  type PackingStrategy,
  type Product,
  type Recommendation,
  type SplitPackingBox,
} from '@/packing'

const repositoryUrl = 'https://github.com/kai987/packing-multilingual'
const PRODUCT_QUANTITY_MAX_DIGITS = 3
const PRODUCT_DIMENSION_MAX_DIGITS = 3
const PRODUCT_PRICE_MAX_DIGITS = 6
const sectionNumberPrefixPattern = /^\d+\.\s*/
const collapseActionLabels: Record<
  SupportedLocale,
  { collapse: string; expand: string }
> = {
  ja: {
    collapse: 'セクションを折りたたむ',
    expand: 'セクションを開く',
  },
  zh: {
    collapse: '折叠模块',
    expand: '展开模块',
  },
  en: {
    collapse: 'Collapse section',
    expand: 'Expand section',
  },
}

type MetricItem = {
  label: string
  value: string | number
}

type PlanText = ReturnType<typeof getAppText>['plan']
type NumberedSectionKey =
  | 'order'
  | 'recommendations'
  | 'selectedPlan'
  | 'plan'
  | 'comparison'
  | 'split'
  | 'catalog'
  | 'nextData'

function cloneProducts(products: Product[]) {
  return products.map((product) => ({
    ...product,
    size: { ...product.size },
  }))
}

function sanitizeDigitsInput(rawValue: string, maxDigits: number) {
  return rawValue.replace(/\D/g, '').slice(0, maxDigits)
}

function getSelectedItem<T extends { key: string }>(
  items: T[],
  selectedKey: string | null,
) {
  return items.find((item) => item.key === selectedKey) ?? items[0] ?? null
}

function formatCartonSummary(
  boxes: Array<{
    recommendation: {
      carton: {
        code: string
        label: string
      }
    }
  }>,
) {
  return boxes
    .map((box) => `${box.recommendation.carton.code} ${box.recommendation.carton.label}`)
    .join(' + ')
}

function percent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value))}%` as `${number}%`
}

function formatNumberedSectionEyebrow(index: number, eyebrow: string) {
  return `${index}. ${eyebrow.replace(sectionNumberPrefixPattern, '')}`
}

function getNumberedSectionEyebrows(
  text: ReturnType<typeof getAppText>,
  hasSelectedRecommendation: boolean,
) {
  const baseEyebrows: Record<NumberedSectionKey, string> = {
    order: text.order.eyebrow,
    recommendations: text.recommendations.eyebrow,
    selectedPlan: text.selectedPlan.eyebrow,
    plan: text.plan.eyebrow,
    comparison: text.comparison.eyebrow,
    split: text.split.eyebrow,
    catalog: text.catalog.eyebrow,
    nextData: text.nextData.eyebrow,
  }
  const visibleKeys: NumberedSectionKey[] = ['order', 'recommendations']

  if (hasSelectedRecommendation) {
    visibleKeys.push('selectedPlan')
  }

  visibleKeys.push('plan', 'comparison', 'split', 'catalog', 'nextData')

  const numberedEyebrows = { ...baseEyebrows }

  visibleKeys.forEach((key, index) => {
    numberedEyebrows[key] = formatNumberedSectionEyebrow(
      index + 1,
      baseEyebrows[key],
    )
  })

  return numberedEyebrows
}

function Section({
  eyebrow,
  title,
  children,
  actions,
  headerStacked = false,
  isCollapsed = false,
  onToggle,
  toggleLabel,
}: {
  eyebrow: string
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
  headerStacked?: boolean
  isCollapsed?: boolean
  onToggle?: () => void
  toggleLabel?: string
}) {
  const canCollapse = Boolean(onToggle)
  const collapseControl = canCollapse ? (
    <Pressable
      accessibilityLabel={toggleLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded: !isCollapsed }}
      hitSlop={8}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.collapseToggle,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.collapseToggleText}>{isCollapsed ? '+' : '-'}</Text>
    </Pressable>
  ) : null

  return (
    <View style={styles.section}>
      <View
        style={[
          styles.sectionHeader,
          headerStacked && styles.sectionHeaderStacked,
        ]}
      >
        {headerStacked ? (
          <>
            <View style={styles.sectionHeaderTitleRow}>
              <View
                style={[
                  styles.sectionTitleGroup,
                  styles.sectionTitleGroupStacked,
                ]}
              >
                <Text style={styles.eyebrow}>{eyebrow}</Text>
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
              {collapseControl}
            </View>
            {actions ? (
              <View
                style={[styles.sectionActions, styles.sectionActionsStacked]}
              >
                {actions}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.sectionTitleGroup}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            {actions || collapseControl ? (
              <View style={styles.sectionActions}>
                {actions}
                {collapseControl}
              </View>
            ) : null}
          </>
        )}
      </View>
      {isCollapsed ? null : children}
    </View>
  )
}

function MetricRows({
  items,
  columns = false,
}: {
  items: MetricItem[]
  columns?: boolean
}) {
  return (
    <View style={columns ? styles.metricGrid : styles.metricList}>
      {items.map((item, index) => (
        <View
          key={`${item.label}-${index}`}
          style={columns ? styles.metricTile : styles.metricRow}
        >
          <Text style={styles.metricLabel}>{item.label}</Text>
          <Text style={styles.metricValue}>{String(item.value)}</Text>
        </View>
      ))}
    </View>
  )
}

function EmptyState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
}

function AppButton({
  label,
  onPress,
  variant = 'secondary',
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.appButton,
        variant === 'primary' && styles.appButtonPrimary,
        variant === 'ghost' && styles.appButtonGhost,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.appButtonText,
          variant === 'primary' && styles.appButtonPrimaryText,
          variant === 'ghost' && styles.appButtonGhostText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function LanguageSwitch({
  locale,
  onChange,
}: {
  locale: SupportedLocale
  onChange: (locale: SupportedLocale) => void
}) {
  const localeOptions = Object.keys(localeNames) as SupportedLocale[]

  return (
    <View style={styles.languageSwitch}>
      {localeOptions.map((localeOption) => {
        const isActive = localeOption === locale

        return (
          <Pressable
            key={localeOption}
            accessibilityRole="button"
            onPress={() => onChange(localeOption)}
            style={({ pressed }) => [
              styles.languageOption,
              isActive && styles.languageOptionActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.languageOptionText,
                isActive && styles.languageOptionActiveText,
              ]}
            >
              {localeNames[localeOption]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function NumberField({
  label,
  value,
  maxLength,
  placeholder,
  onChangeText,
}: {
  label?: string
  value: string
  maxLength: number
  placeholder?: string
  onChangeText: (value: string) => void
}) {
  return (
    <View style={styles.numberField}>
      {label ? <Text style={styles.numberFieldLabel}>{label}</Text> : null}
      <TextInput
        keyboardType="number-pad"
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7b817a"
        style={styles.numberInput}
        value={value}
      />
    </View>
  )
}

function ProductEditor({
  compact,
  product,
  quantity,
  useItemWrap,
  locale,
  labels,
  onDecrease,
  onIncrease,
  onQuantityChange,
  onPriceChange,
  onDimensionChange,
  onToggleItemWrap,
}: {
  compact: boolean
  product: Product
  quantity: number
  useItemWrap: boolean
  locale: SupportedLocale
  labels: {
    dimensions: string
    dimensionsUnit: string
    dimensionLength: string
    dimensionWidth: string
    dimensionHeight: string
    price: string
    priceUnit: string
    weight: string
    note: string
    unsetPrice: string
    itemWrapLabel: string
    itemWrapEnabled: string
    itemWrapDisabled: string
    itemWrapEnableAction: string
    itemWrapDisableAction: string
  }
  onDecrease: () => void
  onIncrease: () => void
  onQuantityChange: (value: string) => void
  onPriceChange: (value: string) => void
  onDimensionChange: (dimension: keyof Product['size'], value: string) => void
  onToggleItemWrap: () => void
}) {
  return (
    <View style={styles.productCard}>
      <View style={[styles.productHeader, compact && styles.productHeaderCompact]}>
        <View style={[styles.brandChip, { backgroundColor: product.color }]}>
          <Text style={styles.brandChipText}>{product.brand}</Text>
        </View>
        <Text style={styles.productName}>{product.name}</Text>
      </View>
      <Text style={styles.productCategory}>{product.category}</Text>

      <Text style={styles.fieldGroupLabel}>
        {labels.dimensions} ({labels.dimensionsUnit})
      </Text>
      <View style={[styles.dimensionGrid, compact && styles.dimensionGridCompact]}>
        <NumberField
          label={labels.dimensionLength}
          maxLength={PRODUCT_DIMENSION_MAX_DIGITS}
          value={String(product.size.length)}
          onChangeText={(value) => onDimensionChange('length', value)}
        />
        <NumberField
          label={labels.dimensionWidth}
          maxLength={PRODUCT_DIMENSION_MAX_DIGITS}
          value={String(product.size.width)}
          onChangeText={(value) => onDimensionChange('width', value)}
        />
        <NumberField
          label={labels.dimensionHeight}
          maxLength={PRODUCT_DIMENSION_MAX_DIGITS}
          value={String(product.size.height)}
          onChangeText={(value) => onDimensionChange('height', value)}
        />
      </View>

      <Text style={styles.fieldGroupLabel}>
        {labels.price} ({labels.priceUnit})
      </Text>
      <NumberField
        maxLength={PRODUCT_PRICE_MAX_DIGITS}
        placeholder={labels.unsetPrice}
        value={product.priceYen !== undefined ? String(product.priceYen) : ''}
        onChangeText={onPriceChange}
      />

      <View style={styles.productMetaGrid}>
        <View style={styles.productMetaBlock}>
          <Text style={styles.metricLabel}>{labels.weight}</Text>
          <Text style={styles.metricValue}>{formatWeight(product.weight, locale)}</Text>
        </View>
        <View style={styles.productMetaBlock}>
          <Text style={styles.metricLabel}>{labels.note}</Text>
          <Text style={styles.metaText}>{product.note}</Text>
        </View>
      </View>

      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          onPress={onDecrease}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
        >
          <Text style={styles.stepperButtonText}>-</Text>
        </Pressable>
        <TextInput
          keyboardType="number-pad"
          maxLength={PRODUCT_QUANTITY_MAX_DIGITS}
          onChangeText={onQuantityChange}
          style={styles.quantityInput}
          value={String(quantity)}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onIncrease}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>

      <View style={[styles.wrapControl, compact && styles.wrapControlCompact]}>
        <View>
          <Text style={styles.metricLabel}>{labels.itemWrapLabel}</Text>
          <Text style={useItemWrap ? styles.wrapEnabled : styles.wrapDisabled}>
            {useItemWrap ? labels.itemWrapEnabled : labels.itemWrapDisabled}
          </Text>
        </View>
        <AppButton
          label={useItemWrap ? labels.itemWrapDisableAction : labels.itemWrapEnableAction}
          onPress={onToggleItemWrap}
          variant={useItemWrap ? 'primary' : 'secondary'}
        />
      </View>
    </View>
  )
}

function SelectableCard({
  badge,
  title,
  subtitle,
  metrics,
  isActive,
  onPress,
}: {
  badge: string
  title: string
  subtitle: string
  metrics: MetricItem[]
  isActive: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectableCard,
        isActive && styles.selectableCardActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.selectableHead}>
        <Text style={styles.cardBadge}>{badge}</Text>
        <Text style={styles.selectableTitle}>{title}</Text>
      </View>
      <Text style={styles.selectableSubtitle}>{subtitle}</Text>
      <MetricRows items={metrics} />
    </Pressable>
  )
}

function groupPlacementsByLayer(placements: Recommendation['placements']) {
  const grouped = new Map<number, Recommendation['placements']>()

  for (const placement of placements) {
    const existing = grouped.get(placement.layerIndex)

    if (existing) {
      existing.push(placement)
    } else {
      grouped.set(placement.layerIndex, [placement])
    }
  }

  for (const layerPlacements of grouped.values()) {
    layerPlacements.sort((left, right) => {
      if (left.y !== right.y) {
        return left.y - right.y
      }

      return left.x - right.x
    })
  }

  return grouped
}

function LayerBoard({
  recommendation,
  layer,
  placements,
  locale,
  labels,
}: {
  recommendation: Recommendation
  layer: PackedLayer
  placements: Recommendation['placements']
  locale: SupportedLocale
  labels: PlanText
}) {
  const itemWrapPadding = getDisplayItemWrapPadding(recommendation.cushion)
  const itemWrapKind = getDisplayItemWrapKind(recommendation.cushion)
  const voidBlocks = buildVoidFillBlocks(recommendation).filter(
    (block) => (block.layerIndex ?? -1) === layer.index,
  )

  return (
    <View style={styles.layerCard}>
      <View style={styles.layerHeader}>
        <Text style={styles.layerTitle}>{labels.layerTitle(layer.index + 1)}</Text>
        <Text style={styles.layerRange}>
          {labels.layerRange(
            formatLength(recommendation.bottomFillHeight + layer.z, locale),
            formatLength(
              recommendation.bottomFillHeight + layer.z + layer.height,
              locale,
            ),
            formatLength(layer.height, locale),
          )}
        </Text>
      </View>

      <View
        style={[
          styles.planBoard,
          {
            aspectRatio:
              recommendation.carton.inner.length / recommendation.carton.inner.width,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.effectiveArea,
            {
              left: percent(
                (recommendation.cushion.sidePadding /
                  recommendation.carton.inner.length) *
                  100,
              ),
              top: percent(
                (recommendation.cushion.sidePadding /
                  recommendation.carton.inner.width) *
                  100,
              ),
              width: percent(
                (recommendation.effectiveInner.length /
                  recommendation.carton.inner.length) *
                  100,
              ),
              height: percent(
                (recommendation.effectiveInner.width /
                  recommendation.carton.inner.width) *
                  100,
              ),
            },
          ]}
        />
        {voidBlocks.map((block) => (
          <View
            key={block.id}
            pointerEvents="none"
            style={[
              styles.voidBlock,
              {
                left: percent(
                  ((recommendation.cushion.sidePadding + block.x) /
                    recommendation.carton.inner.length) *
                    100,
                ),
                top: percent(
                  ((recommendation.cushion.sidePadding + block.y) /
                    recommendation.carton.inner.width) *
                    100,
                ),
                width: percent((block.length / recommendation.carton.inner.length) * 100),
                height: percent((block.width / recommendation.carton.inner.width) * 100),
              },
            ]}
          />
        ))}
        {placements.map((placement) => {
          const widthRate = placement.length / recommendation.carton.inner.length
          const heightRate = placement.width / recommendation.carton.inner.width
          const hasItemWrap = placement.useItemWrap
          const insetXPercent = hasItemWrap
            ? Math.min((itemWrapPadding.side / placement.length) * 100, 18)
            : 0
          const insetYPercent = hasItemWrap
            ? Math.min((itemWrapPadding.side / placement.width) * 100, 18)
            : 0
          const placementDimensions = formatDimensions(
            {
              length: placement.length,
              width: placement.width,
              height: placement.height,
            },
            locale,
          )
          const canShowDetails = widthRate * heightRate >= 0.08

          return (
            <View
              key={placement.instanceId}
              style={[
                styles.planItemShell,
                hasItemWrap && styles.planItemShellWrapped,
                {
                  backgroundColor: hasItemWrap ? '#f7d8a5' : placement.color,
                  left: percent(
                    ((recommendation.cushion.sidePadding + placement.x) /
                      recommendation.carton.inner.length) *
                      100,
                  ),
                  top: percent(
                    ((recommendation.cushion.sidePadding + placement.y) /
                      recommendation.carton.inner.width) *
                      100,
                  ),
                  width: percent(widthRate * 100),
                  height: percent(heightRate * 100),
                },
              ]}
            >
              <View
                style={[
                  styles.planItem,
                  {
                    backgroundColor: placement.color,
                    left: percent(insetXPercent),
                    right: percent(insetXPercent),
                    top: percent(insetYPercent),
                    bottom: percent(insetYPercent),
                  },
                ]}
              >
                <Text numberOfLines={1} style={styles.planItemBrand}>
                  {placement.brand}
                </Text>
                {canShowDetails ? (
                  <>
                    <Text numberOfLines={1} style={styles.planItemCategory}>
                      {placement.category}
                    </Text>
                    <Text numberOfLines={1} style={styles.planItemSize}>
                      {placementDimensions}
                    </Text>
                  </>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>

      <View style={styles.planLegend}>
        <Text style={styles.legendText}>{labels.boardLegend.sidePadding}</Text>
        <Text style={styles.legendText}>
          {labels.boardLegend.itemWrap(formatDisplayItemWrapKind(itemWrapKind, locale))}
        </Text>
        <Text style={styles.legendText}>
          {labels.boardLegend.padding(
            formatLength(recommendation.cushion.sidePadding, locale),
            formatLength(recommendation.cushion.topPadding, locale),
            formatLength(recommendation.bottomFillHeight, locale),
          )}
        </Text>
      </View>
    </View>
  )
}

function PackingPlan({
  recommendation,
  locale,
  labels,
}: {
  recommendation: Recommendation
  locale: SupportedLocale
  labels: PlanText
}) {
  const placementsByLayer = useMemo(
    () => groupPlacementsByLayer(recommendation.placements),
    [recommendation.placements],
  )

  return (
    <View style={styles.layerStack}>
      {recommendation.layers.map((layer) => (
        <LayerBoard
          key={layer.index}
          recommendation={recommendation}
          layer={layer}
          placements={placementsByLayer.get(layer.index) ?? []}
          locale={locale}
          labels={labels}
        />
      ))}
    </View>
  )
}

function SplitBoxSummary({
  box,
  locale,
  labels,
}: {
  box: SplitPackingBox
  locale: SupportedLocale
  labels: {
    boxTitle: (boxIndex: number) => string
    fillRate: string
    weight: string
    bottomFillHeight: string
    topEmptyHeight: string
    topVoidFillHeight: string
    unusedTopHeight: string
    unusedVolume: string
    itemQuantity: (quantity: number) => string
  }
}) {
  const metrics: MetricItem[] = [
    {
      label: labels.fillRate,
      value: formatPercent(box.recommendation.effectiveFillRate, locale),
    },
    {
      label: labels.weight,
      value: formatWeight(box.recommendation.totalWeight, locale),
    },
    {
      label: labels.bottomFillHeight,
      value: formatLength(box.recommendation.bottomFillHeight, locale),
    },
    {
      label: labels.topEmptyHeight,
      value: formatLength(box.recommendation.topEmptyHeight, locale),
    },
    {
      label: labels.topVoidFillHeight,
      value: formatLength(box.recommendation.topVoidFillHeight, locale),
    },
    {
      label: labels.unusedTopHeight,
      value: formatLength(box.recommendation.unusedTopHeight, locale),
    },
    {
      label: labels.unusedVolume,
      value: formatVolumeLiters(box.recommendation.unusedVolume, locale),
    },
  ]

  return (
    <View style={styles.splitBoxCard}>
      <View style={styles.splitBoxHeader}>
        <Text style={styles.splitBoxTitle}>{labels.boxTitle(box.boxIndex)}</Text>
        <Text style={styles.serviceText}>{box.recommendation.carton.service}</Text>
      </View>
      <Text style={styles.splitBoxName}>
        {box.recommendation.carton.code} / {box.recommendation.carton.label}
      </Text>
      <Text style={styles.metaText}>{box.recommendation.cushion.name}</Text>
      <MetricRows items={metrics} />
      <View style={styles.splitItemList}>
        {box.items.map((item) => (
          <View key={`${box.boxIndex}-${item.productId}`} style={styles.splitItem}>
            <View style={[styles.miniColorDot, { backgroundColor: item.color }]} />
            <Text numberOfLines={1} style={styles.splitItemName}>
              {item.brand} / {item.name}
            </Text>
            <Text style={styles.splitItemQty}>{labels.itemQuantity(item.quantity)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function App() {
  const [locale, setLocale] = useState<SupportedLocale>('ja')
  const [editableProducts, setEditableProducts] = useState(() =>
    cloneProducts(packingProducts),
  )
  const [orderLines, setOrderLines] = useState(defaultOrderLines)
  const [packingStrategy, setPackingStrategy] =
    useState<PackingStrategy>('compact')
  const [selectedRecommendationKey, setSelectedRecommendationKey] = useState<
    string | null
  >(null)
  const [selectedSplitKey, setSelectedSplitKey] = useState<string | null>(null)
  const [viewSyncToken, setViewSyncToken] = useState(0)
  const [isSceneGestureActive, setIsSceneGestureActive] = useState(false)
  const [isOrderCollapsed, setIsOrderCollapsed] = useState(false)
  const [isRecommendationsCollapsed, setIsRecommendationsCollapsed] =
    useState(false)
  const [isSelectedSummaryCollapsed, setIsSelectedSummaryCollapsed] =
    useState(false)
  const [isPlanCollapsed, setIsPlanCollapsed] = useState(false)
  const [isComparisonCollapsed, setIsComparisonCollapsed] = useState(false)
  const [isSplitCollapsed, setIsSplitCollapsed] = useState(false)
  const [isCatalogCollapsed, setIsCatalogCollapsed] = useState(false)
  const [isNextDataCollapsed, setIsNextDataCollapsed] = useState(false)
  const { width } = useWindowDimensions()
  const isWide = width >= 900
  const isCompact = width < 640
  const text = getAppText(locale)
  const collapseLabels = collapseActionLabels[locale]
  const localizedCatalog = useMemo(() => {
    const baseCatalog = getLocalizedCatalog(locale)
    const editableProductsById = new Map(
      editableProducts.map((product) => [product.id, product] as const),
    )

    return {
      ...baseCatalog,
      products: baseCatalog.products.map((product) => {
        const editableProduct = editableProductsById.get(product.id)

        return editableProduct
          ? {
              ...product,
              size: { ...editableProduct.size },
              priceYen: editableProduct.priceYen,
            }
          : product
      }),
    }
  }, [editableProducts, locale])
  const { products, cartons, cushions } = localizedCatalog
  const localizedCatalogMaps = useMemo(
    () => getLocalizedCatalogMaps(localizedCatalog),
    [localizedCatalog],
  )
  const quantities = useMemo(
    () => new Map(orderLines.map((line) => [line.productId, line.quantity] as const)),
    [orderLines],
  )
  const itemWrapUsage = useMemo(
    () =>
      new Map(orderLines.map((line) => [line.productId, line.useItemWrap] as const)),
    [orderLines],
  )
  const baseRecommendations = useMemo(
    () =>
      recommendPacking({
        products: editableProducts,
        cartons: packingCartons,
        cushions: packingCushions,
        orderLines,
        strategy: packingStrategy,
      }).slice(0, 3),
    [editableProducts, orderLines, packingStrategy],
  )
  const baseSplitRecommendations = useMemo(
    () =>
      recommendSplitPacking({
        products: editableProducts,
        cartons: packingCartons,
        cushions: packingCushions,
        orderLines,
        strategy: packingStrategy,
      }).slice(0, 3),
    [editableProducts, orderLines, packingStrategy],
  )
  const recommendations = useMemo(
    () =>
      baseRecommendations.map((recommendation) =>
        localizeRecommendation(recommendation, locale, localizedCatalogMaps),
      ),
    [baseRecommendations, locale, localizedCatalogMaps],
  )
  const splitRecommendations = useMemo(
    () =>
      baseSplitRecommendations.map((recommendation) =>
        localizeSplitRecommendation(recommendation, locale, localizedCatalogMaps),
      ),
    [baseSplitRecommendations, locale, localizedCatalogMaps],
  )
  const selectedRecommendation = useMemo(
    () => getSelectedItem(recommendations, selectedRecommendationKey),
    [recommendations, selectedRecommendationKey],
  )
  const selectedSplitRecommendation = useMemo(
    () => getSelectedItem(splitRecommendations, selectedSplitKey),
    [selectedSplitKey, splitRecommendations],
  )
  const bestSingleRecommendation = recommendations[0] ?? null
  const bestSplitRecommendation = splitRecommendations[0] ?? null
  const totalUnits = useMemo(
    () => orderLines.reduce((sum, line) => sum + line.quantity, 0),
    [orderLines],
  )
  const activeSkuCount = useMemo(
    () => orderLines.filter((line) => line.quantity > 0).length,
    [orderLines],
  )
  const totalWeight = useMemo(
    () =>
      editableProducts.reduce((sum, product) => {
        return sum + product.weight * (quantities.get(product.id) ?? 0)
      }, 0),
    [editableProducts, quantities],
  )
  const selectedHasItemWrap = selectedRecommendation
    ? selectedRecommendation.placements.some((placement) => placement.useItemWrap)
    : false
  const getRecommendationItemWrapLabel = (recommendation: Recommendation) =>
    recommendation.placements.some((placement) => placement.useItemWrap)
      ? formatDisplayItemWrapKind(
          getDisplayItemWrapKind(recommendation.cushion),
          locale,
        )
      : text.order.itemWrapDisabled
  const selectedItemWrapLabel = selectedRecommendation
    ? selectedHasItemWrap
      ? getRecommendationItemWrapLabel(selectedRecommendation)
      : text.order.itemWrapDisabled
    : ''
  const visualizedPlanBoxes = selectedRecommendation
    ? [
        {
          key: selectedRecommendation.key,
          title: text.plan.threeDTitle,
          subtitle: `${selectedRecommendation.carton.code} / ${selectedRecommendation.cushion.name}`,
          recommendation: selectedRecommendation,
        },
      ]
    : selectedSplitRecommendation
      ? selectedSplitRecommendation.boxes.map((box) => ({
          key: `${selectedSplitRecommendation.key}-${box.boxIndex}`,
          title: text.split.boxThreeDTitle(box.boxIndex),
          subtitle: `${box.recommendation.carton.code} / ${box.recommendation.cushion.name}`,
          recommendation: box.recommendation,
        }))
      : []
  const sectionEyebrows = getNumberedSectionEyebrows(
    text,
    Boolean(selectedRecommendation),
  )
  const productCardLabels = {
    dimensions: text.order.dimensions,
    dimensionsUnit: text.order.dimensionsUnit,
    dimensionLength: text.order.dimensionLength,
    dimensionWidth: text.order.dimensionWidth,
    dimensionHeight: text.order.dimensionHeight,
    price: text.order.price,
    priceUnit: text.order.priceUnit,
    weight: text.order.weight,
    note: text.order.note,
    unsetPrice: text.order.unsetPrice,
    itemWrapLabel: text.order.itemWrapLabel,
    itemWrapEnabled: text.order.itemWrapEnabled,
    itemWrapDisabled: text.order.itemWrapDisabled,
    itemWrapEnableAction: text.order.itemWrapEnableAction,
    itemWrapDisableAction: text.order.itemWrapDisableAction,
  }
  const selectedPlanMetricItems: MetricItem[] = selectedRecommendation
    ? [
        {
          label: text.selectedPlan.metrics.innerDimensions,
          value: formatDimensions(selectedRecommendation.carton.inner, locale),
        },
        {
          label: text.selectedPlan.metrics.effectiveInner,
          value: formatDimensions(selectedRecommendation.effectiveInner, locale),
        },
        {
          label: text.selectedPlan.metrics.totalWeight,
          value: formatWeight(selectedRecommendation.totalWeight, locale),
        },
        {
          label: text.selectedPlan.metrics.emptyVolume,
          value: formatVolumeLiters(selectedRecommendation.emptyVolume, locale),
        },
        {
          label: text.selectedPlan.metrics.recommendedVoidFill,
          value: formatVolumeLiters(
            selectedRecommendation.recommendedVoidFillVolume,
            locale,
          ),
        },
        {
          label: text.selectedPlan.metrics.bottomFillHeight,
          value: formatLength(selectedRecommendation.bottomFillHeight, locale),
        },
        {
          label: text.selectedPlan.metrics.itemWrapKind,
          value: selectedItemWrapLabel,
        },
        {
          label: text.selectedPlan.metrics.topEmptyHeight,
          value: formatLength(selectedRecommendation.topEmptyHeight, locale),
        },
        {
          label: text.selectedPlan.metrics.topVoidFillHeight,
          value: formatLength(selectedRecommendation.topVoidFillHeight, locale),
        },
        {
          label: text.selectedPlan.metrics.unusedTopHeight,
          value: formatLength(selectedRecommendation.unusedTopHeight, locale),
        },
        {
          label: text.selectedPlan.metrics.unusedVolume,
          value: formatVolumeLiters(selectedRecommendation.unusedVolume, locale),
        },
      ]
    : []
  const singleComparisonMetrics: MetricItem[] = bestSingleRecommendation
    ? [
        {
          label: text.comparison.metrics.fillRate,
          value: formatPercent(bestSingleRecommendation.effectiveFillRate, locale),
        },
        {
          label: text.comparison.metrics.emptyVolume,
          value: formatVolumeLiters(bestSingleRecommendation.emptyVolume, locale),
        },
        {
          label: text.comparison.metrics.extraVoidFill,
          value: formatVolumeLiters(
            bestSingleRecommendation.recommendedVoidFillVolume,
            locale,
          ),
        },
        {
          label: text.comparison.metrics.unusedVolume,
          value: formatVolumeLiters(bestSingleRecommendation.unusedVolume, locale),
        },
      ]
    : []
  const splitComparisonMetrics: MetricItem[] = bestSplitRecommendation
    ? [
        {
          label: text.comparison.metrics.totalFillRate,
          value: formatPercent(bestSplitRecommendation.effectiveFillRate, locale),
        },
        {
          label: text.comparison.metrics.totalEmptyVolume,
          value: formatVolumeLiters(bestSplitRecommendation.totalEmptyVolume, locale),
        },
        {
          label: text.comparison.metrics.extraVoidFill,
          value: formatVolumeLiters(
            bestSplitRecommendation.totalRecommendedVoidFillVolume,
            locale,
          ),
        },
        {
          label: text.comparison.metrics.unusedVolume,
          value: formatVolumeLiters(bestSplitRecommendation.totalUnusedVolume, locale),
        },
      ]
    : []
  const splitBoxLabels = {
    boxTitle: text.split.boxTitle,
    fillRate: text.split.fillRate,
    weight: text.split.weight,
    bottomFillHeight: text.split.bottomFillHeight,
    topEmptyHeight: text.split.topEmptyHeight,
    topVoidFillHeight: text.split.topVoidFillHeight,
    unusedTopHeight: text.split.unusedTopHeight,
    unusedVolume: text.split.unusedVolume,
    itemQuantity: text.split.itemQuantity,
  }

  const updateQuantity = (productId: string, delta: number) => {
    setOrderLines((current) =>
      current.map((line) =>
        line.productId === productId
          ? {
              ...line,
              quantity: Math.min(999, Math.max(0, line.quantity + delta)),
            }
          : line,
      ),
    )
  }
  const updateQuantityValue = (productId: string, rawValue: string) => {
    const nextDigits = sanitizeDigitsInput(rawValue, PRODUCT_QUANTITY_MAX_DIGITS)

    setOrderLines((current) =>
      current.map((line) =>
        line.productId === productId
          ? {
              ...line,
              quantity:
                nextDigits.length > 0 ? Number.parseInt(nextDigits, 10) : 0,
            }
          : line,
      ),
    )
  }
  const updateProductDimension = (
    productId: string,
    dimension: keyof Product['size'],
    rawValue: string,
  ) => {
    const nextDigits = sanitizeDigitsInput(
      rawValue,
      PRODUCT_DIMENSION_MAX_DIGITS,
    )

    if (nextDigits.length === 0) {
      return
    }

    const nextValue = Number.parseInt(nextDigits, 10)

    if (!Number.isFinite(nextValue)) {
      return
    }

    setEditableProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? {
              ...product,
              size: {
                ...product.size,
                [dimension]: nextValue,
              },
            }
          : product,
      ),
    )
  }
  const updateProductPrice = (productId: string, rawValue: string) => {
    const nextDigits = sanitizeDigitsInput(rawValue, PRODUCT_PRICE_MAX_DIGITS)

    setEditableProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return {
          ...product,
          priceYen:
            nextDigits.length > 0 ? Number.parseInt(nextDigits, 10) : undefined,
        }
      }),
    )
  }
  const resetSample = () => {
    setOrderLines(defaultOrderLines)
  }
  const clearOrder = () => {
    setOrderLines((current) =>
      current.map((line) => ({
        ...line,
        quantity: 0,
      })),
    )
  }
  const toggleItemWrap = (productId: string) => {
    setOrderLines((current) =>
      current.map((line) =>
        line.productId === productId
          ? { ...line, useItemWrap: !line.useItemWrap }
          : line,
      ),
    )
  }
  const changePackingStrategy = (strategy: PackingStrategy) => {
    setPackingStrategy(strategy)
    setSelectedRecommendationKey(null)
    setSelectedSplitKey(null)
  }
  const openRepository = () => {
    void Linking.openURL(repositoryUrl)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f5f0" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isSceneGestureActive}
      >
        <View style={styles.page}>
          <View style={styles.topBar}>
            <LanguageSwitch locale={locale} onChange={setLocale} />
            <AppButton
              label="GitHub"
              onPress={openRepository}
              variant="ghost"
            />
          </View>

          <View style={[styles.hero, isWide && styles.heroWide]}>
            <View style={styles.heroPanel}>
              <Text style={styles.heroTitle}>{text.hero.tagline}</Text>
              <Text style={styles.eyebrow}>{text.hero.eyebrow}</Text>
              <Text style={styles.lead}>{text.hero.lead}</Text>
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.metricLabel}>{text.hero.stats.totalUnits}</Text>
                  <Text style={styles.heroStatValue}>{totalUnits}</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.metricLabel}>{text.hero.stats.activeSkus}</Text>
                  <Text style={styles.heroStatValue}>{activeSkuCount}</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.metricLabel}>{text.hero.stats.totalWeight}</Text>
                  <Text style={styles.heroStatValue}>
                    {formatWeight(totalWeight, locale)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.summaryPanel}>
              <Text style={styles.eyebrow}>{text.summary.title}</Text>
              {text.summary.items.map((item) => (
                <Text key={item} style={styles.bulletText}>
                  - {item}
                </Text>
              ))}
            </View>
          </View>

          <View style={[styles.workspace, isWide && styles.workspaceWide]}>
            <View style={styles.workspaceColumn}>
              <Section
                eyebrow={sectionEyebrows.order}
                title={text.order.title}
                headerStacked={isCompact}
                isCollapsed={isOrderCollapsed}
                toggleLabel={
                  isOrderCollapsed ? collapseLabels.expand : collapseLabels.collapse
                }
                onToggle={() => setIsOrderCollapsed((current) => !current)}
                actions={
                  <>
                    <AppButton label={text.order.sampleButton} onPress={resetSample} />
                    <AppButton label={text.order.clearButton} onPress={clearOrder} />
                  </>
                }
              >
                <View style={styles.productGrid}>
                  {products.map((product) => {
                    const quantity = quantities.get(product.id) ?? 0
                    const useItemWrap = itemWrapUsage.get(product.id) ?? false

                    return (
                      <ProductEditor
                        compact={isCompact}
                        key={product.id}
                        product={product}
                        quantity={quantity}
                        useItemWrap={useItemWrap}
                        locale={locale}
                        labels={productCardLabels}
                        onDecrease={() => updateQuantity(product.id, -1)}
                        onIncrease={() => updateQuantity(product.id, 1)}
                        onQuantityChange={(value) =>
                          updateQuantityValue(product.id, value)
                        }
                        onPriceChange={(value) =>
                          updateProductPrice(product.id, value)
                        }
                        onDimensionChange={(dimension, value) =>
                          updateProductDimension(product.id, dimension, value)
                        }
                        onToggleItemWrap={() => toggleItemWrap(product.id)}
                      />
                    )
                  })}
                </View>
              </Section>
            </View>

            <View style={styles.workspaceColumn}>
              <Section
                eyebrow={sectionEyebrows.recommendations}
                title={text.recommendations.title}
                isCollapsed={isRecommendationsCollapsed}
                toggleLabel={
                  isRecommendationsCollapsed
                    ? collapseLabels.expand
                    : collapseLabels.collapse
                }
                onToggle={() =>
                  setIsRecommendationsCollapsed((current) => !current)
                }
              >
                <View style={styles.strategySwitch}>
                  <AppButton
                    label={text.strategy.compact}
                    onPress={() => changePackingStrategy('compact')}
                    variant={packingStrategy === 'compact' ? 'primary' : 'secondary'}
                  />
                  <AppButton
                    label={text.strategy.stable}
                    onPress={() => changePackingStrategy('stable')}
                    variant={packingStrategy === 'stable' ? 'primary' : 'secondary'}
                  />
                </View>
                <Text style={styles.strategyNote}>
                  {packingStrategy === 'compact'
                    ? text.strategy.compactNote
                    : text.strategy.stableNote}
                </Text>

                {totalUnits === 0 ? (
                  <EmptyState
                    title={text.recommendations.emptyNoItemsTitle}
                    body={text.recommendations.emptyNoItemsBody}
                  />
                ) : recommendations.length === 0 ? (
                  <EmptyState
                    title={text.recommendations.emptyNoFitTitle}
                    body={text.recommendations.emptyNoFitBody}
                  />
                ) : (
                  <View style={styles.cardStack}>
                    {recommendations.map((recommendation, index) => (
                      <SelectableCard
                        key={recommendation.key}
                        badge={text.recommendations.candidateLabel(index + 1)}
                        title={recommendation.carton.code}
                        subtitle={`${recommendation.carton.label} / ${recommendation.carton.service}`}
                        metrics={[
                          {
                            label: text.recommendations.metrics.cushion,
                            value: recommendation.cushion.name,
                          },
                          {
                            label: text.recommendations.metrics.score,
                            value: recommendation.score,
                          },
                          {
                            label: text.recommendations.metrics.fillRate,
                            value: formatPercent(
                              recommendation.effectiveFillRate,
                              locale,
                            ),
                          },
                          {
                            label: text.recommendations.metrics.stability,
                            value: `${recommendation.stabilityScore} / 100`,
                          },
                        ]}
                        isActive={selectedRecommendation?.key === recommendation.key}
                        onPress={() =>
                          setSelectedRecommendationKey(recommendation.key)
                        }
                      />
                    ))}
                  </View>
                )}
              </Section>

              {selectedRecommendation ? (
                <Section
                  eyebrow={sectionEyebrows.selectedPlan}
                  title={`${selectedRecommendation.carton.code} / ${selectedRecommendation.cushion.name}`}
                  isCollapsed={isSelectedSummaryCollapsed}
                  toggleLabel={
                    isSelectedSummaryCollapsed
                      ? collapseLabels.expand
                      : collapseLabels.collapse
                  }
                  onToggle={() =>
                    setIsSelectedSummaryCollapsed((current) => !current)
                  }
                >
                  <Text style={styles.serviceText}>
                    {text.selectedPlan.serviceLabel}:{' '}
                    {selectedRecommendation.carton.service}
                  </Text>
                  <Text style={styles.serviceText}>
                    {text.selectedPlan.strategyLabel}:{' '}
                    {formatPackingStrategy(selectedRecommendation.strategy, locale)}
                  </Text>
                  <MetricRows items={selectedPlanMetricItems} columns />
                  <View style={styles.reasonList}>
                    {selectedRecommendation.reasons.map((reason) => (
                      <Text key={reason} style={styles.bulletText}>
                        - {reason}
                      </Text>
                    ))}
                  </View>
                </Section>
              ) : null}
            </View>
          </View>

          <Section
            eyebrow={sectionEyebrows.plan}
            title={text.plan.title}
            isCollapsed={isPlanCollapsed}
            toggleLabel={
              isPlanCollapsed ? collapseLabels.expand : collapseLabels.collapse
            }
            onToggle={() => setIsPlanCollapsed((current) => !current)}
            actions={
              visualizedPlanBoxes.length > 0 ? (
                <AppButton
                  label={text.plan.alignTopView}
                  onPress={() => setViewSyncToken((current) => current + 1)}
                />
              ) : undefined
            }
          >
            {visualizedPlanBoxes.length > 0 ? (
              <>
                {visualizedPlanBoxes.map((box) => (
                  <View key={box.key} style={styles.visualizedBox}>
                    <View style={styles.scenePanel}>
                      <View style={styles.layerHeader}>
                        <Text style={styles.layerTitle}>{box.title}</Text>
                        <Text style={styles.layerRange}>{box.subtitle}</Text>
                        <Text style={styles.layerRange}>{text.plan.threeDHint}</Text>
                      </View>
                      <PackingScene3D
                        onGestureActiveChange={setIsSceneGestureActive}
                        recommendation={box.recommendation}
                        viewSyncToken={viewSyncToken}
                      />
                      <View style={styles.threeDLegend}>
                        {[
                          text.plan.legend.currentItemWrap(
                            getRecommendationItemWrapLabel(box.recommendation),
                          ),
                          text.plan.legend.wrap,
                          text.plan.legend.paperFill,
                          text.plan.legend.recommendedVoidFill,
                          text.plan.legend.product,
                          text.plan.legend.unusedTop,
                          text.plan.legend.carton,
                        ].map((item) => (
                          <Text key={item} style={styles.legendText}>
                            {item}
                          </Text>
                        ))}
                      </View>
                    </View>
                    <PackingPlan
                      recommendation={box.recommendation}
                      locale={locale}
                      labels={text.plan}
                    />
                  </View>
                ))}
              </>
            ) : (
              <EmptyState
                title={text.recommendations.emptyNoItemsTitle}
                body={text.recommendations.emptyNoItemsBody}
              />
            )}
          </Section>

          <Section
            eyebrow={sectionEyebrows.comparison}
            title={text.comparison.title}
            isCollapsed={isComparisonCollapsed}
            toggleLabel={
              isComparisonCollapsed
                ? collapseLabels.expand
                : collapseLabels.collapse
            }
            onToggle={() => setIsComparisonCollapsed((current) => !current)}
          >
            {bestSingleRecommendation && bestSplitRecommendation ? (
              <>
                <View style={[styles.comparisonGrid, isWide && styles.comparisonGridWide]}>
                  <View style={styles.comparisonCard}>
                    <Text style={styles.cardBadge}>{text.comparison.singleBest}</Text>
                    <Text style={styles.comparisonTitle}>
                      {bestSingleRecommendation.carton.code} /{' '}
                      {bestSingleRecommendation.carton.label}
                    </Text>
                    <Text style={styles.metaText}>
                      {bestSingleRecommendation.cushion.name}
                    </Text>
                    <MetricRows items={singleComparisonMetrics} />
                  </View>

                  <View style={[styles.comparisonCard, styles.comparisonCardHighlight]}>
                    <Text style={styles.cardBadge}>
                      {text.comparison.splitBest(bestSplitRecommendation.boxCount)}
                    </Text>
                    <Text style={styles.comparisonTitle}>
                      {formatCartonSummary(bestSplitRecommendation.boxes)}
                    </Text>
                    <Text style={styles.metaText}>
                      {text.comparison.splitShipment(
                        bestSplitRecommendation.boxes.length,
                      )}
                    </Text>
                    <MetricRows items={splitComparisonMetrics} />
                  </View>
                </View>
                <Text style={styles.strategyNote}>
                  {text.comparison.note(
                    bestSplitRecommendation.boxCount,
                    formatPercent(bestSplitRecommendation.effectiveFillRate, locale),
                    formatPercent(
                      bestSplitRecommendation.effectiveFillRate -
                        bestSingleRecommendation.effectiveFillRate,
                      locale,
                    ),
                  )}
                </Text>
              </>
            ) : (
              <EmptyState
                title={text.comparison.emptyTitle}
                body={text.comparison.emptyBody}
              />
            )}
          </Section>

          <Section
            eyebrow={sectionEyebrows.split}
            title={text.split.title}
            isCollapsed={isSplitCollapsed}
            toggleLabel={
              isSplitCollapsed ? collapseLabels.expand : collapseLabels.collapse
            }
            onToggle={() => setIsSplitCollapsed((current) => !current)}
          >
            {splitRecommendations.length === 0 ? (
              <EmptyState title={text.split.emptyTitle} body={text.split.emptyBody} />
            ) : (
              <>
                <View style={styles.cardStack}>
                  {splitRecommendations.map((recommendation, index) => (
                    <SelectableCard
                      key={recommendation.key}
                      badge={text.split.optionLabel(
                        recommendation.boxCount,
                        index + 1,
                      )}
                      title={formatPercent(recommendation.effectiveFillRate, locale)}
                      subtitle={formatCartonSummary(recommendation.boxes)}
                      metrics={[
                        {
                          label: text.split.metrics.totalEmptyVolume,
                          value: formatVolumeLiters(
                            recommendation.totalEmptyVolume,
                            locale,
                          ),
                        },
                        {
                          label: text.split.metrics.extraVoidFill,
                          value: formatVolumeLiters(
                            recommendation.totalRecommendedVoidFillVolume,
                            locale,
                          ),
                        },
                        {
                          label: text.split.metrics.unusedVolume,
                          value: formatVolumeLiters(
                            recommendation.totalUnusedVolume,
                            locale,
                          ),
                        },
                        {
                          label: text.split.metrics.stability,
                          value: `${recommendation.stabilityScore} / 100`,
                        },
                      ]}
                      isActive={selectedSplitRecommendation?.key === recommendation.key}
                      onPress={() => setSelectedSplitKey(recommendation.key)}
                    />
                  ))}
                </View>

                {selectedSplitRecommendation ? (
                  <>
                    <View style={[styles.splitBoxGrid, isWide && styles.splitBoxGridWide]}>
                      {selectedSplitRecommendation.boxes.map((box) => (
                        <SplitBoxSummary
                          key={box.boxIndex}
                          box={box}
                          locale={locale}
                          labels={splitBoxLabels}
                        />
                      ))}
                    </View>
                    <View style={styles.reasonList}>
                      {selectedSplitRecommendation.reasons.map((reason) => (
                        <Text key={reason} style={styles.bulletText}>
                          - {reason}
                        </Text>
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            )}
          </Section>

          <Section
            eyebrow={sectionEyebrows.catalog}
            title={text.catalog.title}
            isCollapsed={isCatalogCollapsed}
            toggleLabel={
              isCatalogCollapsed ? collapseLabels.expand : collapseLabels.collapse
            }
            onToggle={() => setIsCatalogCollapsed((current) => !current)}
          >
            <View style={[styles.catalogGrid, isWide && styles.catalogGridWide]}>
              <View style={styles.catalogPanel}>
                <Text style={styles.catalogTitle}>{text.catalog.cartonTitle}</Text>
                {cartons.map((carton) => (
                  <View key={carton.id} style={styles.catalogItem}>
                    <Text style={styles.catalogItemTitle}>
                      {carton.code} / {carton.label}
                    </Text>
                    <Text style={styles.metaText}>
                      {text.catalog.service}: {carton.service}
                    </Text>
                    {carton.outer ? (
                      <Text style={styles.metaText}>
                        {text.catalog.outerDimensions}:{' '}
                        {formatDimensions(carton.outer, locale)}
                      </Text>
                    ) : null}
                    <Text style={styles.metaText}>
                      {text.catalog.innerDimensions}:{' '}
                      {formatDimensions(carton.inner, locale)}
                    </Text>
                    <Text style={styles.metaText}>
                      {text.catalog.maxWeight}:{' '}
                      {carton.maxWeight === null
                        ? text.catalog.noWeightLimit
                        : formatWeight(carton.maxWeight, locale)}
                    </Text>
                    {carton.priceYen ? (
                      <Text style={styles.metaText}>
                        {text.catalog.materialPrice}:{' '}
                        {formatCurrencyYen(carton.priceYen, locale)}
                      </Text>
                    ) : null}
                    <Text style={styles.catalogNote}>{carton.note}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.catalogPanel}>
                <Text style={styles.catalogTitle}>{text.catalog.cushionTitle}</Text>
                {cushions.map((cushion) => (
                  <View key={cushion.id} style={styles.catalogItem}>
                    <Text style={styles.catalogItemTitle}>{cushion.name}</Text>
                    <Text style={styles.metaText}>
                      {text.catalog.cushionRule(
                        formatLength(cushion.sidePadding, locale),
                        formatLength(cushion.topPadding, locale),
                        formatLength(cushion.bottomPadding, locale),
                      )}
                    </Text>
                    <Text style={styles.metaText}>
                      {text.catalog.stabilityBonus}: +{cushion.stabilityBonus}
                    </Text>
                    <Text style={styles.catalogNote}>{cushion.note}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Section>

          <Section
            eyebrow={sectionEyebrows.nextData}
            title={text.nextData.title}
            isCollapsed={isNextDataCollapsed}
            toggleLabel={
              isNextDataCollapsed ? collapseLabels.expand : collapseLabels.collapse
            }
            onToggle={() => setIsNextDataCollapsed((current) => !current)}
          >
            {text.nextData.items.map((item) => (
              <Text key={item} style={styles.bulletText}>
                - {item}
              </Text>
            ))}
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f5f0',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  scrollContent: {
    paddingBottom: 28,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  page: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 1180,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  languageSwitch: {
    backgroundColor: '#e7ebe5',
    borderColor: '#cfd8cf',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  languageOption: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  languageOptionActive: {
    backgroundColor: '#0f766e',
  },
  languageOptionText: {
    color: '#2f3b36',
    fontSize: 13,
    fontWeight: '700',
  },
  languageOptionActiveText: {
    color: '#ffffff',
  },
  hero: {
    gap: 12,
  },
  heroWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  heroPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#d6ded6',
    borderRadius: 8,
    borderWidth: 1,
    flex: 2,
    gap: 12,
    padding: 18,
  },
  summaryPanel: {
    backgroundColor: '#e8f2ef',
    borderColor: '#b9d3ca',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    padding: 16,
  },
  heroTitle: {
    color: '#15201b',
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 33,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  lead: {
    color: '#46514b',
    fontSize: 15,
    lineHeight: 23,
  },
  heroStats: {
    gap: 10,
  },
  heroStat: {
    backgroundColor: '#f7f8f4',
    borderColor: '#dfe5de',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  heroStatValue: {
    color: '#111c18',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 3,
  },
  workspace: {
    gap: 16,
  },
  workspaceWide: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  workspaceColumn: {
    flex: 1,
    gap: 16,
    minWidth: 0,
  },
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#d8dfd8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionHeaderStacked: {
    flexDirection: 'column',
  },
  sectionHeaderTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    width: '100%',
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  sectionTitleGroupStacked: {
    flex: 1,
  },
  sectionTitle: {
    color: '#16221d',
    fontSize: 20,
    flexShrink: 1,
    fontWeight: '800',
    lineHeight: 25,
  },
  sectionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    maxWidth: '100%',
  },
  sectionActionsStacked: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    width: '100%',
  },
  collapseToggle: {
    alignItems: 'center',
    backgroundColor: '#f7f8f4',
    borderColor: '#cdd8cf',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  collapseToggleText: {
    color: '#17221d',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  appButton: {
    alignItems: 'center',
    backgroundColor: '#eef2ee',
    borderColor: '#cdd8cf',
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  appButtonPrimary: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  appButtonGhost: {
    backgroundColor: '#ffffff',
  },
  appButtonText: {
    color: '#26332e',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  appButtonPrimaryText: {
    color: '#ffffff',
  },
  appButtonGhostText: {
    color: '#0f766e',
  },
  pressed: {
    opacity: 0.72,
  },
  productGrid: {
    gap: 12,
  },
  productCard: {
    backgroundColor: '#fbfcfa',
    borderColor: '#dbe3db',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  productHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  productHeaderCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  brandChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  brandChipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  productName: {
    color: '#17221e',
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    minWidth: 0,
    width: '100%',
  },
  productCategory: {
    color: '#59645e',
    fontSize: 13,
  },
  fieldGroupLabel: {
    color: '#34413a',
    fontSize: 12,
    fontWeight: '800',
  },
  dimensionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  dimensionGridCompact: {
    flexDirection: 'column',
  },
  numberField: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  numberFieldLabel: {
    color: '#5d6861',
    fontSize: 11,
    fontWeight: '700',
  },
  numberInput: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5cd',
    borderRadius: 8,
    borderWidth: 1,
    color: '#15201b',
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  productMetaGrid: {
    gap: 8,
  },
  productMetaBlock: {
    backgroundColor: '#f2f5f2',
    borderRadius: 8,
    gap: 3,
    padding: 10,
  },
  metaText: {
    color: '#4b5650',
    fontSize: 13,
    lineHeight: 19,
  },
  stepper: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 44,
  },
  stepperButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  quantityInput: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5cd',
    borderRadius: 8,
    borderWidth: 1,
    color: '#15201b',
    flex: 1,
    flexBasis: 0,
    fontSize: 17,
    fontWeight: '800',
    minHeight: 42,
    minWidth: 0,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  wrapControl: {
    alignItems: 'center',
    backgroundColor: '#edf5f3',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 10,
  },
  wrapControlCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  wrapEnabled: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
  },
  wrapDisabled: {
    color: '#7b817a',
    fontSize: 14,
    fontWeight: '800',
  },
  strategySwitch: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  strategyNote: {
    color: '#56615b',
    fontSize: 13,
    lineHeight: 20,
  },
  cardStack: {
    gap: 10,
  },
  selectableCard: {
    backgroundColor: '#fbfcfa',
    borderColor: '#d7dfd8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  selectableCardActive: {
    backgroundColor: '#eff8f6',
    borderColor: '#0f766e',
    borderWidth: 2,
  },
  selectableHead: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  cardBadge: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
  },
  selectableTitle: {
    color: '#17221d',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 0,
    textAlign: 'left',
  },
  selectableSubtitle: {
    color: '#58635d',
    fontSize: 13,
    lineHeight: 19,
  },
  metricList: {
    gap: 8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricRow: {
    alignItems: 'center',
    backgroundColor: '#f1f4f1',
    borderRadius: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    padding: 10,
  },
  metricTile: {
    backgroundColor: '#f1f4f1',
    borderRadius: 8,
    gap: 4,
    minWidth: 132,
    padding: 10,
  },
  metricLabel: {
    color: '#667069',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: '#17211d',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  emptyState: {
    backgroundColor: '#f6f7f4',
    borderColor: '#d9e0d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  emptyTitle: {
    color: '#17221d',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyBody: {
    color: '#59645e',
    fontSize: 14,
    lineHeight: 21,
  },
  bulletText: {
    color: '#445049',
    fontSize: 14,
    lineHeight: 22,
  },
  serviceText: {
    color: '#4b5650',
    fontSize: 14,
    lineHeight: 21,
  },
  reasonList: {
    gap: 5,
  },
  layerStack: {
    gap: 12,
  },
  visualizedBox: {
    gap: 12,
  },
  scenePanel: {
    backgroundColor: '#fbfcfa',
    borderColor: '#d7ded7',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  layerCard: {
    backgroundColor: '#fbfcfa',
    borderColor: '#d7ded7',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  layerHeader: {
    gap: 4,
  },
  layerTitle: {
    color: '#17221d',
    fontSize: 16,
    fontWeight: '800',
  },
  layerRange: {
    color: '#59645e',
    fontSize: 12,
    lineHeight: 18,
  },
  planBoard: {
    backgroundColor: '#f3eee6',
    borderColor: '#b9a997',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  effectiveArea: {
    backgroundColor: '#ffffff',
    borderColor: '#b2cfc4',
    borderStyle: 'dashed',
    borderWidth: 1,
    position: 'absolute',
  },
  voidBlock: {
    backgroundColor: '#c3d9d1',
    borderColor: '#82aa9d',
    borderWidth: 1,
    position: 'absolute',
  },
  planItemShell: {
    borderColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'absolute',
  },
  planItemShellWrapped: {
    borderColor: '#c4892f',
    borderWidth: 2,
  },
  planItem: {
    alignItems: 'center',
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 3,
    position: 'absolute',
  },
  planItemBrand: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  planItemCategory: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  planItemSize: {
    color: '#ffffff',
    fontSize: 8,
  },
  planLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  threeDLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendText: {
    backgroundColor: '#eff2ee',
    borderRadius: 6,
    color: '#46514b',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  comparisonGrid: {
    gap: 10,
  },
  comparisonGridWide: {
    flexDirection: 'row',
  },
  comparisonCard: {
    backgroundColor: '#fbfcfa',
    borderColor: '#d7dfd8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    padding: 12,
  },
  comparisonCardHighlight: {
    backgroundColor: '#eef8f6',
    borderColor: '#0f766e',
  },
  comparisonTitle: {
    color: '#17221d',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  splitBoxGrid: {
    gap: 10,
    marginTop: 12,
  },
  splitBoxGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  splitBoxCard: {
    backgroundColor: '#fbfcfa',
    borderColor: '#d7dfd8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    minWidth: 250,
    padding: 12,
  },
  splitBoxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  splitBoxTitle: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
  },
  splitBoxName: {
    color: '#17221d',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  splitItemList: {
    gap: 7,
  },
  splitItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  miniColorDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  splitItemName: {
    color: '#34413a',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  splitItemQty: {
    color: '#59645e',
    fontSize: 12,
    fontWeight: '800',
  },
  catalogGrid: {
    gap: 12,
  },
  catalogGridWide: {
    flexDirection: 'row',
  },
  catalogPanel: {
    flex: 1,
    gap: 10,
  },
  catalogTitle: {
    color: '#17221d',
    fontSize: 17,
    fontWeight: '800',
  },
  catalogItem: {
    backgroundColor: '#f6f8f5',
    borderColor: '#dde4dc',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  catalogItemTitle: {
    color: '#17221d',
    fontSize: 14,
    fontWeight: '800',
  },
  catalogNote: {
    color: '#59645e',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
})
