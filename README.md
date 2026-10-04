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

Web の計算エンジンをビルドするため、Rust と固定バージョンの WASM バインディング生成ツールを用意します。

```bash
rustup show
cargo install wasm-bindgen-cli --version 0.2.114 --locked
```

`rust-toolchain.toml` が Rust 1.93.0 と `wasm32-unknown-unknown` ターゲットを指定します。iOS / Android の TypeScript 計算にはこれらのツールは不要です。

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
- `npm run test:ts`
- `npm run test:core`
- `npm run test:wasm`
- `npm run benchmark`

## Rust / WASM 計算エンジン

Web は `packing-core` の Rust コアを WebAssembly にコンパイルし、専用 Web Worker 内で単箱推薦・分箱探索・配置・支え判定・評価・空隙計算を実行します。UI、翻訳、Three.js の描画は TypeScript のままです。元の2層制限とヒューリスティックの規則は変更していません。

`npm run web` と `npm run build` は先に `npm run build:engine` を実行します。生成した Worker、JS バインディング、WASM は `public/packing-engine/` に置かれ、Expo export に含まれます。生成物と Rust の `target/` は Git 管理せず、Cargo.lock と固定ツールチェーンから再生成します。`npm start` から Web を起動する場合は、先に `npm run build:engine` を実行してください。

Worker の入力は商品・箱・緩衝材・数量・包装設定・戦略、出力は既存の推薦形式です。表示用には各推薦の上位3件だけを返します。言語依存のソートは JavaScript の `localeCompare` と同じ規則を維持します。Rust が計算した空隙ブロックは俯瞰図と3D図でも再利用します。

WASM のロードまたは計算が失敗した場合は同じ Worker 内の TypeScript 実装へ切り替えます。Worker 自体が利用できない・失敗する・30秒以内に応答しない場合はメインスレッドの TypeScript にフォールバックします。この最終フォールバックでは重い入力の処理中に UI が止まる可能性があります。古いリクエストの結果は表示せず、計算中は状態を表示します。iOS / Android は従来どおり TypeScript を使い、Rust のネイティブモジュールを要求しません。

## 梱包計算の前提

個別包装を有効にした商品は、緩衝材プロファイルから求めた厚みを各面に加えた外寸で配置します。商品と包装を一緒に回転させるため、向きが変わっても包装後の容積は変わりません。充填率・空き容積・追加充填材の計算は包装後の外寸を使い、俯瞰図と3D図の商品本体は元の実寸で表示します。

箱マスタの `volumetricWeight` は表に記載された参考容積重量、`maxWeight` は確認済みの重量上限です。いずれも単位はグラムです。現在の表には重量上限の根拠がないため、全箱の `maxWeight` は `null`（未確認）です。容積重量を超えたことだけでは箱を候補から除外しません。実運用前に箱の耐荷重と配送サービスの上限を確認し、適用する上限を登録してください。重量判定には現在、商品の合計重量を使っており、箱・包装材の自重は含みません。

## 検証と公開

`npm test` は既存の16項目を TypeScript と実際の WASM の両方で実行し、全候補の結果・空隙ブロックの対照、Worker 内での実行、フォールバック、古い応答の破棄を検証します。`npm run test:core` は Rust の単体テスト、`npm run benchmark` は既定の7商品について各15回のウォーム計測と Worker 初回起動・往復時間を表示します。Node 上の測定であり、ブラウザやモバイルの性能保証ではありません。

GitHub Actions は PR、`main` への push、手動実行で Rust の整形・clippy・単体テスト、型チェック・lint・両エンジンのテスト・Web build を実行します。PRでは検証のみ行い、`main` の検証がすべて成功した場合に GitHub Pages へ公開します。

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
