# 黒柴 3D（案A）の制作スクリプト

Blender 5.0 の Python モジュール（PyPI の `bpy`）で動く。GUI 版の Blender は不要。

```sh
python3 -m venv venv && venv/bin/pip install bpy==5.0.1 scikit-image pillow
venv/bin/python sdf_dog.py 0.0035          # 形・毛色・重み → dog_mesh.npz
venv/bin/python render_frames.py OUT       # 5状態を 12fps・384px で連番PNGに（1コマ約4秒・CPU）
venv/bin/python pack.py OUT ../../public/lab/dog3d   # WebPアトラスと manifest.json
```

- `sdf_dog.py`：部位を符号付き距離関数で合成してメッシュ化。部位ごとの距離から骨の重みを、位置と法線から毛色（黒→赤茶→裏白）を決める。
- `blend_dog.py`：メッシュ・骨・目鼻・パーティクルの毛・材質・照明・カメラ。
- `anim.py`：待機・なでられ・食事・眠り・しょんぼりの骨アニメーション。
- 素材はすべてこのスクリプトから生成しており、外部モデルは使っていない（ライセンス上の制約なし）。
