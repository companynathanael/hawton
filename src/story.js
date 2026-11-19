// Aviso, menu e cutscene da história (família Hawton).
// Cada quadro é pintado em alta resolução e convertido em pixel art
// (redução + paleta própria + dithering), com animação e música.
window.Story = (() => {
  const W = 640, H = 360, PW = 320, PH = 180;
  const FONT = '"Press Start 2P", monospace';
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hi = document.createElement('canvas'); hi.width = W; hi.height = H;
  const h = hi.getContext('2d');
  const lo = document.createElement('canvas'); lo.width = PW; lo.height = PH;
  const l = lo.getContext('2d', { willReadFrequently: true });
  let facadeImg = null;

  // ---------------- utilidades ----------------
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  function rr(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function ell(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); c.fill(); }
  function poly(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }
  function vgrad(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function glow(c, x, y, r, col, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); const [R, G, B] = hex(col); g.addColorStop(0, `rgba(${R},${G},${B},${a})`); g.addColorStop(1, `rgba(${R},${G},${B},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

  // ---------------- paleta + dithering ----------------
  function medianCut(data, n) {
    const px = []; for (let i = 0; i < data.length; i += 16) px.push([data[i], data[i + 1], data[i + 2]]);
    let boxes = [px];
    while (boxes.length < n) {
      let bi = 0, best = -1, ch = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let mn = 255, mx = 0; for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; } if (mx - mn > best) { best = mx - mn; bi = i; ch = c; } } });
      if (best <= 0) break;
      const b = boxes[bi].sort((a, c) => a[ch] - c[ch]), m = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    return boxes.filter(b => b.length).map(b => { const s = [0, 0, 0]; for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map(v => Math.round(v / b.length)); });
  }
  function makeLUT(pal) {
    const lut = new Uint8Array(32768);
    for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
      const R = r * 8 + 4, G = g * 8 + 4, B = b * 8 + 4; let bi = 0, bd = 1e9;
      for (let i = 0; i < pal.length; i++) { const p = pal[i], d = (p[0] - R) ** 2 * 0.3 + (p[1] - G) ** 2 * 0.59 + (p[2] - B) ** 2 * 0.11; if (d < bd) { bd = d; bi = i; } }
      lut[(r << 10) | (g << 5) | b] = bi;
    }
    return lut;
  }
  // converte o quadro em alta resolução para pixel art
  function pixelize(shot, fade) {
    l.imageSmoothingEnabled = true; l.imageSmoothingQuality = 'high';
    l.clearRect(0, 0, PW, PH); l.drawImage(hi, 0, 0, PW, PH);
    const id = l.getImageData(0, 0, PW, PH), d = id.data;
    if (!shot.pal) {
      const base = medianCut(d, shot.colors || 20).concat((shot.accents || []).map(hex), [[0, 0, 0], [8, 6, 14]]);
      shot.pal = base; shot.lut = makeLUT(base);
    }
    const pal = shot.pal, lut = shot.lut, sp = shot.dither ?? 20;
    if (shot.vhs) for (let i = 0; i < d.length; i += 4) { const lu = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = d[i] * 0.6 + lu * 0.52; d[i + 1] = d[i + 1] * 0.6 + lu * 0.42; d[i + 2] = d[i + 2] * 0.6 + lu * 0.28; }
    for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i += 4) {
      const t = ((BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * sp;
      const r = clamp(d[i] * fade + t, 0, 255) >> 3, g = clamp(d[i + 1] * fade + t, 0, 255) >> 3, b = clamp(d[i + 2] * fade + t, 0, 255) >> 3;
      const p = pal[lut[(r << 10) | (g << 5) | b]];
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
    }
    l.putImageData(id, 0, 0);
    if (shot.vhs) { // faixa de tracking da fita
      const by = Math.floor((performance.now() / 18) % (PH + 30)) - 15;
      for (let y = by; y < by + 6; y++) if (y >= 0 && y < PH) { const row = l.getImageData(0, y, PW, 1); l.putImageData(row, Math.round((Math.random() - 0.5) * 6), y); l.fillStyle = 'rgba(255,255,255,0.12)'; l.fillRect(0, y, PW, 1); }
    }
  }

  // ---------------- personagens ----------------
  const GREG = { skin: '#e8b48c', hair: '#5a3418', style: 'messy', top: '#c8302e', hood: true, pants: '#2a3a6a', shoes: '#d8d8e0' };
  const JOE_Y = { skin: '#e8b48c', hair: '#4a3020', style: 'short', top: '#ece6d8', tie: '#2a4a8a', pants: '#3a3a44', shoes: '#2a2228', glasses: true, mustache: true };
  const JOE = { skin: '#e2ac88', hair: '#9a9aa4', style: 'bald', top: '#e8e4d8', coat: '#3e4a66', tie: '#7a2222', pants: '#34343e', shoes: '#22202a', glasses: true, mustache: true };
  const MOM = { skin: '#f0c8a0', hair: '#a8582a', style: 'long', top: '#5a8ac0', pants: '#4a4a5a', shoes: '#3a2a2a', lips: true };

  // corpo inteiro: x = centro, y = pés, hh = altura. light = {x, y, col}
  function figure(c, o, x, y, hh, pose = 'idle', light = null, opts = {}) {
    const L = layer(), q = L.getContext('2d'), u = hh / 100, f = opts.flip ? -1 : 1;
    q.translate(x, y); q.scale(f, 1);
    const sk = o.skin, top = o.top;
    // pernas
    const step = opts.step || 0;
    q.fillStyle = o.pants; rr(q, -10 * u + step * u, -46 * u, 9 * u, 44 * u, 3 * u); q.fill(); rr(q, 1 * u - step * u, -46 * u, 9 * u, 44 * u, 3 * u); q.fill();
    ell(q, -6 * u + step * u, -2 * u, 7 * u, 3.4 * u, o.shoes); ell(q, 6 * u - step * u, -2 * u, 7 * u, 3.4 * u, o.shoes);
    // braço de trás
    const arm = (side, ang, len = 36, bend = 0) => {
      q.save(); q.translate(side * 13 * u, -78 * u); q.rotate(ang);
      q.fillStyle = o.coat || top; rr(q, -4.5 * u, 0, 9 * u, len * 0.55 * u, 4 * u); q.fill();
      q.translate(0, len * 0.5 * u); q.rotate(bend);
      q.fillStyle = o.coat || top; rr(q, -4 * u, 0, 8 * u, len * 0.45 * u, 4 * u); q.fill();
      ell(q, 0, len * 0.47 * u, 4.2 * u, 4.6 * u, sk);
      q.restore();
    };
    if (pose === 'wave') arm(-1, 0.12); else if (pose === 'point') arm(-1, 0.08); else if (pose === 'hold') arm(-1, -0.6, 34, -1.6); else if (pose === 'phone') arm(-1, -0.25, 34, -1.9); else if (pose === 'scissors') arm(-1, -0.4, 34, -1.2); else arm(-1, 0.1);
    // tronco
    q.fillStyle = top; rr(q, -15 * u, -82 * u, 30 * u, 40 * u, 7 * u); q.fill();
    if (o.coat) { q.fillStyle = o.coat; rr(q, -15 * u, -82 * u, 11 * u, 42 * u, 6 * u); q.fill(); rr(q, 4 * u, -82 * u, 11 * u, 42 * u, 6 * u); q.fill(); }
    if (o.tie) poly(q, [-2 * u, -80 * u, 2 * u, -80 * u, 3 * u, -58 * u, 0, -54 * u, -3 * u, -58 * u], o.tie);
    if (o.hood) { q.fillStyle = shade(top, 0.75); rr(q, -11 * u, -84 * u, 22 * u, 8 * u, 4 * u); q.fill(); q.fillStyle = '#eeeeee'; q.fillRect(-5 * u, -76 * u, 1.4 * u, 12 * u); q.fillRect(4 * u, -76 * u, 1.4 * u, 12 * u); q.fillStyle = shade(top, 0.8); rr(q, -9 * u, -60 * u, 18 * u, 10 * u, 3 * u); q.fill(); }
    // pescoço e cabeça
    q.fillStyle = shade(sk, 0.8); q.fillRect(-4 * u, -88 * u, 8 * u, 8 * u);
    ell(q, 0, -97 * u, 10 * u, 12 * u, sk);
    ell(q, -10 * u, -96 * u, 2.4 * u, 3.4 * u, sk); ell(q, 10 * u, -96 * u, 2.4 * u, 3.4 * u, sk);
    // rosto
    const ey = -98 * u;
    q.fillStyle = '#1a1018';
    if (!opts.back) {
      q.fillRect(-5.5 * u, ey, 2.6 * u, 3 * u); q.fillRect(3 * u, ey, 2.6 * u, 3 * u);
      if (opts.angry) { q.fillRect(-7 * u, ey - 3.5 * u, 6 * u, 1.6 * u); q.fillRect(1 * u, ey - 3.5 * u, 6 * u, 1.6 * u); q.fillStyle = '#5a1a1a'; q.fillRect(-4 * u, -89 * u, 8 * u, 2.4 * u); }
      else if (opts.sad) { q.fillRect(-6 * u, ey - 3 * u, 5 * u, 1.2 * u); q.fillRect(1 * u, ey - 3 * u, 5 * u, 1.2 * u); q.fillStyle = '#6a3a3a'; q.fillRect(-3 * u, -89 * u, 6 * u, 1.2 * u); }
      else { q.fillStyle = '#8a3a3a'; q.fillRect(-4 * u, -90 * u, 8 * u, 1.6 * u); }
      if (o.glasses) { q.strokeStyle = '#2a2a30'; q.lineWidth = 1.4 * u; q.strokeRect(-8 * u, ey - 1.5 * u, 7 * u, 5.5 * u); q.strokeRect(1 * u, ey - 1.5 * u, 7 * u, 5.5 * u); q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(-7 * u, ey - u, 2 * u, u); }
      if (o.mustache) poly(q, [-6 * u, -92 * u, 6 * u, -92 * u, 5 * u, -89.5 * u, -5 * u, -89.5 * u], o.style === 'bald' ? '#c8c8d0' : o.hair);
      if (o.lips) { q.fillStyle = '#c84a5a'; q.fillRect(-3 * u, -90 * u, 6 * u, 1.6 * u); }
    }
    // cabelo
    const hc = o.hair;
    if (o.style === 'long') { ell(q, 0, -104 * u, 11.5 * u, 8 * u, hc); q.fillStyle = hc; rr(q, -12 * u, -104 * u, 6 * u, 30 * u, 3 * u); q.fill(); rr(q, 6 * u, -104 * u, 6 * u, 30 * u, 3 * u); q.fill(); }
    else if (o.style === 'bald') { ell(q, -9 * u, -97 * u, 2.5 * u, 6 * u, hc); ell(q, 9 * u, -97 * u, 2.5 * u, 6 * u, hc); }
    else if (o.style === 'messy') { ell(q, 0, -105 * u, 11 * u, 7.5 * u, hc); for (let i = 0; i < 7; i++) poly(q, [(-10 + i * 3.3) * u, -108 * u, (-8 + i * 3.3) * u, (-116 + (i % 2) * 3) * u, (-6 + i * 3.3) * u, -107 * u], hc); poly(q, [-10 * u, -104 * u, -2 * u, -104 * u, -8 * u, -98 * u], hc); }
    else { ell(q, 0, -105 * u, 10.5 * u, 6.5 * u, hc); q.fillStyle = hc; q.fillRect(-10.5 * u, -105 * u, 3 * u, 6 * u); q.fillRect(7.5 * u, -105 * u, 3 * u, 6 * u); }
    if (opts.back) { ell(q, 0, -98 * u, 10 * u, 10 * u, hc); }
    // braço da frente
    if (pose === 'wave') arm(1, -2.6, 36, 0.5); else if (pose === 'point') arm(1, -1.45, 40, 0.05); else if (pose === 'hold') arm(1, 0.6, 34, 1.6); else if (pose === 'phone') arm(1, 0.25, 34, 1.9); else if (pose === 'scissors') arm(1, -1.2, 36, 0.4); else if (pose === 'bag') { arm(1, 0.05); } else arm(1, -0.1);
    if (pose === 'hold') { ell(q, 0, -62 * u, 12 * u, 8 * u, '#f4f0ff'); ell(q, -6 * u, -66 * u, 5 * u, 5 * u, '#f0c8a0'); }
    if (pose === 'phone') { q.fillStyle = '#14141c'; rr(q, -4 * u, -66 * u, 8 * u, 12 * u, 1.5 * u); q.fill(); q.fillStyle = '#8ae0ff'; q.fillRect(-3 * u, -65 * u, 6 * u, 9 * u); }
    if (pose === 'bag') { q.fillStyle = '#5a3a22'; rr(q, (opts.back ? -11 : 9) * u, -80 * u, 10 * u, 22 * u, 3 * u); q.fill(); }
    if (pose === 'scissors') { q.strokeStyle = '#c8c8d0'; q.lineWidth = 1.5 * u; q.beginPath(); q.moveTo(30 * u, -112 * u); q.lineTo(38 * u, -122 * u); q.moveTo(30 * u, -112 * u); q.lineTo(40 * u, -116 * u); q.stroke(); }
    q.setTransform(1, 0, 0, 1, 0, 0);
    // sombra no lado oposto à luz + luz de recorte
    if (opts.sil) { q.globalCompositeOperation = 'source-atop'; q.fillStyle = opts.sil; q.fillRect(0, 0, W, H); }
    else if (light) {
      const dx = light.x - x, dir = dx >= 0 ? 1 : -1;
      q.globalCompositeOperation = 'source-atop';
      const g = q.createLinearGradient(x - dir * hh * 0.18, 0, x + dir * hh * 0.12, 0);
      g.addColorStop(0, `rgba(8,4,18,${light.dark ?? 0.62})`); g.addColorStop(1, 'rgba(8,4,18,0)');
      q.fillStyle = g; q.fillRect(0, 0, W, H);
      const [R, G, B] = hex(light.col);
      const g2 = q.createLinearGradient(x - dir * hh * 0.1, 0, x + dir * hh * 0.2, 0);
      g2.addColorStop(0, `rgba(${R},${G},${B},0)`); g2.addColorStop(1, `rgba(${R},${G},${B},${light.amt ?? 0.35})`);
      q.fillStyle = g2; q.fillRect(0, 0, W, H);
      if (light.back) { q.fillStyle = `rgba(28,8,30,${light.back})`; q.fillRect(0, 0, W, H); }
    }
    q.globalCompositeOperation = 'source-over';
    if (light && light.rim) {
      const S = layer(), sq = S.getContext('2d'); sq.drawImage(L, 0, 0); sq.globalCompositeOperation = 'source-in'; sq.fillStyle = light.rim; sq.fillRect(0, 0, W, H);
      const dx = Math.sign(light.x - x) * Math.max(1.5, hh / 70), dy = Math.sign(light.y - (y - hh / 2)) * Math.max(1, hh / 120);
      c.drawImage(S, dx, dy);
    }
    c.drawImage(L, 0, 0);
  }
  function shade(col, k) { const [r, g, b] = hex(col); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; }

  // ---------------- elementos de cenário ----------------
  function palm(c, x, y, hh, col, t = 0) {
    c.strokeStyle = col; c.lineWidth = hh * 0.05; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + hh * 0.12, y - hh * 0.5, x + hh * 0.05, y - hh); c.stroke();
    const tx = x + hh * 0.05, ty = y - hh;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI + i * Math.PI / 7 + Math.sin(t * 1.3 + i) * 0.04;
      c.lineWidth = hh * 0.035; c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + Math.cos(a) * hh * 0.25, ty + Math.sin(a) * hh * 0.18 - hh * 0.05, tx + Math.cos(a) * hh * 0.42, ty + Math.sin(a) * hh * 0.2 + hh * 0.12);
      c.stroke();
    }
  }
  function rain(c, t, n, col = 'rgba(170,190,240,0.45)', ang = 0.18, len = 16) {
    c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i < n; i++) {
      const sx = (i * 97.13) % W, sp = 500 + (i * 37) % 300, y = ((i * 53.7) + t * sp) % (H + 40) - 20, x = (sx + y * ang) % W;
      c.moveTo(x, y); c.lineTo(x + len * ang, y + len);
    }
    c.stroke();
  }
  function bricks(c, x0, y0, w, hh, a, b) {
    c.fillStyle = a; c.fillRect(x0, y0, w, hh); c.fillStyle = b;
    for (let y = y0; y < y0 + hh; y += 10) { c.fillRect(x0, y, w, 2); for (let x = x0 + ((y - y0) / 10 % 2) * 12; x < x0 + w; x += 24) c.fillRect(x, y, 2, 10); }
  }

  // ---------------- quadros ----------------
  const SHOTS = [
    { // 1. Califórnia, 1986
      dur: 9, tag: 'CALIFORNIA, 1986', vhs: '11/03/1986', cues: [[0.1, () => Sfx.tape()]], text: 'Greg Hawton nasceu na Califórnia.', accents: ['#ffe890', '#ff8a5a'],
      draw(c, t) {
        const p = ease(t / 9), pan = -20 * p;
        c.fillStyle = vgrad(c, 0, H, ['#2a1650', '#7a2a6a', '#e0605a', '#ffa860', '#ffd98a']); c.fillRect(0, 0, W, H);
        glow(c, 330, 228, 160, '#ffcf7a', 0.55);
        ell(c, 330, 232, 52, 52, '#ffe39a'); for (let i = 0; i < 5; i++) { c.fillStyle = '#ffa860'; c.fillRect(270, 236 + i * 9, 120, 2 + i); }
        c.save(); c.translate(pan, 0);
        // nuvens
        for (const [x, y, w] of [[60, 70, 120], [420, 52, 160], [560, 110, 90]]) { ell(c, x + t * 3, y, w / 2, 10, '#ff9a8a'); ell(c, x + t * 3 + w * 0.15, y - 8, w / 3, 9, '#ffb8a0'); ell(c, x + t * 3, y + 6, w / 2.2, 5, '#c8607a'); }
        // pássaros
        c.strokeStyle = '#3a1a3a'; c.lineWidth = 2;
        for (let i = 0; i < 5; i++) { const bx = 120 + i * 26 + t * 20, by = 90 + Math.sin(i * 2) * 12, w = Math.sin(t * 8 + i) * 4; c.beginPath(); c.moveTo(bx - 6, by - w); c.lineTo(bx, by); c.lineTo(bx + 6, by - w); c.stroke(); }
        // morros e casa
        c.fillStyle = '#5a2a5a'; c.beginPath(); c.moveTo(-40, 250); for (let x = -40; x <= 700; x += 20) c.lineTo(x, 240 - Math.sin(x / 70) * 14); c.lineTo(700, 360); c.lineTo(-40, 360); c.fill();
        c.fillStyle = '#2a1430'; c.fillRect(-40, 262, 760, 100);
        // casa (contraluz)
        c.fillStyle = '#3a1e3a'; c.fillRect(170, 190, 220, 80); poly(c, [156, 192, 280, 150, 404, 192], '#2a1430');
        c.fillStyle = '#ffd98a'; c.fillRect(196, 214, 34, 26); c.fillRect(330, 214, 34, 26); c.fillStyle = '#ffb860'; c.fillRect(196, 214, 34, 6); c.fillRect(330, 214, 34, 6);
        c.fillStyle = '#2a1430'; c.fillRect(212, 214, 2, 26); c.fillRect(346, 214, 2, 26);
        c.fillStyle = '#1e0e22'; c.fillRect(266, 220, 30, 50); glow(c, 213, 227, 40, '#ffd070', 0.3); glow(c, 347, 227, 40, '#ffd070', 0.3);
        // cerca
        c.fillStyle = '#1e0e22'; for (let x = 0; x < 160; x += 12) { c.fillRect(x, 246, 7, 26); poly(c, [x, 246, x + 3.5, 240, x + 7, 246], '#1e0e22'); } c.fillRect(0, 254, 160, 3);
        palm(c, 70, 280, 170, '#1a0a1e', t); palm(c, 560, 286, 200, '#1a0a1e', t + 1); palm(c, 500, 290, 120, '#24102a', t + 2);
        c.restore();
        const lt = { x: 330, y: 230, col: '#ffcf7a', rim: '#ffb860', amt: 0.1, dark: 0.5, back: 0.62 };
        figure(c, JOE_Y, 288 + pan, 330, 120, 'idle', lt);
        figure(c, MOM, 338 + pan, 332, 112, 'hold', lt);
        c.fillStyle = 'rgba(20,6,26,0.55)'; c.fillRect(0, 300, W, 60);
      },
    },
    { // 2. Joe, o engenheiro
      dur: 9, tag: 'ANOS 80', vhs: '02/09/1987', cues: [[0.3, () => Sfx.zap()], [3, () => Sfx.zap()], [6, () => Sfx.zap()]], text: 'Filho de Joe Hawton, um dos maiores engenheiros dos Estados Unidos.', accents: ['#ffe38a', '#ff9a3a', '#7ad8ff'], dither: 22,
      draw(c, t) {
        c.fillStyle = '#0a0812'; c.fillRect(0, 0, W, H);
        const fl = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
        // parede e projetos
        c.fillStyle = '#16121e'; c.fillRect(0, 0, W, 250);
        c.fillStyle = '#122a4a'; c.fillRect(40, 40, 200, 130); c.strokeStyle = '#5a9ad8'; c.lineWidth = 2;
        c.strokeRect(60, 56, 54, 98); c.strokeRect(68, 66, 38, 28); c.strokeRect(70, 104, 34, 14);
        c.beginPath(); for (let x = 0; x < 90; x++) { const y = 80 + Math.sin(x / 7) * 10; x ? c.lineTo(130 + x, y) : c.moveTo(130, y); } c.stroke();
        c.beginPath(); c.moveTo(130, 116); c.lineTo(220, 116); c.moveTo(130, 130); c.lineTo(200, 130); c.moveTo(130, 144); c.lineTo(214, 144); c.stroke();
        c.fillStyle = '#9ac8ff'; c.font = `bold 14px ${FONT}`; c.fillText('HA-1', 136, 104);
        // painel de ferramentas
        c.fillStyle = '#3a2a1e'; c.fillRect(380, 40, 220, 120);
        for (let i = 0; i < 9; i++) { c.fillStyle = ['#9a9aa2', '#c8a040', '#c83a3a', '#7a7a82', '#2a6ac8'][i % 5]; c.fillRect(396 + i * 22, 56, 6, 40 + (i % 3) * 10); }
        // bancada
        c.fillStyle = '#4a3220'; c.fillRect(0, 250, W, 110); c.fillStyle = '#6a4a2e'; c.fillRect(0, 250, W, 8);
        // fliperama em construção
        c.fillStyle = '#22222e'; c.fillRect(420, 120, 90, 132); c.fillStyle = '#ff4fd0'; c.fillRect(428, 128, 74, 18);
        c.fillStyle = '#05070a'; c.fillRect(432, 154, 66, 48);
        const sc = Math.floor(t * 4) % 3; c.fillStyle = ['#3ac8ff', '#5aff8a', '#ffd23a'][sc]; c.fillRect(436, 158, 58, 40);
        c.fillStyle = '#0a1018'; for (let i = 0; i < 6; i++) c.fillRect(442 + i * 9, 172 + (i % 2) * 8, 5, 5);
        c.fillStyle = '#4a4a5a'; c.fillRect(428, 206, 74, 16);
        for (let i = 0; i < 8; i++) { c.strokeStyle = ['#ff4a4a', '#ffd84f', '#4aa8ff'][i % 3]; c.lineWidth = 2; c.beginPath(); c.moveTo(510, 150 + i * 8); c.quadraticCurveTo(540, 170 + i * 10, 520 + i * 6, 250); c.stroke(); }
        glow(c, 465, 178, 80, '#3ac8ff', 0.25);
        // Joe trabalhando (de lado)
        figure(c, JOE_Y, 300, 300, 150, 'scissors', { x: 360, y: 150, col: '#ffcf7a', rim: '#ffe0a0', amt: 0.3, dark: 0.75 }, { flip: false });
        // lâmpada
        c.fillStyle = '#2a2a30'; c.fillRect(358, 0, 3, 70); poly(c, [336, 70, 382, 70, 372, 50, 346, 50], '#3a3a44');
        glow(c, 360, 80, 260 * fl, '#ffcf7a', 0.45 * fl);
        // faíscas do ferro de solda
        for (let i = 0; i < 14; i++) {
          const k = (t * 1.7 + i * 0.137) % 1, a = -1.2 + (i * 0.7) % 2.4;
          const sx = 342 + Math.cos(a) * k * 50, sy = 214 + Math.sin(a) * k * 40 + k * k * 60;
          c.fillStyle = k < 0.5 ? '#fff4c0' : '#ffa030'; c.fillRect(sx, sy, 3, 3);
        }
        glow(c, 342, 214, 30, '#fff0a0', 0.5 * (0.6 + 0.4 * Math.sin(t * 30)));
        // fumaça
        for (let i = 0; i < 5; i++) { const k = (t * 0.3 + i * 0.2) % 1; ell(c, 344 + Math.sin(k * 6 + i) * 10, 200 - k * 120, 10 + k * 20, 6 + k * 10, `rgba(200,190,180,${0.12 * (1 - k)})`); }
        const v = c.createRadialGradient(360, 180, 120, 360, 180, 420); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.8)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
      },
    },
    { // 3. Inauguração: o show no palco
      dur: 10, tag: '', vhs: '04/22/1989', text: 'Nos anos 80, Joe fundou a Hawton Arcade. As crianças amavam o show.', accents: ['#ff4fd0', '#ffe060', '#ffffff', '#e8c040'], colors: 22,
      cues: [[0.2, () => Sfx.crowd(4, 0.9)], [5, () => Sfx.crowd(3, 0.7)]],
      draw(c, t) {
        const art = window.AnimArt;
        // cortinas vermelhas com dobras
        c.fillStyle = '#2a0610'; c.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 24) { const g = c.createLinearGradient(x, 0, x + 24, 0); g.addColorStop(0, '#5a0e1e'); g.addColorStop(0.5, '#a8203a'); g.addColorStop(1, '#4a0a18'); c.fillStyle = g; c.fillRect(x, 0, 24, 250); }
        for (let x = 0; x < W; x += 48) poly(c, [x, 0, x + 48, 0, x + 24, 30 + Math.sin(x) * 4], '#7a1428');
        c.fillStyle = '#d8a830'; c.fillRect(0, 26, W, 4);
        // letreiro sobre o palco
        const on = Math.sin(t * 9) > -0.8;
        c.fillStyle = '#12040c'; rr(c, 170, 38, 300, 46, 8); c.fill(); c.strokeStyle = '#ff4fd0'; c.lineWidth = 2; rr(c, 172, 40, 296, 42, 7); c.stroke();
        c.font = `20px ${FONT}`; c.textAlign = 'center'; c.shadowColor = '#ff4fd0'; c.shadowBlur = on ? 16 : 2; c.fillStyle = on ? '#ffd0f4' : '#7a2a6a'; c.fillText('HAWTON SHOW', 320, 64); c.shadowBlur = 0; c.textAlign = 'left';
        for (let i = 0; i < 20; i++) ell(c, 120 + i * 21, 76, 3, 3, (Math.floor(t * 6) + i) % 2 ? '#ffe060' : '#6a4a10');
        // palco
        c.fillStyle = '#6a3a1a'; c.fillRect(40, 236, 560, 20); for (let x = 40; x < 600; x += 16) c.fillRect(x, 236, 1, 20);
        c.fillStyle = '#8a5428'; c.fillRect(40, 232, 560, 5); c.fillStyle = '#3a1e0c'; c.fillRect(40, 256, 560, 6);
        // holofotes
        for (const [x, col] of [[200, '#ffe8a0'], [320, '#ffd0f4'], [440, '#a0e8ff']]) {
          const sw = Math.sin(t * 1.3 + x) * 20;
          c.save(); c.globalAlpha = 0.22; c.fillStyle = col; c.beginPath(); c.moveTo(x - 6 + sw * 0.2, 0); c.lineTo(x + 6 + sw * 0.2, 0); c.lineTo(x + 50 + sw, 236); c.lineTo(x - 50 + sw, 236); c.fill(); c.restore();
          glow(c, x + sw, 232, 60, col, 0.4);
        }
        // a banda (sprites do jogo, ampliados)
        if (art) {
          const S = art.big ? 2 : 4, bob = k => Math.round(Math.abs(Math.sin(t * 4 + k)) * 4), SP = art.big || art.spr;
          const put = (img, x, y, k) => { c.imageSmoothingEnabled = false; c.drawImage(img, x - img.width * S / 2, y - img.height * S - bob(k), img.width * S, img.height * S); };
          c.imageSmoothingEnabled = false; c.drawImage(art.piano, 140, 236 - 18 * 3, 26 * 3, 18 * 3);
          put(SP.hootsy[Math.floor(t * 3) % 2], 210, 236, 0);
          put(SP.raft[Math.floor(t * 4) % 2], 320, 236, 1);
          put(SP.jester[Math.floor(t * 5) % 2], 430, 236, 2);
          put(SP.bongo[Math.floor(t * 6) % 2], 520, 236, 3);
          c.imageSmoothingEnabled = true;
          // notas musicais
          for (let i = 0; i < 6; i++) { const k = (t * 0.5 + i / 6) % 1; c.globalAlpha = 1 - k; c.fillStyle = ['#ffe060', '#ff7ad8', '#7aeaff'][i % 3]; const x = 200 + i * 60 + Math.sin(k * 6 + i) * 12, y = 150 - k * 110; c.fillRect(x, y, 5, 4); c.fillRect(x + 4, y - 12, 2, 13); c.fillRect(x + 4, y - 12, 6, 2); c.globalAlpha = 1; }
        }
        // plateia (cabeças e braços)
        for (let i = 0; i < 24; i++) {
          const x = i * 28 - 4, bob = Math.abs(Math.sin(t * 6 + i * 1.9)) * 6, hh = 52 + (i % 3) * 10;
          ell(c, x, 360 - hh - bob, 12, 13, '#0e0610'); c.fillStyle = '#0e0610'; rr(c, x - 17, 360 - hh + 10 - bob, 34, hh, 10); c.fill();
          if (i % 2) { c.save(); c.translate(x + 12, 360 - hh + 14 - bob); c.rotate(-2.7 + Math.sin(t * 7 + i) * 0.35); c.fillStyle = '#0e0610'; rr(c, -4, 0, 8, 30, 4); c.fill(); c.restore(); }
          if (i % 5 === 2) { ell(c, x, 360 - hh - bob - 24, 7, 7, ['#ff4a5a', '#4aa8ff', '#ffd84f'][i % 3]); c.strokeStyle = '#2a1a2a'; c.beginPath(); c.moveTo(x, 360 - hh - bob - 17); c.lineTo(x + 2, 360 - hh - bob); c.stroke(); }
        }
        for (let i = 0; i < 70; i++) { const k = (t * 0.22 + i * 0.0731) % 1, x = (i * 71.3 + Math.sin(t * 2 + i) * 18) % W, y = k * (H + 20) - 10; c.fillStyle = ['#ff4fd0', '#40e0ff', '#ffe060', '#7aff8a', '#ffffff'][i % 5]; c.save(); c.translate(x, y); c.rotate(t * 4 + i); c.fillRect(-3, -1.5, 6, 3); c.restore(); }
      },
    },
    { // 4. Fechada: recorte de jornal
      dur: 9, tag: '1993', text: 'Até que um dia ela fechou. Ninguém sabe dizer por quê.', accents: ['#e8e0c8', '#1a1418', '#a02020'], colors: 18, dither: 18,
      cues: [[0.1, () => Sfx.rustle()], [4.5, () => Sfx.heartbeat()], [6.2, () => Sfx.heartbeat()]],
      draw(c, t) {
        // mesa escura e luz de abajur
        c.fillStyle = '#140e0c'; c.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y += 7) { c.fillStyle = y % 14 ? '#1c1410' : '#181210'; c.fillRect(0, y, W, 7); }
        const fl = 0.9 + 0.1 * Math.sin(t * 11) * Math.sin(t * 5.3);
        glow(c, 380, 160, 340 * fl, '#ffcf8a', 0.32);
        const z = 1 + t * 0.018;
        c.save(); c.translate(320, 182); c.scale(z, z); c.rotate(-0.05 + t * 0.002);
        // papel
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(-196, -150, 400, 304);
        c.fillStyle = '#d8ceb4'; c.fillRect(-200, -156, 400, 304);
        for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(90,70,40,${(i * 0.37 % 1) * 0.12})`; c.fillRect(-200 + (i * 53) % 400, -156 + (i * 31) % 304, 2, 2); }
        c.fillStyle = '#1a1418'; c.font = `8px ${FONT}`; c.textAlign = 'center'; c.fillText('THE CALIFORNIA HERALD  -  1993', 0, -140);
        c.fillRect(-190, -132, 380, 2); c.fillRect(-190, -128, 380, 1);
        c.font = `16px ${FONT}`; c.fillText('HAWTON ARCADE', 0, -104); c.fillText('FECHA AS PORTAS', 0, -82);
        c.font = `8px ${FONT}`; c.fillStyle = '#4a3a30'; c.fillText('Causa do fechamento nunca foi explicada', 0, -64); c.textAlign = 'left';
        // foto da fachada em preto e branco
        c.fillStyle = '#1a1418'; c.fillRect(-190, -52, 186, 124);
        if (facadeImg) { c.filter = 'grayscale(1) contrast(1.3) brightness(0.8)'; c.drawImage(facadeImg, -187, -49, 180, 118); c.filter = 'none'; }
        c.fillStyle = '#4a3a30'; c.font = `8px ${FONT}`; c.fillText('A fachada em 1993.', -188, 84);
        // colunas de texto
        for (let col = 0; col < 2; col++) for (let ln = 0; ln < 15; ln++) { const w = 80 - ((ln * 7 + col * 3) % 5) * 6; c.fillStyle = '#5a4a40'; c.fillRect(8 + col * 94, -50 + ln * 8, w, 3); }
        // carimbo vermelho
        c.save(); c.translate(110, 96); c.rotate(-0.2); c.strokeStyle = '#a02020'; c.lineWidth = 3; c.strokeRect(-56, -14, 112, 28); c.fillStyle = '#a02020'; c.font = `10px ${FONT}`; c.textAlign = 'center'; c.fillText('FECHADO', 0, 5); c.restore();
        // mancha de café
        c.strokeStyle = 'rgba(90,50,20,0.35)'; c.lineWidth = 5; c.beginPath(); c.arc(150, -110, 26, 0.3, 5.6); c.stroke();
        c.restore();
        const v = c.createRadialGradient(360, 170, 120, 360, 170, 430); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
      },
    },
    { // 5. Greg no celular (close)
      dur: 8, tag: 'HOJE', cues: [[1.5, () => Sfx.ding(3)], [3.5, () => Sfx.ding(4)], [5.5, () => Sfx.ding(3)]], text: 'Hoje, Greg passa o dia inteiro no celular.', accents: ['#8ae8ff', '#c8302e'], dither: 24,
      draw(c, t) {
        c.fillStyle = '#05060e'; c.fillRect(0, 0, W, H);
        // janela ao fundo
        c.fillStyle = '#0e1630'; c.fillRect(60, 40, 150, 120); c.fillStyle = '#1a2a50'; c.fillRect(66, 46, 66, 108); c.fillRect(138, 46, 66, 108);
        ell(c, 170, 80, 16, 16, '#c8d8ff'); glow(c, 170, 80, 60, '#a0b8ff', 0.25);
        for (let i = 0; i < 6; i++) c.fillRect(70 + i * 22, 150 - (i % 3) * 18, 16, 20 + (i % 3) * 18);
        // cama e pôster
        c.fillStyle = '#121626'; c.fillRect(0, 250, W, 110); c.fillStyle = '#1a1e34'; c.fillRect(380, 60, 70, 96);
        const bob = Math.sin(t * 1.6) * 1.5;
        const cx = 360, cy = 172 + bob;
        // ombros (moletom)
        c.fillStyle = '#5a1416'; rr(c, cx - 150, cy + 80, 300, 160, 70); c.fill();
        c.fillStyle = '#7a1a1c'; rr(c, cx - 70, cy + 70, 140, 40, 20); c.fill();
        // pescoço e cabeça
        c.fillStyle = '#5a3a30'; c.fillRect(cx - 24, cy + 40, 48, 50);
        ell(c, cx, cy, 70, 84, '#6a4234');
        ell(c, cx - 70, cy + 6, 12, 20, '#5a3a30'); ell(c, cx + 70, cy + 6, 12, 20, '#4a2e26');
        // luz azul do celular vinda de baixo
        const L = layer(), q = L.getContext('2d'); ell(q, cx, cy, 70, 84, '#fff'); q.globalCompositeOperation = 'source-in';
        const g = q.createLinearGradient(0, cy + 90, 0, cy - 60); g.addColorStop(0, 'rgba(140,230,255,0.95)'); g.addColorStop(0.6, 'rgba(110,190,240,0.4)'); g.addColorStop(1, 'rgba(110,190,240,0)');
        q.fillStyle = g; q.fillRect(0, 0, W, H); c.globalAlpha = 0.85; c.drawImage(L, 0, 0); c.globalAlpha = 1;
        // olhos cansados com reflexo da tela
        for (const s of [-1, 1]) {
          ell(c, cx + s * 27, cy + 2, 15, 8, '#e8f4ff'); ell(c, cx + s * 25, cy + 4, 7, 7, '#1a1420');
          c.fillStyle = '#ffffff'; c.fillRect(cx + s * 25 - 3, cy + 1, 4, 3);
          c.fillStyle = 'rgba(30,20,40,0.6)'; c.fillRect(cx + s * 27 - 15, cy + 12, 30, 4);
          c.fillStyle = '#2a1a14'; c.fillRect(cx + s * 27 - 16, cy - 16 - (s > 0 ? 2 : 0), 32, 6);
        }
        poly(c, [cx - 8, cy + 10, cx + 8, cy + 10, cx + 4, cy + 30, cx - 4, cy + 30], 'rgba(150,210,240,0.5)');
        c.fillStyle = '#3a1a1a'; c.fillRect(cx - 14, cy + 50, 28, 4);
        // cabelo bagunçado
        ell(c, cx, cy - 60, 76, 40, '#2a160a');
        for (let i = 0; i < 11; i++) poly(c, [cx - 80 + i * 15, cy - 50, cx - 70 + i * 15 + Math.sin(i) * 8, cy - 110 + (i % 3) * 10, cx - 60 + i * 15, cy - 52], '#2a160a');
        poly(c, [cx - 76, cy - 40, cx - 20, cy - 52, cx - 64, cy - 6], '#2a160a'); poly(c, [cx + 76, cy - 40, cx + 10, cy - 52, cx + 66, cy - 10], '#2a160a');
        c.fillStyle = 'rgba(140,230,255,0.25)'; c.fillRect(cx - 60, cy - 70, 60, 3);
        // capuz
        c.strokeStyle = '#4a1012'; c.lineWidth = 16; c.beginPath(); c.arc(cx, cy + 20, 96, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
        // mãos e celular
        c.fillStyle = '#8a5a48'; rr(c, cx - 70, 300, 60, 40, 18); c.fill(); rr(c, cx + 10, 300, 60, 40, 18); c.fill();
        c.fillStyle = '#0a0a12'; rr(c, cx - 36, 262, 72, 110, 8); c.fill();
        c.fillStyle = '#7ad8ff'; c.fillRect(cx - 30, 268, 60, 98);
        const sc = Math.floor(t * 2.5) % 3; c.fillStyle = ['#ff4fd0', '#ffe060', '#5aff8a'][sc]; c.fillRect(cx - 24, 276 + ((t * 30) % 40), 48, 20);
        glow(c, cx, 300, 200, '#7ad8ff', 0.35);
        // notificações flutuando
        for (let i = 0; i < 4; i++) { const k = (t * 0.35 + i * 0.25) % 1; c.globalAlpha = 1 - k; c.fillStyle = '#e8f8ff'; rr(c, cx + 90 + i * 8, 260 - k * 120, 56, 14, 4); c.fill(); c.fillStyle = '#ff4a5a'; c.fillRect(cx + 94 + i * 8, 264 - k * 120, 6, 6); c.globalAlpha = 1; }
      },
    },
    { // 6. Joe na porta
      dur: 10, tag: '', speaker: 'JOE', cues: [[0.2, () => Sfx.doorOpen()], [0.6, () => Sfx.slam ? Sfx.slam() : 0]], lines: [[0, 'Sua infância não é uma infância!'], [4.6, 'Vocês são dominados por esse vício fácil! Vai fazer algo da vida!']], accents: ['#ffcf7a', '#8ae8ff'], dither: 24,
      draw(c, t) {
        c.fillStyle = '#06050c'; c.fillRect(0, 0, W, H);
        const push = 1 + t * 0.012; c.save(); c.translate(W / 2, H / 2); c.scale(push, push); c.translate(-W / 2, -H / 2);
        // corredor iluminado atrás da porta
        c.fillStyle = '#1a1210'; c.fillRect(220, 10, 200, 330);
        c.fillStyle = vgrad(c, 10, 340, ['#ffd890', '#e8a050', '#6a3a1a']); c.fillRect(236, 22, 168, 318);
        glow(c, 320, 120, 200, '#ffcf7a', 0.5);
        // batente
        c.fillStyle = '#2a1a12'; c.fillRect(220, 10, 16, 330); c.fillRect(404, 10, 16, 330); c.fillRect(220, 10, 200, 14);
        // Joe em contraluz
        figure(c, JOE, 320, 344, 300, 'point', { x: 320, y: 0, col: '#ffcf7a', rim: '#ffe0a0', amt: 0.0, dark: 0 }, { angry: true, sil: '#120c10', flip: true });
        // brilho dos óculos
        const gl = 0.6 + 0.4 * Math.sin(t * 3);
        c.fillStyle = `rgba(200,240,255,${gl})`; c.fillRect(296, 66, 22, 4); c.fillRect(326, 66, 22, 4);
        // Greg de costas (primeiro plano, desfocado)
        c.restore();
        c.fillStyle = '#0a0608'; ell(c, 110, 380, 150, 120, '#0a0608'); ell(c, 120, 250, 64, 74, '#0c0808');
        for (let i = 0; i < 8; i++) poly(c, [60 + i * 14, 210, 68 + i * 14, 168 + (i % 3) * 8, 76 + i * 14, 210], '#0c0808');
        glow(c, 170, 320, 90, '#7ad8ff', 0.3);
        // luz quente no chão
        poly(c, [236, 340, 404, 340, 520, 360, 120, 360], 'rgba(255,200,120,0.25)');
      },
    },
    { // 7. Janela (sai de casa)
      dur: 9, tag: '', cues: [[0.1, () => Sfx.exterior()], [1.5, () => Sfx.creak()], [5, () => Sfx.thunder()]], text: 'Depois do último aviso, Greg resolve sair...', accents: ['#ffcf7a', '#c8302e', '#d8e8ff'], dither: 28,
      draw(c, t) {
        c.fillStyle = '#0a0c1e'; c.fillRect(0, 0, W, H);
        // parede de tijolos (vista de baixo)
        bricks(c, 0, 0, W, H, '#1a1c34', '#12142a');
        c.fillStyle = 'rgba(10,10,30,0.4)'; c.fillRect(0, 0, W, H);
        // janela em perspectiva
        poly(c, [190, 40, 470, 20, 450, 300, 210, 286], '#2a2a40');
        poly(c, [206, 56, 454, 38, 438, 284, 222, 272], vgrad(c, 38, 284, ['#ffe0a0', '#e8a868', '#8a5a40']));
        glow(c, 330, 150, 220, '#ffcf7a', 0.35);
        // cortina
        poly(c, [206, 56, 260, 52, 250, 180, 236, 276, 222, 272], '#6a2a3a'); poly(c, [454, 38, 410, 42, 420, 200, 438, 284], '#5a2232');
        // Greg pulando a janela
        const k = ease(clamp(t / 7, 0, 1));
        figure(c, GREG, 300 + k * 30, 330 + k * 6, 210, 'bag', { x: 330, y: 60, col: '#ffcf7a', rim: '#ffd890', amt: 0.15, dark: 0.75 }, { step: 5 });
        // parapeito
        poly(c, [190, 286, 470, 298, 480, 318, 180, 304], '#3a3a52'); poly(c, [180, 304, 480, 318, 480, 326, 180, 312], '#22223a');
        // pingentes de gelo / goteiras
        for (let i = 0; i < 12; i++) { const x = 196 + i * 24, y = 310 + i * 1.1; poly(c, [x, y, x + 6, y, x + 3, y + 10 + (i % 3) * 6], '#8a9ab8'); }
        // chuva / neve leve
        rain(c, t, 160, 'rgba(190,210,255,0.5)', 0.1, 10);
        for (let i = 0; i < 50; i++) { const y = (i * 37 + t * 40) % H, x = (i * 61.7 + Math.sin(t + i) * 12) % W; c.fillStyle = 'rgba(220,230,255,0.7)'; c.fillRect(x, y, 3, 3); }
        const v = c.createRadialGradient(330, 160, 140, 330, 160, 420); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,0.85)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
      },
    },
    { // 8. A rua e o neon ao longe
      dur: 10, tag: '', cues: [[4, () => Sfx.thunder()]], text: '...mas não para qualquer lugar. Para o único lugar onde seu pai não queria que ele fosse.', accents: ['#ff4fd0', '#ffe8b0'], dither: 26,
      draw(c, t) {
        c.fillStyle = vgrad(c, 0, 220, ['#04030c', '#0e0a24', '#2a0e3a']); c.fillRect(0, 0, W, H);
        for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(220,220,255,${0.3 + (i % 3) * 0.2})`; c.fillRect((i * 83.1) % W, (i * 41.7) % 160, 2, 2); }
        // brilho rosa no horizonte
        const fl = Math.sin(t * 7) > -0.7 ? 1 : 0.4;
        glow(c, 330, 205, 180, '#ff4fd0', 0.45 * fl);
        // prédios silhueta
        c.fillStyle = '#0a0614';
        for (let i = 0; i < 16; i++) { const x = i * 42 - 10, hh = 40 + ((i * 37) % 70); c.fillRect(x, 215 - hh, 38, hh); for (let k = 0; k < 4; k++) if ((i + k) % 3 === 0) { c.fillStyle = '#ffd890'; c.fillRect(x + 6 + (k % 2) * 16, 220 - hh + 8 + k * 10, 6, 5); c.fillStyle = '#0a0614'; } }
        // letreiro distante
        glow(c, 331, 186, 70, '#ff4fd0', 0.6 * fl); c.fillStyle = '#12061a'; c.fillRect(286, 178, 90, 18); c.strokeStyle = '#ff4fd0'; c.lineWidth = 2; c.strokeRect(287, 179, 88, 16); c.font = `8px ${FONT}`; c.textAlign = 'center'; c.shadowColor = '#ff4fd0'; c.shadowBlur = 10 * fl; c.fillStyle = fl > 0.5 ? '#ffc0f0' : '#6a2a5a'; c.fillText('HAWTON', 331, 192); c.shadowBlur = 0; c.textAlign = 'left';
        // rua em perspectiva molhada
        poly(c, [0, 360, 640, 360, 360, 215, 300, 215], '#14121e');
        c.fillStyle = '#c8b040'; for (let i = 0; i < 10; i++) { const k = ((i / 10) + t * 0.08) % 1, y = 215 + k * k * 150, w = 2 + k * 10; c.fillRect(330 - w / 2, y, w, 2 + k * 10); }
        // reflexo rosa na rua
        c.fillStyle = 'rgba(255,79,208,0.18)'; poly(c, [300, 220, 360, 220, 420, 360, 240, 360], 'rgba(255,79,208,0.15)');
        // postes
        for (let i = 0; i < 5; i++) {
          const k = i / 5, x = 300 - 20 - k * 0 - (1 - k) * 260 * 0, xx = 140 + i * 0;
          const px = 300 - (i + 1) * 46, py = 215 + (i + 1) * 28, ph = 30 + (i + 1) * 26;
          c.fillStyle = '#1a1a24'; c.fillRect(px, py - ph, 3 + i, ph); glow(c, px + 8, py - ph, 30 + i * 12, '#ffe8b0', 0.4);
          c.fillStyle = '#ffe8b0'; c.fillRect(px, py - ph, 10 + i * 2, 3);
          const qx = 360 + (i + 1) * 46; c.fillStyle = '#1a1a24'; c.fillRect(qx, py - ph, 3 + i, ph); glow(c, qx - 6, py - ph, 30 + i * 12, '#ffe8b0', 0.4); c.fillStyle = '#ffe8b0'; c.fillRect(qx - 8 - i * 2, py - ph, 10 + i * 2, 3);
        }
        // Greg andando de costas
        const walk = Math.sin(t * 5);
        figure(c, GREG, 300 + t * 2, 296 - t * 2, 84 - t * 2.5, 'bag', { x: 330, y: 200, col: '#ff4fd0', rim: '#ff9ae8', amt: 0.1, dark: 0.75 }, { back: true, step: walk * 3 });
        rain(c, t, 200, 'rgba(170,190,240,0.4)', 0.15, 14);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, W, 40);
      },
    },
    { // 9. A fachada abandonada
      dur: 10, tag: 'HOJE, 23:47', text: 'Hawton Arcade. Abandonada há 30 anos.', accents: ['#ffd23a', '#ff3a3a', '#fff0d0', '#d8e8ff'], colors: 22, dither: 20,
      cues: [[0.1, () => Sfx.exterior()], [3.2, () => Sfx.thunder()], [6.4, () => Sfx.click()], [7.4, () => Sfx.creak()]],
      draw(c, t) {
        const flash = (t > 3.1 && t < 3.22) || (t > 3.3 && t < 3.36);
        c.fillStyle = vgrad(c, 0, 200, flash ? ['#a8b8e8', '#6a7aa8'] : ['#04030c', '#0e0c22', '#1a1430']); c.fillRect(0, 0, W, H);
        // prédio
        bricks(c, 60, 110, 520, 200, flash ? '#4a3a5a' : '#1e1628', flash ? '#3a2a48' : '#150f1e');
        c.fillStyle = '#0c0812'; c.fillRect(50, 100, 540, 14);
        // letreiro com letras falhando
        c.fillStyle = '#2a0a1a'; rr(c, 120, 30, 400, 76, 10); c.fill(); c.strokeStyle = '#5a1a3a'; c.lineWidth = 3; rr(c, 120, 30, 400, 76, 10); c.stroke();
        c.font = `26px ${FONT}`; c.textAlign = 'left';
        const word = 'HAWTON', word2 = 'ARCADE';
        const dead = [1, 4], flick = (i, ph) => Math.sin(t * 13 + i * 7 + ph) > (dead.includes(i) ? 0.85 : -0.6);
        let x = 168; for (let i = 0; i < word.length; i++) { const on = flick(i, 0); c.shadowColor = '#ffd23a'; c.shadowBlur = on ? 14 : 0; c.fillStyle = on ? '#ffe070' : '#4a3a14'; c.fillText(word[i], x, 70); x += c.measureText(word[i]).width; }
        c.font = `14px ${FONT}`; x = 236; for (let i = 0; i < word2.length; i++) { const on = flick(i, 3); c.shadowColor = '#ff3a3a'; c.shadowBlur = on ? 12 : 0; c.fillStyle = on ? '#ff8a7a' : '#4a1414'; c.fillText(word2[i], x, 96); x += c.measureText(word2[i]).width; }
        c.shadowBlur = 0;
        // janelas com tábuas
        for (const wx of [90, 190, 380, 480]) { c.fillStyle = '#05040a'; c.fillRect(wx, 170, 70, 60); for (let k = 0; k < 3; k++) { c.save(); c.translate(wx + 35, 182 + k * 18); c.rotate((k % 2 ? 1 : -1) * 0.12); c.fillStyle = '#4a3020'; c.fillRect(-40, -5, 80, 10); c.fillStyle = '#2a1a10'; c.fillRect(-40, 3, 80, 2); c.restore(); } }
        // porta que se abre sozinha
        const open = clamp((t - 7.2) / 2, 0, 1);
        c.fillStyle = '#020104'; c.fillRect(282, 196, 76, 114);
        c.fillStyle = '#3a2418'; c.fillRect(282 + open * 30, 196, 38 - open * 30, 114); c.fillRect(320, 196, 38, 114);
        c.fillStyle = '#5a3a24'; c.fillRect(318 + 0, 196, 2, 114);
        // calçada e poças
        c.fillStyle = '#100e18'; c.fillRect(0, 310, W, 50);
        for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(255,210,60,0.12)'; c.fillRect(80 + i * 90, 322 + (i % 2) * 14, 60, 3); }
        // Greg de costas com a lanterna
        const lit = t > 6.4;
        if (lit) { c.save(); c.globalAlpha = 0.25; c.fillStyle = '#fff0c8'; c.beginPath(); c.moveTo(326, 290); c.lineTo(282, 200); c.lineTo(360, 200); c.fill(); c.restore(); glow(c, 320, 250, 60, '#fff0c8', 0.35); }
        figure(c, GREG, 326, 352, 96, 'idle', { x: 320, y: 60, col: '#ffd23a', rim: '#ffd890', amt: 0.1, dark: 0.75 }, { back: true });
        if (flash) { c.fillStyle = 'rgba(220,230,255,0.35)'; c.fillRect(0, 0, W, H); }
        rain(c, t, 260, 'rgba(170,190,240,0.45)', 0.2, 20);
        const v = c.createRadialGradient(320, 200, 140, 320, 200, 420); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
      },
    },
    { // 10. Lá dentro: olhos no escuro
      dur: 11, tag: '', text: '', accents: ['#ffffff', '#ffe060', '#ff6a6a', '#ffd0a0'], colors: 16, dither: 14,
      cues: [[0.2, () => Sfx.interior()], [3, () => Sfx.heartbeat()], [4.6, () => Sfx.heartbeat()], [5.8, () => Sfx.heartbeat()], [6.8, () => Sfx.heartbeat()], [7.6, () => Sfx.heartbeat()], [8.2, () => Sfx.heartbeat()], [8.7, () => Sfx.heartbeat()], [9.4, () => { Sfx.sting(); Sfx.staticBurst(0.6, 1.2); }]],
      draw(c, t) {
        const art = window.AnimArt;
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        // feixe da lanterna varrendo o palco
        const ang = Math.sin(t * 0.55) * 0.9 - 0.1, bx = 320 + Math.sin(ang) * 260;
        c.save(); c.beginPath(); c.moveTo(320, 420); c.lineTo(bx - 70, 120); c.lineTo(bx + 70, 120); c.closePath(); c.clip();
        c.fillStyle = '#2a1a14'; c.fillRect(0, 0, W, H);
        c.fillStyle = '#4a0a18'; for (let x = 0; x < W; x += 24) c.fillRect(x, 0, 12, 230);
        c.fillStyle = '#5a3418'; c.fillRect(0, 230, W, 26);
        if (art) {
          const S = art.big ? 2 : 4, SP = art.big || art.spr; c.imageSmoothingEnabled = false;
          [['hootsy', 120], ['raft', 230], ['jester', 340], ['joly', 450], ['giggles', 540]].forEach(([id, x]) => { const im = SP[id][0]; c.drawImage(im, x - im.width * S / 2, 232 - im.height * S, im.width * S, im.height * S); });
          c.imageSmoothingEnabled = true;
        }
        glow(c, bx, 200, 110, '#fff0c8', 0.35);
        c.restore();
        // poeira no feixe
        for (let i = 0; i < 40; i++) { const k = (i * 0.137 + t * 0.05) % 1, y = 120 + k * 280, x = 320 + (bx - 320) * (1 - (y - 120) / 300) + Math.sin(i * 3 + t) * 40 * (1 - k); c.fillStyle = 'rgba(255,240,210,0.5)'; c.fillRect(x, y, 2, 2); }
        // olhos acendendo um a um
        const EY = [[120, 168, '#ffe060'], [230, 176, '#ffe8a0'], [340, 170, '#ffffff'], [450, 156, '#ffffff'], [540, 170, '#ff6a6a'], [70, 250, '#ffd0a0'], [600, 260, '#ffe060'], [20, 300, '#ff6a6a']];
        EY.forEach(([x, y, col], i) => {
          const on = t > 3 + i * 0.7; if (!on) return;
          const blink = Math.sin(t * 2 + i * 3) > 0.96 ? 0 : 1;
          if (!blink) return;
          glow(c, x - 10, y, 14, col, 0.8); glow(c, x + 10, y, 14, col, 0.8);
          c.fillStyle = col; c.fillRect(x - 12, y - 2, 5, 4); c.fillRect(x + 8, y - 2, 5, 4);
        });
        // susto final: rosto do Jester
        if (t > 9.4 && art) {
          const f = art.face('jester'), k = Math.min(1, (t - 9.4) / 0.15), sc = 3 + k * 2.2;
          c.imageSmoothingEnabled = false; c.drawImage(f, 320 - 40 * sc + (Math.random() - 0.5) * 16, 180 - 40 * sc + (Math.random() - 0.5) * 16, 80 * sc, 80 * sc); c.imageSmoothingEnabled = true;
          c.fillStyle = 'rgba(255,0,0,0.25)'; c.fillRect(0, 0, W, H);
        }
      },
    },
    { // 11. Título
      dur: 5, tag: '', text: '', accents: ['#ff4fd0', '#40e0ff', '#ffffff'], colors: 14, dither: 12,
      cues: [[0.05, () => { Sfx.zap(); Sfx.swell(3); }]],
      draw(c, t) {
        c.fillStyle = '#04020a'; c.fillRect(0, 0, W, H);
        for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(160,120,220,${Math.random() * 0.12})`; c.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
        const on = t > 0.4 && (Math.sin(t * 23) > -0.7 || t > 2.2);
        const gx = t < 1.2 ? (Math.random() - 0.5) * 20 : 0;
        c.font = `40px ${FONT}`; c.textAlign = 'center';
        c.shadowColor = '#ff4fd0'; c.shadowBlur = on ? 24 : 0; c.fillStyle = on ? '#ffd0f4' : '#3a0a2a'; c.fillText('HAWTON', 320 + gx, 168);
        c.shadowColor = '#40e0ff'; c.font = `24px ${FONT}`; c.fillStyle = on ? '#c8f8ff' : '#0a2a3a'; c.fillText('ARCADE', 320 - gx, 210);
        c.shadowBlur = 0; c.textAlign = 'left';
        if (t < 1.2) for (let i = 0; i < 6; i++) { const y = Math.random() * H; const sl = c.getImageData(0, y, W, 6); c.putImageData(sl, (Math.random() - 0.5) * 40, y); }
      },
    },
  ];

  // ---------------- estado ----------------
  const st = { mode: 'off', i: 0, t: 0, total: 0, menuSel: 0, warnT: 0, music: null, done: false, creditsT: 0 };
  function startMusic() {
    try {
      if (!st.music) { st.music = new Audio('assets/story.mp3'); }
      st.music.volume = 0.85; st.music.currentTime = 0; const p = st.music.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  function fadeMusic(to, sec) {
    const m = st.music; if (!m) return;
    const from = m.volume, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / (sec * 1000)); m.volume = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); else if (to === 0) m.pause(); };
    step();
  }

  // ---------------- desenho de texto ----------------
  function text(g, s, x, y, col, size = 8, align = 'left', sh = '#000') {
    g.font = `${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'top';
    if (sh) { g.fillStyle = sh; g.fillText(s, x + 1, y + 1); }
    g.fillStyle = col; g.fillText(s, x, y); g.textAlign = 'left';
  }
  function wrapLines(g, s, maxW, size = 8) {
    g.font = `${size}px ${FONT}`; const out = []; let line = '';
    for (const w of s.split(' ')) { const tt = line ? line + ' ' + w : w; if (g.measureText(tt).width > maxW && line) { out.push(line); line = w; } else line = tt; }
    if (line) out.push(line); return out;
  }
  // caixa de diálogo estilo cutscene (preta com borda)
  function dialog(g, s, k, speaker) {
    const bw = 520, lines = wrapLines(g, s, bw - 32, 8), bh = 18 + lines.length * 13 + (speaker ? 4 : 0);
    const x = (W - bw) / 2, y = H - bh - 16;
    g.fillStyle = '#000'; g.fillRect(x - 2, y - 2, bw + 4, bh + 4);
    g.fillStyle = '#f0e8d8'; g.fillRect(x, y, bw, bh); g.fillStyle = '#05040a'; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    if (speaker) { g.fillStyle = '#05040a'; g.fillRect(x + 12, y - 12, 50, 14); g.fillStyle = '#f0e8d8'; g.fillRect(x + 12, y - 12, 50, 2); g.fillRect(x + 12, y - 12, 2, 12); g.fillRect(x + 60, y - 12, 2, 12); text(g, speaker, x + 37, y - 8, '#ffcf7a', 8, 'center', null); }
    if (st.lastS !== s) { st.lastS = s; st.lastN = 0; }
    let n = Math.floor(k * 40);
    const tot = Math.min(s.length, Math.max(0, n));
    if (tot > (st.lastN || 0) && tot % 2 === 0 && tot < s.length && window.Sfx) Sfx.typeTick();
    st.lastN = tot;
    lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, n)); n -= ln.length + 1; text(g, part, W / 2, y + 11 + i * 13 + (speaker ? 2 : 0), '#f8f4ec', 8, 'center', null); });
  }

  // ---------------- aviso ----------------
  function drawWarning(g, t) {
    g.fillStyle = '#05030a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(160,120,220,${(i * 0.37 % 1) * 0.12})`; g.fillRect((i * 97) % W, (i * 53) % H, 1, 1); }
    const bw = 470, pad = 18, iconW = 18, tw = bw - pad * 2 - iconW;
    const items = [
      ['#ff6a6a', 'This game contains jump scares and is not suitable for children under 10 years old.'],
      ['#cfc4e0', 'The HAWTON ARCADE game was inspired by the FNAF game (FNAF developed by Scott Cawthon).'],
      ['#968cb4', 'Report any bugs or errors to the HAWTON ARCADE developer; the game is in PRE-DEMO phase.'],
    ].map(([c, s]) => [c, wrapLines(g, s, tw, 8)]);
    const bodyH = items.reduce((a, [, ls]) => a + ls.length * 12, 0) + (items.length - 1) * 14;
    const bh = 72 + bodyH + 18, bx = (W - bw) / 2, by = Math.round((H - bh) / 2) - 8;
    const a = clamp(t * 2, 0, 1);
    g.globalAlpha = a;
    g.fillStyle = '#000'; g.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    g.fillStyle = '#3a2a4e'; g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    g.fillStyle = '#100a18'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#170f22'; g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    for (let x = 0; x < bw - 8; x += 8) { g.fillStyle = (x / 8) % 2 ? '#241806' : '#c89a20'; g.fillRect(bx + 4 + x, by + 4, Math.min(8, bw - 8 - x), 3); g.fillRect(bx + 4 + x, by + bh - 7, Math.min(8, bw - 8 - x), 3); }
    // triângulo de alerta
    const tx = W / 2, ty = by + 16;
    for (let i = 0; i < 16; i++) { g.fillStyle = '#ffcf3a'; g.fillRect(tx - i, ty + i, i * 2 + 1, 1); }
    g.fillStyle = '#170f22'; g.fillRect(tx - 1, ty + 5, 3, 6); g.fillRect(tx - 1, ty + 12, 3, 2);
    text(g, 'AVISO', W / 2, by + 38, '#ffcf3a', 8, 'center');
    let y = by + 60;
    items.forEach(([c, ls], i) => {
      const ix = bx + pad, iy = y + 1; g.fillStyle = c;
      if (i === 0) { g.fillRect(ix + 1, iy, 6, 6); g.fillRect(ix, iy + 1, 8, 4); g.fillStyle = '#170f22'; g.fillRect(ix + 2, iy + 2, 1, 1); g.fillRect(ix + 5, iy + 2, 1, 1); }
      else if (i === 1) { g.fillRect(ix, iy + 1, 8, 5); g.fillStyle = '#170f22'; g.fillRect(ix + 2, iy + 3, 1, 1); g.fillRect(ix + 5, iy + 3, 1, 1); }
      else { g.fillRect(ix + 3, iy, 2, 7); g.fillRect(ix, iy + 2, 8, 1); g.fillRect(ix, iy + 5, 8, 1); }
      ls.forEach((ln, k) => text(g, ln, bx + pad + iconW, y + k * 12, c, 8, 'left', '#000'));
      y += ls.length * 12 + 14;
      if (i < items.length - 1) { g.fillStyle = '#2a2038'; g.fillRect(bx + pad + iconW, y - 9, tw, 1); }
    });
    g.globalAlpha = 1;
    if (t > 1 && Math.sin(t * 3) > -0.4) text(g, 'pressione qualquer tecla', W / 2, by + bh + 12, '#6a5a80', 8, 'center');
    vign(g);
  }
  function vign(g) { const v = g.createRadialGradient(W / 2, H / 2, 140, W / 2, H / 2, 420); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)'); g.fillStyle = v; g.fillRect(0, 0, W, H); }

  // ---------------- menu ----------------
  const MENU = ['NOVO JOGO', 'PULAR HISTORIA', 'CREDITOS'];
  const menuShot = { colors: 20, accents: ['#ff4fd0', '#40e0ff'], dither: 22 };
  function drawMenu(g, t) {
    h.fillStyle = '#05040a'; h.fillRect(0, 0, W, H);
    if (facadeImg) { const z = 1.04 + Math.sin(t * 0.2) * 0.02; h.drawImage(facadeImg, 0, 0, facadeImg.width, facadeImg.height, W / 2 - W * z / 2 + 40, H / 2 - H * z / 2, W * z, H * z); }
    h.fillStyle = 'rgba(14,6,30,0.6)'; h.fillRect(0, 0, W, H);
    rain(h, t, 160, 'rgba(170,190,240,0.35)', 0.2, 18);
    const gr = h.createLinearGradient(0, 0, W * 0.6, 0); gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = gr; h.fillRect(0, 0, W, H);
    pixelize(menuShot, 1);
    g.imageSmoothingEnabled = false; g.drawImage(lo, 0, 0, W, H);
    const fl = Math.random() > 0.03;
    g.shadowColor = '#ff4fd0'; g.shadowBlur = fl ? 14 : 0;
    text(g, 'HAWTON', 40, 60, fl ? '#ff8ae6' : '#7a2a6a', 32, 'left', null);
    g.shadowColor = '#40e0ff'; text(g, 'ARCADE', 40, 100, '#7aeaff', 32, 'left', null); g.shadowBlur = 0;
    text(g, 'PRE-DEMO', 44, 142, '#6a6078', 8);
    MENU.forEach((m, i) => {
      const sel = i === st.menuSel, y = 190 + i * 22;
      if (sel) { g.fillStyle = 'rgba(255,79,208,0.18)'; g.fillRect(36, y - 6, 200, 20); g.fillStyle = '#ff4fd0'; g.fillRect(36, y - 6, 3, 20); text(g, '>', 46, y, '#ff8ae6'); }
      text(g, m, 64, y, sel ? '#ffffff' : '#b8acc8');
    });
    text(g, 'SETAS + ENTER', 40, H - 22, '#4a4258');
    text(g, 'v0.1', W - 12, H - 22, '#4a4258', 8, 'right');
    vign(g);
  }

  // ---------------- tela de carregamento ----------------
  const TIPS = [
    'Sem energia, a lanterna é sua melhor amiga.',
    'A chave do corredor de serviço fica na recepção.',
    'Portas de segurança fechadas gastam energia.',
    'Câmera com estática? Aperte R para consertar.',
    'Fios soltos na porta: ligue as cores iguais.',
    'Os fliperamas ainda funcionam... alguns.',
    'Se algo cair do teto, não fique parado.',
  ];
  const STEPS = ['Ligando os fliperamas', 'Varrendo os confetes', 'Contando os tickets', 'Testando os neons', 'Trancando as saídas', 'Acordando o Zippy'];
  const loadShot = { colors: 22, accents: ['#ff4fd0', '#40e0ff', '#ffe060', '#7aff8a', '#ffffff', '#ff7a2a'], dither: 22 };
  function drawLoading(g, t) {
    const c = h;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.shadowBlur = 0;
    // parede e piso
    c.fillStyle = vgrad(c, 0, 230, ['#07040f', '#140a24', '#22103a']); c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 40) { c.fillStyle = 'rgba(255,255,255,0.025)'; c.fillRect(x, 0, 20, 230); }
    // piso xadrez em perspectiva
    for (let r = 0; r < 12; r++) {
      const y0 = 230 + r * r * 1.1 + r * 4, y1 = 230 + (r + 1) * (r + 1) * 1.1 + (r + 1) * 4;
      for (let k = -12; k < 12; k++) {
        const sx = x => 320 + (x - 320) * (1 + r * 0.25), sx1 = x => 320 + (x - 320) * (1 + (r + 1) * 0.25);
        const xa = 320 + k * 28;
        poly(c, [sx(xa), y0, sx(xa + 28), y0, sx1(xa + 28), y1, sx1(xa), y1], (k + r) % 2 ? '#1a1030' : '#2a1a46');
      }
    }
    // reflexo do neon no chão
    glow(c, 320, 250, 220, '#ff4fd0', 0.18);
    // letreiro neon na parede
    const fl = (Math.sin(t * 17) > -0.85 || t % 3 < 2.6) ? 1 : 0.25;
    c.font = `22px ${FONT}`; c.textAlign = 'center';
    c.shadowColor = '#ff4fd0'; c.shadowBlur = 18 * fl; c.fillStyle = fl > 0.5 ? '#ffc8f0' : '#5a1e4e'; c.fillText('HAWTON', 320, 52);
    c.shadowColor = '#40e0ff'; c.shadowBlur = 14; c.font = `12px ${FONT}`; c.fillStyle = '#c8f8ff'; c.fillText('ARCADE', 320, 72);
    c.shadowBlur = 0; c.textAlign = 'left';
    c.strokeStyle = '#ff4fd0'; c.globalAlpha = 0.6 * fl; c.lineWidth = 2; c.strokeRect(196, 24, 248, 58); c.globalAlpha = 1;
    // fileiras de fliperamas nos lados (silhuetas com telas)
    const cab = (x, y, s, col, ph) => {
      c.fillStyle = '#0c0816'; rr(c, x, y, 44 * s, 96 * s, 4 * s); c.fill();
      c.fillStyle = col; c.fillRect(x + 4 * s, y + 6 * s, 36 * s, 10 * s);
      const on = 0.6 + 0.4 * Math.sin(t * 3 + ph);
      c.fillStyle = '#020306'; c.fillRect(x + 6 * s, y + 22 * s, 32 * s, 26 * s);
      c.globalAlpha = on; c.fillStyle = col; c.fillRect(x + 8 * s, y + 24 * s, 28 * s, 22 * s); c.globalAlpha = 1;
      glow(c, x + 22 * s, y + 35 * s, 40 * s, col, 0.25 * on);
      c.fillStyle = '#1a1226'; c.fillRect(x + 4 * s, y + 52 * s, 36 * s, 10 * s);
      ell(c, x + 14 * s, y + 57 * s, 2.5 * s, 2.5 * s, '#ff3a3a'); ell(c, x + 26 * s, y + 57 * s, 2.5 * s, 2.5 * s, '#3a8aff');
      glow(c, x + 22 * s, y + 104 * s, 30 * s, col, 0.15 * on);
    };
    const cols = ['#40e0ff', '#ffe060', '#7aff8a', '#ff7a2a', '#ff4fd0'];
    for (let i = 0; i < 4; i++) { cab(14 + i * 34, 128 - i * 8, 0.9 - i * 0.12, cols[i % 5], i); cab(560 - i * 34, 128 - i * 8, 0.9 - i * 0.12, cols[(i + 2) % 5], i + 3); }
    // fliperama central com a animação de carregamento
    const X = 250, Y = 96;
    c.fillStyle = '#2a1640'; rr(c, X - 6, Y - 6, 152, 232, 10); c.fill();
    c.fillStyle = '#3a1e5a'; rr(c, X, Y, 140, 224, 8); c.fill();
    c.fillStyle = '#4a2a72'; c.fillRect(X, Y, 8, 224); c.fillStyle = '#24123a'; c.fillRect(X + 132, Y, 8, 224);
    // letreiro do gabinete
    c.fillStyle = '#ff4fd0'; c.fillRect(X + 12, Y + 8, 116, 22); c.fillStyle = '#ffd0f4'; c.fillRect(X + 16, Y + 12, 108, 3);
    // tela
    const SX = X + 16, SY = Y + 40, SW = 108, SH = 80;
    c.fillStyle = '#05040a'; c.fillRect(SX - 4, SY - 4, SW + 8, SH + 8);
    c.fillStyle = '#04120c'; c.fillRect(SX, SY, SW, SH);
    // labirinto
    c.fillStyle = '#2a4aff'; for (const [a, b, w2, h2] of [[0, 0, SW, 3], [0, SH - 3, SW, 3], [0, 0, 3, SH], [SW - 3, 0, 3, SH], [20, 18, 30, 3], [62, 18, 26, 3], [20, 58, 68, 3], [52, 30, 3, 18]]) c.fillRect(SX + a, SY + b, w2, h2);
    // pontinhos sendo comidos
    const px = (t * 34) % (SW + 20) - 10;
    for (let x = 8; x < SW - 6; x += 8) if (x > px + 4) { c.fillStyle = '#ffe8b0'; c.fillRect(SX + x, SY + 40, 2, 2); }
    // Greg correndo e o Zippy atrás
    const run = Math.floor(t * 8) % 2;
    const gx = SX + px, gy = SY + 34;
    c.fillStyle = '#5a3418'; c.fillRect(gx, gy, 6, 3); c.fillStyle = '#e8b48c'; c.fillRect(gx + 1, gy + 3, 5, 3); c.fillStyle = '#c8302e'; c.fillRect(gx, gy + 6, 6, 5); c.fillStyle = '#2a3a6a'; c.fillRect(gx + run, gy + 11, 2, 3); c.fillRect(gx + 4 - run, gy + 11, 2, 3);
    const zx = gx - 22 - Math.sin(t * 2) * 3;
    if (zx > SX + 2) { c.fillStyle = '#a8937c'; c.fillRect(zx, gy + 1, 8, 7); c.fillRect(zx - 2, gy - 1, 3, 3); c.fillRect(zx + 7, gy - 1, 3, 3); c.fillStyle = '#7a3ab8'; c.fillRect(zx + 1, gy + 8, 6, 5); c.fillStyle = '#fff4c0'; c.fillRect(zx + 2, gy + 3, 1, 1); c.fillRect(zx + 5, gy + 3, 1, 1); c.fillStyle = '#1a1418'; c.fillRect(zx + 3, gy + 5, 2, 1); }
    glow(c, SX + SW / 2, SY + SH / 2, 80, '#40e0ff', 0.25);
    // controles e moedeiro
    c.fillStyle = '#24123a'; poly(c, [X + 4, Y + 136, X + 136, Y + 136, X + 148, Y + 160, X - 8, Y + 160], '#24123a');
    ell(c, X + 34, Y + 146, 6, 4, '#ff3a3a'); c.fillStyle = '#c8c8d0'; c.fillRect(X + 33, Y + 136, 2, 10);
    for (let i = 0; i < 3; i++) ell(c, X + 76 + i * 16, Y + 148, 5, 3.5, ['#ffe060', '#3a8aff', '#7aff8a'][i]);
    c.fillStyle = '#1a0e2a'; c.fillRect(X + 54, Y + 172, 32, 30); c.fillStyle = '#ffb030'; c.fillRect(X + 60, Y + 178, 20, 8); c.fillStyle = '#5a3a10'; c.fillRect(X + 68, Y + 179, 4, 6);
    glow(c, X + 70, Y + 182, 26, '#ffb030', 0.35 + 0.2 * Math.sin(t * 5));
    // fichas caindo no moedeiro
    for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; if (k < 0.6) { const yy = Y + 110 - 60 + k * 120; if (yy < Y + 176) { ell(c, X + 70 + Math.sin(k * 9) * 4, yy, 4 * Math.abs(Math.cos(t * 6 + i)) + 1, 4, '#ffd23a'); } } }
    // confete e poeira
    for (let i = 0; i < 60; i++) { const k = (t * 0.12 + i * 0.0731) % 1, x = (i * 71.3 + Math.sin(t + i) * 10) % W, y = k * H; c.fillStyle = cols[i % 5]; c.globalAlpha = 0.6; c.fillRect(x, y, 3, 2); }
    c.globalAlpha = 1;
    const v = c.createRadialGradient(320, 170, 150, 320, 170, 430); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.8)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    pixelize(loadShot, Math.min(1, t / 0.5, Math.max(0, (LOAD_T + 0.6 - t) / 0.6)));
    g.imageSmoothingEnabled = false; g.drawImage(lo, 0, 0, W, H);
    const a = Math.min(1, t / 0.5, Math.max(0, (LOAD_T + 0.6 - t) / 0.6));
    g.globalAlpha = a;
    text(g, 'LOADING', 320, 112, '#3a0a2a', 8, 'center', null);
    const pg = g.createLinearGradient(0, 262, 0, 300); pg.addColorStop(0, 'rgba(5,3,10,0)'); pg.addColorStop(1, 'rgba(5,3,10,0.92)');
    g.fillStyle = pg; g.fillRect(0, 262, W, 38); g.fillStyle = 'rgba(5,3,10,0.92)'; g.fillRect(0, 300, W, 60);
    g.fillStyle = '#3a2a4e'; g.fillRect(0, 300, W, 1);
    // progresso irregular (parece carregamento de verdade)
    const k = clamp(t / LOAD_T, 0, 1), prog = Math.min(1, ease(k) + Math.sin(k * 23) * 0.015 * (1 - k)) * (k > 0.98 ? 1 : 0.99);
    const pct = Math.floor(prog * 100);
    // barra feita de fichas
    const bx = 120, by = 312, bw = 400, n = 25;
    g.fillStyle = '#000'; g.fillRect(bx - 4, by - 4, bw + 8, 22); g.fillStyle = '#3a2a4e'; g.fillRect(bx - 2, by - 2, bw + 4, 18); g.fillStyle = '#0c0816'; g.fillRect(bx, by, bw, 14);
    for (let i = 0; i < n; i++) {
      const on = i / n < prog, cx = bx + 4 + i * 16;
      if (on) { g.fillStyle = ['#ff4fd0', '#ff7ad8', '#40e0ff', '#7aeaff'][(i >> 1) % 4]; g.fillRect(cx, by + 3, 12, 8); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(cx, by + 3, 12, 2); }
      else { g.fillStyle = '#1a1226'; g.fillRect(cx, by + 3, 12, 8); }
    }
    // ficha girando na ponta
    const fx = bx + 4 + Math.min(n - 1, Math.floor(prog * n)) * 16 + 6, sw = Math.abs(Math.cos(t * 6)) * 7 + 1;
    g.fillStyle = '#000'; g.fillRect(fx - sw - 1, by - 12, sw * 2 + 2, 12); g.fillStyle = '#ffd23a'; g.fillRect(fx - sw, by - 11, sw * 2, 10); g.fillStyle = '#fff4b0'; g.fillRect(fx - sw, by - 11, sw, 2);
    const step = STEPS[Math.min(STEPS.length - 1, Math.floor(prog * STEPS.length))];
    text(g, 'CARREGANDO', bx, by - 26, '#ff8ae6', 8);
    text(g, step + '.'.repeat(1 + Math.floor(t * 3) % 3), bx + 92, by - 26, '#b8acc8', 8);
    text(g, pct + '%', bx + bw, by - 26, '#7aeaff', 8, 'right');
    // dica
    const ti = Math.floor(t / 2.6) % TIPS.length, tl = t % 2.6, ta = Math.min(1, tl / 0.3, (2.6 - tl) / 0.3);
    g.globalAlpha = a * ta;
    text(g, 'DICA', W / 2, by + 26, '#ffcf3a', 8, 'center');
    text(g, TIPS[ti], W / 2, by + 38, '#d8ccb8', 8, 'center');
    g.globalAlpha = 1;
    if (prog >= 1) text(g, 'pronto', W - 16, 14, '#7aff8a', 8, 'right');
  }
  const LOAD_T = 6.5;

  // ---------------- cutscene ----------------
  const FADE = 0.6;
  function drawShot(g, dt) {
    const s = SHOTS[st.i]; st.t += dt;
    if (st.t >= s.dur) { st.i++; st.t = 0; if (st.i >= SHOTS.length) { st.mode = 'done'; return; } return drawShot(g, 0); }
    seed = 11 + st.i;
    if (st.cueShot !== st.i) { st.cueShot = st.i; st.fired = {}; if (st.i > 0 && window.Sfx) Sfx.staticBurst(0.3, 0.7); }
    if (window.Sfx && s.cues) s.cues.forEach(([at, fn], k) => { if (!st.fired[k] && st.t >= at) { st.fired[k] = true; try { fn(); } catch (e) {} } });
    h.setTransform(1, 0, 0, 1, 0, 0); h.globalAlpha = 1; h.shadowBlur = 0; h.globalCompositeOperation = 'source-over';
    s.draw(h, st.t);
    const fade = Math.min(1, st.t / FADE, (s.dur - st.t) / FADE);
    pixelize(s, Math.max(0, fade));
    g.imageSmoothingEnabled = false; g.drawImage(lo, 0, 0, W, H);
    // VHS: PLAY e data
    if (s.vhs) {
      if (Math.floor(st.t * 2) % 2 || st.t > 3) text(g, '> PLAY', 24, 34, '#f4f0e6', 8, 'left', '#000');
      text(g, s.vhs, W - 24, H - 84, '#f4f0e6', 8, 'right', '#000');
      const sec = Math.floor(st.t * 1) + 12; text(g, `00:0${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, W - 24, H - 72, '#f4f0e6', 8, 'right', '#000');
    }
    // estática na troca de cena
    st.glitch = 0;
    if (st.i > 0 && st.t < 0.3) { const k = 1 - st.t / 0.3; st.glitch = k; for (let y = 0; y < H; y += 3) { const v = Math.random() * 220 | 0; g.fillStyle = `rgba(${v},${v},${v},${k * 0.85})`; g.fillRect(0, y, W, 3); } }
    if (s.dur - st.t < 0.15) st.glitch = 0.6;
    // barras de cinema
    g.fillStyle = '#000'; g.fillRect(0, 0, W, 22);
    if (s.tag) text(g, s.tag, 16, 7, '#d8ccb8');
    if (s.lines) {
      let cur = null; for (const [at, line] of s.lines) if (st.t >= at + 0.4) cur = [at, line];
      if (cur) dialog(g, cur[1], (st.t - cur[0] - 0.4) * 1.4, s.speaker);
    } else if (s.text && st.t > 0.5) dialog(g, s.text, (st.t - 0.5) * 1.2);
    text(g, 'ENTER: avançar   ESC: pular', W - 12, 7, '#4a4258', 8, 'right', null);
    // granulado
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * W | 0, 22 + Math.random() * (H - 22) | 0, 2, 2); }
  }
  function drawCredits(g, t) {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const a = Math.min(1, t / 0.8, Math.max(0, (4 - t) / 0.8));
    g.globalAlpha = a;
    text(g, 'CREATED BY:', W / 2, H / 2 - 24, '#b8acc8', 8, 'center', null);
    g.shadowColor = '#ff4fd0'; g.shadowBlur = 16; text(g, 'Nazinho', W / 2, H / 2 - 6, '#ff8ae6', 24, 'center', null); g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  return {
    setFacade(img) { facadeImg = img; },
    unlock() { try { if (!st.music) { st.music = new Audio('assets/story.mp3'); st.music.volume = 0.85; st.music.preload = 'auto'; } const p = st.music.play(); if (p && p.then) p.then(() => { if (st.mode !== 'story') st.music.pause(); }).catch(() => {}); else if (st.mode !== 'story') st.music.pause(); } catch (e) {} },
    get mode() { return st.mode; },
    get glitch() { return st.glitch || 0; },
    loading() { st.mode = 'loading'; st.t = 0; },
    start(mode) { st.mode = mode; st.t = 0; st.i = 0; st.warnT = 0; st.creditsT = 0; if (mode === 'story') startMusic(); },
    // retorna: null (continua) | 'menu' | 'story' | 'skip' | 'credits' | 'done'
    update(dt, inp) {
      if (st.mode === 'done') { st.mode = 'off'; fadeMusic(0.45, 1.5); return 'done'; }
      if (st.mode === 'warning') { st.warnT += dt; if (st.warnT > 0.8 && inp.any) { st.mode = 'menu'; return 'menu'; } }
      else if (st.mode === 'menu') {
        st.t += dt;
        if (inp.up) st.menuSel = (st.menuSel + MENU.length - 1) % MENU.length;
        if (inp.down) st.menuSel = (st.menuSel + 1) % MENU.length;
        if (inp.click && inp.my != null) MENU.forEach((m, i) => { const y = 190 + i * 22; if (inp.my * H >= y - 6 && inp.my * H < y + 14 && inp.mx * W < 260) { st.menuSel = i; inp.ok = true; } });
        if (inp.ok) {
          const m = MENU[st.menuSel];
          if (m === 'NOVO JOGO') { st.mode = 'story'; st.i = 0; st.t = 0; startMusic(); return 'story'; }
          if (m === 'PULAR HISTORIA') { st.mode = 'off'; return 'skip'; }
          if (m === 'CREDITOS') { st.mode = 'credits-menu'; st.creditsT = 0; return null; }
        }
      }
      else if (st.mode === 'credits-menu') { st.creditsT += dt; if (st.creditsT > 4 || (st.creditsT > 0.5 && inp.any)) st.mode = 'menu'; }
      else if (st.mode === 'story') {
        if (inp.esc) { st.mode = 'done'; }
        else if (inp.ok && st.t > 0.8) { st.t = Math.max(st.t, SHOTS[st.i].dur - FADE); }
        if (st.mode === 'done') { fadeMusic(0.45, 1.5); return 'done'; }
      }
      else if (st.mode === 'loading') { st.t += dt; if (st.t > LOAD_T + 0.6) { st.mode = 'off'; return 'loading-done'; } }
      else if (st.mode === 'credits') { st.creditsT += dt; if (st.creditsT > 4) { st.mode = 'off'; fadeMusic(0.35, 2); return 'credits-done'; } }
      return null;
    },
    draw(g, dt) {
      if (st.mode === 'warning') drawWarning(g, st.warnT);
      else if (st.mode === 'menu') drawMenu(g, st.t);
      else if (st.mode === 'credits-menu') drawCredits(g, Math.min(st.creditsT, 3.2));
      else if (st.mode === 'story') { drawShot(g, dt); if (st.mode === 'done') { fadeMusic(0.45, 1.5); } }
      else if (st.mode === 'credits') drawCredits(g, st.creditsT);
      else if (st.mode === 'loading') drawLoading(g, st.t);
    },
    credits() { st.mode = 'credits'; st.creditsT = 0; },
    stopMusic(sec = 2) { fadeMusic(0, sec); },
    // para testes: renderiza um quadro específico
    debugJump(i, t) { st.mode = 'story'; st.i = i; st.t = t; },
    debugShot(i, t, g) { st.mode = 'story'; st.i = i; st.t = t; drawShot(g, 0); },
  };
})();
