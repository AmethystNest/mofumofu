# Mofumofu — 灯りの残る部屋

スマホ縦画面向けの犬育成PWA。災害後の静かな近未来の街で、ごはんを分け、街を歩き、犬との温かな日々を育てます。

```sh
npm ci
npm run dev
npm test
BASE_PATH=/mofumofu/ npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

お世話、探索、7日間の第一章と2つの選択結果、日記、持ちもの、端末内自動保存、保存ファイルの書き出し・読み込みまで操作できます。離れている間におなかや信頼は減りません。

犬は承認済みの待機v12を維持し、左右の耳、しっぽ、なで反応、遊び、食事、睡眠を局所ワープ素材で追加しました。元の首かしげ・瞬きの時刻と6370msのテンポを保持します。端末の動きを減らす設定に対応します。

実装・確認結果は [docs/playable-chapter.md](docs/playable-chapter.md)。元の首元修正は [docs/dog-idle-v12.md](docs/dog-idle-v12.md)。以前の黒柴の試作は `lab/dog.html` に保持しています。

ブラウザ確認を再実行する場合は、Python Playwrightと `/usr/bin/chromium` を用意し、上記のpreview起動後に `python scripts/check-playable.py` を実行します。犬PNG再生成は `python scripts/make-dog-motions.py`（Pillow・NumPy・SciPyが必要）。

保存はこの端末のブラウザ内だけです。機種変更やブラウザデータ削除の前に、設定から記録を書き出してください。iPhone / Galaxy実機での確認は未実施です。
