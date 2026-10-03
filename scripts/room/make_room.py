"""
部屋の背景（朝・昼・夕・夜の4種）を SVG で組み立てる。
SVG を Chromium で描いて WebP にする（scripts/room/build-room.sh）。ブラウザごとの SVG フィルター差を避けるため、
アプリには焼いた WebP だけを置く。画像生成AIは使っていない（図形・グラデーション・ノイズだけ）。

座標は 780x720（カード 390x360 の2倍）。犬の足元は y≈641、ラグの中心はその少し奥。
使い方：python scripts/room/make_room.py <出力フォルダ>
"""
import random
import sys
from pathlib import Path

W, H = 780, 720

# ---- 時間帯ごとの色 -------------------------------------------------------------
VARIANTS = {
    'morning': dict(
        wall=('#f1e9dd', '#dccbb4'), wain=('#e6d9c5', '#cdb99f'), sky=('#a9c8cf', '#eadfc3'), glow='#fff4d6', glow_a=.55,
        floor=('#c19a78', '#e0bf9b'), beam='#fff1cf', beam_a=.34, beam_x=0, grade='#ffe8c0', grade_a=.06, dark=.0,
        city=('#8fb0ad', '#7a9c98', '#648783'), lamp=False, stars=False, moon=False, screen=.8),
    'noon': dict(
        wall=('#f0e7d9', '#d9c7ae'), wain=('#e4d5be', '#cbb69a'), sky=('#9fc3cb', '#e6dcc0'), glow='#fffbe8', glow_a=.5,
        floor=('#bf9573', '#dfbb95'), beam='#fffaf0', beam_a=.28, beam_x=70, grade='#ffffff', grade_a=.0, dark=.0,
        city=('#8aaca9', '#73958f', '#5f827c'), lamp=False, stars=False, moon=False, screen=.8),
    'evening': dict(
        wall=('#ecd9c1', '#d1b08f'), wain=('#dfc6a6', '#c29f7c'), sky=('#e8b48c', '#f2d9a6'), glow='#ffd9a0', glow_a=.7,
        floor=('#b98963', '#d9a97c'), beam='#ffc98a', beam_a=.42, beam_x=150, grade='#ff9a50', grade_a=.12, dark=.06,
        city=('#b58a7a', '#8f6c66', '#6d5457'), lamp=True, stars=False, moon=False, screen=.9),
    'night': dict(
        wall=('#514f66', '#3b3a4d'), wain=('#464459', '#34334a'), sky=('#1e2742', '#44507a'), glow='#a9bcff', glow_a=.2,
        floor=('#4a4254', '#5c5160'), beam='#9db4ff', beam_a=.2, beam_x=60, grade='#2a3566', grade_a=.22, dark=.18,
        city=('#27304c', '#1d2540', '#151b32'), lamp=True, stars=True, moon=True, screen=1.0),
}


def grad(id_, stops, x1=0, y1=0, x2=0, y2=1, units=''):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a}"' if a is not None else '') + '/>' for o, c, a in stops)
    return f'<linearGradient id="{id_}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{units}>{s}</linearGradient>'


def rgrad(id_, stops, cx=.5, cy=.5, r=.5):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return f'<radialGradient id="{id_}" cx="{cx}" cy="{cy}" r="{r}">{s}</radialGradient>'


def mix(c1, c2, t):
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(a, b))


def shade(c, k):
    """k>0 で白へ、k<0 で黒へ"""
    return mix(c, '#ffffff', k) if k > 0 else mix(c, '#000000', -k)


def build(name, v):
    rnd = random.Random(7)
    night = name == 'night'
    out = []
    add = out.append
    ink = '#4a382c'          # 物の輪郭（犬の輪郭に合わせた暗い茶）

    # ---------------------------------------------------------------- defs
    d = []
    d.append(grad('wall', [(0, v['wall'][0], None), (1, v['wall'][1], None)]))
    d.append(grad('wain', [(0, v['wain'][0], None), (1, v['wain'][1], None)]))
    d.append(grad('sky', [(0, v['sky'][0], None), (1, v['sky'][1], None)]))
    d.append(grad('floor', [(0, v['floor'][0], None), (1, v['floor'][1], None)]))
    d.append(rgrad('glow', [(0, v['glow'], v['glow_a']), (1, v['glow'], 0)], .32, .45, .7))
    d.append(grad('beam', [(0, v['beam'], v['beam_a']), (.7, v['beam'], v['beam_a'] * .45), (1, v['beam'], 0)], 0, 0, 0, 1))
    d.append(rgrad('vig', [(0, '#000', 0), (.62, '#000', 0), (1, '#1d1208', .26 + v['dark'])], .5, .46, .75))
    d.append(grad('aoTop', [(0, '#2b1a0c', .38), (1, '#2b1a0c', 0)]))
    d.append(grad('aoBot', [(0, '#2b1a0c', 0), (1, '#2b1a0c', .3)]))
    d.append(grad('wood', [(0, '#a98764', None), (1, '#8d6c4b', None)]))
    d.append(grad('woodTop', [(0, '#c9a47c', None), (1, '#a98764', None)]))
    d.append(grad('curtain', [(0, '#f6ebd6', None), (.5, '#e7d6b8', None), (1, '#f0e2c8', None)], 0, 0, 1, 0))
    d.append(grad('glass', [(0, '#ffffff', .22), (.5, '#ffffff', .0), (1, '#ffffff', .12)], 0, 0, 1, 1))
    d.append(grad('screen', [(0, '#cfe6dc', None), (1, '#8fb5a8', None)]))
    d.append(rgrad('lampGlow', [(0, '#ffd08a', .85 if night else .5), (.45, '#ffb25a', .28 if night else .14), (1, '#ffb25a', 0)], .5, .5, .5))
    d.append(rgrad('screenGlow', [(0, '#a8ffd8', .5), (1, '#a8ffd8', 0)], .5, .5, .5))
    d.append(rgrad('moonGlow', [(0, '#e8eeff', .6), (1, '#e8eeff', 0)], .5, .5, .5))
    d.append(grad('terra', [(0, '#c98a6e', None), (.55, '#b87559', None), (1, '#93573f', None)], 0, 0, 1, 0))
    d.append(grad('box', [(0, '#c9a079', None), (1, '#a67f5a', None)]))
    d.append(grad('rug', [(0, '#efdfc0', None), (1, '#e0c9a2', None)]))
    # フィルター
    d.append('<filter id="b2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2"/></filter>')
    d.append('<filter id="b5" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>')
    d.append('<filter id="b10" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>')
    d.append('<filter id="b22" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="22"/></filter>')
    d.append('<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .15  0 0 0 0 .1  0 0 0 .55 -.18"/></filter>')
    d.append('<filter id="plaster" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".011 .016" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .18  0 0 0 1.1 -.45"/></filter>')
    d.append('<filter id="plasterFine" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .32  0 0 0 0 .22  0 0 0 .9 -.35"/></filter>')
    d.append('<filter id="grainWood" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .26" numOctaves="3" seed="21"/><feColorMatrix values="0 0 0 0 .22  0 0 0 0 .13  0 0 0 0 .06  0 0 0 1.3 -.55"/></filter>')
    d.append('<filter id="grainWoodLight" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .26" numOctaves="3" seed="33"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .85  0 0 0 1.1 -.62"/></filter>')
    d.append('<filter id="weave" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9 .9" numOctaves="1" seed="2"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .14  0 0 0 1 -.35"/></filter>')
    d.append('<filter id="cardboard" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05 .9" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .18  0 0 0 0 .08  0 0 0 1.2 -.5"/></filter>')
    d.append('<clipPath id="floorClip"><path d="M0 448H780V720H0Z"/></clipPath>')
    d.append('<clipPath id="wallClip"><path d="M0 0H780V448H0Z"/></clipPath>')
    d.append('<clipPath id="winClip"><rect x="85" y="61" width="364" height="285" rx="19"/></clipPath>')
    d.append('<clipPath id="rugClip"><ellipse cx="386" cy="610" rx="250" ry="58"/></clipPath>')
    add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><defs>{"".join(d)}</defs>')

    # ---------------------------------------------------------------- 壁
    add(f'<rect width="{W}" height="{H}" fill="url(#wall)"/>')
    # 腰壁（羽目板）：y392〜448
    add(f'<rect y="392" width="{W}" height="56" fill="url(#wain)"/>')
    for x in range(0, W, 78):
        add(f'<path d="M{x} 398V432" stroke="#000" stroke-opacity=".07" stroke-width="2"/><path d="M{x+2} 398V432" stroke="#fff" stroke-opacity=".1" stroke-width="1.5"/>')
    add(f'<rect y="388" width="{W}" height="6" fill="{shade(v["wain"][0], .35)}" opacity=".9"/><rect y="394" width="{W}" height="3" fill="#000" opacity=".1"/>')
    # 壁の質感：しっくい
    add(f'<rect width="{W}" height="448" filter="url(#plaster)" opacity=".34" style="mix-blend-mode:multiply"/>')
    add(f'<rect width="{W}" height="448" filter="url(#plasterFine)" opacity=".26" style="mix-blend-mode:multiply"/>')
    # 壁紙のうすい縞
    for x in range(10, W, 46):
        add(f'<rect x="{x}" y="0" width="22" height="388" fill="#fff" opacity=".035"/>')
    # 窓からの光が壁を明るくする
    add(f'<ellipse cx="270" cy="210" rx="360" ry="260" fill="url(#glow)" style="mix-blend-mode:screen"/>')
    # 幅木
    add(f'<rect y="432" width="{W}" height="16" fill="{shade(v["wain"][0], .15)}"/><rect y="432" width="{W}" height="3" fill="#fff" opacity=".3"/><rect y="444" width="{W}" height="4" fill="#000" opacity=".16"/>')
    # 壁の ひび
    add('<path d="M18 110l12 14-9 34 19 20-6 20" stroke="#6d5a49" stroke-opacity=".5" stroke-width="2.4" fill="none" stroke-linejoin="round"/>')
    add('<path d="M20 112l12 14-9 34 19 20" stroke="#fff" stroke-opacity=".25" stroke-width="1" fill="none" transform="translate(2 1)"/>')

    # ---------------------------------------------------------------- 窓
    sky = v['sky']
    add('<rect x="72" y="48" width="390" height="312" rx="28" fill="#6f665c"/>')
    add('<rect x="72" y="48" width="390" height="312" rx="28" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/>')
    add('<g clip-path="url(#winClip)">')
    add('<rect x="85" y="61" width="364" height="285" fill="url(#sky)"/>')
    if v['stars']:
        for _ in range(46):
            x, y = rnd.uniform(90, 445), rnd.uniform(66, 230)
            r = rnd.choice([.8, 1, 1.2, 1.6])
            add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="#fff" opacity="{rnd.uniform(.45, .95):.2f}"/>')
    if v['moon']:
        add('<circle cx="372" cy="118" r="62" fill="url(#moonGlow)"/><circle cx="372" cy="118" r="22" fill="#f4f1e2"/><circle cx="381" cy="112" r="20" fill="#dcdacf" opacity=".35"/><circle cx="364" cy="124" r="4" fill="#c9c6b8" opacity=".5"/><circle cx="378" cy="128" r="2.6" fill="#c9c6b8" opacity=".5"/>')
    else:
        sx = {'morning': 150, 'noon': 330, 'evening': 400}[name]
        sy = {'morning': 190, 'noon': 98, 'evening': 235}[name]
        add(f'<circle cx="{sx}" cy="{sy}" r="90" fill="{v["glow"]}" opacity=".5" filter="url(#b22)"/><circle cx="{sx}" cy="{sy}" r="24" fill="#fffdf0" opacity=".9" filter="url(#b2)"/>')
        for cx, cy, rx, ry in ((210, 120, 60, 14), (340, 150, 80, 12), (130, 160, 44, 10), (400, 95, 52, 10)):
            add(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#fff" opacity=".4" filter="url(#b5)"/>')
    c1, c2, c3 = v['city']
    # 遠景・中景・近景の廃墟のビル（遠いほど霞む）
    def skyline(base, col, op, seed, hmin, hmax, wmin, wmax):
        r = random.Random(seed)
        x = 80
        p = f'M{x} {base}'
        while x < 455:
            w = r.randint(wmin, wmax)
            h = r.randint(hmin, hmax)
            top = base - h
            p += f'H{x}V{top}'
            if r.random() < .45:
                p += f'l{w*.3:.0f} {r.randint(6, 14)}l{w*.2:.0f} -{r.randint(2, 8)}'
                p += f'H{x + w}'
            else:
                p += f'H{x + w}'
            x += w
        p += f'V{base}Z'
        return f'<path d="{p}" fill="{col}" opacity="{op}"/>'
    add(skyline(262, c1, .55, 3, 36, 96, 22, 40))
    add(skyline(285, c2, .75, 8, 30, 78, 26, 48))
    add(skyline(312, c3, .95, 17, 14, 44, 30, 60))
    if name in ('evening', 'night'):    # 灯りの残る窓
        for _ in range(26 if night else 8):
            x, y = rnd.uniform(95, 440), rnd.uniform(240, 300)
            add(f'<rect x="{x:.0f}" y="{y:.0f}" width="3" height="4" fill="#ffd58a" opacity="{rnd.uniform(.5, 1):.2f}"/>')
    # 手前の草と木
    gcol = mix(c3, '#6f9a6c', .35 if not night else .1)
    add(f'<path d="M85 330q60-30 120-8t150-12q50-6 94 4V346H85Z" fill="{gcol}"/>')
    add(f'<path d="M85 338q80-14 150 0t214-6V346H85Z" fill="{shade(gcol, -.18)}"/>')
    for x, y, r in ((128, 322, 20), (150, 328, 15), (232, 316, 24), (262, 326, 17), (352, 322, 21), (376, 330, 15), (426, 320, 19)):
        add(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*.78:.1f}" fill="{shade(gcol, .06)}"/><ellipse cx="{x-r*.3:.1f}" cy="{y-r*.3:.1f}" rx="{r*.55:.1f}" ry="{r*.4:.1f}" fill="{shade(gcol, .2)}" opacity=".55"/>')
    add('</g>')
    # ガラスの反射と、窓枠
    add('<rect x="85" y="61" width="364" height="285" rx="19" fill="url(#glass)"/>')
    add('<path d="M96 70L300 70L170 340H96Z" fill="#fff" opacity=".07"/>')
    add('<path d="M265 61V346M85 205H449" stroke="#b3ab9d" stroke-width="10"/>')
    add('<path d="M263 61V346M85 203H449" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>')
    add('<path d="M270 61V346M85 210H449" stroke="#000" stroke-opacity=".16" stroke-width="2"/>')
    add('<rect x="85" y="61" width="364" height="285" rx="19" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="3"/>')
    # 窓台
    add('<rect x="55" y="350" width="430" height="22" rx="8" fill="url(#woodTop)"/>')
    add('<rect x="55" y="350" width="430" height="22" rx="8" fill="#000" filter="url(#grainWood)" opacity=".5" style="mix-blend-mode:multiply"/>')
    add('<rect x="58" y="351" width="424" height="4" rx="2" fill="#fff" opacity=".4"/>')
    add('<rect x="55" y="366" width="430" height="6" rx="3" fill="#000" opacity=".16"/>')
    add(f'<rect x="60" y="372" width="420" height="14" fill="#000" opacity=".12" filter="url(#b5)"/>')
    # 窓台の鉢植え
    def plant(cx, base, s=1.0):
        g = []
        g.append(f'<ellipse cx="{cx}" cy="{base}" rx="{26*s}" ry="5" fill="#000" opacity=".22" filter="url(#b2)"/>')
        g.append(f'<path d="M{cx-20*s} {base-34*s}h{40*s}l-{5*s} {34*s}h-{30*s}Z" fill="url(#terra)" stroke="{ink}" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/>')
        g.append(f'<rect x="{cx-23*s}" y="{base-40*s}" width="{46*s}" height="{9*s}" rx="{3*s}" fill="#c9806a" stroke="{ink}" stroke-opacity=".5" stroke-width="2"/>')
        g.append(f'<rect x="{cx-21*s}" y="{base-39*s}" width="{40*s}" height="{2.5*s}" rx="1" fill="#fff" opacity=".35"/>')
        leaf_cols = ('#6f9a6b', '#82ad78', '#5d8860')
        for ang, ln, ci in ((-62, 46, 0), (-30, 58, 1), (0, 64, 2), (28, 56, 1), (58, 44, 0), (-80, 30, 2), (78, 30, 2)):
            import math
            a = math.radians(ang - 90)
            x2 = cx + math.cos(a) * ln * s
            y2 = base - 40 * s + math.sin(a) * ln * s
            mx, my = cx + math.cos(a) * ln * s * .5, base - 40 * s + math.sin(a) * ln * s * .5
            nx, ny = -math.sin(a) * 11 * s, math.cos(a) * 11 * s
            col = leaf_cols[ci]
            g.append(f'<path d="M{cx} {base-40*s}Q{mx+nx:.1f} {my+ny:.1f} {x2:.1f} {y2:.1f}Q{mx-nx:.1f} {my-ny:.1f} {cx} {base-40*s}Z" fill="{col}" stroke="{ink}" stroke-opacity=".4" stroke-width="1.6" stroke-linejoin="round"/>')
            g.append(f'<path d="M{cx} {base-40*s}L{x2:.1f} {y2:.1f}" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/>')
        return ''.join(g)
    add(plant(404, 352, 1.0))
    # 窓から落ちる床の光
    # カーテン（ひだ・タッセル）
    def curtain(x0, x1, top, bot, flip=False):
        g = []
        w = x1 - x0
        n = 6
        for i in range(n):
            xa = x0 + w * i / n
            xb = x0 + w * (i + 1) / n
            tone = ['#f2e6cf', '#e3d1b0', '#f4e9d3'][i % 3]
            sk = 6 if not flip else -6
            g.append(f'<path d="M{xa:.1f} {top}H{xb:.1f}L{xb + sk * (i % 2 - .5):.1f} {bot}H{xa + sk * (i % 2 - .5):.1f}Z" fill="{tone}" opacity=".96"/>')
        g.append(f'<rect x="{x0}" y="{top}" width="{w}" height="{bot - top}" fill="#000" opacity=".05"/>')
        for i in range(n + 1):
            xx = x0 + w * i / n
            g.append(f'<path d="M{xx:.1f} {top}V{bot}" stroke="#7a5f3c" stroke-opacity=".22" stroke-width="2.4"/>')
        g.append(f'<path d="M{x0} {bot}H{x1}" stroke="{ink}" stroke-opacity=".22" stroke-width="3"/>')
        g.append(f'<path d="M{x0} {top}H{x1}" stroke="{ink}" stroke-opacity=".3" stroke-width="3"/>')
        return ''.join(g)
    # 左
    add(f'<g opacity="{.96 if not night else .7}">' + curtain(56, 118, 50, 340) + '</g>')
    add('<path d="M56 235Q88 252 121 232" stroke="#a98763" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M86 246v26" stroke="#a98763" stroke-width="5"/><ellipse cx="86" cy="277" rx="7" ry="9" fill="#c4a07a" stroke="#4a382c" stroke-opacity=".4"/>')
    add(f'<g opacity="{.96 if not night else .7}">' + curtain(430, 480, 50, 340, True) + '</g>')
    add('<path d="M430 235Q455 250 480 236" stroke="#a98763" stroke-width="7" fill="none" stroke-linecap="round"/>')
    # カーテンの影
    add('<rect x="118" y="55" width="22" height="285" fill="#000" opacity=".1" filter="url(#b10)"/>')

    # ---------------------------------------------------------------- 床
    add(f'<path d="M0 448H{W}V{H}H0Z" fill="url(#floor)"/>')
    rows = [448, 468, 492, 521, 556, 598, 648, 708, 780]
    add('<g clip-path="url(#floorClip)">')
    for ri in range(len(rows) - 1):
        y0, y1 = rows[ri], rows[ri + 1]
        scale = (y1 - y0) / 20
        plen = 230 * scale ** .6 + 60
        x = -rnd.uniform(0, plen)
        while x < W:
            ln = plen * rnd.uniform(.85, 1.15)
            k = rnd.uniform(-.07, .07)
            col = shade(mix(v['floor'][0], v['floor'][1], (y0 - 448) / 270), k)
            add(f'<rect x="{x:.1f}" y="{y0}" width="{ln:.1f}" height="{y1 - y0}" fill="{col}"/>')
            add(f'<rect x="{x:.1f}" y="{y0}" width="{ln:.1f}" height="{max(2, (y1 - y0) * .1):.1f}" fill="#fff" opacity=".14"/>')
            add(f'<path d="M{x:.1f} {y0}V{y1}" stroke="#3b2614" stroke-opacity=".5" stroke-width="{1.5 + scale * .6:.1f}"/>')
            x += ln
        add(f'<path d="M0 {y1}H{W}" stroke="#3b2614" stroke-opacity=".42" stroke-width="{2 + scale * .8:.1f}"/>')
        add(f'<path d="M0 {y0 + 1}H{W}" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>')
    add(f'<rect y="448" width="{W}" height="{H - 448}" filter="url(#grainWood)" opacity=".5" style="mix-blend-mode:multiply"/>')
    add(f'<rect y="448" width="{W}" height="{H - 448}" filter="url(#grainWoodLight)" opacity=".28" style="mix-blend-mode:screen"/>')
    # 壁ぎわの影と、手前のやわらかな明暗
    add(f'<rect y="448" width="{W}" height="64" fill="url(#aoTop)"/>')
    add(f'<rect y="620" width="{W}" height="100" fill="url(#aoBot)"/>')
    # 窓の光（窓枠の影が十字に落ちる）
    bx = v['beam_x']
    def pane(x0, x1, y0, y1, dx):
        return f'M{x0 + dx} 452L{x1 + dx} 452L{x1 + dx + 110} 700L{x0 + dx + 110} 700Z'
    beam = f'<g style="mix-blend-mode:{"screen" if night else "soft-light"}" opacity="{1 if night else .95}" filter="url(#b5)">'
    for (a, b) in ((80, 215), (226, 360)):
        beam += f'<path d="M{a + bx} 452L{b + bx} 452L{b + bx + 150} 705L{a + bx + 150} 705Z" fill="url(#beam)"/>'
    beam += '</g>'
    add(beam)
    add(f'<g style="mix-blend-mode:screen" opacity=".55" filter="url(#b10)"><path d="M{70 + bx} 452L{370 + bx} 452L{520 + bx} 710L{220 + bx} 710Z" fill="{v["beam"]}" opacity=".28"/></g>')
    add('</g>')

    # ---------------------------------------------------------------- ラグ
    add('<ellipse cx="388" cy="624" rx="268" ry="62" fill="#2b1a0c" opacity=".3" filter="url(#b10)"/>')
    add('<ellipse cx="386" cy="612" rx="256" ry="64" fill="#c9ab80"/>')   # 厚み
    add('<ellipse cx="386" cy="607" rx="252" ry="60" fill="url(#rug)"/>')
    add('<g clip-path="url(#rugClip)">')
    add('<rect x="130" y="545" width="520" height="130" filter="url(#weave)" opacity=".6" style="mix-blend-mode:multiply"/>')
    for i, (rx, ry, col, op) in enumerate(((236, 54, '#b99968', .55), (206, 46, '#d4b886', .6), (176, 38, '#b99968', .45), (120, 24, '#c7a874', .4))):
        add(f'<ellipse cx="386" cy="607" rx="{rx}" ry="{ry}" fill="none" stroke="{col}" stroke-opacity="{op}" stroke-width="{4 if i % 2 == 0 else 2.4}" stroke-dasharray="{"0" if i % 2 == 0 else "12 8"}"/>')
    add('</g>')
    # 房
    import math
    for k in range(120):
        a = math.pi * 2 * k / 120
        x1, y1 = 386 + math.cos(a) * 252, 607 + math.sin(a) * 60
        x2, y2 = 386 + math.cos(a) * 262, 607 + math.sin(a) * 66
        add(f'<path d="M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}" stroke="#e7d4ad" stroke-width="2.2" stroke-linecap="round"/>')
    add('<ellipse cx="386" cy="607" rx="252" ry="60" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2" transform="translate(0 -2)"/>')
    # 犬の足元の影（犬の絵は影を持たない）
    add('<ellipse cx="390" cy="652" rx="132" ry="19" fill="#2b1a0c" opacity=".34" filter="url(#b5)"/>')
    add('<ellipse cx="390" cy="650" rx="96" ry="11" fill="#2b1a0c" opacity=".28" filter="url(#b2)"/>')

    # ---------------------------------------------------------------- 机と端末
    add('<rect x="520" y="372" width="230" height="30" fill="#000" opacity=".14" filter="url(#b10)"/>')   # 壁への影
    add('<rect x="548" y="374" width="13" height="94" fill="url(#wood)"/><rect x="709" y="374" width="13" height="94" fill="url(#wood)"/>')
    add('<rect x="548" y="374" width="3" height="94" fill="#fff" opacity=".22"/><rect x="709" y="374" width="3" height="94" fill="#fff" opacity=".22"/>')
    add('<rect x="561" y="392" width="148" height="9" fill="#7c5e41"/><rect x="561" y="392" width="148" height="2" fill="#fff" opacity=".18"/>')
    add('<ellipse cx="555" cy="470" rx="16" ry="4" fill="#000" opacity=".28" filter="url(#b2)"/><ellipse cx="716" cy="470" rx="16" ry="4" fill="#000" opacity=".28" filter="url(#b2)"/>')
    add('<rect x="530" y="350" width="226" height="26" rx="6" fill="url(#woodTop)" stroke="#4a382c" stroke-opacity=".45" stroke-width="2"/>')
    add('<rect x="530" y="350" width="226" height="26" rx="6" fill="#000" filter="url(#grainWood)" opacity=".5" style="mix-blend-mode:multiply"/>')
    add('<rect x="534" y="351" width="218" height="4" rx="2" fill="#fff" opacity=".4"/>')
    add('<rect x="530" y="368" width="226" height="8" rx="4" fill="#000" opacity=".15"/>')
    # 本
    add('<rect x="552" y="326" width="68" height="24" rx="3" fill="#e0c28d" stroke="#4a382c" stroke-opacity=".45" stroke-width="2"/><rect x="556" y="322" width="60" height="6" rx="2" fill="#f1e1bf" stroke="#4a382c" stroke-opacity=".35" stroke-width="1.5"/>')
    add('<rect x="552" y="340" width="68" height="4" fill="#a78654" opacity=".6"/><path d="M566 338h30" stroke="#a78654" stroke-width="3"/>')
    # 端末〈ミナト〉
    scr = v['screen']
    if night or name == 'evening':
        add(f'<circle cx="642" cy="222" r="150" fill="url(#screenGlow)" style="mix-blend-mode:screen" opacity="{.9 if night else .35}"/>')
    add('<ellipse cx="640" cy="352" rx="46" ry="6" fill="#000" opacity=".28" filter="url(#b2)"/>')
    add('<rect x="632" y="285" width="16" height="64" rx="4" fill="#7d8c86" stroke="#4a382c" stroke-opacity=".5" stroke-width="2"/>')
    add('<rect x="610" y="342" width="62" height="10" rx="5" fill="#6f7d77" stroke="#4a382c" stroke-opacity=".5" stroke-width="2"/>')
    add('<rect x="556" y="158" width="154" height="130" rx="22" fill="#6f817b" stroke="#3d3128" stroke-opacity=".7" stroke-width="3"/>')
    add('<rect x="560" y="162" width="146" height="40" rx="18" fill="#fff" opacity=".12"/>')
    add('<rect x="568" y="170" width="130" height="88" rx="13" fill="#2a3a37"/>')
    add(f'<rect x="571" y="173" width="124" height="82" rx="11" fill="url(#screen)" opacity="{.75 + .25 * scr:.2f}"/>')
    for yy in range(176, 255, 4):
        add(f'<path d="M573 {yy}H693" stroke="#2a3a37" stroke-opacity=".1" stroke-width="1"/>')
    add('<path d="M586 218h22l9-20 12 36 11-16h38" stroke="#f6fbe6" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    add('<path d="M586 218h22l9-20 12 36 11-16h38" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".22" filter="url(#b2)"/>')
    add('<path d="M574 180Q600 176 640 178" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>')
    add(f'<circle cx="633" cy="272" r="5.5" fill="{"#c8ffb8" if night else "#bdd5b3"}" stroke="#2f3d38" stroke-width="1.5"/>')
    if night:
        add('<circle cx="633" cy="272" r="14" fill="#9dffa0" opacity=".5" filter="url(#b5)"/>')
    for i in range(4):
        add(f'<path d="M{592 + i * 7} 266v10" stroke="#2f3d38" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>')
    # 端末のケーブル
    add('<path d="M652 350Q690 378 706 412Q716 440 718 470" stroke="#4a4237" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>')
    # 壁の時計（止まっている）
    add('<circle cx="640" cy="90" r="36" fill="#000" opacity=".12" filter="url(#b5)" transform="translate(3 5)"/>')
    add('<circle cx="640" cy="90" r="36" fill="#d9c9ae" stroke="#4a382c" stroke-opacity=".6" stroke-width="3"/><circle cx="640" cy="90" r="29" fill="#f4ecdb"/>')
    for i in range(12):
        a = math.pi * 2 * i / 12
        add(f'<path d="M{640 + math.cos(a) * 24:.1f} {90 + math.sin(a) * 24:.1f}L{640 + math.cos(a) * 27:.1f} {90 + math.sin(a) * 27:.1f}" stroke="#6b5a48" stroke-width="2" stroke-linecap="round"/>')
    add('<path d="M640 90L640 70M640 90L653 98" stroke="#5a4838" stroke-width="3" stroke-linecap="round"/><circle cx="640" cy="90" r="3" fill="#5a4838"/>')
    add('<path d="M622 76q10-10 22-10" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>')
    # 付箋
    add('<rect x="727" y="150" width="30" height="30" fill="#f2dc8a" stroke="#4a382c" stroke-opacity=".35" stroke-width="1.5" transform="rotate(5 742 165)"/><path d="M732 160h18M732 167h14M732 174h10" stroke="#8d7a42" stroke-width="2" stroke-linecap="round" transform="rotate(5 742 165)"/>')

    # ---------------------------------------------------------------- 床の小物（器・箱）
    add('<ellipse cx="94" cy="520" rx="62" ry="9" fill="#000" opacity=".3" filter="url(#b2)"/>')
    add('<path d="M44 474h100l-10 41H54Z" fill="#c1b393" stroke="#4a382c" stroke-opacity=".55" stroke-width="2.4" stroke-linejoin="round"/>')
    add('<path d="M50 478h88" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/>')
    add('<path d="M56 500q38 10 76 0" stroke="#8c7d5c" stroke-opacity=".5" stroke-width="2" fill="none"/>')
    add('<ellipse cx="94" cy="476" rx="50" ry="11" fill="#8f836d" stroke="#4a382c" stroke-opacity=".55" stroke-width="2.4"/>')
    add('<ellipse cx="94" cy="477" rx="38" ry="7" fill="#b9d3cc"/><ellipse cx="88" cy="475" rx="14" ry="2.6" fill="#fff" opacity=".6"/>')
    # 段ボール箱（配給）
    add('<ellipse cx="690" cy="540" rx="68" ry="9" fill="#000" opacity=".3" filter="url(#b5)"/>')
    add('<rect x="636" y="466" width="106" height="72" rx="6" fill="url(#box)" stroke="#4a382c" stroke-opacity=".6" stroke-width="2.6"/>')
    add('<rect x="636" y="466" width="106" height="72" rx="6" fill="#000" filter="url(#cardboard)" opacity=".42" style="mix-blend-mode:multiply"/>')
    add('<path d="M636 480H742" stroke="#4a382c" stroke-opacity=".4" stroke-width="2"/><rect x="636" y="466" width="106" height="14" rx="6" fill="#fff" opacity=".12"/>')
    add('<rect x="672" y="466" width="34" height="74" fill="#d8c9a2" opacity=".78"/><rect x="672" y="466" width="34" height="74" fill="#000" opacity=".06"/>')
    add('<rect x="650" y="496" width="42" height="28" rx="2" fill="#f7f0dd" stroke="#4a382c" stroke-opacity=".35" stroke-width="1.5" transform="rotate(-3 671 510)"/>')
    add('<text x="671" y="515" font-size="15" font-weight="700" text-anchor="middle" fill="#8f4b3a" font-family="IPAGothic, Noto Sans CJK JP, sans-serif" transform="rotate(-3 671 510)">配給</text>')
    add('<path d="M640 538H738" stroke="#000" stroke-opacity=".18" stroke-width="3"/>')

    # ---------------------------------------------------------------- 卓上ライト（夕・夜は灯る）
    lx, ly = 733, 350
    if v['lamp']:
        add(f'<circle cx="{lx - 6}" cy="{ly - 40}" r="190" fill="url(#lampGlow)" style="mix-blend-mode:screen"/>')
        add(f'<ellipse cx="{lx - 8}" cy="{ly + 4}" rx="42" ry="9" fill="#ffc67a" opacity="{.5 if night else .28}" filter="url(#b5)" style="mix-blend-mode:screen"/>')
    add(f'<ellipse cx="{lx}" cy="{ly + 1}" rx="17" ry="4" fill="#000" opacity=".3" filter="url(#b2)"/>')
    add(f'<rect x="{lx - 13}" y="{ly - 6}" width="26" height="8" rx="4" fill="#8a7f6e" stroke="{ink}" stroke-opacity=".5" stroke-width="1.8"/>')
    add(f'<path d="M{lx} {ly - 6}V{ly - 34}L{lx - 14} {ly - 54}" stroke="#8a7f6e" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    shade_c = '#ffe3a8' if v['lamp'] else '#e8dcc4'
    add(f'<path d="M{lx - 30} {ly - 52}L{lx - 10} {ly - 80}H{lx + 4}L{lx - 2} {ly - 52}Z" fill="{shade_c}" stroke="{ink}" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/>')
    add(f'<path d="M{lx - 27} {ly - 54}L{lx - 11} {ly - 77}" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>')
    if v['lamp']:
        add(f'<ellipse cx="{lx - 16}" cy="{ly - 52}" rx="14" ry="4" fill="#fff4cf" opacity=".95"/>')

    # ---------------------------------------------------------------- 仕上げ
    add(f'<rect width="{W}" height="{H}" fill="{v["grade"]}" opacity="{v["grade_a"]}" style="mix-blend-mode:soft-light"/>')
    if night:
        add(f'<rect width="{W}" height="{H}" fill="#1b2350" opacity=".16" style="mix-blend-mode:multiply"/>')
    add(f'<rect width="{W}" height="{H}" fill="url(#vig)"/>')
    add(f'<rect width="{W}" height="{H}" filter="url(#grain)" opacity=".34" style="mix-blend-mode:multiply"/>')
    add('</svg>')
    return ''.join(out)


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for k, v in VARIANTS.items():
        (out / f'room-{k}.svg').write_text(build(k, v), encoding='utf-8')
    print('svg', list(VARIANTS))
