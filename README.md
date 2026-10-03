# 配給は一人分

スマホ縦画面向けの犬育成シミュレーション（PWA）。仕様・方針・進捗は [CLAUDE.md](CLAUDE.md)。

```sh
npm install
npm run dev        # 開発サーバー
npm test           # core のテスト（プロトタイプとの等価性・シミュレーション）
npm run build      # 型チェック＋本番ビルド（GitHub Pages 用は BASE_PATH=/mofumofu/）
```

トップ画面には、最新の犬の待機アニメーション v12 を表示します。
素材は `public/assets/dog/idle-v12/`、再生処理は `src/render/dog-idle.ts`。
320×320 の元PNGを同じテンポで切り替え、ページが非表示の間は停止します。
犬の首元修正と組込みの確認内容は [docs/dog-idle-v12.md](docs/dog-idle-v12.md)。
以前の黒柴の試作は `lab/dog.html` に保持しています。
