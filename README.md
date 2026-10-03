# brick-packing React Native app

Expo + React Native + TypeScript で構成した、日本向け梱包プランナーのアプリ原型です。

この原型では、以下のような業務課題を想定しています。

- 会社に複数サイズの紙箱がある
- 出荷対象はサイズが異なる箱入りカード商品
- 商品は `Pokemon`、`ONE PIECE`、`Dragon Ball` などのシリーズを含む
- 注文内容から、適切な紙箱、商品の向き、緩衝材を自動で提案したい
- 単に「入るかどうか」だけでなく、安定性、空隙量、緩衝材厚みも考慮したい

## 現在の実装

- Expo SDK 55 + React Native 0.83 + React 19
- TypeScript 5.9
- iOS / Android / Web を同じ React Native UI で起動可能
- 商品マスタ、箱規格マスタ、緩衝材ルールのサンプルデータ
- 説明可能なフロントエンド側のヒューリスティック装箱アルゴリズム
- 日本語 / 中文 / English UI
- 商品数量、寸法、価格、個別包装の入力
- 推奨箱、分割発送案、箱内 3D 図、箱内レイヤー俯瞰図、マスタ一覧の表示
- `expo-gl` + `@react-three/fiber` + `three` による 3D プレビュー

## 起動方法

```bash
npm install
npm run start
```

Expo CLI が起動したら、ターミナルの QR コードを Expo Go または開発ビルドで読み取ります。

Web で確認する場合:

```bash
npm run web
```

## コマンド

- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`

## 梱包計算の前提

個別包装を有効にした商品は、緩衝材プロファイルから求めた厚みを各面に加えた外寸で配置します。商品と包装を一緒に回転させるため、向きが変わっても包装後の容積は変わりません。充填率・空き容積・追加充填材の計算は包装後の外寸を使い、俯瞰図と3D図の商品本体は元の実寸で表示します。

箱マスタの `volumetricWeight` は表に記載された参考容積重量、`maxWeight` は確認済みの重量上限です。いずれも単位はグラムです。現在の表には重量上限の根拠がないため、全箱の `maxWeight` は `null`（未確認）です。容積重量を超えたことだけでは箱を候補から除外しません。実運用前に箱の耐荷重と配送サービスの上限を確認し、適用する上限を登録してください。重量判定には現在、商品の合計重量を使っており、箱・包装材の自重は含みません。

## 検証と公開

`npm test` は Node.js のテストランナーと `tsx` で梱包ロジックを検証します。包装によるサイズ超過・回転・分割梱包・重量上限・商品の重なりやはみ出し・多言語表示を確認します。

GitHub Actions は PR、`main` への push、手動実行で型チェック・lint・テスト・Web buildを実行します。PRでは検証のみ行い、`main` の検証がすべて成功した場合に GitHub Pages へ公開します。

## コード構成

```text
src/
├── App.tsx          # React Native UI
├── PackingScene3D.tsx
├── data.ts          # 商品 / 箱 / 緩衝材のサンプルマスタ
├── localization.ts  # 多言語テキストとローカライズ済みマスタ
├── locale.ts        # ロケールと数値表示
├── main.tsx         # Expo root component 登録
└── packing.ts       # 装箱推薦と評価ロジック
```

## 今後の拡張候補

- 実際の SKU マスタを取り込み、寸法と重量を実測値に置き換える
- 「縦置き不可」「単独包装必須」「高単価商品の二重保護」などの業務ルールを追加する
- CSV、Shopify、楽天、Amazon、または社内システムから注文を取り込む
- 現在のヒューリスティックを、より強い 3D bin packing / cartonization サービスに置き換える
- 現場で調整した梱包結果を蓄積し、推薦ルールの改善に活用する
