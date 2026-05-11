import { cartons as baseCartons, cushions as baseCushions, products as baseProducts } from '@/data'
import {
  getRecommendationReasons,
  getSplitRecommendationReasons,
  type Carton,
  type CushionProfile,
  type Product,
  type Recommendation,
  type SplitPackingRecommendation,
} from '@/packing'
import { getIntlLocale, type SupportedLocale } from '@/locale'

type LocalizedEntry = Record<SupportedLocale, string>

type ProductCopy = {
  brand?: LocalizedEntry
  name: LocalizedEntry
  category: LocalizedEntry
  note: LocalizedEntry
}

type CartonCopy = {
  code?: LocalizedEntry
  label: LocalizedEntry
  service: LocalizedEntry
  note: LocalizedEntry
}

type CushionCopy = {
  name: LocalizedEntry
  note: LocalizedEntry
}

const productCopyById: Partial<Record<string, ProductCopy>> = {
  'pokemon-booster-box': {
    name: {
      ja: 'ポケモンカードゲーム 拡張パックBOX',
      zh: 'Pokemon 卡牌游戏 扩充包 BOX',
      en: 'Pokemon TCG Expansion Pack Box',
    },
    category: {
      ja: '拡張パックBOX',
      zh: '扩充包 BOX',
      en: 'Expansion Pack Box',
    },
    note: {
      ja: 'サンプル寸法。実運用ではSKUごとの実測値に置き換えます。',
      zh: '示例尺寸。实际使用时请替换为各 SKU 的实测值。',
      en: 'Sample dimensions. In production, replace this with measured values for each SKU.',
    },
  },
  'pokemon-premium-set': {
    name: {
      ja: 'ポケモンカードゲーム プレミアムセット',
      zh: 'Pokemon 卡牌游戏 高级套装',
      en: 'Pokemon TCG Premium Set',
    },
    category: {
      ja: '限定セット',
      zh: '限定套装',
      en: 'Limited Set',
    },
    note: {
      ja: '角潰れを避けるため、厚めの緩衝材を優先したい商品です。',
      zh: '为了避免压角，建议优先使用更厚的缓冲材。',
      en: 'Use thicker cushioning for this item to reduce corner crush risk.',
    },
  },
  'onepiece-booster-box': {
    name: {
      ja: 'ONE PIECEカードゲーム ブースターボックス',
      zh: 'ONE PIECE 卡牌游戏 补充盒',
      en: 'ONE PIECE Card Game Booster Box',
    },
    category: {
      ja: 'ブースターボックス',
      zh: '补充盒',
      en: 'Booster Box',
    },
    note: {
      ja: 'サンプル寸法。タイトル別で箱サイズ差分を持てる設計です。',
      zh: '示例尺寸。可以按作品维护不同的箱体尺寸差异。',
      en: 'Sample dimensions. The model supports title-specific box size variants.',
    },
  },
  'onepiece-double-pack': {
    name: {
      ja: 'ONE PIECEカードゲーム ダブルパック',
      zh: 'ONE PIECE 卡牌游戏 双包',
      en: 'ONE PIECE Card Game Double Pack',
    },
    category: {
      ja: 'ダブルパック',
      zh: '双包',
      en: 'Double Pack',
    },
    note: {
      ja: '薄型商品のため、上面の潰れと空隙量が安定性に影響します。',
      zh: '这类薄型商品更容易受到顶部挤压和空隙量的影响。',
      en: 'Because this item is thin, top compression and void volume have a larger impact on stability.',
    },
  },
  'onepiece-op15-adventure-on-gods-island': {
    name: {
      ja: 'ONE PIECEカードゲーム OP-15 神の島の冒険',
      zh: 'ONE PIECE 卡牌游戏 OP-15 神之岛的冒险',
      en: "ONE PIECE Card Game OP-15 Adventure on God's Island",
    },
    category: {
      ja: 'ブースターパックBOX',
      zh: '补充包 BOX',
      en: 'Booster Pack Box',
    },
    note: {
      ja: '長さ7cm・幅7cm・高さ15cm・重量250gの指定値を反映。',
      zh: '已按指定值录入：长 7 cm、宽 7 cm、高 15 cm、重量 250 g。',
      en: 'Reflects the specified dimensions: 7 cm x 7 cm x 15 cm, weight 250 g.',
    },
  },
  'dragonball-booster-box': {
    brand: {
      ja: 'Dragon Ball',
      zh: '龙珠',
      en: 'Dragon Ball',
    },
    name: {
      ja: 'ドラゴンボールカードゲーム ブースターボックス',
      zh: '龙珠卡牌游戏 补充盒',
      en: 'Dragon Ball Card Game Booster Box',
    },
    category: {
      ja: 'ブースターボックス',
      zh: '补充盒',
      en: 'Booster Box',
    },
    note: {
      ja: 'Pokemon / ONE PIECE と近い寸法でも個別管理できます。',
      zh: '即使与 Pokemon / ONE PIECE 尺寸接近，也可以独立管理。',
      en: 'Even if the size is close to Pokemon or ONE PIECE products, it can still be tracked separately.',
    },
  },
  'dragonball-starter-deck': {
    brand: {
      ja: 'Dragon Ball',
      zh: '龙珠',
      en: 'Dragon Ball',
    },
    name: {
      ja: 'ドラゴンボールカードゲーム スターターデッキ',
      zh: '龙珠卡牌游戏 入门卡组',
      en: 'Dragon Ball Card Game Starter Deck',
    },
    category: {
      ja: 'スターターデッキ',
      zh: '入门卡组',
      en: 'Starter Deck',
    },
    note: {
      ja: '小型商品を同梱するときの隙間調整に使いやすい想定です。',
      zh: '适合在与小型商品同箱时用于调整空隙。',
      en: 'Useful for adjusting leftover space when combined with smaller items.',
    },
  },
}

const cartonCopyById: Partial<Record<string, CartonCopy>> = {
  'ma60-033': {
    label: {
      ja: '60サイズ No.1',
      zh: '60 尺寸 No.1',
      en: 'Size 60 No.1',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 222 x 167 x 155 mm。容積重量 1.5 kg。',
      zh: '图片表格内尺寸 222 x 167 x 155 mm，容积重量 1.5 kg。',
      en: 'Image table inner dimensions: 222 x 167 x 155 mm. Volumetric weight: 1.5 kg.',
    },
  },
  'ma80-1538': {
    label: {
      ja: '80サイズ No.2',
      zh: '80 尺寸 No.2',
      en: 'Size 80 No.2',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 280 x 200 x 220 mm。容積重量 2.2 kg。',
      zh: '图片表格内尺寸 280 x 200 x 220 mm，容积重量 2.2 kg。',
      en: 'Image table inner dimensions: 280 x 200 x 220 mm. Volumetric weight: 2.2 kg.',
    },
  },
  'ma80-059': {
    label: {
      ja: '80サイズ No.3',
      zh: '80 尺寸 No.3',
      en: 'Size 80 No.3',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 300 x 300 x 150 mm。容積重量 3.2 kg。',
      zh: '图片表格内尺寸 300 x 300 x 150 mm，容积重量 3.2 kg。',
      en: 'Image table inner dimensions: 300 x 300 x 150 mm. Volumetric weight: 3.2 kg.',
    },
  },
  'ma100-531': {
    label: {
      ja: '100サイズ No.4',
      zh: '100 尺寸 No.4',
      en: 'Size 100 No.4',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 350 x 260 x 200 mm。容積重量 4.3 kg。',
      zh: '图片表格内尺寸 350 x 260 x 200 mm，容积重量 4.3 kg。',
      en: 'Image table inner dimensions: 350 x 260 x 200 mm. Volumetric weight: 4.3 kg.',
    },
  },
  'ma100-078': {
    label: {
      ja: '100サイズ No.5',
      zh: '100 尺寸 No.5',
      en: 'Size 100 No.5',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 400 x 300 x 150 mm。容積重量 4.3 kg。',
      zh: '图片表格内尺寸 400 x 300 x 150 mm，容积重量 4.3 kg。',
      en: 'Image table inner dimensions: 400 x 300 x 150 mm. Volumetric weight: 4.3 kg.',
    },
  },
  'ma100-371': {
    label: {
      ja: '100サイズ No.7',
      zh: '100 尺寸 No.7',
      en: 'Size 100 No.7',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 420 x 310 x 230 mm。容積重量 6.8 kg。',
      zh: '图片表格内尺寸 420 x 310 x 230 mm，容积重量 6.8 kg。',
      en: 'Image table inner dimensions: 420 x 310 x 230 mm. Volumetric weight: 6.8 kg.',
    },
  },
  'ma100-1450': {
    label: {
      ja: '100サイズ No.8',
      zh: '100 尺寸 No.8',
      en: 'Size 100 No.8',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 300 x 300 x 300 mm。容積重量 6.9 kg。',
      zh: '图片表格内尺寸 300 x 300 x 300 mm，容积重量 6.9 kg。',
      en: 'Image table inner dimensions: 300 x 300 x 300 mm. Volumetric weight: 6.9 kg.',
    },
  },
  'ma120-991': {
    label: {
      ja: '120サイズ No.10',
      zh: '120 尺寸 No.10',
      en: 'Size 120 No.10',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 350 x 350 x 350 mm。容積重量 9.5 kg。',
      zh: '图片表格内尺寸 350 x 350 x 350 mm，容积重量 9.5 kg。',
      en: 'Image table inner dimensions: 350 x 350 x 350 mm. Volumetric weight: 9.5 kg.',
    },
  },
  'custom-120-11': {
    code: {
      ja: 'オーダーメイド',
      zh: '定制箱',
      en: 'Custom Box',
    },
    label: {
      ja: '120サイズ No.11',
      zh: '120 尺寸 No.11',
      en: 'Size 120 No.11',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 545 x 330 x 295 mm。外寸欄は厚手表記。容積重量 11.9 kg。',
      zh: '图片表格内尺寸 545 x 330 x 295 mm，外尺寸栏标注厚款，容积重量 11.9 kg。',
      en: 'Image table inner dimensions: 545 x 330 x 295 mm. The outer dimensions are marked as thick-wall. Volumetric weight: 11.9 kg.',
    },
  },
  'ma120-974': {
    label: {
      ja: '120サイズ No.12',
      zh: '120 尺寸 No.12',
      en: 'Size 120 No.12',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 450 x 350 x 350 mm。外寸欄は厚手表記。容積重量 12.2 kg。',
      zh: '图片表格内尺寸 450 x 350 x 350 mm，外尺寸栏标注厚款，容积重量 12.2 kg。',
      en: 'Image table inner dimensions: 450 x 350 x 350 mm. The outer dimensions are marked as thick-wall. Volumetric weight: 12.2 kg.',
    },
  },
  'ma140-643': {
    label: {
      ja: '140サイズ No.14',
      zh: '140 尺寸 No.14',
      en: 'Size 140 No.14',
    },
    service: {
      ja: 'ダンボール表',
      zh: '纸箱表',
      en: 'Cardboard box table',
    },
    note: {
      ja: '画像表の内寸 500 x 400 x 400 mm。容積重量 19.1 kg。',
      zh: '图片表格内尺寸 500 x 400 x 400 mm，容积重量 19.1 kg。',
      en: 'Image table inner dimensions: 500 x 400 x 400 mm. Volumetric weight: 19.1 kg.',
    },
  },
  dhl8: {
    label: {
      ja: '140サイズ',
      zh: '140 尺寸',
      en: 'Size 140',
    },
    service: {
      ja: 'DHL',
      zh: 'DHL',
      en: 'DHL',
    },
    note: {
      ja: '画像表の外寸 540 x 450 x 420 mm から各辺 20mm を差し引いて内寸を推定。容積重量 20.3 kg。',
      zh: '根据图片表格外尺寸 540 x 450 x 420 mm，每边减去 20mm 推算内尺寸。容积重量 20.3 kg。',
      en: 'Estimated inner dimensions by subtracting 20 mm from each listed outer dimension, 540 x 450 x 420 mm. Volumetric weight: 20.3 kg.',
    },
  },
  dhl7: {
    label: {
      ja: '130サイズ',
      zh: '130 尺寸',
      en: 'Size 130',
    },
    service: {
      ja: 'DHL',
      zh: 'DHL',
      en: 'DHL',
    },
    note: {
      ja: '画像表の外寸 480 x 410 x 400 mm から各辺 20mm を差し引いて内寸を推定。容積重量 15.7 kg。',
      zh: '根据图片表格外尺寸 480 x 410 x 400 mm，每边减去 20mm 推算内尺寸。容积重量 15.7 kg。',
      en: 'Estimated inner dimensions by subtracting 20 mm from each listed outer dimension, 480 x 410 x 400 mm. Volumetric weight: 15.7 kg.',
    },
  },
  dhl6: {
    label: {
      ja: '120サイズ',
      zh: '120 尺寸',
      en: 'Size 120',
    },
    service: {
      ja: 'DHL',
      zh: 'DHL',
      en: 'DHL',
    },
    note: {
      ja: '画像表の外寸 420 x 370 x 370 mm から各辺 20mm を差し引いて内寸を推定。容積重量 11.4 kg。',
      zh: '根据图片表格外尺寸 420 x 370 x 370 mm，每边减去 20mm 推算内尺寸。容积重量 11.4 kg。',
      en: 'Estimated inner dimensions by subtracting 20 mm from each listed outer dimension, 420 x 370 x 370 mm. Volumetric weight: 11.4 kg.',
    },
  },
  dhl5: {
    label: {
      ja: '100サイズ',
      zh: '100 尺寸',
      en: 'Size 100',
    },
    service: {
      ja: 'DHL',
      zh: 'DHL',
      en: 'DHL',
    },
    note: {
      ja: '画像表の外寸 340 x 320 x 340 mm から各辺 20mm を差し引いて内寸を推定。容積重量 7.4 kg。',
      zh: '根据图片表格外尺寸 340 x 320 x 340 mm，每边减去 20mm 推算内尺寸。容积重量 7.4 kg。',
      en: 'Estimated inner dimensions by subtracting 20 mm from each listed outer dimension, 340 x 320 x 340 mm. Volumetric weight: 7.4 kg.',
    },
  },
  dhl4: {
    label: {
      ja: '86サイズ',
      zh: '86 尺寸',
      en: 'Size 86',
    },
    service: {
      ja: 'DHL',
      zh: 'DHL',
      en: 'DHL',
    },
    note: {
      ja: '画像表の外寸 340 x 330 x 190 mm から各辺 20mm を差し引いて内寸を推定。容積重量 4.2 kg。',
      zh: '根据图片表格外尺寸 340 x 330 x 190 mm，每边减去 20mm 推算内尺寸。容积重量 4.2 kg。',
      en: 'Estimated inner dimensions by subtracting 20 mm from each listed outer dimension, 340 x 330 x 190 mm. Volumetric weight: 4.2 kg.',
    },
  },
  'fedex-small': {
    label: {
      ja: 'Small',
      zh: 'Small',
      en: 'Small',
    },
    service: {
      ja: 'FedEx',
      zh: 'FedEx',
      en: 'FedEx',
    },
    note: {
      ja: '画像表の外寸 330 x 260 x 330 mm から各辺 20mm を差し引いて内寸を推定。容積重量 5.6 kg。',
      zh: '根据图片表格外尺寸 330 x 260 x 330 mm，每边减去 20mm 推算内尺寸。容积重量 5.6 kg。',
      en: 'Estimated inner dimensions by subtracting 20 mm from each listed outer dimension, 330 x 260 x 330 mm. Volumetric weight: 5.6 kg.',
    },
  },
  'yamato-compact-box': {
    code: {
      ja: '宅急便コンパクト',
      zh: '宅急便 Compact',
      en: 'TA-Q-BIN Compact',
    },
    label: {
      ja: '専用BOX',
      zh: '专用箱',
      en: 'Dedicated Box',
    },
    service: {
      ja: '宅急便コンパクト',
      zh: '宅急便 Compact',
      en: 'TA-Q-BIN Compact',
    },
    note: {
      ja: 'ヤマト運輸の専用資材。公式案内では重量制限なし。',
      zh: 'Yamato Transport 专用资材，官方说明中未设置重量上限。',
      en: 'Dedicated Yamato Transport packaging. The official guidance does not specify a weight limit.',
    },
  },
  'yamato-box-6': {
    code: {
      ja: 'クロネコボックス',
      zh: '黑猫纸箱',
      en: 'Kuroneko Box',
    },
    label: {
      ja: '6',
      zh: '6号',
      en: 'No. 6',
    },
    service: {
      ja: '宅急便 60サイズ相当',
      zh: '宅急便 60 尺寸',
      en: 'TA-Q-BIN 60 size',
    },
    note: {
      ja: 'ヤマト運輸公式の小型箱。小さめのBOX商品向け。',
      zh: 'Yamato 官方小型纸箱，适合较小的盒装商品。',
      en: 'Official Yamato small carton for smaller boxed products.',
    },
  },
  'yamato-box-8': {
    code: {
      ja: 'クロネコボックス',
      zh: '黑猫纸箱',
      en: 'Kuroneko Box',
    },
    label: {
      ja: '8',
      zh: '8号',
      en: 'No. 8',
    },
    service: {
      ja: '宅急便 80サイズ相当',
      zh: '宅急便 80 尺寸',
      en: 'TA-Q-BIN 80 size',
    },
    note: {
      ja: 'ヤマト運輸公式の標準箱。複数SKUの混載候補。',
      zh: 'Yamato 官方标准箱，适合多个 SKU 混装。',
      en: 'Official Yamato standard carton, suitable for mixed-SKU orders.',
    },
  },
  'yamato-box-10': {
    code: {
      ja: 'クロネコボックス',
      zh: '黑猫纸箱',
      en: 'Kuroneko Box',
    },
    label: {
      ja: '10',
      zh: '10号',
      en: 'No. 10',
    },
    service: {
      ja: '宅急便 100サイズ相当',
      zh: '宅急便 100 尺寸',
      en: 'TA-Q-BIN 100 size',
    },
    note: {
      ja: 'ヤマト運輸公式の中型箱。緩衝材を厚めに入れやすい。',
      zh: 'Yamato 官方中型箱，更适合使用较厚缓冲材。',
      en: 'Official Yamato medium carton with room for thicker cushioning.',
    },
  },
  'yamato-box-12': {
    code: {
      ja: 'クロネコボックス',
      zh: '黑猫纸箱',
      en: 'Kuroneko Box',
    },
    label: {
      ja: '12',
      zh: '12号',
      en: 'No. 12',
    },
    service: {
      ja: '宅急便 120サイズ相当',
      zh: '宅急便 120 尺寸',
      en: 'TA-Q-BIN 120 size',
    },
    note: {
      ja: 'ヤマト運輸公式の大型箱。複数BOXの同梱向け。',
      zh: 'Yamato 官方大型箱，适合多个盒装商品同箱。',
      en: 'Official Yamato large carton for combining multiple boxed products.',
    },
  },
  'yamato-box-14': {
    code: {
      ja: 'クロネコボックス',
      zh: '黑猫纸箱',
      en: 'Kuroneko Box',
    },
    label: {
      ja: '14',
      zh: '14号',
      en: 'No. 14',
    },
    service: {
      ja: '宅急便 140サイズ相当',
      zh: '宅急便 140 尺寸',
      en: 'TA-Q-BIN 140 size',
    },
    note: {
      ja: 'ヤマト運輸公式の特大型箱。大量同梱や余白確保向け。',
      zh: 'Yamato 官方特大型箱，适合大批量同梱或预留更多缓冲空间。',
      en: 'Official Yamato extra-large carton for high-volume orders or extra clearance.',
    },
  },
}

const cushionCopyById: Partial<Record<string, CushionCopy>> = {
  'air-cap-light': {
    name: {
      ja: 'プチプチ（気泡緩衝材）5mm',
      zh: '气泡缓冲膜 5 mm',
      en: 'Bubble Wrap 5 mm',
    },
    note: {
      ja: '一般的な軽量保護。単品や標準箱向け。',
      zh: '通用型轻量保护，适合单品或标准箱。',
      en: 'General-purpose lightweight protection for single items and standard cartons.',
    },
  },
  'paper-pad': {
    name: {
      ja: 'クラフト紙緩衝材',
      zh: '牛皮纸缓冲材',
      en: 'Kraft Paper Cushioning',
    },
    note: {
      ja: '隙間埋め性能が高く、混載時に安定しやすい。',
      zh: '填充空隙能力较强，混装时更稳定。',
      en: 'Provides strong void fill and improves stability for mixed loads.',
    },
  },
  'epe-foam': {
    name: {
      ja: '発泡PEフォーム 10mm',
      zh: 'EPE 发泡 PE 泡棉 10 mm',
      en: 'EPE Foam 10 mm',
    },
    note: {
      ja: '角潰れを避けたい限定品や高単価商品向け。',
      zh: '适合需要避免压角的限定品或高单价商品。',
      en: 'Best for premium or limited items where corner protection matters.',
    },
  },
}

const appText = {
  ja: {
    documentTitle: '袁の梱包プランナー',
    languageMenuLabel: '表示言語',
    languageMenuAria: '表示言語を選択',
    languageButtonHint: (nextLabel: string) => `${nextLabel}に切り替え`,
    languageButtonAria: (nextLabel: string) =>
      `${nextLabel}に画面表示の言語を切り替えます。`,
    hero: {
      tagline: '注文内容から最適な紙箱と緩衝材を選ぶ梱包アプリ。',
      eyebrow: '袁の梱包プランナー',
      lead:
        'ポケモン、ONE PIECE、ドラゴンボールの箱入りカード商品を対象に、箱規格、商品の寸法、緩衝材の厚みを加味して「どの箱を使うか」「どの向きで積むか」を素早く比較できる前端原型です。',
      stats: {
        totalUnits: '注文点数',
        activeSkus: '対象SKU',
        totalWeight: '総重量',
      },
    },
    summary: {
      title: 'この原型でできること',
      items: [
        '注文数量から候補箱を自動比較',
        '緩衝材を含めた有効内寸で装箱可否を判定',
        '段ごとの配置と安定性スコアを表示',
        '実運用では商品マスタと箱マスタを差し替え可能',
      ],
    },
    order: {
      eyebrow: '注文商品',
      title: '商品数量を調整',
      sampleButton: 'サンプル注文',
      clearButton: 'すべて0にする',
      dimensions: '寸法',
      dimensionsUnit: 'mm',
      dimensionLength: '長さ',
      dimensionWidth: '幅',
      dimensionHeight: '高さ',
      price: '価格',
      priceUnit: '円',
      weight: '重量',
      note: '注意',
      unsetPrice: '未設定',
      itemWrapLabel: '個別緩衝材',
      itemWrapEnabled: '使用中',
      itemWrapDisabled: '未使用',
      itemWrapEnableAction: '緩衝材を使う',
      itemWrapDisableAction: '緩衝材を外す',
    },
    recommendations: {
      eyebrow: '推奨結果',
      title: '箱候補を比較',
      emptyNoItemsTitle: '商品数量が 0 です。',
      emptyNoItemsBody: '左側で数量を入力すると推奨箱が表示されます。',
      emptyNoFitTitle: '現在の箱規格では収まりません。',
      emptyNoFitBody: 'もっと大きい箱を追加するか、緩衝材ルールを見直してください。',
      candidateLabel: (index: number) => `候補 ${index}`,
      metrics: {
        cushion: '緩衝材',
        score: 'スコア',
        fillRate: '充填率',
        stability: '安定性',
      },
    },
    strategy: {
      ariaLabel: '梱包方針',
      compact: '省箱優先',
      stable: '安定性優先',
      compactNote:
        'できるだけ小さい箱を優先し、空隙量を強めに圧縮して比較します。',
      stableNote:
        '箱内の姿勢と下段の安定を優先し、壊れやすい商品をより保守的に扱います。',
    },
    selectedPlan: {
      eyebrow: '採用案の詳細',
      serviceLabel: '適用サービス',
      strategyLabel: '梱包方針',
      metrics: {
        innerDimensions: '箱の内寸',
        effectiveInner: '有効内寸',
        totalWeight: '総重量',
        emptyVolume: '空き容積',
        recommendedVoidFill: '推奨追加充填材',
        bottomFillHeight: '底面の全面充填',
        itemWrapKind: '個別緩衝材の表示種別',
        topEmptyHeight: '上部空き高さ',
        topVoidFillHeight: '上面の追加充填目安',
        unusedTopHeight: '未使用上部高さ',
        unusedVolume: '未使用空き容積',
      },
    },
    comparison: {
      eyebrow: '単箱と分割案の比較',
      title: '整体利用率を見比べる',
      singleBest: '単箱最良',
      splitBest: (boxCount: number) => `${boxCount}箱分割最良`,
      splitShipment: (boxCount: number) => `${boxCount}箱で分割発送`,
      note: (boxCount: number, fillRate: string, difference: string) =>
        `${boxCount}箱分割にすると、合計充填率は ${fillRate} まで上がり、単箱案との差は ${difference} です。`,
      emptyTitle: '分割比較の対象がまだありません。',
      emptyBody: '商品数量を入れると、単箱案と分割案の差が表示されます。',
      metrics: {
        fillRate: '充填率',
        totalFillRate: '合計充填率',
        emptyVolume: '空き容積',
        totalEmptyVolume: '合計空き容積',
        extraVoidFill: '追加充填材',
        unusedVolume: '未使用容積',
      },
    },
    plan: {
      eyebrow: '装箱プラン',
      title: '箱内立体図と俯視図',
      threeDTitle: '箱内立体図（概略）',
      threeDHint: 'マウスでドラッグして角度変更、ホイールで拡大縮小できます',
      alignTopView: '俯視図に合わせる',
      loading: '3Dビューを読み込んでいます...',
      legend: {
        currentItemWrap: (wrapLabel: string) =>
          `商品の外側の淡色箱 = 商品ごとの個別緩衝材（現在は ${wrapLabel}）`,
        wrap: '斜め模様の淡色 = 包み材（プチプチ / PEフォーム）',
        paperFill: '紙色の淡色 = 紙の詰め材',
        recommendedVoidFill: '半透明の茶色 = 推奨される追加充填材',
        product: '濃い色の箱 = 商品',
        unusedTop: '何も塗られていない上部空間 = 未使用高さ',
        carton: '薄い箱枠 = 紙箱の内寸',
      },
      layerTitle: (layerIndex: number) => `箱内俯視図（第${layerIndex}層）`,
      layerRange: (start: string, end: string, height: string) =>
        `箱の底から ${start} 〜 ${end} / この層の高さ ${height}`,
      boardLegend: {
        sidePadding: '外周の色付き部分 = 側面緩衝材',
        itemWrap: (wrapLabel: string) =>
          `商品の外側の淡色部分 = 商品ごとの個別緩衝材（現在は${wrapLabel}）`,
        wrap: '斜め模様の淡色 = 包み材（プチプチ / PEフォーム）',
        paperFill: '紙色の淡色 = 紙の詰め材',
        recommendedVoidFill: '淡い半透明 = 推奨される追加充填材',
        padding: (side: string, top: string, bottom: string) =>
          `商品の左右前後に ${side} の緩衝材 / 商品の上に ${top} の緩衝材 / 箱底全体に ${bottom} の充填材`,
      },
      placementPosition: (x: string, y: string, orientation: string) =>
        `x ${x} / y ${y} / 向き ${orientation}`,
    },
    split: {
      eyebrow: '分割発送案',
      title: '分割発送の候補',
      emptyTitle: '分割発送案はまだ作成されていません。',
      emptyBody: '現在の注文内容では比較対象がありません。',
      optionLabel: (boxCount: number, index: number) => `${boxCount}箱案 ${index}`,
      boxTitle: (boxIndex: number) => `箱 ${boxIndex}`,
      boxThreeDTitle: (boxIndex: number) => `箱 ${boxIndex} の立体図`,
      fillRate: '充填率',
      weight: '重量',
      bottomFillHeight: '底面全面充填',
      topEmptyHeight: '上部空き高さ',
      topVoidFillHeight: '推奨上面充填',
      unusedTopHeight: '未使用上部高さ',
      unusedVolume: '未使用容積',
      itemQuantity: (quantity: number) => `${quantity} 点`,
      metrics: {
        totalEmptyVolume: '合計空き容積',
        extraVoidFill: '追加充填材',
        unusedVolume: '未使用容積',
        stability: '安定性',
      },
    },
    catalog: {
      eyebrow: 'ヤマト運輸箱規格と緩衝材',
      title: '公式資材マスタ',
      cartonTitle: 'ヤマト運輸 公式箱マスタ',
      service: '配送サービス',
      outerDimensions: '外寸',
      innerDimensions: '内寸',
      maxWeight: '容積重量',
      noWeightLimit: '公式案内では制限なし',
      materialPrice: '資材価格',
      cushionTitle: '緩衝材ルール',
      cushionRule: (side: string, top: string, bottom: string) =>
        `商品の左右前後に ${side} の緩衝材 / 商品の上に ${top} の緩衝材 / 箱底全体に基準 ${bottom} の充填材（重量に応じて増量）`,
      stabilityBonus: '安定性ボーナス',
    },
    nextData: {
      eyebrow: '実運用に必要な次データ',
      title: 'ここを本番データに置き換える',
      items: [
        '商品マスタ: SKUごとの実測寸法、重量、壊れやすさ、天地無用可否',
        '箱マスタ: 実内寸、許容重量、配送会社サイズ、コスト',
        '緩衝材マスタ: 側面余白、上下面余白、必要量の算出ルール',
        '受注連携: 受注CSVや基幹システムから注文行を取り込む処理',
        '検証ログ: 現場で手直しした梱包結果を学習用に残す仕組み',
      ],
    },
  },
  zh: {
    documentTitle: '袁的包装规划器',
    languageMenuLabel: '界面语言',
    languageMenuAria: '选择界面语言',
    languageButtonHint: (nextLabel: string) => `切换到${nextLabel}`,
    languageButtonAria: (nextLabel: string) =>
      `将界面语言切换为${nextLabel}。`,
    hero: {
      tagline: '根据订单内容选择最合适纸箱与缓冲材的包装应用。',
      eyebrow: '袁的包装规划器',
      lead:
        '面向 Pokemon、ONE PIECE、龙珠等盒装卡牌商品，这个前端原型会结合箱型规格、商品尺寸和缓冲材厚度，快速比较“该用哪个箱子”以及“应该如何摆放”。',
      stats: {
        totalUnits: '订单件数',
        activeSkus: '涉及 SKU',
        totalWeight: '总重量',
      },
    },
    summary: {
      title: '这个原型可以做什么',
      items: [
        '根据订单数量自动比较候选箱型',
        '基于含缓冲材的有效内尺寸判断能否装箱',
        '显示每一层的摆放方式与稳定性评分',
        '实际落地时可替换为正式商品主数据与箱型主数据',
      ],
    },
    order: {
      eyebrow: '订单商品',
      title: '调整商品数量',
      sampleButton: '示例订单',
      clearButton: '全部清零',
      dimensions: '尺寸',
      dimensionsUnit: 'mm',
      dimensionLength: '长',
      dimensionWidth: '宽',
      dimensionHeight: '高',
      price: '价格',
      priceUnit: '日元',
      weight: '重量',
      note: '说明',
      unsetPrice: '未设置',
      itemWrapLabel: '单品缓冲包装',
      itemWrapEnabled: '已使用',
      itemWrapDisabled: '未使用',
      itemWrapEnableAction: '使用缓冲包装',
      itemWrapDisableAction: '取消缓冲包装',
    },
    recommendations: {
      eyebrow: '推荐结果',
      title: '比较箱型候选',
      emptyNoItemsTitle: '当前商品数量为 0。',
      emptyNoItemsBody: '在左侧输入数量后，这里会显示推荐箱型。',
      emptyNoFitTitle: '按当前箱型规格无法装下。',
      emptyNoFitBody: '请增加更大的箱型，或调整缓冲材规则。',
      candidateLabel: (index: number) => `候选 ${index}`,
      metrics: {
        cushion: '缓冲材',
        score: '评分',
        fillRate: '填充率',
        stability: '稳定性',
      },
    },
    strategy: {
      ariaLabel: '包装策略',
      compact: '优先小箱',
      stable: '优先稳定',
      compactNote: '优先选择尽量小的箱子，并更积极地压缩空隙量进行比较。',
      stableNote: '优先保证箱内姿态和底层稳定性，对易损商品采用更保守的处理。',
    },
    selectedPlan: {
      eyebrow: '采纳方案详情',
      serviceLabel: '适用服务',
      strategyLabel: '包装策略',
      metrics: {
        innerDimensions: '箱内尺寸',
        effectiveInner: '有效内尺寸',
        totalWeight: '总重量',
        emptyVolume: '空余体积',
        recommendedVoidFill: '建议追加填充材',
        bottomFillHeight: '底部整体填充',
        itemWrapKind: '单品缓冲显示类型',
        topEmptyHeight: '顶部空余高度',
        topVoidFillHeight: '顶部建议填充',
        unusedTopHeight: '未使用顶部高度',
        unusedVolume: '未使用空余体积',
      },
    },
    comparison: {
      eyebrow: '单箱与拆分方案对比',
      title: '比较整体利用率',
      singleBest: '单箱最佳',
      splitBest: (boxCount: number) => `${boxCount}箱拆分最佳`,
      splitShipment: (boxCount: number) => `拆分为 ${boxCount} 箱发货`,
      note: (boxCount: number, fillRate: string, difference: string) =>
        `拆分为 ${boxCount} 箱后，总填充率提升到 ${fillRate}，与单箱方案相比差值为 ${difference}。`,
      emptyTitle: '目前还没有可用于拆分对比的数据。',
      emptyBody: '输入商品数量后，这里会显示单箱方案与拆分方案的差异。',
      metrics: {
        fillRate: '填充率',
        totalFillRate: '总填充率',
        emptyVolume: '空余体积',
        totalEmptyVolume: '总空余体积',
        extraVoidFill: '追加填充材',
        unusedVolume: '未使用体积',
      },
    },
    plan: {
      eyebrow: '装箱方案',
      title: '箱内立体图与俯视图',
      threeDTitle: '箱内立体图（示意）',
      threeDHint: '可拖拽调整角度，滚轮缩放',
      alignTopView: '对齐到俯视图',
      loading: '正在加载 3D 视图...',
      legend: {
        currentItemWrap: (wrapLabel: string) =>
          `商品外围的浅色盒层 = 单品缓冲材（当前为 ${wrapLabel}）`,
        wrap: '斜纹浅色 = 包裹类缓冲材（气泡膜 / PE 泡棉）',
        paperFill: '纸色浅层 = 纸质填充材',
        recommendedVoidFill: '半透明棕色 = 建议追加的填充材',
        product: '深色实体 = 商品',
        unusedTop: '未着色的顶部空间 = 未使用高度',
        carton: '浅色箱框 = 纸箱内尺寸',
      },
      layerTitle: (layerIndex: number) => `箱内俯视图（第 ${layerIndex} 层）`,
      layerRange: (start: string, end: string, height: string) =>
        `从箱底 ${start} 到 ${end} / 本层高度 ${height}`,
      boardLegend: {
        sidePadding: '外圈着色区域 = 侧面缓冲材',
        itemWrap: (wrapLabel: string) =>
          `商品外围浅色区域 = 单品缓冲材（当前为${wrapLabel}）`,
        wrap: '斜纹浅色 = 包裹类缓冲材（气泡膜 / PE 泡棉）',
        paperFill: '纸色浅层 = 纸质填充材',
        recommendedVoidFill: '浅色半透明区域 = 建议追加填充材',
        padding: (side: string, top: string, bottom: string) =>
          `商品四周保留 ${side} 缓冲材 / 商品顶部保留 ${top} 缓冲材 / 箱底整体铺设 ${bottom} 填充材`,
      },
      placementPosition: (x: string, y: string, orientation: string) =>
        `x ${x} / y ${y} / 摆放方向 ${orientation}`,
    },
    split: {
      eyebrow: '拆分发货方案',
      title: '拆分发货候选',
      emptyTitle: '暂时还没有生成拆分发货方案。',
      emptyBody: '按照当前订单内容，还没有可比较的拆分对象。',
      optionLabel: (boxCount: number, index: number) => `${boxCount} 箱方案 ${index}`,
      boxTitle: (boxIndex: number) => `箱 ${boxIndex}`,
      boxThreeDTitle: (boxIndex: number) => `箱 ${boxIndex} 的立体图`,
      fillRate: '填充率',
      weight: '重量',
      bottomFillHeight: '底部整体填充',
      topEmptyHeight: '顶部空余高度',
      topVoidFillHeight: '建议顶部填充',
      unusedTopHeight: '未使用顶部高度',
      unusedVolume: '未使用体积',
      itemQuantity: (quantity: number) => `${quantity} 件`,
      metrics: {
        totalEmptyVolume: '总空余体积',
        extraVoidFill: '追加填充材',
        unusedVolume: '未使用体积',
        stability: '稳定性',
      },
    },
    catalog: {
      eyebrow: 'Yamato 箱型规格与缓冲材',
      title: '官方资材主数据',
      cartonTitle: 'Yamato 官方纸箱主数据',
      service: '配送服务',
      outerDimensions: '外尺寸',
      innerDimensions: '内尺寸',
      maxWeight: '容积重量',
      noWeightLimit: '官方说明中未设置限制',
      materialPrice: '资材价格',
      cushionTitle: '缓冲材规则',
      cushionRule: (side: string, top: string, bottom: string) =>
        `商品四周保留 ${side} 缓冲材 / 商品顶部保留 ${top} 缓冲材 / 箱底基准填充 ${bottom}（会随重量增加）`,
      stabilityBonus: '稳定性加成',
    },
    nextData: {
      eyebrow: '真实落地还需要的数据',
      title: '这些内容需要替换为正式数据',
      items: [
        '商品主数据：每个 SKU 的实测尺寸、重量、易损等级、是否可倒置',
        '箱型主数据：实际内尺寸、承重上限、物流尺寸、成本',
        '缓冲材主数据：侧面余量、上下余量、用量计算规则',
        '订单接入：从订单 CSV 或业务系统导入订单行的处理流程',
        '校验日志：记录现场修正后的包装结果，用于后续学习和优化',
      ],
    },
  },
  en: {
    documentTitle: 'Yuan Packing Planner',
    languageMenuLabel: 'Language',
    languageMenuAria: 'Choose interface language',
    languageButtonHint: (nextLabel: string) => `Switch to ${nextLabel}`,
    languageButtonAria: (nextLabel: string) =>
      `Switch the interface language to ${nextLabel}.`,
    hero: {
      tagline: 'A packing app that selects the best carton and cushioning from an order.',
      eyebrow: 'Yuan Packing Planner',
      lead:
        'This front-end prototype targets boxed trading card products from Pokemon, ONE PIECE, and Dragon Ball. It compares carton options and packing orientation based on carton specs, product dimensions, and cushioning thickness.',
      stats: {
        totalUnits: 'Order Units',
        activeSkus: 'Active SKUs',
        totalWeight: 'Total Weight',
      },
    },
    summary: {
      title: 'What this prototype covers',
      items: [
        'Automatically compares carton candidates from order quantities',
        'Checks fit using effective inner dimensions after cushioning is applied',
        'Shows layer-by-layer placement and stability scores',
        'Can be swapped to production product and carton masters later',
      ],
    },
    order: {
      eyebrow: 'Order Items',
      title: 'Adjust item quantities',
      sampleButton: 'Sample Order',
      clearButton: 'Set All to 0',
      dimensions: 'Dimensions',
      dimensionsUnit: 'mm',
      dimensionLength: 'Length',
      dimensionWidth: 'Width',
      dimensionHeight: 'Height',
      price: 'Price',
      priceUnit: 'JPY',
      weight: 'Weight',
      note: 'Notes',
      unsetPrice: 'Not set',
      itemWrapLabel: 'Item Cushioning',
      itemWrapEnabled: 'Enabled',
      itemWrapDisabled: 'Disabled',
      itemWrapEnableAction: 'Enable Cushioning',
      itemWrapDisableAction: 'Disable Cushioning',
    },
    recommendations: {
      eyebrow: 'Recommendations',
      title: 'Compare carton options',
      emptyNoItemsTitle: 'All item quantities are 0.',
      emptyNoItemsBody: 'Enter quantities on the left to see recommended cartons.',
      emptyNoFitTitle: 'Nothing fits with the current carton set.',
      emptyNoFitBody: 'Add a larger carton or revise the cushioning rules.',
      candidateLabel: (index: number) => `Option ${index}`,
      metrics: {
        cushion: 'Cushion',
        score: 'Score',
        fillRate: 'Fill Rate',
        stability: 'Stability',
      },
    },
    strategy: {
      ariaLabel: 'Packing strategy',
      compact: 'Compact First',
      stable: 'Stability First',
      compactNote:
        'Prioritizes the smallest viable carton and compresses void space more aggressively in the comparison.',
      stableNote:
        'Prioritizes in-box posture and lower-layer stability, and handles fragile products more conservatively.',
    },
    selectedPlan: {
      eyebrow: 'Selected Option Details',
      serviceLabel: 'Service',
      strategyLabel: 'Packing strategy',
      metrics: {
        innerDimensions: 'Carton Inner Size',
        effectiveInner: 'Effective Inner Size',
        totalWeight: 'Total Weight',
        emptyVolume: 'Empty Volume',
        recommendedVoidFill: 'Suggested Extra Void Fill',
        bottomFillHeight: 'Full Base Fill',
        itemWrapKind: 'Item Wrap Display Type',
        topEmptyHeight: 'Top Empty Height',
        topVoidFillHeight: 'Suggested Top Fill',
        unusedTopHeight: 'Unused Top Height',
        unusedVolume: 'Unused Volume',
      },
    },
    comparison: {
      eyebrow: 'Single Box vs Split',
      title: 'Compare overall utilization',
      singleBest: 'Best Single Box',
      splitBest: (boxCount: number) => `Best ${boxCount}-Box Split`,
      splitShipment: (boxCount: number) => `Split shipment across ${boxCount} boxes`,
      note: (boxCount: number, fillRate: string, difference: string) =>
        `Splitting into ${boxCount} boxes raises the combined fill rate to ${fillRate}, a difference of ${difference} versus the best single-box option.`,
      emptyTitle: 'There is no split comparison yet.',
      emptyBody: 'Enter item quantities to compare single-box and split-box outcomes.',
      metrics: {
        fillRate: 'Fill Rate',
        totalFillRate: 'Combined Fill Rate',
        emptyVolume: 'Empty Volume',
        totalEmptyVolume: 'Combined Empty Volume',
        extraVoidFill: 'Extra Void Fill',
        unusedVolume: 'Unused Volume',
      },
    },
    plan: {
      eyebrow: 'Packing Plan',
      title: '3D and top-down carton views',
      threeDTitle: '3D Carton View (Concept)',
      threeDHint: 'Drag to rotate and use the wheel to zoom',
      alignTopView: 'Match Top View',
      loading: 'Loading 3D view...',
      legend: {
        currentItemWrap: (wrapLabel: string) =>
          `Light shell around each product = item-level cushioning (currently ${wrapLabel})`,
        wrap: 'Light diagonal pattern = wrap material (bubble wrap / PE foam)',
        paperFill: 'Paper-toned layer = paper void fill',
        recommendedVoidFill: 'Semi-transparent brown = suggested extra void fill',
        product: 'Solid dark block = product',
        unusedTop: 'Unfilled top space = unused height',
        carton: 'Thin light frame = carton inner size',
      },
      layerTitle: (layerIndex: number) => `Top View (Layer ${layerIndex})`,
      layerRange: (start: string, end: string, height: string) =>
        `From ${start} to ${end} above the carton base / layer height ${height}`,
      boardLegend: {
        sidePadding: 'Colored outer band = side cushioning',
        itemWrap: (wrapLabel: string) =>
          `Light area around each item = item-level cushioning (currently ${wrapLabel})`,
        wrap: 'Light diagonal pattern = wrap material (bubble wrap / PE foam)',
        paperFill: 'Paper-toned layer = paper void fill',
        recommendedVoidFill: 'Light translucent area = suggested extra void fill',
        padding: (side: string, top: string, bottom: string) =>
          `${side} cushioning on all sides / ${top} cushioning above each item / ${bottom} fill across the carton base`,
      },
      placementPosition: (x: string, y: string, orientation: string) =>
        `x ${x} / y ${y} / orientation ${orientation}`,
    },
    split: {
      eyebrow: 'Split Shipment Options',
      title: 'Split shipment candidates',
      emptyTitle: 'No split shipment options have been generated yet.',
      emptyBody: 'The current order does not produce a meaningful split comparison.',
      optionLabel: (boxCount: number, index: number) => `${boxCount}-Box Option ${index}`,
      boxTitle: (boxIndex: number) => `Box ${boxIndex}`,
      boxThreeDTitle: (boxIndex: number) => `3D View for Box ${boxIndex}`,
      fillRate: 'Fill Rate',
      weight: 'Weight',
      bottomFillHeight: 'Full Base Fill',
      topEmptyHeight: 'Top Empty Height',
      topVoidFillHeight: 'Suggested Top Fill',
      unusedTopHeight: 'Unused Top Height',
      unusedVolume: 'Unused Volume',
      itemQuantity: (quantity: number) => `${quantity} units`,
      metrics: {
        totalEmptyVolume: 'Combined Empty Volume',
        extraVoidFill: 'Extra Void Fill',
        unusedVolume: 'Unused Volume',
        stability: 'Stability',
      },
    },
    catalog: {
      eyebrow: 'Yamato Cartons and Cushioning',
      title: 'Official Packaging Master',
      cartonTitle: 'Yamato Official Carton Master',
      service: 'Shipping Service',
      outerDimensions: 'Outer Size',
      innerDimensions: 'Inner Size',
      maxWeight: 'Volumetric Weight',
      noWeightLimit: 'No limit listed in the official guidance',
      materialPrice: 'Material Cost',
      cushionTitle: 'Cushioning Rules',
      cushionRule: (side: string, top: string, bottom: string) =>
        `${side} cushioning on all sides / ${top} cushioning above each item / ${bottom} base fill as the starting point (increases with weight)`,
      stabilityBonus: 'Stability Bonus',
    },
    nextData: {
      eyebrow: 'Data Needed for Production',
      title: 'Replace these with production data',
      items: [
        'Product master: measured dimensions, weight, fragility, and upside-down handling rules per SKU',
        'Carton master: actual inner size, allowed weight, carrier size class, and cost',
        'Cushioning master: side gaps, top and bottom gaps, and quantity calculation rules',
        'Order integration: import order lines from CSV or core business systems',
        'Validation logs: capture manual packing adjustments for future learning and tuning',
      ],
    },
  },
}

export type LocalizedCatalog = {
  products: Product[]
  cartons: Carton[]
  cushions: CushionProfile[]
}

export type LocalizedCatalogMaps = {
  productsById: Map<string, Product>
  cartonsById: Map<string, Carton>
  cushionsById: Map<string, CushionProfile>
}

export function getLocalizedCatalog(locale: SupportedLocale): {
  products: Product[]
  cartons: Carton[]
  cushions: CushionProfile[]
} {
  const products = baseProducts.map((product) => {
    const copy = productCopyById[product.id]

    if (!copy) {
      return product
    }

    return {
      ...product,
      brand: copy.brand?.[locale] ?? product.brand,
      name: copy.name[locale],
      category: copy.category[locale],
      note: copy.note[locale],
    }
  })

  const cartons = baseCartons.map((carton) => {
    const copy = cartonCopyById[carton.id]

    if (!copy) {
      return carton
    }

    return {
      ...carton,
      code: copy.code?.[locale] ?? carton.code,
      label: copy.label[locale],
      service: copy.service[locale],
      note: copy.note[locale],
    }
  })

  const cushions = baseCushions.map((cushion) => {
    const copy = cushionCopyById[cushion.id]

    if (!copy) {
      return cushion
    }

    return {
      ...cushion,
      name: copy.name[locale],
      note: copy.note[locale],
    }
  })

  return { products, cartons, cushions }
}

export function getLocalizedCatalogMaps(
  catalog: LocalizedCatalog,
): LocalizedCatalogMaps {
  return {
    productsById: new Map(catalog.products.map((product) => [product.id, product])),
    cartonsById: new Map(catalog.cartons.map((carton) => [carton.id, carton])),
    cushionsById: new Map(catalog.cushions.map((cushion) => [cushion.id, cushion])),
  }
}

export function localizeRecommendation(
  recommendation: Recommendation,
  locale: SupportedLocale,
  catalogMaps: LocalizedCatalogMaps,
): Recommendation {
  const localizedRecommendation: Recommendation = {
    ...recommendation,
    carton:
      catalogMaps.cartonsById.get(recommendation.carton.id) ?? recommendation.carton,
    cushion:
      catalogMaps.cushionsById.get(recommendation.cushion.id) ?? recommendation.cushion,
    placements: recommendation.placements.map((placement) => {
      const product = catalogMaps.productsById.get(placement.productId)

      if (!product) {
        return placement
      }

      return {
        ...placement,
        name: product.name,
        brand: product.brand,
        category: product.category,
        color: product.color,
      }
    }),
    reasons: [],
  }

  localizedRecommendation.reasons = getRecommendationReasons(
    localizedRecommendation,
    locale,
  )

  return localizedRecommendation
}

export function localizeSplitRecommendation(
  recommendation: SplitPackingRecommendation,
  locale: SupportedLocale,
  catalogMaps: LocalizedCatalogMaps,
): SplitPackingRecommendation {
  const intlLocale = getIntlLocale(locale)
  const localizedSplitRecommendation: SplitPackingRecommendation = {
    ...recommendation,
    boxes: recommendation.boxes.map((box) => ({
      ...box,
      recommendation: localizeRecommendation(box.recommendation, locale, catalogMaps),
      items: box.items
        .map((item) => {
          const product = catalogMaps.productsById.get(item.productId)

          if (!product) {
            return item
          }

          return {
            ...item,
            brand: product.brand,
            name: product.name,
            category: product.category,
            color: product.color,
          }
        })
        .sort((left, right) => left.name.localeCompare(right.name, intlLocale)),
    })),
    reasons: [],
  }

  localizedSplitRecommendation.reasons = getSplitRecommendationReasons(
    localizedSplitRecommendation,
    locale,
  )

  return localizedSplitRecommendation
}

export function getAppText(locale: SupportedLocale) {
  return appText[locale]
}
