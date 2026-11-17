"""Gera assets/map_clean.png: a planta sem os rótulos de texto (usada durante o jogo).
Para cada rótulo, procura um trecho vizinho com a mesma textura (carpete estrelado,
azulejo, madeira...) e copia por cima do texto com bordas suavizadas.
Uso: python3 tools/clean_map.py   (requer opencv-python-headless e numpy)
"""
import cv2, numpy as np, json

_src = open('src/mapdata.js').read()
ROOMS = [r['r'] for r in json.loads(_src[_src.index('{'):_src.rindex('}') + 1])['rooms']]

def room_of(x0, y0, x1, y1):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for rx, ry, rw, rh in ROOMS:
        if rx <= cx < rx + rw and ry <= cy < ry + rh:
            return (rx, ry, rx + rw, ry + rh)
    return None

# (x0, y0, x1, y1, opções) em pixels de assets/map.jpg
# opções: dy/dx = faixa de busca permitida; full = cobre a caixa inteira; red = anotação vermelha
BOXES = [
    (97, 27, 198, 50, {}), (517, 34, 654, 57, {'dy': (-4, 4), 'dx': (-200, -20)}), (277, 196, 374, 221, {}),
    (722, 221, 814, 249, {}), (1044, 94, 1194, 119, {}), (924, 184, 1049, 209, {}),
    (1062, 249, 1142, 274, {'dy': (26, 40), 'dx': (-4, 4), 'noroom': 1}), (1157, 184, 1282, 209, {}),
    (54, 330, 83, 471, {'dx': (-2, 2), 'dy': (-200, 260)}), (145, 368, 251, 404, {}), (409, 393, 511, 420, {}),
    (669, 412, 779, 443, {}), (179, 580, 281, 605, {}), (186, 708, 324, 735, {'tile': (334, 700, 92, 40)}),
    (477, 651, 741, 681, {'tile': (480, 639, 255, 15)}),
    (979, 393, 1129, 418, {}), (934, 518, 1072, 543, {'dy': (-4, 4), 'dx': (-200, 120)}), (922, 660, 1024, 685, {}),
    (1206, 655, 1305, 677, {'dy': (40, 64), 'dx': (-30, 30)}),
    (1204, 677, 1307, 701, {'dy': (24, 40), 'dx': (-30, 30)}),
    (877, 553, 967, 591, {'full': 1, 'red': 1, 'dy': (-2, 2)}),
    (1226, 298, 1330, 337, {'full': 1, 'red': 1, 'tileabs': (1215, 364, 23, 46)}),
    (1256, 286, 1274, 594, {'full': 1, 'red': 1, 'dy': (-2, 2)}),
    (1110, 665, 1178, 678, {'red': 1}),
    (1200, 245, 1275, 262, {'red': 1}),
]

im = cv2.imread('assets/map.jpg')
H, W = im.shape[:2]
f = im.astype(np.int32)
b, g, r = f[:, :, 0], f[:, :, 1], f[:, :, 2]
bright = ((r + g + b) / 3 > 135) & (r >= b - 12)
redish = (r > 75) & (r - g > 28) & (r - b > 18)
whiteish = (r > 170) & (g > 170) & (b > 170)

mask = np.zeros((H, W), np.uint8)
for x0, y0, x1, y1, o in BOXES:
    if o.get('full'):
        mask[y0:y1, x0:x1] = 255
    elif o.get('red'):
        sel = redish[y0:y1, x0:x1] | whiteish[y0:y1, x0:x1]
        mask[y0:y1, x0:x1][sel] = 255
    else:
        mask[y0:y1, x0:x1][bright[y0:y1, x0:x1]] = 255
mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=3)
lim = np.zeros_like(mask)
for x0, y0, x1, y1, o in BOXES:
    lim[max(0, y0 - 3):y1 + 3, max(0, x0 - 3):x1 + 3] = 255
mask &= lim
M = mask > 0

out = im.copy()
SEARCH = 90
for (x0, y0, x1, y1, o) in BOXES:
    x0, y0, x1, y1 = max(0, x0 - 6), max(0, y0 - 6), min(W, x1 + 6), min(H, y1 + 6)
    tm = M[y0:y1, x0:x1]
    if not tm.any():
        continue
    if 'tileabs' in o:  # repete a grade do fundo mantendo a fase
        sx, sy, sw, sh = o['tileabs']
        yy, xx = np.mgrid[y0:y1, x0:x1]
        src = out[sy + (yy - sy) % sh, sx + (xx - sx) % sw].astype(np.float32)
        a = cv2.GaussianBlur(tm.astype(np.float32), (5, 5), 0)
        a = np.maximum(a, tm.astype(np.float32))[:, :, None]
        out[y0:y1, x0:x1] = (out[y0:y1, x0:x1].astype(np.float32) * (1 - a) + src * a).astype(np.uint8)
        print((x0, y0, x1, y1), 'tileabs'); continue
    if 'tile' in o:
        sx, sy, sw, sh = o['tile']
        yy, xx = np.mgrid[y0:y1, x0:x1]
        src = out[sy + (yy - y0) % sh, sx + (xx - x0) % sw].astype(np.float32)
        a = cv2.GaussianBlur(tm.astype(np.float32), (5, 5), 0)
        a = np.maximum(a, tm.astype(np.float32))[:, :, None]
        out[y0:y1, x0:x1] = (out[y0:y1, x0:x1].astype(np.float32) * (1 - a) + src * a).astype(np.uint8)
        print((x0, y0, x1, y1), 'tile'); continue
    room = None if (o.get('red') or o.get('full') or o.get('noroom')) else room_of(x0, y0, x1, y1)
    ctx = ~tm  # pixels de contexto (sem texto) para comparar
    tgt = f[y0:y1, x0:x1]
    best, bo = None, (0, 0)
    dyr = o.get('dy', (-SEARCH, SEARCH)); dxr = o.get('dx', (-SEARCH * 2, SEARCH * 2))
    for dy in range(dyr[0], dyr[1] + 1, 1 if dyr[1] - dyr[0] < 30 else 2):
        for dx in range(dxr[0], dxr[1] + 1, 1 if dxr[1] - dxr[0] < 30 else 2):
            sx0, sy0 = x0 + dx, y0 + dy
            if sx0 < 0 or sy0 < 0 or sx0 + (x1 - x0) > W or sy0 + (y1 - y0) > H:
                continue
            if room and (sx0 < room[0] - 2 or sy0 < room[1] - 2 or sx0 + (x1 - x0) > room[2] + 2 or sy0 + (y1 - y0) > room[3] + 2):
                continue
            if M[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)].any():
                continue
            src = f[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]
            cost = np.abs(src - tgt)[ctx].mean() if ctx.any() else 0
            busy = src[tm].std(axis=0).mean()
            cost += 0.8 * busy
            if best is None or cost < best:
                best, bo = cost, (dx, dy)
    if best is None:
        print('sem fonte para', (x0, y0, x1, y1)); continue
    dx, dy = bo
    src = out[y0 + dy:y1 + dy, x0 + dx:x1 + dx].astype(np.float32)
    a = cv2.GaussianBlur(tm.astype(np.float32), (5, 5), 0)
    a = np.maximum(a, tm.astype(np.float32))[:, :, None]
    region = out[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = (region * (1 - a) + src * a).astype(np.uint8)
    print((x0, y0, x1, y1), 'offset', bo, 'custo', round(float(best), 1))

cv2.imwrite('assets/map_clean.png', out)
