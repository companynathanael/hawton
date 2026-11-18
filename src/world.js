// Hawton Arcade — mapa jogável em tiles, desenhado em pixel art no próprio código.
// Segue o layout da planta (assets/map.jpg), que agora é usada nas câmeras.
// Coordenadas: 1 tile = 8px; o mundo tem 1376x768px (172x96 tiles), igual à planta.
window.World = (() => {
  'use strict';
  const T = 8, TW = 172, TH = 96, W = TW * T, H = TH * T;
  const OUT = 0, FLOOR = 1, WALL = 2, VOID = 3, DOOR = 4;

  // ---------- RNG determinístico ----------
  let seed = 1337;
  const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = a => a[Math.floor(rand() * a.length)];

  // ---------- salas (tiles, inclusivo) ----------
  // floor: tipo de piso | wall: papel de parede da face | amb/tint: luz ambiente
  const ROOMS = [
    { id: 'security', name: 'SALA DE SEGURANÇA', rects: [[7, 4, 25, 14]], floor: 'lino', wall: 'office', amb: 0.10, tint: '#4060a0' },
    { id: 'c1', name: 'CORREDOR C1', rects: [[27, 4, 48, 14], [49, 4, 113, 7], [104, 8, 113, 18]], floor: 'stars', wall: 'corridor', amb: 0.06, tint: '#5040a0' },
    { id: 'c6', name: 'CORREDOR C6', rects: [[7, 16, 10, 91], [7, 87, 53, 91], [47, 70, 53, 86]], floor: 'stars', wall: 'corridor', amb: 0.05, tint: '#4030a0' },
    { id: 'arcade1', name: 'ARCADE 1', rects: [[12, 16, 67, 35]], floor: 'carpet', carpet: '#1b1840', wall: 'arcade', amb: 0.09, tint: '#8040c0' },
    { id: 'arcade2', name: 'ARCADE 2', rects: [[12, 37, 36, 59]], floor: 'carpet', carpet: '#173a2c', wall: 'arcade', amb: 0.08, tint: '#30a070' },
    { id: 'mid', name: 'CORREDOR', rects: [[38, 37, 45, 61]], floor: 'stars', wall: 'corridor', amb: 0.05, tint: '#4030a0' },
    { id: 'arcade4', name: 'ARCADE 4', rects: [[47, 37, 67, 68]], floor: 'carpet', carpet: '#1a1d44', wall: 'arcade', amb: 0.08, tint: '#3070c0' },
    { id: 'arcade3', name: 'ARCADE 3', rects: [[12, 63, 45, 85]], floor: 'carpet', carpet: '#1d1838', wall: 'arcade', amb: 0.08, tint: '#a03060' },
    { id: 'v', name: 'CORREDOR CENTRAL', rects: [[69, 8, 74, 62]], floor: 'stars', wall: 'corridor', amb: 0.05, tint: '#4030a0' },
    { id: 'kitchen', name: 'COZINHA', rects: [[76, 9, 102, 19], [76, 20, 113, 38]], floor: 'checker', wall: 'kitchen', amb: 0.12, tint: '#a0c0d0' },
    { id: 'arcade5', name: 'ARCADE 5', rects: [[76, 40, 113, 61]], floor: 'stars', wall: 'graffiti', amb: 0.10, tint: '#c040a0' },
    { id: 'c5', name: 'CORREDOR C5', rects: [[69, 63, 148, 68]], floor: 'stars', wall: 'corridor', amb: 0.06, tint: '#6030a0' },
    { id: 'lobby', name: 'RECEPÇÃO / LOBBY', rects: [[55, 70, 97, 91]], floor: 'lobby', wall: 'lobby', amb: 0.12, tint: '#6050c0' },
    { id: 'hallA', name: 'PARTY HALL A', rects: [[115, 4, 165, 21]], floor: 'wood', wall: 'party', amb: 0.09, tint: '#c08050' },
    { id: 'power1', name: 'POWER RM 1', rects: [[115, 23, 131, 37]], floor: 'concrete', wall: 'power', amb: 0.07, tint: '#40a060' },
    { id: 'service', name: 'SERVICE', rects: [[133, 23, 142, 37], [138, 38, 142, 38]], floor: 'concrete', wall: 'power', amb: 0.07, tint: '#40a060' },
    { id: 'power2', name: 'POWER RM 2', rects: [[144, 23, 165, 37]], floor: 'concrete', wall: 'power', amb: 0.07, tint: '#40a060' },
    { id: 'hallB', name: 'PARTY HALL B', rects: [[115, 40, 148, 61]], floor: 'wood', wall: 'party', amb: 0.09, tint: '#c08050' },
    { id: 'stairs', name: 'ESCADA DO PORÃO', rects: [[103, 69, 108, 85]], floor: 'stairs', wall: 'basement', amb: 0.03, tint: '#303050' },
    { id: 'basement', name: 'PORÃO', rects: [[110, 75, 140, 91]], floor: 'basement', wall: 'basement', amb: 0.04, tint: '#506070' },
    { id: 'secret', name: '???', rects: [[147, 75, 165, 91]], floor: 'white', wall: 'white', amb: 0.16, tint: '#c0e0ff' },
  ];
  const VOIDS = [[49, 8, 68, 14], [12, 60, 36, 62]];
  // portas: retângulo de tiles na parede | type: door (normal), arch (passagem), security, exit (trancada)
  const DOORS = [
    { id: 'secW', r: [7, 15, 9, 15], type: 'security', name: 'PORTA OESTE' },
    { id: 'secE', r: [26, 11, 26, 13], type: 'security', name: 'PORTA LESTE' },
    { r: [11, 25, 11, 27], type: 'door' }, { r: [68, 25, 68, 27], type: 'door' },
    { r: [39, 36, 43, 36], type: 'arch', neon: '#ff60ff' },
    { r: [37, 53, 37, 55], type: 'door' },
    { r: [46, 45, 46, 47], type: 'arch', neon: '#40ffff' },
    { r: [40, 62, 43, 62], type: 'arch', neon: '#40ffff' },
    { r: [46, 64, 46, 66], type: 'arch', neon: '#40ffff' },
    { r: [11, 50, 11, 52], type: 'door' }, { r: [11, 76, 11, 78], type: 'door' },
    { r: [46, 76, 46, 78], type: 'door' }, { r: [27, 86, 29, 86], type: 'door' },
    { r: [54, 77, 54, 79], type: 'door' },
    { r: [73, 69, 76, 69], type: 'door', double: true },
    { id: 'exit', r: [73, 92, 76, 92], type: 'exit', msg: 'As portas não abrem mais.' },
    { r: [75, 32, 75, 34], type: 'door' }, { r: [75, 54, 75, 56], type: 'door' },
    { r: [91, 62, 95, 62], type: 'arch', neon: '#ff4040' },
    { r: [114, 10, 114, 12], type: 'door' }, { id: 'svcA', r: [139, 22, 141, 22], type: 'door', lock: true },
    { r: [132, 31, 132, 33], type: 'door' },
    { r: [143, 31, 143, 33], type: 'door' }, { id: 'svcB', r: [139, 39, 141, 39], type: 'door', lock: true },
    { r: [121, 62, 123, 62], type: 'door' }, { r: [139, 62, 141, 62], type: 'door' },
    { r: [109, 80, 109, 84], type: 'arch' },
    { id: 'back1', r: [30, 3, 33, 3], type: 'exit', double: true, msg: 'Trancada pelo lado de fora.' },
    { id: 'back2', r: [139, 3, 141, 3], type: 'exit', msg: 'A porta dos fundos está emperrada.' },
  ];

  // ---------- grade de tiles ----------
  const tiles = new Uint8Array(TW * TH);
  const troom = new Int16Array(TW * TH).fill(-1);
  const tdoor = new Int16Array(TW * TH).fill(-1);
  const face = new Uint8Array(TW * TH);
  const ti = (x, y) => y * TW + x;
  const tAt = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH) ? OUT : tiles[ti(x, y)];
  ROOMS.forEach((rm, i) => rm.rects.forEach(([x0, y0, x1, y1]) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { tiles[ti(x, y)] = FLOOR; troom[ti(x, y)] = i; }
  }));
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (tiles[ti(x, y)] === FLOOR) continue;
    let near = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (tAt(x + i, y + j) === FLOOR) near = true;
    if (near) tiles[ti(x, y)] = WALL;
  }
  VOIDS.forEach(([x0, y0, x1, y1]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tiles[ti(x, y)] !== FLOOR) tiles[ti(x, y)] = VOID; });

  const doors = DOORS.map((d, i) => {
    const [x0, y0, x1, y1] = d.r;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { tiles[ti(x, y)] = DOOR; tdoor[ti(x, y)] = i; }
    const horiz = tAt(x0, y0 - 1) === FLOOR || tAt(x0, y1 + 1) === FLOOR;
    const vert = !horiz;
    // sala de cada lado (para luz/nome)
    return Object.assign({}, d, {
      i, horiz, x: x0 * T, y: y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T,
      open: d.type === 'arch', anim: d.type === 'arch' ? 1 : 0,
      cx: (x0 + x1 + 1) * T / 2, cy: (y0 + y1 + 1) * T / 2, vert,
    });
  });
  // linhas de "face" (parede vista de frente): piso cuja parte de cima é parede
  for (let y = 1; y < TH; y++) for (let x = 0; x < TW; x++) {
    const a = tAt(x, y - 1);
    if (tiles[ti(x, y)] === FLOOR && (a === WALL || a === VOID)) face[ti(x, y)] = 1;
  }

  // ---------- máscara de colisão (px) ----------
  const solid = new Uint8Array(W * H);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const t = tiles[ti(x, y)];
    if (t === FLOOR && !face[ti(x, y)]) continue;
    if (t === DOOR) continue;
    for (let j = 0; j < T; j++) solid.fill(1, (y * T + j) * W + x * T, (y * T + j) * W + x * T + T);
  }
  const block = (x, y, w, h) => {
    for (let j = Math.max(0, y | 0); j < Math.min(H, (y + h) | 0); j++) solid.fill(1, j * W + Math.max(0, x | 0), j * W + Math.min(W, (x + w) | 0));
  };

  // ---------- canvas ----------
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const objC = document.createElement('canvas'); objC.width = W; objC.height = H;
  const og = objC.getContext('2d');
  let cx = g;
  const R = (x, y, w, h, c) => { cx.fillStyle = c; cx.fillRect(x, y, w, h); };
  const P = (x, y, c) => { cx.fillStyle = c; cx.fillRect(x, y, 1, 1); };
  const shade = (c, k) => { const n = parseInt(c.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255; r = Math.max(0, Math.min(255, r * k | 0)); gg = Math.max(0, Math.min(255, gg * k | 0)); b = Math.max(0, Math.min(255, b * k | 0)); return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1); };

  // ---------- pisos ----------
  const CONF = ['#ff4fa0', '#4fe0ff', '#ffd84f', '#9f6bff', '#5fff8f', '#ff8a3a'];
  function floorTile(rm, x, y) {
    const px = x * T, py = y * T;
    switch (rm.floor) {
      case 'carpet': {
        const base = rm.carpet;
        R(px, py, T, T, base);
        if (rand() < 0.2) { const c = pick(CONF); const k = ri(0, 3);
          if (k === 0) P(px + ri(0, 7), py + ri(0, 7), c);
          else if (k === 1) { const a = ri(0, 5), b = ri(0, 5); R(px + a, py + b, 2, 1, c); R(px + a + 1, py + b + 1, 2, 1, c); }
          else if (k === 2) { const a = ri(1, 5), b = ri(1, 5); P(px + a, py + b, c); P(px + a - 1, py + b + 1, c); P(px + a + 1, py + b + 1, c); }
          else { const a = ri(0, 6), b = ri(0, 6); R(px + a, py + b, 1, 2, c); } }
        if (rand() < 0.25) P(px + ri(0, 7), py + ri(0, 7), shade(base, 1.6));
        break;
      }
      case 'stars': {
        R(px, py, T, T, '#110d27');
        const n = (Math.sin(x * 0.31) + Math.cos(y * 0.27) + Math.sin((x + y) * 0.13)) / 3;
        if (n > 0.25) { cx.globalAlpha = (n - 0.25) * 0.5; R(px, py, T, T, n > 0.5 ? '#5a2a8a' : '#2a3a8a'); cx.globalAlpha = 1; }
        if (rand() < 0.2) P(px + ri(0, 7), py + ri(0, 7), pick(['#ffffff', '#b8c8ff', '#ffd0f0', '#8090ff']));
        if (rand() < 0.03) { const a = px + ri(1, 6), b = py + ri(1, 6); P(a, b, '#fff'); P(a - 1, b, '#7080d0'); P(a + 1, b, '#7080d0'); P(a, b - 1, '#7080d0'); P(a, b + 1, '#7080d0'); }
        break;
      }
      case 'checker': {
        R(px, py, T, T, (x + y) % 2 ? '#a7bccb' : '#d4e0e8');
        R(px, py + 7, T, 1, 'rgba(60,80,100,0.25)'); R(px + 7, py, 1, T, 'rgba(60,80,100,0.25)');
        if (rand() < 0.08) { cx.globalAlpha = 0.18; R(px + ri(0, 4), py + ri(0, 4), ri(2, 4), ri(2, 4), '#5a4a30'); cx.globalAlpha = 1; }
        break;
      }
      case 'wood': {
        const off = (y % 2) * 12 + (x * 5) % 3;
        R(px, py, T, T, (x + Math.floor((x * T + off) / 24)) % 3 ? '#8a5432' : '#7d4b2c');
        R(px, py + 3, T, 1, '#6a3c22'); R(px, py + 7, T, 1, '#5a321c');
        if ((x * T + off) % 24 < T) R(px + ((x * T + off) % 24) % T, py, 1, 3, '#5a321c');
        if (rand() < 0.2) P(px + ri(0, 7), py + ri(0, 6), '#9a6440');
        break;
      }
      case 'concrete': {
        R(px, py, T, T, (x + y) % 2 ? '#3e434c' : '#42474f');
        R(px, py, T, 1, '#4c525c'); R(px, py, 1, T, '#4c525c'); R(px + 7, py, 1, T, '#30343b'); R(px, py + 7, T, 1, '#30343b');
        if (rand() < 0.2) P(px + ri(1, 6), py + ri(1, 6), '#2e3238');
        break;
      }
      case 'lino': {
        R(px, py, T, T, (x + y) % 2 ? '#2a303e' : '#2e3544');
        if (rand() < 0.15) { cx.globalAlpha = 0.3; R(px + ri(0, 5), py + ri(0, 6), 3, 1, '#4a5466'); cx.globalAlpha = 1; }
        break;
      }
      case 'lobby': {
        R(px, py, T, T, '#221a40');
        const m = (x * 7 + y * 3) % 11;
        if (m === 0) { R(px + 2, py + 2, 4, 1, '#5a3aa0'); R(px + 2, py + 2, 1, 4, '#5a3aa0'); }
        else if (m === 5) { P(px + 4, py + 4, '#ff5fb0'); P(px + 3, py + 5, '#ff5fb0'); P(px + 5, py + 5, '#ff5fb0'); }
        else if (m === 8) R(px + 1, py + 6, 3, 1, '#3ad0d0');
        if (rand() < 0.2) P(px + ri(0, 7), py + ri(0, 7), '#3a2e60');
        break;
      }
      case 'basement': {
        R(px, py, T, T, (x + y) % 2 ? '#4a4c52' : '#47494f');
        R(px, py + 7, T, 1, '#3a3c42'); R(px + 7, py, 1, T, '#3a3c42');
        if (rand() < 0.1) { cx.globalAlpha = 0.25; R(px + ri(0, 4), py + ri(0, 4), ri(3, 6), ri(2, 5), '#2a2a24'); cx.globalAlpha = 1; }
        if (rand() < 0.05) { const a = px + ri(0, 4), b = py + ri(0, 6); P(a, b, '#2a2c30'); P(a + 1, b + 1, '#2a2c30'); P(a + 2, b + 1, '#2a2c30'); P(a + 3, b + 2, '#2a2c30'); }
        break;
      }
      case 'white': {
        R(px, py, T, T, '#cddae2');
        if (x % 2 === 0) R(px, py, 1, T, '#a9b8c2');
        if (y % 2 === 0) R(px, py, T, 1, '#a9b8c2');
        if (rand() < 0.04) { cx.globalAlpha = 0.2; R(px + ri(0, 4), py + ri(0, 4), 3, 3, '#6a5a50'); cx.globalAlpha = 1; }
        break;
      }
      case 'stairs': {
        const lx = x - 103;
        R(px, py, T, T, (y % 2) ? '#6a6e78' : '#80848e');
        R(px, py + (y % 2 ? 7 : 3), T, 1, '#4a4e58');
        if (lx === 0) R(px, py, 2, T, '#9aa0aa');
        if (lx === 5) R(px + 6, py, 2, T, '#9aa0aa');
        break;
      }
    }
  }

  // ---------- paredes ----------
  const WALLS = {
    arcade: { base: '#2a1a4c', top: '#3c2668', line: '#ff4fd0', line2: '#40d0ff' },
    corridor: { base: '#1b1838', top: '#2a2650', line: '#6a4aff', line2: null },
    kitchen: { base: '#c4d0d8', top: '#dfe8ee', tile: true },
    graffiti: { base: '#2a1a40', top: '#3a2858', graffiti: true },
    lobby: { base: '#34245a', top: '#4a3478', line: '#ff5fd0', line2: null },
    party: { base: '#e6dcc0', top: '#f2ead6', low: '#4a5a9a', bunting: true },
    power: { base: '#4a4e58', top: '#5a5f6a', hazard: true },
    office: { base: '#3a4458', top: '#4a5670', line: null },
    basement: { base: '#4a4a52', top: '#5a5a62', pipes: true },
    white: { base: '#dde6ec', top: '#eef4f8' },
  };
  function wallFace(rm, x, y) {
    // desenha a face da parede (16px: tile de parede + linha de face)
    const s = WALLS[rm.wall] || WALLS.corridor;
    const px = x * T, py = (y - 1) * T;
    R(px, py, T, 16, s.base);
    R(px, py, T, 2, s.top);
    if (s.tile) { for (let j = 3; j < 16; j += 4) R(px, py + j, T, 1, '#a8b6c0'); R(px + (y % 2 ? 3 : 7), py + 2, 1, 14, '#a8b6c0'); }
    if (s.line) { R(px, py + 5, T, 1, s.line); cx.globalAlpha = 0.35; R(px, py + 4, T, 3, s.line); cx.globalAlpha = 1; }
    if (s.line2) R(px, py + 9, T, 1, s.line2);
    if (s.low) R(px, py + 10, T, 5, s.low);
    if (s.bunting && x % 2 === 0) { const c = pick(['#ff5a5a', '#5ab0ff', '#ffd84f', '#7aff8a', '#d070ff']); R(px + 1, py + 3, 5, 1, c); R(px + 2, py + 4, 3, 1, c); P(px + 3, py + 5, c); }
    if (s.bunting) P(px + (x % 2 ? 4 : 0), py + 2, '#9a8a70');
    if (s.hazard) for (let i = 0; i < T; i++) P(px + i, py + 13, ((x * T + i) >> 2) % 2 ? '#e0c030' : '#202020');
    if (s.hazard) for (let i = 0; i < T; i++) P(px + i, py + 14, ((x * T + i + 2) >> 2) % 2 ? '#e0c030' : '#202020');
    if (s.pipes) { R(px, py + 4, T, 2, '#6a6e78'); R(px, py + 4, T, 1, '#8a8e98'); if (x % 9 === 0) R(px + 3, py + 3, 2, 4, '#3a3e48'); }
    if (s.graffiti) {
      const cols = ['#ff4fd0', '#40ff9a', '#ffd84f', '#40c0ff', '#ff7a30'];
      for (let k = 0; k < 6; k++) { cx.globalAlpha = 0.85; R(px + ri(0, 6), py + ri(3, 12), ri(1, 3), ri(1, 3), pick(cols)); }
      cx.globalAlpha = 1;
    }
    R(px, py + 15, T, 1, shade(s.base, 0.55)); // rodapé
    // dobras / manchas
    if (rand() < 0.08) { cx.globalAlpha = 0.2; R(px + ri(0, 5), py + ri(4, 12), 2, ri(2, 5), '#000'); cx.globalAlpha = 1; }
  }
  function wallCap(x, y) {
    const px = x * T, py = y * T;
    R(px, py, T, T, '#262234');
    // bordas iluminadas onde encosta no piso
    const fl = (i, j) => { const t = tAt(x + i, y + j); return t === FLOOR || t === DOOR; };
    if (fl(0, -1)) R(px, py, T, 1, '#5a5274');
    if (fl(-1, 0)) R(px, py, 1, T, '#4a4462');
    if (fl(1, 0)) R(px + 7, py, 1, T, '#4a4462');
    if (fl(0, 1)) R(px, py + 7, T, 1, '#151220');
    R(px + 2, py + 2, 4, 4, '#2c283c');
  }

  // ---------- mobília ----------
  const objects = [];   // { x, y, w, h, kind, ... } para profundidade e interação
  const cabinets = [];
  const lights = [];
  const CAB = [
    { body: '#c23a3a', dark: '#6e1c26', lite: '#ff7a5a', scr: '#40c0ff', mq: '#ffd84f' },
    { body: '#2f56c8', dark: '#1a2a6e', lite: '#5a8aff', scr: '#ff60c0', mq: '#40e0ff' },
    { body: '#7a3ac8', dark: '#3e1c6e', lite: '#a86aff', scr: '#60ff90', mq: '#ff60ff' },
    { body: '#2e9a5a', dark: '#16502e', lite: '#5adc8a', scr: '#ffd84f', mq: '#7aff7a' },
    { body: '#d8a830', dark: '#7a5a14', lite: '#ffd860', scr: '#40ffd0', mq: '#ff8a30' },
    { body: '#d05a9a', dark: '#6e2a50', lite: '#ff8ac8', scr: '#80a0ff', mq: '#ffd0f0' },
    { body: '#2aa0b0', dark: '#14545c', lite: '#5ad8e0', scr: '#ff5a5a', mq: '#40ffff' },
    { body: '#3a3a4a', dark: '#1a1a24', lite: '#5a5a6e', scr: '#c060ff', mq: '#ff4040' },
  ];
  function addObj(o) { objects.push(o); return o; }

  function cabinet(x, y, facing = 'down', pal) {
    const c = pal || pick(CAB);
    const o = addObj({ kind: 'cab', x: x - 1, y, w: 16, h: 22, facing, c, seed: rand() * 1000, game: ri(0, 5) });
    if (facing === 'down') {
      R(x + 1, y, 12, 4, c.dark); R(x + 2, y + 1, 10, 2, shade(c.mq, 0.5));
      R(x, y + 4, 14, 9, c.body); R(x, y + 4, 1, 9, c.dark); R(x + 13, y + 4, 1, 9, c.dark);
      R(x + 1, y + 5, 1, 7, c.lite); R(x + 12, y + 5, 1, 7, c.lite);
      R(x + 2, y + 5, 10, 8, '#08080e'); R(x + 3, y + 6, 8, 6, '#101820');
      R(x - 1, y + 13, 16, 3, c.lite); R(x - 1, y + 16, 16, 1, c.dark);
      R(x + 3, y + 13, 2, 2, '#ff3030'); P(x + 3, y + 13, '#ff9a9a'); P(x + 8, y + 14, '#ffe040'); P(x + 10, y + 14, '#40e0ff'); P(x + 12, y + 14, '#ff60ff');
      R(x + 1, y + 17, 12, 5, c.body); R(x + 1, y + 21, 12, 1, c.dark);
      R(x + 5, y + 18, 4, 3, '#1a1418'); P(x + 6, y + 19, '#ff9020'); P(x + 7, y + 19, '#ff9020');
      o.screen = [x + 3, y + 6, 8, 6]; o.marquee = [x + 2, y + 1, 10, 2];
      lights.push({ x: x + 7, y: y + 14, r: 20, c: c.scr, f: rand() * 0.25, g: 'main', cab: o });
    } else {
      R(x + 1, y + 1, 12, 3, c.dark);
      R(x, y + 4, 14, 18, shade(c.body, 0.7)); R(x, y + 4, 1, 18, c.dark); R(x + 13, y + 4, 1, 18, c.dark);
      for (let i = 0; i < 4; i++) R(x + 3, y + 6 + i * 2, 8, 1, '#0a0a10');
      R(x + 4, y + 15, 6, 4, '#24202c'); P(x + 5, y + 16, '#40ff40');
      R(x + 6, y + 19, 2, 3, '#101014');
    }
    R(x, y + 22, 14, 1, 'rgba(0,0,0,0.4)');
    block(x - 1, y + 13, 16, 9);
    cabinets.push(o);
    return o;
  }
  // ilha de fliperamas costas com costas
  function island(xs, y) { xs.forEach(x => cabinet(x, y, 'up')); xs.forEach(x => cabinet(x, y + 16, 'down')); }

  function claw(x, y) {
    R(x, y + 18, 24, 12, '#c83a8a'); R(x, y + 18, 24, 1, '#ff8ac8'); R(x, y + 29, 24, 1, '#6e1c4a');
    R(x + 9, y + 22, 6, 4, '#1a1418'); P(x + 11, y + 23, '#ff9020');
    R(x, y + 2, 24, 16, '#6a5a8a'); R(x + 1, y + 3, 22, 14, '#a8c8e8');
    cx.globalAlpha = 0.5; R(x + 1, y + 3, 22, 14, '#304060'); cx.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const c = pick(['#ff6a8a', '#ffd84f', '#7aff8a', '#8ab0ff', '#ff9a4a', '#d08aff']); const a = x + ri(2, 20), b = y + ri(11, 15); R(a, b, 2, 2, c); P(a, b, shade(c, 1.4)); }
    R(x + 11, y + 3, 1, 5, '#c0c0c8'); R(x + 9, y + 8, 5, 1, '#c0c0c8'); P(x + 9, y + 9, '#c0c0c8'); P(x + 13, y + 9, '#c0c0c8');
    R(x + 1, y + 3, 1, 14, '#e0f0ff');
    R(x, y, 24, 3, '#ff4fd0');
    block(x, y + 16, 24, 14);
    const o = addObj({ kind: 'claw', x, y, w: 24, h: 30 });
    lights.push({ x: x + 12, y: y + 14, r: 34, c: '#ff4fa0', f: 0.3, g: 'main' });
    return o;
  }
  function pinball(x, y) {
    R(x + 1, y + 24, 2, 3, '#101014'); R(x + 9, y + 24, 2, 3, '#101014');
    R(x, y, 12, 7, '#1e1834'); R(x + 1, y + 1, 10, 5, '#ff6a2a'); P(x + 3, y + 3, '#ffd84f'); P(x + 7, y + 2, '#40e0ff');
    R(x, y + 7, 12, 18, '#4a2a8a'); R(x + 1, y + 8, 10, 16, '#2a6ad0');
    P(x + 3, y + 10, '#ff4040'); P(x + 8, y + 11, '#ffd84f'); P(x + 5, y + 14, '#40ff80'); R(x + 3, y + 21, 2, 1, '#fff'); R(x + 7, y + 21, 2, 1, '#fff');
    cx.globalAlpha = 0.35; R(x + 1, y + 8, 3, 16, '#ffffff'); cx.globalAlpha = 1;
    block(x, y + 10, 12, 16);
    const o = addObj({ kind: 'pinball', x, y, w: 12, h: 27 });
    lights.push({ x: x + 6, y: y + 14, r: 22, c: '#ff8a3a', f: 0.2, g: 'main' });
    return o;
  }
  function stool(x, y) { R(x + 1, y + 3, 4, 3, '#101014'); R(x, y, 6, 4, '#c03040'); R(x + 1, y, 4, 1, '#ff6a7a'); block(x, y + 2, 6, 4); addObj({ kind: 'stool', x, y, w: 6, h: 6 }); }
  function plant(x, y) {
    R(x + 2, y + 9, 7, 5, '#a8643a'); R(x + 2, y + 9, 7, 1, '#c88050'); R(x + 3, y + 13, 5, 1, '#6a3a20');
    const leaf = ['#2e8a3a', '#3eaa4a', '#1e6a2a'];
    for (let i = 0; i < 14; i++) R(x + ri(0, 9), y + ri(0, 8), 2, 1, pick(leaf));
    block(x + 2, y + 9, 7, 5); addObj({ kind: 'plant', x, y, w: 11, h: 14 });
  }
  function trash(x, y) { R(x, y + 2, 6, 7, '#5a6070'); R(x, y + 2, 6, 1, '#7a8090'); R(x - 1, y + 1, 8, 1, '#4a5060'); R(x + 1, y + 4, 1, 4, '#4a5060'); block(x, y + 4, 6, 5); addObj({ kind: 'trash', x, y, w: 7, h: 9 }); }
  function debris(x0, y0, w, h, n, cols) {
    const pc = cx; cx = g;
    for (let i = 0; i < n; i++) { const x = x0 + ri(0, w), y = y0 + ri(0, h); if (tAt(x >> 3, y >> 3) !== FLOOR || face[ti(x >> 3, y >> 3)]) continue; const c = pick(cols || CONF.concat(['#d0d0d0', '#8a7a6a', '#e8e0c8'])); const k = ri(0, 2); if (k === 0) P(x, y, c); else if (k === 1) R(x, y, 2, 1, c); else R(x, y, 2, 2, c); }
    cx = pc;
  }
  function rug(x, y, w, h, c) {
    R(x, y, w, h, c); R(x, y, w, 1, shade(c, 1.3)); R(x, y + h - 1, w, 1, shade(c, 0.6));
    for (let i = 0; i < w * h / 10; i++) P(x + ri(1, w - 2), y + ri(1, h - 2), shade(c, rand() < 0.5 ? 1.35 : 0.7));
    for (let i = 2; i < w - 2; i += 4) { P(x + i, y + 2, shade(c, 1.5)); P(x + i, y + h - 3, shade(c, 1.5)); }
  }
  function table(x, y, w, h) {
    R(x, y + h, w, 2, 'rgba(0,0,0,0.35)');
    R(x, y, w, h, '#e8e8f0'); R(x, y, w, 1, '#ffffff'); R(x, y + h - 2, w, 2, '#b8b8c8');
    for (let i = 4; i < w - 4; i += 9) P(x + i, y + h - 1, '#9898a8');
    if (rand() < 0.7) { R(x + ri(4, w - 10), y + 2, 4, 3, pick(['#ff6a6a', '#6ab0ff', '#ffd84f'])); }
    block(x, y + 2, w, h - 1);
    addObj({ kind: 'table', x, y, w, h: h + 2 });
    for (let i = 3; i < w - 4; i += 9) { chair(x + i, y - 6, rand() < 0.1); chair(x + i, y + h + 1, rand() < 0.15); }
  }
  function chair(x, y, fallen) {
    if (fallen) { R(x - 1, y + 2, 7, 3, '#6a3a22'); R(x - 1, y + 2, 7, 1, '#8a5432'); addObj({ kind: 'chair', x, y, w: 6, h: 5 }); return; }
    R(x - 1, y - 1, 7, 7, '#2a140a'); R(x, y, 5, 5, '#a8402a'); R(x, y, 5, 1, '#d86a48'); R(x, y + 4, 5, 1, '#6a2414');
    block(x, y + 1, 5, 4);
  }
  function counter(x, y, w, h, top = '#9aa4ae', front = '#6a737c') {
    R(x, y + h, w, 2, 'rgba(0,0,0,0.3)');
    R(x, y, w, h, top); R(x, y, w, 1, shade(top, 1.2)); R(x, y + h - 3, w, 3, front); R(x, y + h - 1, w, 1, shade(front, 0.6));
    block(x, y + 1, w, h);
    addObj({ kind: 'counter', x, y, w, h: h + 2 });
  }
  function crate(x, y, s = 12) {
    R(x, y, s, s, '#9a6a3a'); R(x, y, s, 1, '#c08a50'); R(x, y + s - 1, s, 1, '#5a3a1a'); R(x, y, 1, s, '#7a5028'); R(x + s - 1, y, 1, s, '#7a5028');
    for (let i = 2; i < s - 1; i++) P(x + i, y + i, '#6a4420'); R(x + 1, y + (s >> 1), s - 2, 1, '#7a5028');
    block(x, y + 3, s, s - 3); addObj({ kind: 'crate', x, y, w: s, h: s });
  }
  function beanbag(x, y, c) {
    R(x + 1, y + 2, 12, 8, c); R(x + 2, y + 1, 10, 1, c); R(x + 2, y + 10, 10, 1, shade(c, 0.6));
    R(x + 3, y + 2, 5, 2, shade(c, 1.35)); R(x + 1, y + 8, 12, 2, shade(c, 0.75));
    block(x + 1, y + 4, 12, 7); addObj({ kind: 'bean', x, y, w: 14, h: 11 });
  }
  function sofa(x, y, w, c) {
    R(x, y, w, 4, shade(c, 0.8)); R(x, y + 4, w, 6, c); R(x, y + 4, 3, 7, shade(c, 0.7)); R(x + w - 3, y + 4, 3, 7, shade(c, 0.7));
    for (let i = 4; i < w - 4; i += 8) R(x + i, y + 5, 1, 4, shade(c, 0.7));
    R(x, y + 10, w, 1, 'rgba(0,0,0,0.4)'); block(x, y + 3, w, 8); addObj({ kind: 'sofa', x, y, w, h: 11 });
  }
  function shelf(x, y, w) {
    R(x, y, w, 12, '#3a3e48'); R(x, y, w, 1, '#5a5e68');
    for (let i = 1; i < w - 3; i += 4) { const c = pick(['#8a6a3a', '#c0c0c8', '#5a8aa0', '#a04a3a', '#d8c070']); R(x + i, y + 2, 3, 4, c); if (rand() < 0.7) R(x + i, y + 7, 3, 4, shade(c, 0.8)); }
    block(x, y + 4, w, 8); addObj({ kind: 'shelf', x, y, w, h: 12 });
  }
  function generator(x, y, k) {
    R(x, y + 24, 30, 2, 'rgba(0,0,0,0.4)');
    R(x, y, 30, 24, '#4a6a5a'); R(x, y, 30, 2, '#6a8a7a'); R(x, y + 22, 30, 2, '#2a3a32');
    for (let i = 0; i < 5; i++) R(x + 3, y + 5 + i * 3, 12, 1, '#22302a');
    R(x + 18, y + 4, 9, 8, '#1a221e'); R(x + 19, y + 5, 7, 6, '#2a3a30');
    R(x + 18, y + 14, 3, 3, '#c0c0c8'); R(x + 23, y + 14, 3, 3, '#c0c0c8');
    for (let i = 0; i < 6; i++) P(x + 2 + i * 5, y + 20, (i % 2) ? '#e0c030' : '#202020');
    R(x + 26, y - 4, 3, 6, '#5a5e68');
    block(x, y + 8, 30, 16);
    const o = addObj({ kind: 'gen', x, y, w: 30, h: 26, leds: [[x + 20, y + 7], [x + 23, y + 7]] });
    lights.push({ x: x + 15, y: y + 14, r: 30, c: '#40ff70', f: 0.3, g: 'gen' });
    return o;
  }
  function eCabinet(x, y) {
    R(x, y, 12, 20, '#5a5f6a'); R(x, y, 12, 1, '#7a808a'); R(x + 1, y + 2, 10, 16, '#4a4e58'); R(x + 6, y + 2, 1, 16, '#3a3e48');
    P(x + 2, y + 4, '#40ff40'); P(x + 4, y + 4, '#ff4040'); R(x + 8, y + 9, 2, 3, '#c0c0c8');
    block(x, y + 10, 12, 10); addObj({ kind: 'ecab', x, y, w: 12, h: 20 });
  }
  function oven(x, y) {
    R(x, y, 24, 22, '#8a4a34'); for (let j = 0; j < 22; j += 4) for (let i = (j / 4) % 2 * 3; i < 24; i += 6) R(x + i, y + j, 5, 3, '#a85a3e');
    R(x + 5, y + 10, 14, 10, '#1a0e0a'); R(x + 6, y + 9, 12, 1, '#1a0e0a'); R(x + 4, y + 20, 16, 2, '#6a3a2a');
    R(x + 9, y - 6, 6, 6, '#6a6e78');
    block(x, y + 8, 24, 14); addObj({ kind: 'oven', x, y, w: 24, h: 22 });
  }
  function fridge(x, y) {
    R(x, y, 16, 24, '#c8d0d8'); R(x, y, 16, 1, '#eef2f6'); R(x + 1, y + 9, 14, 1, '#8a949e'); R(x + 13, y + 3, 1, 4, '#5a646e'); R(x + 13, y + 12, 1, 8, '#5a646e');
    R(x, y + 24, 16, 1, 'rgba(0,0,0,0.35)'); block(x, y + 10, 16, 14); addObj({ kind: 'fridge', x, y, w: 16, h: 25 });
  }
  function pizzaBox(x, y) { R(x, y, 9, 8, '#d8b880'); R(x, y, 9, 1, '#f0d8a0'); R(x + 2, y + 3, 5, 2, '#c03a2a'); }
  function desk(x, y) {
    R(x, y + 14, 70, 2, 'rgba(0,0,0,0.35)');
    R(x, y, 70, 14, '#5a4a3a'); R(x, y, 70, 1, '#7a6a5a'); R(x, y + 12, 70, 2, '#3a2e24');
    R(x, y + 14, 16, 16, '#5a4a3a'); R(x, y + 28, 16, 2, '#3a2e24');
    for (let i = 0; i < 3; i++) { const mx = x + 8 + i * 20; R(mx, y - 8, 16, 11, '#1a1e26'); R(mx + 1, y - 7, 14, 8, '#0a1018'); R(mx + 6, y + 3, 4, 2, '#2a2e36'); }
    R(x + 28, y + 6, 14, 3, '#2a2e36'); R(x + 50, y + 6, 4, 4, '#e8e8f0'); P(x + 51, y + 7, '#5a3a20');
    R(x + 58, y + 4, 8, 6, '#e8e4d0'); R(x + 59, y + 5, 6, 1, '#9a9688');
    block(x, y + 2, 70, 17); block(x, y + 14, 16, 18);
    addObj({ kind: 'desk', x, y: y + 14, w: 16, h: 16 });
    const o = addObj({ kind: 'desk', x, y: y - 8, w: 70, h: 24, monitors: [0, 1, 2].map(i => [x + 9 + i * 20, y - 7, 14, 8]) });
    return o;
  }
  function officeChair(x, y) { R(x + 1, y, 8, 3, '#2a2e3a'); R(x, y + 3, 10, 6, '#3a3e4a'); R(x + 1, y + 4, 8, 3, '#4a4e5a'); R(x + 4, y + 9, 2, 2, '#1a1a20'); block(x, y + 4, 10, 7); addObj({ kind: 'chair', x, y, w: 10, h: 11 }); }
  function kiddieRide(x, y) {
    R(x, y + 26, 32, 3, 'rgba(0,0,0,0.4)');
    R(x + 2, y + 18, 28, 8, '#3a3a4a'); R(x + 2, y + 18, 28, 1, '#5a5a6e');
    R(x + 10, y, 12, 22, '#d83a3a'); R(x + 12, y - 4, 8, 4, '#d83a3a'); R(x + 14, y - 6, 4, 2, '#ff6a5a');
    R(x + 13, y + 5, 6, 6, '#80d0ff'); R(x + 14, y + 6, 2, 2, '#e0f4ff');
    R(x + 5, y + 14, 5, 8, '#f0c030'); R(x + 22, y + 14, 5, 8, '#f0c030');
    R(x + 12, y + 22, 8, 3, '#ff8a30');
    block(x + 2, y + 14, 28, 12); addObj({ kind: 'ride', x, y: y - 6, w: 32, h: 35 });
    lights.push({ x: x + 16, y: y + 12, r: 30, c: '#ff4040', f: 0.4, g: 'main' });
  }
  function reception(x, y) {
    R(x, y, 48, 6, '#d8c0a0'); R(x, y, 6, 26, '#d8c0a0'); R(x + 42, y, 6, 26, '#d8c0a0');
    R(x, y + 6, 6, 20, '#c0a888'); R(x + 42, y + 6, 6, 20, '#c0a888');
    R(x, y + 26, 48, 8, '#c8b090'); R(x, y + 26, 48, 1, '#e8d8c0');
    const rb = ['#ff4040', '#ff9a30', '#ffe040', '#40e060', '#40a0ff', '#a050ff'];
    for (let i = 0; i < 48; i++) R(x + i, y + 31, 1, 3, rb[Math.floor(i / 8) % 6]);
    R(x + 18, y + 10, 12, 8, '#3a5ac8'); R(x + 19, y + 8, 10, 3, '#4a6ae0');
    R(x + 30, y + 27, 6, 3, '#1a1e26');
    block(x, y + 2, 48, 32); addObj({ kind: 'reception', x, y, w: 48, h: 34 });
    lights.push({ x: x + 24, y: y + 32, r: 40, c: '#ff60ff', f: 0.1, g: 'main' });
  }
  function tv(x, y) { R(x, y, 22, 14, '#1a1a22'); R(x + 1, y + 1, 20, 11, '#2a3040'); R(x + 3, y + 14, 16, 4, '#4a3a5a'); block(x, y + 8, 22, 10); addObj({ kind: 'tv', x, y, w: 22, h: 18, screen: [x + 1, y + 1, 20, 11] }); }
  function poster(x, y, c) { const pc = cx; cx = g; R(x, y, 10, 12, c); R(x + 1, y + 1, 8, 6, shade(c, 1.4)); R(x + 2, y + 9, 6, 1, '#fff'); cx = pc; }
  function stage(x, y, w, h) {
    R(x, y, w, h, '#a06a3a'); for (let j = 2; j < h; j += 4) R(x, y + j, w, 1, '#7a4a2a');
    R(x, y + h, w, 3, '#5a3418'); R(x, y, w, 1, '#c08a50');
    block(x, y, w, h + 3); addObj({ kind: 'stage', x, y, w, h: h + 3 });
  }
  function balloon(x, y, c) { R(x, y, 5, 6, c); P(x + 1, y + 1, shade(c, 1.5)); R(x + 2, y + 6, 1, 6, '#c0c0c0'); }
  function airHockey(x, y) {
    R(x, y + 16, 34, 2, 'rgba(0,0,0,0.4)'); R(x, y, 34, 16, '#2a4ad0'); R(x + 1, y + 1, 32, 14, '#e8f0ff');
    R(x + 16, y + 1, 1, 14, '#ff4040'); R(x + 1, y + 6, 2, 4, '#202020'); R(x + 31, y + 6, 2, 4, '#202020');
    R(x + 8, y + 6, 3, 3, '#ff4040'); R(x + 24, y + 7, 3, 3, '#3060ff'); P(x + 18, y + 8, '#202020');
    block(x, y + 2, 34, 14); addObj({ kind: 'hockey', x, y, w: 34, h: 18 });
  }
  function prize(x, y, w) {
    R(x, y, w, 14, '#4a3a6a'); R(x + 1, y + 1, w - 2, 7, '#a8c8e8'); cx.globalAlpha = 0.5; R(x + 1, y + 1, w - 2, 7, '#203050'); cx.globalAlpha = 1;
    for (let i = 2; i < w - 3; i += 4) R(x + i, y + 4, 3, 3, pick(['#ff6a8a', '#ffd84f', '#7aff8a', '#8ab0ff']));
    R(x, y + 14, w, 1, 'rgba(0,0,0,0.4)'); block(x, y + 3, w, 11); addObj({ kind: 'prize', x, y, w, h: 15 });
  }
  function vending(x, y, c) {
    R(x, y, 16, 26, c); R(x, y, 16, 1, shade(c, 1.4)); R(x + 2, y + 3, 9, 14, '#1a2030');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) R(x + 3 + i * 3, y + 4 + j * 3, 2, 2, pick(['#ff4040', '#40a0ff', '#ffd040', '#40e080']));
    R(x + 12, y + 5, 2, 6, '#c0c0c8'); R(x + 2, y + 20, 10, 3, '#0a0a10');
    block(x, y + 12, 16, 14); addObj({ kind: 'vending', x, y, w: 16, h: 26 });
    lights.push({ x: x + 8, y: y + 14, r: 22, c: '#a0d0ff', f: 0.2, g: 'main' });
  }
  function panelBox(x, y) {
    R(x, y, 18, 16, '#6a6e78'); R(x, y, 18, 1, '#8a8e98'); R(x + 1, y + 2, 16, 12, '#3a3e48');
    for (let i = 0; i < 4; i++) { R(x + 3 + i * 3, y + 5, 2, 4, '#202228'); R(x + 3 + i * 3, y + 5, 2, 2, '#c0c0c8'); }
    R(x + 2, y + 11, 14, 1, '#e0c030');
    addObj({ kind: 'panel', x, y, w: 18, h: 16 });
  }


  // ---------- detalhes extras ----------
  const onBase = fn => { const pc = cx; cx = g; fn(); cx = pc; };
  const onObj = fn => { const pc = cx; cx = og; fn(); cx = pc; };
  function pot(x, y, c = '#8a8e98') { R(x, y + 1, 6, 4, c); R(x + 1, y, 4, 1, shade(c, 1.3)); R(x + 1, y + 1, 4, 1, '#2a2e36'); P(x - 1, y + 2, c); P(x + 6, y + 2, c); }
  function pan(x, y) { R(x, y, 5, 4, '#3a3e48'); R(x + 1, y + 1, 3, 2, '#202228'); R(x + 5, y + 2, 4, 1, '#6a5040'); }
  function board(x, y) { R(x, y, 8, 5, '#c89a5a'); R(x, y + 4, 8, 1, '#8a6438'); P(x + 2, y + 1, '#d83a2a'); P(x + 4, y + 2, '#d83a2a'); P(x + 5, y + 1, '#4aa83a'); R(x + 9, y + 2, 4, 1, '#d0d4dc'); P(x + 13, y + 2, '#2a2014'); }
  function bottle(x, y, c) { R(x, y + 1, 2, 4, c); P(x, y, '#e8e8e8'); P(x, y + 2, shade(c, 1.4)); }
  function plates(x, y, n = 4) { for (let i = 0; i < n; i++) R(x, y - i, 6, 1, i % 2 ? '#f0f0f4' : '#c8c8d4'); }
  function bowl(x, y, c) { R(x, y, 5, 3, '#e8e8f0'); R(x + 1, y, 3, 1, c); }
  function dough(x, y) { R(x, y, 4, 3, '#f0dcb0'); P(x + 1, y, '#fff4d8'); }
  function sack(x, y) { R(x + 1, y - 1, 8, 1, '#c8bea8'); R(x, y, 10, 12, '#e8e0cc'); R(x, y, 10, 1, '#fffaf0'); R(x + 2, y + 4, 6, 3, '#c03a2a'); R(x, y + 11, 10, 1, '#a89e88'); block(x, y + 5, 10, 7); addObj({ kind: 'sack', x, y: y - 1, w: 10, h: 13 }); }
  function bin(x, y, c = '#2a6a3a') { R(x - 1, y, 12, 2, shade(c, 1.3)); R(x, y + 2, 10, 11, c); R(x + 2, y + 5, 6, 1, shade(c, 0.7)); R(x + 2, y + 8, 6, 1, shade(c, 0.7)); R(x, y + 13, 10, 1, 'rgba(0,0,0,0.4)'); block(x, y + 5, 10, 8); addObj({ kind: 'bin', x: x - 1, y, w: 12, h: 14 }); }
  function trayRack(x, y) {
    R(x, y, 14, 26, '#8a949e'); R(x + 1, y + 1, 12, 24, '#3a3e48');
    for (let j = 2; j < 24; j += 4) { R(x + 1, y + j, 12, 1, '#a8b0b8'); if (rand() < 0.7) R(x + 2, y + j - 2, 10, 2, pick(['#d8b880', '#f0dcb0', '#c03a2a'])); }
    R(x, y + 26, 2, 2, '#202020'); R(x + 12, y + 26, 2, 2, '#202020');
    block(x, y + 14, 14, 14); addObj({ kind: 'rack', x, y, w: 14, h: 28 });
  }
  function wetSign(x, y) { R(x + 1, y, 4, 1, '#e8c030'); R(x, y + 1, 6, 7, '#f0d040'); R(x + 2, y + 2, 2, 3, '#202020'); P(x + 2, y + 6, '#202020'); R(x, y + 8, 6, 1, '#8a7020'); block(x, y + 4, 6, 4); addObj({ kind: 'sign', x, y, w: 6, h: 9 }); }
  function mopBucket(x, y) { R(x, y + 3, 9, 7, '#e8c030'); R(x + 1, y + 4, 7, 2, '#5a7a9a'); R(x + 6, y - 8, 1, 12, '#a07a50'); R(x + 4, y + 2, 5, 2, '#d8d0c0'); block(x, y + 5, 9, 5); addObj({ kind: 'bucket', x, y: y - 8, w: 9, h: 18 }); }
  function drain(x, y) { R(x, y, 7, 7, '#5a646e'); for (let i = 1; i < 7; i += 2) R(x + 1, y + i, 5, 1, '#20262c'); }
  function stain(x, y, w, h, c, a = 0.3) { cx.globalAlpha = a; R(x + 1, y, w - 2, h, c); R(x, y + 1, w, h - 2, c); cx.globalAlpha = 1; }
  function extinguisher(x, y) { R(x + 1, y, 2, 2, '#202020'); R(x, y + 2, 4, 8, '#d02a2a'); P(x + 1, y + 3, '#ff7a6a'); R(x, y + 10, 4, 1, 'rgba(0,0,0,0.4)'); block(x, y + 6, 4, 4); addObj({ kind: 'ext', x, y, w: 4, h: 11 }); }
  function clock(x, y) { R(x, y, 7, 7, '#e8e8f0'); R(x + 1, y + 1, 5, 5, '#fffaf0'); R(x + 3, y + 1, 1, 3, '#202020'); R(x + 3, y + 3, 2, 1, '#202020'); }
  function cobweb(x, y, flip) { cx.globalAlpha = 0.35; const f = flip ? -1 : 1; for (let i = 0; i < 7; i++) { P(x + f * i, y, '#c8c8d0'); P(x, y + i, '#c8c8d0'); P(x + f * i, y + i, '#c8c8d0'); } for (let i = 2; i < 6; i++) { P(x + f * i, y + 3, '#c8c8d0'); P(x + f * 3, y + i, '#c8c8d0'); } cx.globalAlpha = 1; }
  function sconce(x, y, c) { R(x, y, 4, 3, '#3a3e48'); R(x + 1, y + 1, 2, 2, c); lights.push({ x: x + 2, y: y + 8, r: 22, c, f: 0.25, g: 'main' }); }
  function neon(x, y, w, c, kind) {
    const pc = cx; cx = g;
    if (kind === 'zig') for (let i = 0; i < w; i++) P(x + i, y + ((i >> 2) % 2 ? 1 : 4) + (i % 4 === 0 ? 0 : 0), c);
    else if (kind === 'star') { R(x + 3, y, 1, 7, c); R(x, y + 3, 7, 1, c); P(x + 1, y + 1, c); P(x + 5, y + 1, c); P(x + 1, y + 5, c); P(x + 5, y + 5, c); }
    else { R(x, y, w, 1, c); R(x, y + 5, w, 1, c); for (let i = 0; i < w; i += 5) R(x + i, y + 1, 1, 4, c); }
    cx = pc;
    lights.push({ x: x + w / 2, y: y + 10, r: Math.max(24, w * 0.6), c, f: 0.3, g: 'main' });
  }
  const BAL = ['#ff4a5a', '#4aa8ff', '#ffd84f', '#7aff8a', '#d070ff', '#ff8ad0', '#ff9a3a', '#ffffff'];
  // buquê de balões com fios presos num peso
  function balloonBunch(x, y, n = 5, cols) {
    const pal = cols || BAL, H = 34;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([x + ri(1, 14), y + ri(0, 12)]);
    pts.sort((a, b) => a[1] - b[1]);
    for (const [bx, by] of pts) { for (let k = by + 8; k < y + H - 3; k++) P(Math.round(bx + 3 + (x + 9 - bx - 3) * (k - by - 8) / (y + H - 3 - by - 8)), k, '#b8b8c8'); }
    for (const [bx, by] of pts) {
      const c = pick(pal);
      R(bx + 1, by, 5, 1, c); R(bx, by + 1, 7, 5, c); R(bx + 1, by + 6, 5, 1, c); P(bx + 3, by + 7, shade(c, 0.7));
      R(bx + 1, by + 1, 2, 2, shade(c, 1.6)); R(bx + 5, by + 3, 1, 3, shade(c, 0.7));
    }
    R(x + 7, y + H - 3, 5, 3, '#5a5a6a'); R(x + 7, y + H - 3, 5, 1, '#8a8a9a');
    addObj({ kind: 'balloons', x, y, w: 20, h: H });
  }
  // arco de balões (enfileirados) — decoração no chão/palco
  function balloonRow(x, y, len, vert) {
    for (let i = 0; i < len; i += 5) {
      const c = BAL[(i / 5) % 6 | 0], bx = vert ? x + (i % 10 ? 2 : 0) : x + i, by = vert ? y + i : y + (i % 10 ? 2 : 0);
      R(bx, by, 6, 5, c); R(bx + 1, by + 1, 2, 1, shade(c, 1.6));
    }
  }
  function cone(x, y) { R(x + 2, y, 2, 2, '#ff7a2a'); R(x + 1, y + 2, 4, 3, '#ff7a2a'); R(x + 1, y + 3, 4, 1, '#f0f0f0'); R(x, y + 5, 6, 2, '#3a3a40'); block(x, y + 4, 6, 3); addObj({ kind: 'sign', x, y, w: 6, h: 7 }); }
  function gift(x, y, c) { R(x, y, 7, 6, c); R(x + 3, y, 1, 6, '#ffe060'); R(x, y + 2, 7, 1, '#ffe060'); P(x + 2, y - 1, '#ffe060'); P(x + 4, y - 1, '#ffe060'); block(x, y + 2, 7, 4); addObj({ kind: 'gift', x, y: y - 1, w: 7, h: 7 }); }
  function hat(x, y, c) { P(x + 1, y, '#ffe060'); R(x + 1, y + 1, 1, 1, c); R(x, y + 2, 3, 2, c); }
  function cake(x, y) { R(x, y + 2, 10, 5, '#f0d0e0'); R(x, y + 2, 10, 1, '#fff0f8'); R(x + 1, y + 4, 8, 1, '#ff6a9a'); for (let i = 1; i < 10; i += 3) { R(x + i, y, 1, 2, '#6ab0ff'); P(x + i, y - 1, '#ffd84f'); } }
  function cup(x, y, c) { R(x, y, 2, 2, c); P(x, y, shade(c, 1.4)); }
  function speaker(x, y) { R(x, y, 10, 14, '#1a1a22'); R(x + 2, y + 2, 6, 4, '#2a2a34'); R(x + 3, y + 7, 4, 4, '#2a2a34'); P(x + 4, y + 8, '#4a4a54'); block(x, y + 6, 10, 8); addObj({ kind: 'speaker', x, y, w: 10, h: 14 }); }
  function barrel(x, y, c = '#3a6aa0') { R(x, y, 11, 13, c); R(x, y, 11, 2, shade(c, 1.35)); R(x, y + 5, 11, 1, shade(c, 0.6)); R(x, y + 9, 11, 1, shade(c, 0.6)); R(x + 3, y + 6, 4, 3, '#e0c030'); R(x, y + 13, 11, 1, 'rgba(0,0,0,0.4)'); block(x, y + 5, 11, 8); addObj({ kind: 'barrel', x, y, w: 11, h: 14 }); }
  function toolbox(x, y) { R(x, y + 2, 12, 6, '#c03030'); R(x, y + 2, 12, 1, '#ff6060'); R(x + 4, y, 4, 2, '#3a3e48'); R(x + 5, y + 4, 2, 1, '#c0c0c8'); }
  function spool(x, y) { R(x, y, 12, 12, '#8a6a3a'); R(x + 2, y + 2, 8, 8, '#2a2a2a'); R(x + 5, y + 5, 2, 2, '#8a6a3a'); block(x, y + 4, 12, 8); addObj({ kind: 'spool', x, y, w: 12, h: 12 }); }
  function locker(x, y, n = 2) { for (let i = 0; i < n; i++) { const lx = x + i * 9; R(lx, y, 9, 22, '#4a6a8a'); R(lx, y, 9, 1, '#6a8aaa'); R(lx + 8, y, 1, 22, '#2a4a6a'); for (let j = 3; j < 8; j += 2) R(lx + 2, y + j, 5, 1, '#2a4a6a'); R(lx + 6, y + 11, 1, 3, '#c0c0c8'); } block(x, y + 10, n * 9, 12); addObj({ kind: 'locker', x, y, w: n * 9, h: 22 }); }
  function cork(x, y, w) { R(x, y, w, 9, '#a8783a'); R(x, y, w, 1, '#5a3a1a'); for (let i = 2; i < w - 4; i += 5) { R(x + i, y + 2 + (i % 3), 4, 4, pick(['#f0f0e0', '#fff0a0', '#c0e0ff', '#ffc0c0'])); P(x + i + 1, y + 2 + (i % 3), '#d02020'); } }
  function drawing(x, y) { R(x, y, 8, 7, '#f4f0e4'); const c = pick(['#d02020', '#2040d0', '#20a040', '#a020c0', '#202020']); R(x + 2, y + 2, 3, 3, c); P(x + 6, y + 1, '#ffc020'); R(x + 1, y + 5, 6, 1, pick(['#20a040', '#202020'])); }
  function puddle(x, y, w) { cx.globalAlpha = 0.45; R(x + 2, y, w - 4, 1, '#6a8aa8'); R(x, y + 1, w, 3, '#4a6a88'); R(x + 2, y + 4, w - 4, 1, '#4a6a88'); cx.globalAlpha = 0.6; R(x + 3, y + 1, 3, 1, '#a8c8e8'); cx.globalAlpha = 1; }
  function bench(x, y, w, c = '#5a3a6a') { R(x, y, w, 5, c); R(x, y, w, 1, shade(c, 1.4)); R(x + 1, y + 5, 2, 2, '#1a1a20'); R(x + w - 3, y + 5, 2, 2, '#1a1a20'); block(x, y + 1, w, 6); addObj({ kind: 'bench', x, y, w, h: 7 }); }
  function stanchion(x, y) { R(x, y, 3, 2, '#e0c060'); R(x + 1, y + 2, 1, 6, '#c0a040'); R(x, y + 8, 3, 1, '#8a7030'); block(x, y + 5, 3, 4); addObj({ kind: 'stanchion', x, y, w: 3, h: 9 }); }
  function rope(x0, x1, y) { const pc = cx; cx = og; for (let x = x0; x <= x1; x++) P(x, y + 3 + Math.round(Math.sin((x - x0) / (x1 - x0) * Math.PI) * 2), '#c02040'); cx = pc; }
  function kidsTable(x, y) { R(x, y, 22, 12, '#f0c030'); R(x, y, 22, 1, '#ffe080'); R(x, y + 11, 22, 1, '#a07a10'); for (let i = 0; i < 4; i++) R(x + 3 + i * 5, y + 3, 3, 4, '#fffaf0'); P(x + 5, y + 8, '#d02020'); P(x + 12, y + 8, '#2040d0'); P(x + 17, y + 7, '#20a040'); block(x, y + 2, 22, 10); addObj({ kind: 'ktable', x, y, w: 22, h: 12 }); [[-6, 2], [23, 2], [8, -6], [8, 13]].forEach(([dx, dy]) => { R(x + dx, y + dy, 5, 5, pick(['#d02020', '#2060d0', '#20a040'])); }); }
  function brokenCab(x, y) { R(x, y + 4, 24, 12, '#3a2a4a'); R(x, y + 4, 24, 1, '#5a4a6a'); R(x + 3, y + 6, 8, 7, '#0a0a10'); P(x + 5, y + 8, '#c0d0e0'); P(x + 7, y + 10, '#c0d0e0'); R(x + 14, y + 7, 6, 4, '#c23a3a'); R(x + 24, y + 6, 3, 8, '#2a1a34'); block(x, y + 6, 26, 10); addObj({ kind: 'broken', x, y: y + 4, w: 27, h: 13 }); for (let i = 0; i < 10; i++) onBase(() => P(x - 6 + ri(0, 36), y + 16 + ri(0, 6), '#a8c8e8')); }
  function tickets(x, y, n) { onBase(() => { for (let i = 0; i < n; i++) { const a = x + ri(0, 30), b = y + ri(0, 20); if (tAt(a >> 3, b >> 3) !== FLOOR || face[ti(a >> 3, b >> 3)]) continue; R(a, b, 3, 1, '#ff9a30'); P(a + 1, b, '#ffd080'); } }); }
  function boiler(x, y) { R(x, y, 22, 32, '#6a6e78'); R(x, y, 22, 2, '#8a8e98'); R(x + 2, y + 4, 18, 26, '#5a5e68'); R(x + 7, y + 8, 8, 8, '#2a2e36'); R(x + 9, y + 10, 4, 4, '#ff6a20'); R(x + 18, y - 6, 3, 8, '#5a5e68'); R(x + 3, y + 22, 4, 2, '#c03030'); block(x, y + 14, 22, 18); addObj({ kind: 'boiler', x, y: y - 6, w: 22, h: 38 }); lights.push({ x: x + 11, y: y + 14, r: 20, c: '#ff7a30', f: 0.4, g: 'gen' }); }
  function mattress(x, y) { R(x, y, 28, 14, '#c8bca0'); R(x, y, 28, 1, '#e8dcc0'); for (let i = 4; i < 28; i += 6) P(x + i, y + 6, '#9a8e72'); stain(x + 8, y + 3, 8, 6, '#6a4a2a', 0.5); block(x, y + 3, 28, 11); addObj({ kind: 'mattress', x, y, w: 28, h: 14 }); }
  function ticketRail(x, y, w) { R(x, y, w, 1, '#c0c8d0'); for (let i = 2; i < w - 3; i += 6) { R(x + i, y + 1, 4, 5, '#fffaf0'); R(x + i + 1, y + 2, 2, 1, '#8a8a8a'); R(x + i + 1, y + 4, 2, 1, '#8a8a8a'); } }
  function menuBoard(x, y) { R(x, y, 26, 11, '#1a2a22'); R(x, y, 26, 1, '#5a3a20'); for (let j = 3; j < 10; j += 2) R(x + 2, y + j, 14 + ri(0, 6), 1, '#d8e8d8'); R(x + 20, y + 3, 4, 3, '#ffd84f'); }
  function potRack(x, y, n) { R(x, y, n * 9, 1, '#5a5e68'); for (let i = 0; i < n; i++) { const px = x + 2 + i * 9; R(px + 2, y + 1, 1, 2, '#5a5e68'); if (i % 2) pot(px, y + 3, '#a8acb4'); else pan(px, y + 3); } }
  function freezer(x, y) { R(x, y, 26, 16, '#a8b4c0'); R(x + 1, y + 1, 24, 14, '#c0ccd8'); R(x + 13, y + 1, 1, 14, '#8a96a2'); R(x + 3, y + 6, 1, 4, '#5a646e'); R(x + 22, y + 6, 1, 4, '#5a646e'); R(x + 7, y + 3, 12, 2, '#3a7ac8'); }
  function mixer(x, y) { R(x, y + 3, 6, 4, '#d83a3a'); R(x + 1, y, 5, 3, '#d83a3a'); R(x + 2, y + 4, 3, 2, '#c0c8d0'); }

  function decor() {
    cx = og;
    // ===== COZINHA =====
    onBase(() => {
      potRack(652, 66, 7);
      ticketRail(718, 64, 32);
      menuBoard(696, 66);
      clock(740, 65);
      freezer(856, 152);
      R(832, 158, 20, 2, '#e8c030');
      drain(700, 170); drain(780, 262); drain(640, 280);
      stain(724, 228, 14, 8, '#c03a2a', 0.35); stain(660, 186, 10, 6, '#c03a2a', 0.3);
      stain(800, 240, 18, 10, '#ffffff', 0.35); stain(620, 160, 12, 8, '#5a4a30', 0.25);
      for (let i = 0; i < 12; i++) { const x = ri(620, 890), y = ri(150, 275); if (tAt(x >> 3, y >> 3) === FLOOR && !face[ti(x >> 3, y >> 3)]) R(x, y, ri(2, 4), 1, pick(['#d0d4dc', '#c89a5a', '#f0dcb0', '#c03a2a'])); }
      cobweb(610, 82, false); cobweb(821, 82, true); cobweb(909, 170, true);
    });
    // panelas no fogão e coisas nas bancadas
    pot(657, 76, '#8a8e98'); pan(678, 77); pot(697, 76, '#a8acb4');
    board(716, 78); bottle(733, 76, '#d02a2a'); bottle(736, 76, '#e8c030'); bottle(739, 76, '#2a8a3a'); bowl(743, 78, '#f0dcb0');
    dough(647, 118); dough(653, 124); dough(649, 132); bowl(656, 114, '#d83a2a');
    board(678, 116); plates(684, 135, 5); bottle(690, 120, '#d02a2a');
    board(700, 203); bowl(722, 204, '#4aa83a'); plates(760, 210, 4); plates(768, 210, 6); mixer(774, 202);
    plates(626, 292, 5); plates(634, 292, 3); bowl(668, 288, '#e8e8f0'); bottle(720, 286, '#3a6ac8'); bottle(724, 286, '#3a6ac8');
    plates(790, 292, 6); board(810, 287); bowl(840, 288, '#f0dcb0'); bottle(870, 286, '#d02a2a');
    // ilha nova com massa e balança
    counter(724, 112, 40, 18, '#c0c8d0', '#8a949e'); dough(730, 116); dough(738, 117); dough(746, 115); R(754, 114, 6, 5, '#e8e8f0'); R(755, 115, 4, 2, '#4a4a54');
    counter(636, 200, 36, 14, '#c0c8d0', '#8a949e'); board(640, 203); bowl(656, 203, '#d83a2a');
    trayRack(806, 98); trayRack(806, 128);
    sack(846, 184); sack(858, 186); sack(852, 196);
    bin(886, 244); bin(898, 244, '#3a4a5a');
    crate(824, 240); crate(824, 254); R(826, 243, 8, 3, '#d02a2a'); R(826, 257, 8, 3, '#d02a2a');
    wetSign(760, 244); mopBucket(744, 248);
    extinguisher(612, 232);
    // ===== SEGURANÇA =====
    onBase(() => { cork(96, 26, 30); clock(140, 27); for (let i = 0; i < 6; i++) R(ri(80, 190), ri(80, 112), 4, 3, '#e8e4d0'); cobweb(58, 42, false); cobweb(205, 42, true); });
    locker(150, 38, 3);
    R(140, 98, 12, 12, '#4a4e58'); R(141, 99, 10, 10, '#5a5e68'); R(146, 103, 2, 2, '#c0c0c8'); block(140, 102, 12, 8); addObj({ kind: 'safe', x: 140, y: 98, w: 12, h: 12 });
    // ===== ARCADES =====
    onBase(() => cobweb(98, 138, false));
    neon(222, 124, 7, '#ff4fd0', 'star'); neon(236, 124, 7, '#40e0ff', 'star');
    neon(302, 124, 80, '#ff60ff', 'zig');
    R(352, 124, 12, 18, '#3a3a4a'); R(353, 126, 10, 6, '#ffd84f'); R(355, 133, 6, 3, '#1a1a20'); block(352, 134, 12, 8); addObj({ kind: 'change', x: 352, y: 124, w: 12, h: 18 });
    trash(232, 150); bench(240, 224, 30); bench(470, 224, 30);
    tickets(140, 150, 40); tickets(400, 150, 40); tickets(260, 230, 30);
    brokenCab(230, 400); trash(270, 330);
    onBase(() => { for (let i = 0; i < 20; i++) P(ri(220, 270), ri(396, 420), '#a8c8e8'); stain(120, 420, 20, 10, '#2a1a10', 0.4); cobweb(98, 306, false); cobweb(293, 306, true); });
    neon(300, 500, 0, '#40e0ff', 'star');
    tickets(130, 600, 40); tickets(260, 620, 30); bench(300, 600, 26);
    neon(384, 296 - 4, 0, '#ffd84f', 'star');
    tickets(400, 460, 40); bench(500, 460, 30); trash(388, 520);
    onBase(() => { cobweb(378, 306, false); cobweb(541, 306, true); cobweb(98, 514, false); });
    stool(660, 350); stool(672, 350); stool(726, 350);
    tickets(640, 430, 40); trash(860, 470);
    // ===== SALÕES =====
    cake(1000, 135); cake(1150, 99);
    [[972, 97], [990, 99], [1010, 97], [1040, 98], [1060, 99], [1140, 65], [1170, 66], [1200, 101], [1180, 137], [1210, 138], [1000, 387], [1030, 388], [1060, 427], [1090, 428]].forEach(([x, y], i) => cup(x, y, ['#ff6a6a', '#6ab0ff', '#ffd84f', '#7aff8a'][i % 4]));
    [[1020, 99], [1100, 136], [1160, 66], [1020, 428]].forEach(([x, y]) => plates(x, y + 3, 3));
    gift(940, 70); gift(948, 76, '#5ab0ff'); gift(1240, 156, '#d070ff'); gift(1250, 160, '#ff5a5a');
    gift(940, 450, '#7aff8a'); gift(1150, 360, '#ffd84f');
    speaker(1272, 46); speaker(1306, 46); speaker(1004, 322); speaker(1098, 322);
    onBase(() => { [[960, 160, '#ff5a5a'], [1100, 120, '#5ab0ff'], [1190, 80, '#ffd84f'], [960, 460, '#d070ff'], [1080, 470, '#7aff8a']].forEach(([x, y, c]) => hat(x, y, c)); for (let i = 0; i < 6; i++) { const x = ri(940, 1250), y = ri(60, 160), c = pick(['#ff5a5a', '#5ab0ff', '#ffd84f']); for (let k = 0; k < 8; k++) P(x + k, y + Math.round(Math.sin(k) * 1.5), c); } cobweb(1325, 42, true); cobweb(1189, 330, true); });
    // ===== LOBBY =====
    stanchion(566, 700); stanchion(634, 700); rope(569, 633, 700);
    kidsTable(590, 650);
    locker(446, 660, 2);
    R(446, 652, 18, 6, '#8a5a3a'); onBase(() => R(446, 646, 18, 6, '#c8a040'));
    onBase(() => { R(676, 562, 30, 8, '#5a3a20'); for (let i = 0; i < 4; i++) { R(679 + i * 7, 560, 4, 4, '#ffd84f'); R(680 + i * 7, 564, 2, 3, '#c8a020'); } cobweb(442, 576, false); cobweb(781, 576, true); });
    // ===== CORREDORES =====
    [260, 380, 470, 620, 700, 800].forEach(x => onBase(() => sconce(x, 28, '#a080ff')));
    [600, 760, 940, 1060, 1160].forEach(x => onBase(() => sconce(x, 500, '#ff80ff')));
    onBase(() => { poster(420, 28, '#c83a3a'); poster(520, 28, '#3ac8a0'); poster(660, 28, '#ffd84f'); poster(900, 500, '#ff4fd0'); poster(1100, 500, '#5a8aff'); });
    extinguisher(82, 300); extinguisher(82, 640); extinguisher(590, 380); extinguisher(1184, 530);
    bench(150, 728, 30); trash(588, 470);
    onBase(() => { stain(70, 470, 12, 18, '#2a1a10', 0.3); stain(700, 530, 20, 8, '#2a1a10', 0.3); });
    // ===== ENERGIA =====
    barrel(1030, 280); barrel(1041, 282, '#c03030'); toolbox(964, 284);
    onBase(() => { R(990, 290, 14, 1, '#e0c030'); R(1010, 186, 10, 8, '#e0c030'); P(1014, 188, '#202020'); P(1014, 190, '#202020'); cobweb(922, 194, false); });
    barrel(1158, 278); spool(1300, 276); toolbox(1180, 292);
    onBase(() => { for (let i = 0; i < 6; i++) R(1196 + i * 5, 288, 1, 10, '#8a6a3a'); R(1196, 290, 26, 1, '#8a6a3a'); R(1196, 296, 26, 1, '#8a6a3a'); R(1290, 186, 10, 8, '#e0c030'); cobweb(1325, 194, true); });
    // ===== PORÃO =====
    boiler(1090, 600);
    brokenCab(940, 690); mattress(1010, 700);
    bin(1080, 640, '#4a4e58');
    onBase(() => { puddle(960, 660, 16); puddle(1040, 680, 22); puddle(900, 690, 10); cobweb(882, 610, false); cobweb(1125, 610, true); stain(1000, 640, 26, 14, '#2a2a20', 0.35); for (let i = 0; i < 8; i++) { const x = ri(890, 1110); R(x, 602, 1, ri(3, 8), '#2a2a30'); } });
    // ===== PORÃO SECRETO =====
    onBase(() => {
      for (let i = 0; i < 10; i++) drawing(1182 + i * 14 + (i > 3 ? 14 : 0), 595 + (i % 2) * 3);
      for (let i = 0; i < 14; i++) { const x = 1190 + ri(0, 120), y = 620 + ri(0, 100); R(x, y, ri(3, 6), 1, '#8a8a92'); }
      stain(1230, 700, 30, 14, '#3a1010', 0.4);
      cobweb(1178, 610, false); cobweb(1325, 610, true);
      R(1288, 690, 6, 2, '#1a1a1a'); R(1289, 690, 4, 1, '#c0c0c0');
    });
    R(1250, 680, 8, 8, '#7a4428'); R(1250, 676, 8, 4, '#9a6038'); R(1251, 688, 1, 3, '#4a2614'); R(1256, 688, 1, 3, '#4a2614'); block(1250, 680, 8, 9); addObj({ kind: 'chair', x: 1250, y: 676, w: 8, h: 15 });
  }

  // ---------- desenho do mapa ----------
  function build() {
    cx = g;
    // fora: planta azul
    R(0, 0, W, H, '#07060b');
    // pisos
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const t = tiles[ti(x, y)];
      if (t === FLOOR) floorTile(ROOMS[troom[ti(x, y)]], x, y);
      else if (t === DOOR) {
        // soleira: piso da sala vizinha
        const d = doors[tdoor[ti(x, y)]];
        const nb = d.horiz ? (tAt(x, y + 1) === FLOOR ? ti(x, y + 1) : ti(x, y - 1)) : (tAt(x + 1, y) === FLOOR ? ti(x + 1, y) : ti(x - 1, y));
        const rm = ROOMS[troom[nb]] || ROOMS[0];
        floorTile(rm, x, y);
        cx.globalAlpha = 0.35; R(x * T, y * T, T, T, '#000'); cx.globalAlpha = 1;
      }
    }
    // tapetes
    rug(150, 168, 80, 56, '#6a2a3a'); rug(388, 168, 82, 56, '#4a2a6a');
    rug(136, 548, 148, 92, '#7a2a2a'); rug(408, 330, 100, 128, '#7a2a3a');
    rug(570, 640, 64, 40, '#3a2a6a');
    // paredes
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const t = tiles[ti(x, y)];
      if (t === VOID) { R(x * T, y * T, T, T, '#040306'); continue; }
      if (t === WALL) wallCap(x, y);
    }
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (face[ti(x, y)]) wallFace(ROOMS[troom[ti(x, y)]], x, y);

    // ===== mobília (camada própria, para desenhar na frente do jogador) =====
    cx = og;
    // SEGURANÇA
    poster(150, 34, '#3a6ac8'); poster(166, 34, '#c83a6a');
    desk(64, 52); officeChair(94, 74);
    eCabinet(184, 40); R(186, 64, 14, 8, '#2a2e3a'); R(188, 65, 10, 3, '#4a3a2a'); P(190, 66, '#ff4040');
    trash(170, 98);
    // painéis de botões das portas
    R(60, 100, 10, 12, '#4a4e58'); R(61, 102, 3, 3, '#e03030'); R(65, 102, 3, 3, '#e8e8f0'); R(61, 107, 8, 3, '#2a2e36');
    R(196, 76, 10, 12, '#4a4e58'); R(197, 78, 3, 3, '#e03030'); R(201, 78, 3, 3, '#e8e8f0'); R(197, 83, 8, 3, '#2a2e36');
    // C1
    plant(316, 34); trash(372, 100); plant(222, 98); poster(340, 34, '#8a3ac8');
    vending(842, 54, '#c83a3a'); vending(862, 54, '#3a6ac8'); plant(890, 56); trash(850, 138);
    // ARCADE 1
    [104, 120, 136, 152, 168, 184, 200].forEach(x => cabinet(x, 122, 'down'));
    [248, 264, 280].forEach(x => cabinet(x, 122, 'down'));
    [392, 408, 424, 440, 456].forEach(x => cabinet(x, 122, 'down'));
    claw(494, 116);
    island([166, 182, 198], 170); island([404, 420, 436], 170);
    cabinet(122, 254, 'up'); cabinet(138, 254, 'up');
    [230, 240, 250, 260].forEach(x => stool(x, 262));
    [440, 452, 464, 476].forEach(x => stool(x, 262));
    debris(100, 140, 440, 140, 130);
    // ARCADE 2 (destruído)
    [104, 120, 136, 152, 168, 200, 216, 232, 248, 264].forEach(x => cabinet(x, 290, 'down'));
    [150, 166, 182, 198, 214].forEach(x => cabinet(x, 452, 'up'));
    counter(176, 364, 36, 14, '#6a4a3a', '#4a3226');
    R(182, 366, 8, 6, '#c8a080'); R(196, 368, 6, 4, '#3a6ac8');
    debris(100, 310, 190, 160, 190);
    for (let i = 0; i < 6; i++) { const x = ri(110, 270), y = ri(320, 440); R(x, y, 5, 3, pick(['#8a6a4a', '#5a5a6a', '#a04040'])); }
    // ARCADE 3
    [120, 136, 152, 168, 184, 200, 216, 232, 248, 264, 280].forEach(x => cabinet(x, 498, 'down'));
    island([176, 192, 208, 224], 566); island([248], 566);
    [120, 136, 152, 168, 184].forEach(x => cabinet(x, 652, 'up'));
    [248, 264, 280].forEach(x => cabinet(x, 652, 'up'));
    counter(316, 646, 40, 16, '#c86a3a', '#8a4024'); R(320, 648, 8, 5, '#ffd84f'); R(332, 648, 10, 5, '#ff6a8a'); R(346, 649, 6, 4, '#7aff8a');
    debris(100, 520, 260, 160, 130);
    // ARCADE 4
    [384, 400, 416, 432, 448, 464, 480, 496, 512].forEach(x => cabinet(x, 290, 'down'));
    island([440, 456], 344); island([440, 456], 400);
    pinball(380, 410); pinball(380, 444);
    cabinet(522, 340, 'down'); cabinet(522, 372, 'down'); cabinet(522, 404, 'down');
    airHockey(410, 494); prize(468, 520, 64);
    debris(380, 310, 160, 230, 110);
    // ARCADE 5
    [640, 656, 704, 720].forEach(x => cabinet(x, 314, 'down'));
    pinball(614, 340); pinball(614, 372); pinball(614, 404);
    cabinet(690, 432, 'down');
    kiddieRide(736, 446);
    shelf(880, 334, 28);
    R(884, 420, 18, 26, '#2a2a3a'); R(886, 422, 14, 12, '#5a3a8a'); R(888, 438, 10, 6, '#c03a3a'); block(884, 430, 18, 16); addObj({ kind: 'booth', x: 884, y: 420, w: 18, h: 26 });
    debris(620, 330, 280, 160, 120);
    // COZINHA
    fridge(612, 66); fridge(630, 66);
    counter(650, 74, 100, 12); [656, 676, 696].forEach(x => { R(x, 75, 12, 8, '#3a3e48'); R(x + 2, 77, 3, 3, '#202228'); R(x + 7, 77, 3, 3, '#202228'); });
    pizzaBox(716, 74); pizzaBox(728, 75);
    oven(756, 68); oven(784, 68);
    counter(644, 112, 20, 30, '#c0c8d0', '#8a949e'); counter(676, 112, 20, 30, '#c0c8d0', '#8a949e');
    pizzaBox(648, 118); pizzaBox(680, 124);
    counter(690, 200, 96, 14); R(700, 202, 20, 8, '#c8a070'); R(740, 203, 14, 6, '#5a8a3a');
    counter(616, 284, 280, 14, '#c0c8d0', '#8a949e');
    [650, 700, 760].forEach(x => { R(x, 286, 14, 8, '#7a848e'); R(x + 2, 288, 10, 4, '#3a4450'); });
    shelf(880, 168, 28); shelf(880, 220, 28);
    for (let i = 0; i < 4; i++) pizzaBox(620 + i * 10, 244 + (i % 2));
    debris(620, 100, 280, 190, 30, ['#c03a2a', '#e8d0a0', '#8a8a8a']);
    // PARTY HALL A
    table(970, 96, 110, 10); table(970, 136, 110, 10);
    table(1130, 64, 100, 10); table(1130, 100, 100, 10); table(1130, 136, 100, 10);
    stage(1268, 60, 54, 96);
    [[940, 50, '#ff5a5a'], [960, 46, '#5ab0ff'], [1062, 46, '#ffd84f'], [1250, 48, '#d070ff'], [1300, 40, '#ff5a5a'], [936, 150, '#7a5aff']].forEach(([x, y, c]) => balloon(x, y, c));
    debris(930, 50, 380, 120, 60, ['#ff5a5a', '#5ab0ff', '#ffd84f', '#7aff8a', '#d070ff']);
    balloonBunch(924, 40, 6); balloonBunch(1090, 40, 5); balloonBunch(1232, 136, 6); balloonBunch(924, 132, 4);
    balloonBunch(1100, 92, 3); balloonBunch(1180, 40, 4);
    balloonRow(1258, 58, 100, true);
    gift(1240, 160, '#ff5a8a'); gift(1250, 156, '#5ab0ff'); gift(940, 112, '#7aff8a');
    // POWER RM 1
    eCabinet(924, 180); eCabinet(940, 180); eCabinet(956, 180);
    panelBox(994, 182);
    eCabinet(1022, 180); eCabinet(1038, 180);
    R(928, 230, 24, 30, '#5a5f6a'); R(930, 232, 20, 26, '#4a4e58'); for (let i = 0; i < 6; i++) R(932, 234 + i * 4, 16, 1, '#3a3e48'); block(928, 240, 24, 20); addObj({ kind: 'transformer', x: 928, y: 230, w: 24, h: 30 });
    { const pc = cx; cx = g; for (let i = 0; i < 40; i++) P(960 + i * 2, 262 + Math.round(Math.sin(i * 0.4) * 2), '#151518'); cx = pc; }
    // SERVICE
    R(1068, 184, 24, 4, '#3a3e48'); R(1070, 176, 20, 12, '#8a949e'); R(1072, 178, 16, 10, '#a8b0b8'); P(1086, 183, '#3a3e48');
    R(1066, 280, 8, 8, '#e8c030'); R(1068, 278, 4, 3, '#8a7a5a'); block(1066, 282, 8, 6);
    // POWER RM 2
    generator(1162, 182); generator(1204, 182); generator(1246, 182);
    R(1294, 200, 14, 36, '#5a2a3a'); for (let i = 0; i < 8; i++) R(1296, 202 + i * 4, 10, 2, i % 2 ? '#8a3a4a' : '#3a1a24'); block(1294, 220, 14, 16); addObj({ kind: 'pipes', x: 1294, y: 200, w: 14, h: 36 });
    R(1250, 262, 30, 1, '#8a2020'); P(1265, 270, '#c02020'); R(1263, 268, 5, 1, '#c02020'); P(1264, 269, '#c02020'); P(1266, 269, '#c02020');
    for (let i = 0; i < 50; i++) P(1170 + i * 2, 240 + Math.round(Math.sin(i * 0.3) * 2), '#151518');
    // PARTY HALL B
    stage(1000, 330, 112, 18);
    table(990, 386, 120, 10); table(990, 426, 120, 10);
    R(1168, 336, 12, 70, '#e8e8f0'); R(1168, 336, 12, 1, '#fff'); block(1168, 338, 12, 68); addObj({ kind: 'table', x: 1168, y: 336, w: 12, h: 70 });
    [[930, 360, '#ff5a5a'], [1150, 470, '#7aff8a'], [940, 470, '#5ab0ff']].forEach(([x, y, c]) => balloon(x, y, c));
    debris(930, 350, 250, 130, 60, ['#ff5a5a', '#5ab0ff', '#ffd84f', '#7aff8a', '#d070ff']);
    balloonRow(998, 350, 116, false);
    balloonBunch(924, 330, 6); balloonBunch(1140, 330, 5); balloonBunch(924, 446, 5); balloonBunch(1120, 452, 4); balloonBunch(1060, 456, 3);
    gift(1150, 420, '#ffd84f'); gift(1140, 428, '#d070ff');
    // CORREDORES
    plant(556, 66); plant(586, 300); trash(588, 180); poster(604, 504, '#3ac88a');
    plant(60, 140); trash(78, 420); plant(60, 600); trash(400, 700); plant(410, 576);
    R(150, 708, 40, 6, '#6a4a3a'); R(150, 708, 40, 1, '#8a6a5a'); block(150, 708, 40, 6);
    poster(700, 504, '#c83a8a'); poster(860, 504, '#3a8ac8');
    R(1000, 532, 30, 8, '#8a5a3a'); R(1000, 532, 30, 1, '#aa7a5a'); block(1000, 532, 30, 8);
    plant(1176, 520); trash(1160, 540);
    debris(560, 510, 620, 40, 60);
    debris(60, 150, 30, 560, 40); debris(60, 700, 370, 30, 40);
    // mais coisas pelos corredores
    cone(64, 236); wetSign(80, 300); plant(78, 470); cone(66, 650); plant(76, 560);
    plant(330, 706); cone(250, 718); wetSign(300, 700);
    cone(640, 536); wetSign(760, 512); plant(940, 506); cone(1100, 540); bench(820, 540, 26);
    plant(400, 40); cone(470, 50); wetSign(620, 36); plant(700, 36); cone(880, 50);
    balloonBunch(560, 504, 4);
    // LOBBY
    balloonBunch(446, 572, 5); balloonBunch(756, 572, 5); balloonBunch(600, 700, 3);
    poster(450, 562, '#ff4fd0');
    R(470, 562, 30, 14, '#1a1a22'); R(471, 563, 28, 11, '#3a1a5a');
    cabinet(520, 562, 'down', CAB[2]); cabinet(536, 562, 'down', CAB[3]);
    R(640, 562, 26, 14, '#1a1a22'); R(641, 563, 24, 11, '#a0c0e0');
    poster(720, 562, '#7a3ac8'); plant(760, 572); plant(446, 712);
    sofa(470, 592, 40, '#4a3a8a');
    reception(690, 590);
    beanbag(456, 616, '#3a6ad0'); beanbag(482, 620, '#3ac06a');
    beanbag(468, 702, '#9a3ad0'); beanbag(608, 700, '#2ab0a0'); beanbag(728, 702, '#2ab0a0');
    tv(520, 690); sofa(510, 720, 46, '#3a2a6a'); sofa(680, 720, 46, '#3a2a6a');
    plant(770, 712); R(752, 712, 14, 10, '#c0c8d0'); block(752, 714, 14, 8);
    // ESCADA / PORÃO
    crate(886, 612); crate(886, 626); crate(966, 606, 14); crate(980, 610); crate(974, 622);
    shelf(1040, 606, 26);
    R(1060, 690, 20, 12, '#6a6e78'); R(1062, 692, 16, 8, '#4a4e58'); block(1060, 694, 20, 8);
    for (let i = 0; i < 30; i++) R(900 + ri(0, 40), 712 + ri(0, 18), ri(2, 4), 2, pick(['#5a5a62', '#3a3a42', '#7a6a5a']));
    R(1104, 690, 22, 14, '#5a5e68'); R(1105, 691, 20, 4, '#7a7e88'); block(1104, 694, 22, 10);
    cx = g;
    // rachadura na parede leste
    R(1124, 660, 1, 18, '#151518'); P(1123, 664, '#151518'); P(1125, 670, '#151518'); P(1122, 672, '#151518');
    // PORÃO SECRETO
    R(1236, 592, 18, 14, '#020204'); R(1236, 592, 18, 1, '#5a6a7a');
    cx.globalAlpha = 0.25; R(1220, 680, 40, 20, '#4a1a1a'); cx.globalAlpha = 1;
    R(1300, 700, 16, 12, '#1a1a22'); R(1301, 701, 14, 9, '#3a3a44');

    decor();
    cx = g;
    // pôsteres jogados no chão dos arcades
    if (window.POSTERS && POSTERS.length) {
      const imgs = POSTERS.map(p => {
        const c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
        const bin = atob(p.data), arr = new Uint8ClampedArray(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        c.getContext('2d').putImageData(new ImageData(arr, p.w, p.h), 0, 0);
        return c;
      });
      const oData = og.getImageData(0, 0, W, H).data;
      const free = (x0, y0, w, h) => {
        for (let y = y0 - 2; y < y0 + h + 2; y += 2) for (let x = x0 - 2; x < x0 + w + 2; x += 2) {
          if (x < 0 || y < 0 || x >= W || y >= H) return false;
          const t = tAt(x >> 3, y >> 3);
          if (t !== FLOOR || face[ti(x >> 3, y >> 3)] || solid[y * W + x] || oData[(y * W + x) * 4 + 3] > 0) return false;
        }
        return true;
      };
      let k = 0;
      ROOMS.filter(r => /^arcade/.test(r.id)).forEach(rm => {
        const [x0, y0, x1, y1] = rm.rects[0];
        let placed = 0;
        for (let tries = 0; tries < 400 && placed < 2; tries++) {
          const img = imgs[k % imgs.length], ang = (rand() - 0.5) * 0.9;
          const bw = Math.ceil(Math.abs(img.width * Math.cos(ang)) + Math.abs(img.height * Math.sin(ang))), bh = Math.ceil(Math.abs(img.width * Math.sin(ang)) + Math.abs(img.height * Math.cos(ang)));
          const x = ri(x0 * T + 4, (x1 + 1) * T - bw - 4), y = ri((y0 + 1) * T + 4, (y1 + 1) * T - bh - 4);
          if (!free(x, y, bw, bh)) continue;
          g.save(); g.imageSmoothingEnabled = false;
          g.translate(x + bw / 2, y + bh / 2); g.rotate(ang);
          g.globalAlpha = 0.45; g.fillStyle = '#000'; g.fillRect(-img.width / 2 + 1, -img.height / 2 + 2, img.width, img.height);
          g.globalAlpha = 0.92; g.drawImage(img, Math.round(-img.width / 2), Math.round(-img.height / 2));
          g.restore(); g.globalAlpha = 1;
          placed++; k++;
        }
      });
    }
    g.drawImage(objC, 0, 0);
  }

  // ---------- luzes do ambiente ----------
  function roomLights() {
    const L = (x, y, r, c, f, gg = 'main') => lights.push({ x, y, r, c, f, g: gg });
    // neons dos arcos
    doors.forEach(d => { if (d.neon) L(d.cx, d.cy, 26, d.neon, 0.4); });
    // cozinha / porão: fluorescentes
    L(700, 110, 70, '#d0f0ff', 0.6); L(760, 230, 70, '#d0f0ff', 0.3); L(860, 220, 50, '#d0f0ff', 0.2);
    L(950, 660, 60, '#c0d0e0', 0.85); L(1060, 660, 50, '#c0d0e0', 0.5);
    // salões
    L(1000, 80, 70, '#ffc080', 0.1); L(1180, 80, 70, '#ffc080', 0.1); L(1290, 100, 50, '#ffb060', 0.15);
    L(1055, 345, 70, '#ffc080', 0.1); L(1050, 420, 60, '#ffb060', 0.15);
    // corredores
    L(320, 60, 40, '#8060ff', 0.2); L(560, 50, 40, '#8060ff', 0.2); L(780, 50, 40, '#6040ff', 0.2);
    L(72, 300, 30, '#6040ff', 0.2); L(72, 560, 30, '#6040ff', 0.2); L(240, 715, 40, '#6040ff', 0.2);
    L(572, 200, 30, '#6040ff', 0.2); L(572, 420, 30, '#6040ff', 0.2);
    L(700, 525, 40, '#ff60ff', 0.15); L(950, 525, 40, '#ff60ff', 0.15); L(1120, 125 + 400, 30, '#ff60ff', 0.2);
    // lobby
    L(484, 568, 34, '#ff40ff', 0.2); L(653, 568, 28, '#a0e0ff', 0.1); L(600, 650, 60, '#8070ff', 0.1);
    // segurança
    L(100, 50, 50, '#40c0ff', 0.15); L(150, 90, 50, '#a0b8e0', 0.2);
    // arcade 5 grafite
    L(760, 340, 50, '#c040ff', 0.1); L(860, 470, 30, '#ff40c0', 0.2);
    // energia
    L(1003, 194, 22, '#ffb030', 0.25, 'gen'); L(985, 260, 50, '#a0ffb0', 0.3, 'gen'); L(1240, 270, 60, '#a0ffb0', 0.3, 'gen');
    // emergência (sempre acesas)
    L(1265, 268, 26, '#ff2040', 0.7, 'emg');
    L(596, 728, 26, '#ff2030', 0.05, 'emg'); L(70, 112, 20, '#ff2030', 0.05, 'emg');
    L(978, 500, 18, '#ff3030', 0.05, 'emg'); L(1124, 500, 18, '#ff3030', 0.05, 'emg'); L(1078, 196, 22, '#ff3030', 0.1, 'emg');
    L(1250, 660, 90, '#e0f0ff', 0.75, 'emg');
  }

  // ---------- salas para o jogo ----------
  const rooms = [];
  ROOMS.forEach(rm => rm.rects.forEach(([x0, y0, x1, y1]) => rooms.push({ id: rm.id, name: rm.name, r: [x0 * T, y0 * T - T, (x1 - x0 + 1) * T, (y1 - y0 + 2) * T], amb: rm.amb, tint: rm.tint })));

  build();
  roomLights();

  // ---------- oclusão e "lado de fora" ----------
  const tocc = new Uint8Array(TW * TH);
  for (let k = 0; k < tiles.length; k++) tocc[k] = (tiles[k] === WALL || tiles[k] === VOID || tiles[k] === OUT) ? 1 : 0;
  const outsideC = document.createElement('canvas'); outsideC.width = W; outsideC.height = H;
  {
    const oc = outsideC.getContext('2d'); oc.fillStyle = '#000';
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (tiles[ti(x, y)] === OUT) oc.fillRect(x * T, y * T, T, T);
  }

  function doorAt(x, y) { const k = tdoor[ti(x >> 3, y >> 3)]; return k >= 0 ? doors[k] : null; }
  function walkable(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H || solid[y * W + x]) return false;
    const d = doorAt(x, y);
    if (d) return d.anim > 0.85;
    // o painel de uma porta horizontal fechada invade 6px a linha de baixo
    const u = doorAt(x, y - 6);
    if (u && u.horiz && u.anim < 0.85) return false;
    return true;
  }
  function occludes(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const k = ti(x >> 3, y >> 3);
    if (tocc[k]) return true;
    const di = tdoor[k];
    return di >= 0 && doors[di].anim < 0.5;
  }

  // ---------- desenho dinâmico: portas, telas, letreiros ----------
  const SCR = ['#40c0ff', '#ff60c0', '#60ff90', '#ffd84f', '#ff7a40', '#c070ff'];
  function drawScreen(ctx, o, t, on) {
    const [x, y, w, h] = o.screen;
    if (!on) { ctx.fillStyle = '#0c1218'; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(160,200,255,0.12)'; ctx.fillRect(x + 1, y + 1, 2, 1); return; }
    const c = o.c.scr, s = o.seed;
    if (o.playT > 0) { ctx.fillStyle = Math.floor(t * 12) % 2 ? '#ffffff' : c; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#000'; ctx.fillRect(x + 1, y + 2, w - 2, 1); ctx.fillRect(x + 2, y + 4, w - 4, 1); return; }
    ctx.fillStyle = shade(c, 0.25); ctx.fillRect(x, y, w, h);
    const k = Math.floor(t * 6 + s) % 40;
    ctx.fillStyle = c;
    switch (o.game) {
      case 0: for (let i = 0; i < w; i++) { const hh = 1 + ((Math.sin(i * 1.7 + t * 4 + s) + 1) * (h - 2) / 2 | 0); ctx.fillRect(x + i, y + h - hh, 1, hh); } break;
      case 1: ctx.fillRect(x + ((t * 9 + s) % w | 0), y + 2, 2, 2); ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); break;
      case 2: for (let i = 0; i < 4; i++) ctx.fillRect(x + ((i * 3 + t * 5 + s) % w | 0), y + ((i * 5 + t * 3) % h | 0), 1, 1); break;
      case 3: if (k % 10 < 6) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, y + 2, w - 2, 1); ctx.fillRect(x + 2, y + 4, w - 4, 1); } break;
      case 4: ctx.fillRect(x + 1, y + 1, 2, h - 2); ctx.fillRect(x + w - 3, y + 1, 2, h - 2); ctx.fillStyle = '#fff'; ctx.fillRect(x + 1 + ((t * 7 + s) % (w - 2) | 0), y + ((t * 5) % h | 0), 1, 1); break;
      default: ctx.fillRect(x + (k % w), y + ((k >> 2) % h), 3, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w, 1);
  }
  function drawDoor(ctx, d) {
    const a = d.anim;
    if (d.type === 'arch') {
      if (!d.neon) return;
      ctx.fillStyle = d.neon;
      if (d.horiz) { ctx.fillRect(d.x - 1, d.y, 1, T); ctx.fillRect(d.x + d.w, d.y, 1, T); ctx.globalAlpha = 0.5; ctx.fillRect(d.x, d.y, d.w, 1); ctx.globalAlpha = 1; }
      else { ctx.fillRect(d.x, d.y - 1, T, 1); ctx.fillRect(d.x, d.y + d.h, T, 1); }
      return;
    }
    const sec = d.type === 'security', exit = d.type === 'exit';
    const col = sec ? '#6a6e78' : exit ? '#5a7a9a' : '#7a4e30', lite = sec ? '#9aa0aa' : exit ? '#a8d0f0' : '#9a6a44', dark = sec ? '#3a3e48' : exit ? '#2a3a4a' : '#4a2c1a';
    if (d.horiz) {
      const hh = 15;
      const top = d.y - 1;
      if (sec) {
        // persiana de aço que desce
        const ph = Math.round(hh * (1 - a));
        ctx.fillStyle = '#121016'; ctx.fillRect(d.x, top, d.w, hh);
        if (ph > 0) {
          ctx.fillStyle = col; ctx.fillRect(d.x, top, d.w, ph);
          ctx.fillStyle = dark; for (let j = 2; j < ph; j += 3) ctx.fillRect(d.x, top + j, d.w, 1);
          for (let i = 0; i < d.w; i++) if (((i >> 2) % 2) === 0) { ctx.fillStyle = '#e0c030'; ctx.fillRect(d.x + i, top + ph - 2, 1, 2); } else { ctx.fillStyle = '#202020'; ctx.fillRect(d.x + i, top + ph - 2, 1, 2); }
        }
        ctx.fillStyle = '#2a2e36'; ctx.fillRect(d.x - 1, top - 1, 1, hh + 1); ctx.fillRect(d.x + d.w, top - 1, 1, hh + 1);
        return;
      }
      if (exit) {
        ctx.fillStyle = col; ctx.fillRect(d.x, top, d.w, hh);
        ctx.fillStyle = '#9ab8d8'; ctx.globalAlpha = 0.6; ctx.fillRect(d.x + 2, top + 2, d.w / 2 - 3, hh - 4); ctx.fillRect(d.x + d.w / 2 + 1, top + 2, d.w / 2 - 3, hh - 4); ctx.globalAlpha = 1;
        ctx.fillStyle = '#c0c8d0'; ctx.fillRect(d.x + d.w / 2 - 2, top + 6, 1, 3); ctx.fillRect(d.x + d.w / 2 + 1, top + 6, 1, 3);
        return;
      }
      // porta comum: abre deslizando (dupla: para os dois lados)
      ctx.fillStyle = '#0e0b10'; ctx.fillRect(d.x, top, d.w, hh);
      const leaf = (x, w) => { if (w <= 0) return; ctx.fillStyle = col; ctx.fillRect(x, top, w, hh); ctx.fillStyle = lite; ctx.fillRect(x, top, w, 1); ctx.fillStyle = dark; ctx.fillRect(x, top + hh - 1, w, 1); ctx.fillRect(x + 2, top + 3, Math.max(0, w - 4), 1); };
      if (d.double) { const w = Math.round(d.w / 2 * (1 - a)); leaf(d.x, w); leaf(d.x + d.w - w, w); }
      else { const w = Math.round(d.w * (1 - a)); leaf(d.x, w); if (w > 4) { ctx.fillStyle = '#e0c060'; ctx.fillRect(d.x + w - 3, top + 7, 1, 2); } }
      return;
    }
    // porta em parede vertical (vista de cima): uma tábua fina
    if (sec) {
      const ph = Math.round(d.h * (1 - a));
      ctx.fillStyle = '#121016'; ctx.fillRect(d.x + 2, d.y, 4, d.h);
      if (ph > 0) { ctx.fillStyle = col; ctx.fillRect(d.x + 1, d.y, 6, ph); ctx.fillStyle = '#e0c030'; ctx.fillRect(d.x + 1, d.y + ph - 2, 6, 2); ctx.fillStyle = dark; for (let j = 2; j < ph - 2; j += 3) ctx.fillRect(d.x + 1, d.y + j, 6, 1); }
      return;
    }
    ctx.fillStyle = '#0e0b10'; ctx.fillRect(d.x + 2, d.y, 4, d.h);
    if (a < 0.98) {
      // porta girando: comprimento diminui
      const len = Math.round(d.h * (1 - a));
      ctx.fillStyle = col; ctx.fillRect(d.x + 2, d.y, 4, len);
      ctx.fillStyle = lite; ctx.fillRect(d.x + 2, d.y, 1, len);
      ctx.fillStyle = dark; ctx.fillRect(d.x + 5, d.y, 1, len);
      if (len > 8) { ctx.fillStyle = '#e0c060'; ctx.fillRect(d.x + 4, d.y + len - 5, 1, 2); }
    }
    if (a > 0) {
      // folha aberta encostada na parede
      const len = Math.round(d.h * a * 0.9);
      ctx.fillStyle = shade(col, 0.8); ctx.fillRect(d.x + 1, d.y, 6, 2);
      ctx.fillStyle = col; ctx.fillRect(d.x + 6, d.y + 1, Math.min(len, 10), 2);
    }
  }
  function drawDynamic(ctx, cx0, cy0, vw, vh, t, st) {
    ctx.save(); ctx.translate(-cx0, -cy0);
    for (const o of cabinets) {
      if (!o.screen || o.x > cx0 + vw || o.x + o.w < cx0 || o.y > cy0 + vh || o.y + o.h < cy0) continue;
      drawScreen(ctx, o, t, st.powered || o.playT > 0);
      const [mx, my, mw, mh] = o.marquee;
      ctx.fillStyle = st.powered ? o.c.mq : shade(o.c.mq, 0.35); ctx.fillRect(mx, my, mw, mh);
    }
    for (const o of objects) {
      if (o.kind === 'desk' && o.monitors) o.monitors.forEach(([x, y, w, h], i) => { ctx.fillStyle = st.powered ? (st.camOn && i === 1 ? '#5aff9a' : '#1a4a3a') : '#0a1018'; ctx.fillRect(x, y, w, h); if (st.powered) { ctx.fillStyle = '#8affc0'; ctx.fillRect(x + 1, y + 1 + ((t * 4 + i) % 6 | 0), w - 2, 1); } });
      if (o.kind === 'gen' && st.gen) { ctx.fillStyle = Math.sin(t * 8) > 0 ? '#40ff60' : '#ffb030'; o.leds.forEach(([x, y]) => ctx.fillRect(x, y, 2, 2)); }
      if (o.kind === 'tv' && st.powered) { const [x, y, w, h] = o.screen; for (let j = 0; j < h; j++) { ctx.fillStyle = `rgba(${150 + Math.random() * 100 | 0},${150 + Math.random() * 100 | 0},${170 + Math.random() * 80 | 0},0.7)`; ctx.fillRect(x, y + j, w, 1); } }
    }
    for (const d of doors) {
      if (d.x > cx0 + vw + 8 || d.x + d.w < cx0 - 8 || d.y > cy0 + vh + 16 || d.y + d.h < cy0 - 16) continue;
      drawDoor(ctx, d);
    }
    ctx.restore();
  }
  // redesenha objetos que ficam na frente do jogador
  function drawFront(ctx, cx0, cy0, px, py, t, st) {
    for (const o of objects) {
      const bottom = o.y + o.h;
      if (bottom <= py) continue;
      if (o.x > px + 8 || o.x + o.w < px - 8 || o.y > py || bottom < py - 22) continue;
      ctx.drawImage(objC, o.x, o.y, o.w, o.h, o.x - cx0, o.y - cy0, o.w, o.h);
      if (o.screen && o.kind === 'cab') { ctx.save(); ctx.translate(-cx0, -cy0); drawScreen(ctx, o, t, st.powered || o.playT > 0); ctx.restore(); }
    }
  }

  // ---------- interações fixas ----------
  const interact = [
    { id: 'gen', r: [1162, 206, 120, 20], label: '[E] dar partida no gerador' },
    { id: 'panel', r: [990, 196, 26, 18], label: '[E] abrir painel elétrico' },
    { id: 'desk', r: [80, 68, 64, 34], label: '[E] sentar na mesa de segurança' },
    { id: 'key', r: [690, 620, 48, 18], label: '[E] pegar a chave' },
    { id: 'secret_in', r: [1252, 254, 30, 22], label: '[E] investigar a marca no chão', to: [1240, 640], msg: 'Uma passagem escondida...' },
    { id: 'secret_out', r: [1228, 608, 34, 14], label: '[E] subir', to: [1266, 248], msg: '' },
    { id: 'crack', r: [1108, 650, 18, 36], label: '[E] examinar rachadura', to: [1186, 670], msg: 'A parede cedeu.' },
    { id: 'crack_back', r: [1176, 650, 16, 36], label: '[E] voltar', to: [1100, 672], msg: '' },
  ];

  // ---------- câmeras (posição na planta = mesma do mundo) ----------
  // x,y = centro da vista | w = largura da vista (altura 16:9) | ix,iy = posição do ícone na planta
  const cameras = [
    { n: 1, name: 'LOBBY', x: 612, y: 644, w: 372 },
    { n: 2, name: 'ARCADE 1', x: 320, y: 204, w: 470 },
    { n: 3, name: 'ARCADE 2', x: 198, y: 386, w: 360 },
    { n: 4, name: 'ARCADE 3', x: 232, y: 592, w: 360 },
    { n: 5, name: 'ARCADE 4', x: 460, y: 420, w: 480 },
    { n: 6, name: 'ARCADE 5', x: 760, y: 404, w: 340 },
    { n: 7, name: 'COZINHA', x: 760, y: 188, w: 450 },
    { n: 8, name: 'PARTY HALL A', x: 1124, y: 100, w: 430 },
    { n: 9, name: 'PARTY HALL B', x: 1056, y: 404, w: 340 },
    { n: 10, name: 'CORREDOR C1', x: 330, y: 74, w: 384, ix: 450, iy: 50 },
    { n: 11, name: 'PORTA C6', x: 72, y: 168, w: 220, ix: 72, iy: 200 },
    { n: 12, name: 'CORREDOR C5', x: 870, y: 524, w: 440, ix: 900, iy: 524 },
    { n: 13, name: 'POWER ROOMS', x: 1124, y: 240, w: 430 },
    { n: 14, name: 'PORÃO', x: 1000, y: 664, w: 300 },
  ];

  return {
    T, W, H, TW, TH, canvas, objCanvas: objC, outsideC, solid, rooms, lights, doors, cabinets, objects, interact, cameras, ROOMS, DOORS,
    spawn: [600, 724], walkable, occludes, doorAt, drawDynamic, drawFront, drawScreen,
    tileAt: (x, y) => tAt(x >> 3, y >> 3), FLOOR, DOOR,
  };
})();
