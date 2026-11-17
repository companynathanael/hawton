// Hawton Arcade — motor principal: tela inicial, cutscene da fachada e exploração do mapa.
(() => {
  'use strict';
  const Wd = window.World;
  const D = { width: Wd.W, height: Wd.H, spawn: Wd.spawn, rooms: Wd.rooms, lights: Wd.lights, interact: Wd.interact };
  const GW = 384, GH = 216;      // resolução interna do jogo
  const CW = 640, CH = 360;      // resolução interna da cutscene
  const FONT = '"Press Start 2P", monospace';

  const screen = document.getElementById('screen');
  Post.init(screen);

  const buf = document.createElement('canvas');
  const g = buf.getContext('2d');
  const lightC = document.createElement('canvas'); lightC.width = GW; lightC.height = GH;
  const lg = lightC.getContext('2d');

  function setRes(w, h) {
    if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
    g.imageSmoothingEnabled = false;
  }
  setRes(CW, CH);

  // ---------- utilidades ----------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeIn3 = t => t * t * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const inR = (x, y, r) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];

  // ---------- recursos ----------
  const img = {};
  let loaded = 0;
  const toLoad = [['map', 'assets/map.jpg'], ['facade', 'assets/facade.jpg']];
  toLoad.forEach(([k, src]) => {
    const im = new Image();
    im.onload = () => { loaded++; };
    im.onerror = () => { console.error('falha ao carregar', src); };
    im.src = src; img[k] = im;
  });
  let fontReady = false;
  (document.fonts ? document.fonts.load('8px "Press Start 2P"') : Promise.resolve())
    .catch(() => {}).then(() => { fontReady = true; });
  setTimeout(() => { fontReady = true; }, 2500);

  // ---------- colisão (mapa em tiles: src/world.js) ----------
  const MW = D.width, MH = D.height;
  const walkable = Wd.walkable;
  const boxFree = (x, y) => {
    for (let yy = y - 4; yy <= y; yy += 2)
      for (let xx = x - 4; xx <= x + 4; xx += 2) if (!walkable(xx, yy)) return false;
    return true;
  };
  let maskCanvas = null;
  function getMaskCanvas() {
    if (maskCanvas) return maskCanvas;
    maskCanvas = document.createElement('canvas'); maskCanvas.width = MW; maskCanvas.height = MH;
    const c = maskCanvas.getContext('2d'), id = c.createImageData(MW, MH);
    for (let i = 0; i < Wd.solid.length; i++) {
      if (!Wd.solid[i]) { id.data[i * 4 + 1] = 255; id.data[i * 4 + 3] = 60; }
      else { id.data[i * 4] = 255; id.data[i * 4 + 3] = 50; }
    }
    c.putImageData(id, 0, 0);
    return maskCanvas;
  }

  // ---------- oclusão de luz (paredes e portas fechadas) ----------
  const outsideC = Wd.outsideC;
  function castCone(ox, oy, ang, len, half, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = ang - half + (2 * half * i) / (n - 1), dx = Math.cos(a), dy = Math.sin(a);
      let d = 3;
      while (d < len) {
        if (Wd.occludes(ox + dx * d, oy + dy * d)) break;
        d += 2;
      }
      d = Math.min(len, d + 5);
      pts.push(ox + dx * d, oy + dy * d);
    }
    return pts;
  }
  function clipPoly(ctx, ox, oy, pts, cx, cy) {
    ctx.beginPath(); ctx.moveTo(ox - cx, oy - cy);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i] - cx, pts[i + 1] - cy);
    ctx.closePath(); ctx.clip();
  }

  // ---------- salas ----------
  D.rooms.forEach(r => { r.rgb = hex(r.tint); });
  const roomAt = (x, y) => D.rooms.find(r => inR(x, y, r.r)) || null;
  const surfaceOf = room => {
    if (!room) return 'carpet';
    const n = room.name;
    if (/COZINHA|PORÃO$|\?\?\?|POWER|SERVICE|SEGURANÇA/.test(n)) return 'tile';
    if (/PARTY/.test(n)) return 'wood';
    if (/ESCADA/.test(n)) return 'metal';
    return 'carpet';
  };

  // ---------- sprites de luz ----------
  const glowCache = {};
  function glow(color) {
    if (glowCache[color]) return glowCache[color];
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d'), [r, gg, b] = hex(color);
    const grd = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grd.addColorStop(0.25, `rgba(${r},${gg},${b},0.62)`);
    grd.addColorStop(0.55, `rgba(${r},${gg},${b},0.22)`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = grd; x.fillRect(0, 0, s, s);
    return (glowCache[color] = c);
  }

  // estado de cintilação das luzes
  D.lights.forEach(l => {
    const rm = D.rooms.find(r => inR(l.x, l.y, r.r));
    l.clip = rm ? [rm.r[0] - 2, rm.r[1] - 2, rm.r[2] + 4, rm.r[3] + 4] : null;
  });
  // circuitos: emg = emergência (sempre acesa), gen = gerador, main = rede principal
  D.lights.forEach(l => {
    if (!l.g) {
      const rm = D.rooms.find(r => inR(l.x, l.y, r.r));
      l.g = l.c === '#ff3030' || (rm && rm.name === '???') ? 'emg' : rm && /POWER|SERVICE/.test(rm.name) ? 'gen' : 'main';
    }
    l.onAt = 0; l.lit = false;
  });
  D.lights.forEach(l => { l.off = 0; l.ph = Math.random() * 100; l.i = 1; l.hum = /^#[c-e]0[d-f]0/.test(l.c) || l.c === '#d0f0ff'; });

  // ---------- entrada ----------
  const keys = {};
  const pressed = {};
  let mouse = { x: 0, y: 0, t: -99 };
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
    anyInput();
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  addEventListener('mousemove', e => {
    const cv = Post.canvas, r = cv.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width; mouse.y = (e.clientY - r.top) / r.height; mouse.t = now;
  });
  addEventListener('pointerdown', e => {
    const cv = Post.canvas;
    if (e.target === cv || e.target === document.body) {
      const r = cv.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width; mouse.y = (e.clientY - r.top) / r.height;
      if (e.pointerType === 'mouse') mouse.t = now;
      pressed.click = true;
    }
    anyInput();
  });
  const consume = k => { const v = pressed[k]; pressed[k] = false; return v; };

  // controles de toque
  const touch = { on: false, vx: 0, vy: 0, run: false };
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) {
    const tl = document.getElementById('touch'), stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let sid = null;
    const setStick = (cx, cy) => {
      const r = stick.getBoundingClientRect();
      let dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy), max = r.width / 2 - 10;
      if (m > max) { dx *= max / m; dy *= max / m; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      touch.vx = dx / max; touch.vy = dy / max;
    };
    stick.addEventListener('pointerdown', e => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e.clientX, e.clientY); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setStick(e.clientX, e.clientY); });
    const endStick = e => { if (e.pointerId === sid) { sid = null; touch.vx = touch.vy = 0; knob.style.transform = ''; } };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => { e.preventDefault(); down(); });
      if (up) { el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); }
    };
    btn('bE', () => { pressed.e = true; });
    btn('bF', () => { pressed.f = true; });
    btn('bM', () => { pressed.m = true; });
    btn('bR', () => { touch.run = true; }, () => { touch.run = false; });
    touch.el = tl;
    addEventListener('pointerdown', () => anyInput());
  }

  // ---------- estado ----------
  let state = 'loading';
  let now = 0, last = performance.now();
  const post = { glitch: 0, flash: 0, fade: 1, curv: 0.045 };

  function anyInput() {
    if (state === 'title' && loaded === toLoad.length) {
      Sfx.init(); Sfx.resume();
      startCutscene();
    } else if (state === 'cutscene' && cut.t > 0.6 && cut.t < 11) {
      if (pressed.enter || pressed.escape || pressed[' '] || pressed.click) { cut.t = 11; }
    }
  }

  // =====================================================================
  //  TELA INICIAL
  // =====================================================================
  function drawTitle(t) {
    setRes(CW, CH);
    g.fillStyle = '#030206'; g.fillRect(0, 0, CW, CH);
    // estática
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      g.fillRect((Math.random() * CW) | 0, (Math.random() * CH) | 0, 2, 1);
    }
    if (!fontReady) return;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (loaded < toLoad.length) {
      g.font = `8px ${FONT}`; g.fillStyle = '#7a6f8a';
      g.fillText('CARREGANDO' + '.'.repeat(((t * 3) | 0) % 4), CW / 2, CH / 2);
      return;
    }
    const blink = Math.sin(t * 3) > -0.3 && Math.random() > 0.02;
    g.font = `16px ${FONT}`;
    g.fillStyle = '#2a0e18'; g.fillText('HAWTON ARCADE', CW / 2 + 2, CH / 2 - 38);
    g.fillStyle = Math.random() > 0.03 ? '#e8c060' : '#5a4020'; g.fillText('HAWTON ARCADE', CW / 2, CH / 2 - 40);
    g.font = `8px ${FONT}`;
    if (blink) { g.fillStyle = '#d8d0e8'; g.fillText(isTouch ? 'TOQUE PARA COMEÇAR' : 'CLIQUE OU APERTE QUALQUER TECLA', CW / 2, CH / 2 + 20); }
    g.fillStyle = '#5a5068'; g.fillText('USE FONES DE OUVIDO', CW / 2, CH / 2 + 50);
    g.textAlign = 'left';
  }

  // =====================================================================
  //  CUTSCENE — FACHADA
  // =====================================================================
  const FW = 2000, FH = 1116;
  const cut = { t: 0, drops: [], splashes: [], fired: {}, fog: null, lampL: 1, lampR: 0, sign: 0, inner: 0 };

  function makeFog() {
    const w = 256, h = 64, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), id = x.createImageData(w, h);
    const grid = (s) => { const a = []; for (let i = 0; i < (w / s + 2) * (h / s + 2); i++) a.push(Math.random()); return a; };
    const layers = [[32, 0.5, grid(32)], [16, 0.3, grid(16)], [8, 0.2, grid(8)]];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let v = 0;
      for (const [s, amp, gr] of layers) {
        const gw = w / s + 2, fx = i / s, fy = j / s, x0 = fx | 0, y0 = fy | 0, tx = ease(fx - x0), ty = ease(fy - y0);
        const a = gr[y0 * gw + (x0 % (w / s))], b = gr[y0 * gw + ((x0 + 1) % (w / s))];
        const cc = gr[(y0 + 1) * gw + (x0 % (w / s))], d = gr[(y0 + 1) * gw + ((x0 + 1) % (w / s))];
        v += lerp(lerp(a, b, tx), lerp(cc, d, tx), ty) * amp;
      }
      const edge = Math.sin(Math.PI * j / h);
      const k = (j * w + i) * 4;
      id.data[k] = 150; id.data[k + 1] = 165; id.data[k + 2] = 200;
      id.data[k + 3] = clamp((v - 0.3) * 1.6, 0, 1) * edge * 255;
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  function startCutscene() {
    state = 'cutscene';
    cut.t = 0; cut.fired = {};
    cut.fog = cut.fog || makeFog();
    cut.drops = [];
    for (let i = 0; i < 260; i++) cut.drops.push(newDrop(true));
    Sfx.exterior();
  }

  function newDrop(anywhere) {
    const layer = Math.random() < 0.45 ? 0 : Math.random() < 0.6 ? 1 : 2;
    return {
      x: rnd(-60, CW + 20), y: anywhere ? rnd(-CH, CH) : rnd(-80, -10),
      v: [380, 560, 820][layer] * rnd(0.9, 1.15), l: [5, 9, 15][layer], a: [0.18, 0.28, 0.42][layer], layer
    };
  }

  const base = Math.max(CW / FW, CH / FH);
  function cutCam(t) {
    let z, cx, cy;
    if (t < 8.2) {
      const k = ease(clamp(t / 8.2, 0, 1));
      z = lerp(1.0, 1.32, k); cx = lerp(1000, 1030, k); cy = lerp(558, 640, k);
    } else {
      const k = easeIn3(clamp((t - 8.2) / 3.6, 0, 1));
      z = lerp(1.32, 7.5, k); cx = lerp(1030, 1036, k); cy = lerp(640, 840, k);
    }
    const s = base * z;
    cx = clamp(cx, CW / 2 / s, FW - CW / 2 / s);
    cy = clamp(cy, CH / 2 / s, FH - CH / 2 / s);
    // leve respiração da câmera
    cx += Math.sin(t * 0.7) * 3 / z; cy += Math.cos(t * 0.53) * 2 / z;
    return { s, cx, cy, z };
  }

  // agenda de acendimento do letreiro
  const signSchedule = [[3.0, 3.12], [3.3, 3.38], [3.55, 5.3], [6.35, 6.45], [6.9, 9.4], [9.6, 9.65], [10.1, 10.8]];
  function signLevel(t) {
    for (const [a, b] of signSchedule) if (t >= a && t < b) return Math.random() < 0.06 ? 0.25 : 0.88 + Math.random() * 0.12;
    return 0;
  }

  function drawCutscene(dt) {
    setRes(CW, CH);
    const t = (cut.t += dt);
    const cam = cutCam(t);
    const X = ix => (ix - cam.cx) * cam.s + CW / 2;
    const Y = iy => (iy - cam.cy) * cam.s + CH / 2;
    const once = (k, at, fn) => { if (t >= at && !cut.fired[k]) { cut.fired[k] = true; fn(); } };

    // eventos
    once('thunder', 5.6, () => { cut.flash = 1; setTimeout(() => Sfx.thunder(), 280); });
    once('flash2', 5.85, () => { cut.flash = 0.7; });
    once('riser', 8.4, () => Sfx.riser(3.4));
    once('hb1', 9.3, () => Sfx.heartbeat());
    once('hb2', 10.3, () => Sfx.heartbeat());
    once('hb3', 11.0, () => Sfx.heartbeat());
    cut.flash = Math.max(0, (cut.flash || 0) - dt * 2.4);

    // fachada
    g.fillStyle = '#000'; g.fillRect(0, 0, CW, CH);
    g.imageSmoothingEnabled = cam.s < 1;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img.facade, X(0), Y(0), FW * cam.s, FH * cam.s);

    // letreiro
    const sl = signLevel(t);
    cut.sign = sl;
    Sfx.buzz(sl > 0.5 ? 1 : sl > 0 ? 0.4 : 0);
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (sl > 0) {
      g.globalAlpha = 0.5 * sl;
      g.drawImage(img.facade, 480, 190, 1120, 370, X(480), Y(190), 1120 * cam.s, 370 * cam.s);
      g.globalAlpha = 0.35 * sl;
      const gs = glow('#ffb43c'); const R = 1300 * cam.s;
      g.drawImage(gs, X(1035) - R / 2, Y(380) - R / 2 * 0.6, R, R * 0.6);
      g.globalAlpha = 0.25 * sl;
      const gs2 = glow('#ff3c6a'); const R2 = 900 * cam.s;
      g.drawImage(gs2, X(1035) - R2 / 2, Y(500) - R2 / 4, R2, R2 / 2);
    }
    // postes
    cut.lampL = Math.random() < 0.025 ? 0.15 : Math.random() < 0.97 ? 1 : 0.6;
    if (Math.random() < 0.01) cut.lampR = 1; cut.lampR = Math.max(0, cut.lampR - dt * (Math.random() < 0.5 ? 8 : 1));
    const lamp = (x, y, c, a, beam) => {
      if (a <= 0) return;
      g.globalAlpha = 0.8 * a;
      const R = 170 * cam.s; g.drawImage(glow(c), X(x) - R / 2, Y(y) - R / 2, R, R);
      g.globalAlpha = 0.18 * a;
      const [r, gg, b] = hex(c);
      const grd = g.createLinearGradient(0, Y(y), 0, Y(1020));
      grd.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(X(x - 22), Y(y + 10)); g.lineTo(X(x + 22), Y(y + 10));
      g.lineTo(X(x + beam), Y(1030)); g.lineTo(X(x - beam), Y(1030)); g.closePath(); g.fill();
      g.globalAlpha = 0.35 * a;
      const P = 420 * cam.s; g.drawImage(glow(c), X(x) - P / 2, Y(1010) - P / 8, P, P / 4);
    };
    lamp(198, 350, '#ffd8a0', cut.lampL, 170);
    lamp(1822, 392, '#a8c8ff', cut.lampR, 150);
    // algo piscando lá dentro
    cut.inner = Math.random() < 0.04 ? rnd(0.3, 1) : cut.inner * 0.9;
    g.globalAlpha = 0.22 * cut.inner;
    const IR = 160 * cam.s; g.drawImage(glow('#c040ff'), X(1030) - IR / 2, Y(860) - IR / 2, IR, IR);
    // relâmpago
    if (cut.flash > 0) {
      g.globalAlpha = cut.flash * 0.45;
      g.drawImage(img.facade, X(0), Y(0), FW * cam.s, FH * cam.s);
      g.globalAlpha = cut.flash * 0.25; g.fillStyle = '#c8d8ff'; g.fillRect(0, 0, CW, CH);
    }
    g.restore();

    // neblina
    g.save();
    g.imageSmoothingEnabled = true;
    const fogY = Y(880), fogH = Math.max(80, (FH - 880) * cam.s * 1.3);
    for (let k = 0; k < 2; k++) {
      const off = ((t * (14 + k * 9) + k * 97) % CW);
      g.globalAlpha = 0.22 + 0.08 * k;
      for (let i = -1; i < 2; i++) g.drawImage(cut.fog, i * CW + off * (k ? -1 : 1), fogY + k * 20, CW + 1, fogH);
    }
    g.restore();

    // chuva
    const wind = 0.16;
    const groundY = Y(1000);
    g.save();
    for (const d of cut.drops) {
      d.y += d.v * dt; d.x += d.v * wind * dt;
      const limit = d.layer === 2 ? Math.min(CH, groundY + rnd(0, 140) * cam.s) : CH + 20;
      if (d.y > limit) {
        if (d.layer === 2 && d.y < CH) for (let i = 0; i < 2; i++) cut.splashes.push({ x: d.x, y: d.y, vx: rnd(-40, 40), vy: rnd(-70, -30), life: 0.25 });
        Object.assign(d, newDrop(false));
      }
      g.strokeStyle = `rgba(175,195,235,${d.a * (1 + (cut.flash || 0))})`;
      g.lineWidth = d.layer === 2 ? 1.2 : 1;
      g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - d.l * wind, d.y - d.l); g.stroke();
    }
    g.fillStyle = 'rgba(190,210,245,0.6)';
    cut.splashes = cut.splashes.filter(s => {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 400 * dt;
      g.fillRect(s.x | 0, s.y | 0, 1, 1);
      return s.life > 0;
    });
    g.restore();

    // barras de cinema
    const bar = 26 * clamp(t / 2, 0, 1);
    g.fillStyle = '#000'; g.fillRect(0, 0, CW, bar); g.fillRect(0, CH - bar, CW, bar);

    // texto
    if (fontReady && t > 0.8 && t < 10.8) {
      g.font = `8px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillStyle = `rgba(150,140,170,${0.45 + 0.1 * Math.sin(t * 4)})`;
      g.fillText(isTouch ? 'TOQUE: PULAR' : 'ENTER: PULAR', CW - 12, CH - 13);
      g.textAlign = 'left';
    }

    // pós
    post.fade = clamp(t / 2.4, 0, 1) * (1 - clamp((t - 11.2) / 0.9, 0, 1));
    post.flash = (cut.flash || 0) * 0.35;
    post.glitch = (t > 10.7 && t < 12.1 ? 0.4 + Math.random() * 0.5 : 0) + (cut.flash > 0.5 ? 0.15 : 0) + (sl > 0 && Math.random() < 0.03 ? 0.3 : 0);
    if (t > 12.4) startGame();
  }

  // =====================================================================
  //  JOGO
  // =====================================================================
  const P = { x: D.spawn[0], y: D.spawn[1], dir: 'up', anim: 0, frame: 0, moving: false, run: false, aim: -Math.PI / 2, flash: true, lastFrame: 0 };
  const cam = { x: 0, y: 0, shake: 0 };
  const game = {
    t: 0, room: null, roomT: 0, amb: [26, 20, 44], power: 1, surge: rnd(25, 45), surgeSeq: null,
    msg: '', msgT: 0, prompt: null, fadeT: 0, tp: null, map: false, debug: false,
    creakT: rnd(6, 14), clankT: rnd(18, 35), blipT: rnd(2, 5), hbT: 0, flashFlick: 1, hintT: 0,
    gen: false, genT: 0, powered: false, powerT: 0, ui: null, intro: false, lampSndT: 0, energy: 100
  };
  // sala de segurança
  const sec = {
    seated: false, cams: false, cam: 0, camStatic: 0,
    light: { W: false, E: false },
    door: { W: Wd.doors.find(d => d.id === 'secW'), E: Wd.doors.find(d => d.id === 'secE') },
  };
  const CHAIR = [99, 90];
  const motes = [];
  const puffs = [];

  function startGame() {
    state = 'game';
    setRes(GW, GH);
    Sfx.interior();
    game.t = 0; game.fadeT = 0; game.hintT = 0;
    P.x = D.spawn[0]; P.y = D.spawn[1]; P.dir = 'up'; P.aim = -Math.PI / 2;
    cam.x = clamp(P.x - GW / 2, 0, MW - GW); cam.y = clamp(P.y - GH / 2 - 30, 0, MH - GH);
    game.room = null;
    motes.length = 0;
    for (let i = 0; i < 140; i++) motes.push({ x: cam.x + rnd(0, GW), y: cam.y + rnd(0, GH), vx: rnd(-3, 3), vy: rnd(-2, 2), ph: Math.random() * 6 });
    if (touch.el) touch.el.classList.add('on');
    game.gen = game.powered = false; game.ui = null; game.intro = false; game.energy = 100;
    sec.seated = sec.cams = false; sec.light.W = sec.light.E = false;
    for (const d of Wd.doors) { d.open = d.type === 'arch' || d.type === 'security'; d.anim = d.open ? 1 : 0; }
    if (/[?&]lit\b/.test(location.search)) { game.gen = true; game.genT = -99; game.powered = true; game.powerT = -99; }
  }

  function showMsg(text) { game.msg = text; game.msgT = 0; }

  function teleport(to, msg) {
    if (game.tp) return;
    game.tp = { t: 0, to, msg, done: false };
    Sfx.whoosh();
  }

  function updateGame(dt) {
    game.t += dt; game.roomT += dt; game.msgT += dt; game.hintT += dt;

    // mapa
    if (game.ui) updateUI(dt);
    if (!game.ui && !sec.seated && (consume('m') || consume('tab'))) { game.map = !game.map; Sfx.click(); }
    if (!game.intro && game.t > 2.6) { game.intro = true; showMsg('Está tudo apagado.'); }
    if (consume('k') || consume('`')) game.debug = !game.debug;

    // lanterna
    if (!game.ui && !sec.seated && consume('f')) { P.flash = !P.flash; Sfx.click(); }

    // movimento
    let ix = 0, iy = 0;
    if (sec.seated && !game.ui) updateSeated(dt);
    if (!game.map && !game.tp && !game.ui && !sec.seated) {
      if (keys.a || keys.arrowleft) ix -= 1;
      if (keys.d || keys.arrowright) ix += 1;
      if (keys.w || keys.arrowup) iy -= 1;
      if (keys.s || keys.arrowdown) iy += 1;
      if (touch.vx || touch.vy) { ix = touch.vx; iy = touch.vy; }
    }
    const mag = Math.hypot(ix, iy);
    P.moving = mag > 0.15;
    P.run = !!(keys.shift || touch.run);
    if (P.moving) {
      const nx = ix / Math.max(1, mag), ny = iy / Math.max(1, mag);
      const sp = (P.run ? 92 : 52) * Math.min(1, mag);
      const dx = nx * sp * dt, dy = ny * sp * dt;
      if (boxFree(P.x + dx, P.y)) P.x += dx;
      else if (Math.abs(ny) < 0.3) { // desliza em quinas
        if (boxFree(P.x + dx, P.y - 1.5)) { P.x += dx; P.y -= 1.5 * Math.sign(1); }
        else if (boxFree(P.x + dx, P.y + 1.5)) { P.x += dx; P.y += 1.5; }
      }
      if (boxFree(P.x, P.y + dy)) P.y += dy;
      else if (Math.abs(nx) < 0.3) {
        if (boxFree(P.x - 1.5, P.y + dy)) { P.x -= 1.5; P.y += dy; }
        else if (boxFree(P.x + 1.5, P.y + dy)) { P.x += 1.5; P.y += dy; }
      }
      if (Math.abs(nx) > Math.abs(ny)) P.dir = nx > 0 ? 'right' : 'left'; else P.dir = ny > 0 ? 'down' : 'up';
      P.anim += dt * (P.run ? 11 : 7.5);
      P.frame = 1 + (Math.floor(P.anim) % 4);
      if (P.frame !== P.lastFrame && (P.frame === 1 || P.frame === 3)) {
        Sfx.step(surfaceOf(game.room), P.run);
        if (P.run) puffs.push({ x: P.x + rnd(-2, 2), y: P.y, life: 0.5, vx: -nx * 10, vy: -4 });
      }
      P.lastFrame = P.frame;
    } else { P.frame = 0; P.anim = 0; P.lastFrame = 0; }

    // mira da lanterna
    const mouseActive = now - mouse.t < 2.5 && !isTouch && !sec.seated;
    let target = P.aim;
    if (mouseActive) {
      const wx = cam.x + mouse.x * GW, wy = cam.y + mouse.y * GH;
      target = Math.atan2(wy - (P.y - 9), wx - P.x);
      if (!P.moving) {
        const a = target;
        if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) P.dir = Math.cos(a) > 0 ? 'right' : 'left';
        else P.dir = Math.sin(a) > 0 ? 'down' : 'up';
      }
    } else if (P.moving) target = Math.atan2(iy, ix);
    let da = target - P.aim; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    P.aim += da * Math.min(1, dt * (mouseActive ? 18 : 9));

    // sala
    const room = roomAt(P.x, P.y - 4);
    if (room && (!game.room || room.name !== game.room.name)) {
      game.room = room; game.roomT = 0;
      if (room.name === '???') { Sfx.heartbeat(); post.glitch = 0.8; }
    }
    if (room) {
      const pk = game.powered ? 1 : 0.55;
      const tgt = [(34 + room.rgb[0] * room.amb * 3) * pk, (28 + room.rgb[1] * room.amb * 3) * pk, (54 + room.rgb[2] * room.amb * 3) * pk];
      for (let i = 0; i < 3; i++) game.amb[i] = lerp(game.amb[i], tgt[i], Math.min(1, dt * 1.5));
    }

    // interação
    game.prompt = null;
    if (!game.ui && !sec.seated && !game.tp && !game.map) game.prompt = findPrompt();
    if (game.prompt && consume('e')) game.prompt.run();
    consume('e');

    // portas
    for (const d of Wd.doors) {
      const tgt = d.open ? 1 : 0;
      if (d.anim !== tgt) {
        const sp = d.type === 'security' ? 2.6 : 4.5;
        d.anim = tgt > d.anim ? Math.min(1, d.anim + dt * sp) : Math.max(0, d.anim - dt * sp);
      }
    }
    for (const o of Wd.cabinets) if (o.playT > 0) o.playT -= dt;

    // consumo de energia
    if (game.powered) {
      const closed = (sec.door.W.open ? 0 : 1) + (sec.door.E.open ? 0 : 1);
      const lit = (sec.light.W ? 1 : 0) + (sec.light.E ? 1 : 0);
      game.usage = 1 + closed + lit + (sec.cams ? 1 : 0);
      game.energy -= (0.05 + 0.11 * closed + 0.05 * lit + (sec.cams ? 0.05 : 0)) * dt;
      if (game.energy <= 0) blackout();
    }

    // teletransporte com fade
    if (game.tp) {
      const tp = game.tp; tp.t += dt;
      if (tp.t > 0.7 && !tp.done) {
        tp.done = true; P.x = tp.to[0]; P.y = tp.to[1];
        cam.x = clamp(P.x - GW / 2, 0, MW - GW); cam.y = clamp(P.y - GH / 2, 0, MH - GH);
        motes.forEach(m => { m.x = cam.x + rnd(0, GW); m.y = cam.y + rnd(0, GH); });
        post.glitch = 1;
        if (tp.msg) showMsg(tp.msg);
      }
      if (tp.t > 1.5) game.tp = null;
    }

    // câmera
    const lookX = sec.seated ? 0 : Math.cos(P.aim) * 16, lookY = sec.seated ? -10 : Math.sin(P.aim) * 12;
    const tx = clamp(P.x + lookX - GW / 2, 0, MW - GW), ty = clamp(P.y - 8 + lookY - GH / 2, 0, MH - GH);
    const k = 1 - Math.exp(-dt * 4.5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.shake = Math.max(0, cam.shake - dt * 6);

    // luzes / energia
    for (const l of D.lights) {
      if (l.off > 0) l.off -= dt;
      else if (Math.random() < l.f * dt * 1.3) l.off = rnd(0.03, 0.2) * (Math.random() < 0.15 ? 5 : 1);
      const wob = 1 - 0.1 * l.f * (0.5 + 0.5 * Math.sin(game.t * 9 + l.ph));
      const lv = circuitLevel(l);
      if (lv > 0 && !l.lit) {
        l.lit = true;
        if (game.t > 3 && game.lampSndT <= 0 && Math.hypot(l.x - P.x, l.y - P.y) < 220) { Sfx.lampOn(); game.lampSndT = 0.08; }
      }
      l.i = (l.off > 0 ? 0.08 : wob) * lv * (l.g === 'main' ? game.power : 1);
    }
    game.lampSndT -= dt;
    if (game.gen) {
      const d = Math.hypot(P.x - GEN_POS[0], P.y - GEN_POS[1]);
      Sfx.setEngine(0.12 + 0.88 * clamp(1 - d / 380, 0, 1));
    }
    if (game.powered) game.surge -= dt;
    if (game.surge <= 0 && !game.surgeSeq) {
      game.surgeSeq = { t: 0 }; Sfx.zap();
    }
    if (game.surgeSeq) {
      const s = game.surgeSeq; s.t += dt;
      game.power = s.t < 0.08 ? 0.1 : s.t < 0.2 ? 1 : s.t < 0.55 ? 0.03 : s.t < 0.62 ? 0.7 : s.t < 0.75 ? 0.05 : 1;
      game.flashFlick = s.t < 0.75 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
      post.glitch = Math.max(post.glitch, s.t < 0.8 ? 0.5 : 0);
      if (s.t > 0.8) { game.surgeSeq = null; game.surge = rnd(35, 75); game.power = 1; }
    } else {
      game.flashFlick = Math.random() < 0.004 ? 0.3 : lerp(game.flashFlick, 1, dt * 8);
    }
    post.glitch = Math.max(0, post.glitch - dt * 1.8);

    // sons ambientes
    game.creakT -= dt; if (game.creakT < 0) { Sfx.creak(); game.creakT = rnd(9, 22); }
    game.clankT -= dt; if (game.clankT < 0) { Sfx.clank(); game.clankT = rnd(20, 45); }
    game.blipT -= dt;
    if (game.blipT < 0) {
      game.blipT = rnd(3, 8);
      if (!game.powered) { /* fliperamas mudos sem energia */ }
      else if (game.room && /ARCADE|LOBBY/.test(game.room.name)) Sfx.blip(game.power);
      else if (game.room && /CORREDOR/.test(game.room.name)) Sfx.blip(0.3 * game.power);
    }
    if (game.room && game.room.name === '???') { game.hbT -= dt; if (game.hbT < 0) { Sfx.heartbeat(); game.hbT = 1.5; } }
    let hum = 0;
    for (const l of D.lights) if (l.hum) {
      const d = Math.hypot(l.x - P.x, l.y - P.y);
      hum = Math.max(hum, clamp(1 - d / (l.r * 2.2), 0, 1) * l.i);
    }
    Sfx.setHum(hum);
    Sfx.setDrone(game.room && game.room.name === '???' ? 1.8 : game.room && /PORÃO|ESCADA/.test(game.room.name) ? 1.4 : 1);

    // partículas de poeira
    for (const m of motes) {
      m.x += (m.vx + Math.sin(game.t * 0.5 + m.ph) * 2) * dt; m.y += (m.vy + Math.cos(game.t * 0.4 + m.ph) * 1.5) * dt;
      if (m.x < cam.x - 10) m.x += GW + 20; if (m.x > cam.x + GW + 10) m.x -= GW + 20;
      if (m.y < cam.y - 10) m.y += GH + 20; if (m.y > cam.y + GH + 10) m.y -= GH + 20;
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) puffs.splice(i, 1);
    }
  }

  function drawCone(ctx, x, y, ang, len, half, a, rgb) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, len);
    grd.addColorStop(0, `rgba(${rgb},${a})`);
    grd.addColorStop(0.45, `rgba(${rgb},${a * 0.6})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grd;
    for (const [h, k] of [[half, 0.4], [half * 0.72, 0.35], [half * 0.45, 0.3]]) {
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, len, -h, h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawScene(cx, cy, o) {
    const st = { powered: game.powered, gen: game.gen, camOn: sec.cams };
    const px = Math.round(P.x) - cx, py = Math.round(P.y) - cy;
    const hx = px + Math.cos(P.aim) * 4, hy = py - 9 + Math.sin(P.aim) * 3;
    const flashOn = o.flash && P.flash ? game.flashFlick : 0;

    // mundo
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#05040a'; g.fillRect(0, 0, GW, GH);
    g.drawImage(Wd.canvas, cx, cy, GW, GH, 0, 0, GW, GH);
    Wd.drawDynamic(g, cx, cy, GW, GH, game.t, st);

    // sombra + jogador + o que fica na frente dele
    if (px > -20 && py > -20 && px < GW + 20 && py < GH + 30) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.ellipse(px, py - 1, 6, 2.2, 0, 0, Math.PI * 2); g.fill();
      const spr = Sprite.frames[P.dir][P.frame];
      g.drawImage(spr, px - 7, py - 20);
      for (const p of puffs) { g.fillStyle = `rgba(160,150,180,${p.life})`; g.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), 2, 1); }
      Wd.drawFront(g, cx, cy, Math.round(P.x), Math.round(P.y), game.t, st);
    }

    // ---- mapa de luz ----
    lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
    const a = game.amb, pw = 0.35 + 0.65 * game.power;
    const ak = o.cam ? 2.1 : 1;
    lg.fillStyle = `rgb(${a[0] * pw * ak | 0},${a[1] * pw * ak | 0},${a[2] * pw * ak | 0})`;
    lg.fillRect(0, 0, GW, GH);
    lg.globalCompositeOperation = 'lighter';
    for (const l of D.lights) {
      const lx = l.x - cx, ly = l.y - cy, R = l.r * 2.4;
      if (l.i <= 0.01 || lx < -R || ly < -R || lx > GW + R || ly > GH + R) continue;
      lg.globalAlpha = l.i;
      if (l.clip) { lg.save(); lg.beginPath(); lg.rect(l.clip[0] - cx, l.clip[1] - cy, l.clip[2], l.clip[3]); lg.clip(); }
      lg.drawImage(glow(l.c), lx - R / 2, ly - R / 2, R, R);
      if (l.clip) lg.restore();
    }
    // telas de fliperama sendo jogadas
    for (const c of Wd.cabinets) if (c.playT > 0) { lg.globalAlpha = 0.8; lg.drawImage(glow('#ffffff'), c.x + 8 - cx - 20, c.y + 10 - cy - 20, 40, 40); }
    let poly = null;
    const wox = hx + cx, woy = hy + cy;
    if (!o.cam) {
      lg.globalAlpha = 0.5;
      lg.drawImage(glow('#ffe2b8'), px - 26, py - 36, 52, 52);
    }
    if (flashOn > 0) {
      poly = castCone(wox, woy, P.aim, 170, 0.48, 96);
      lg.save(); clipPoly(lg, wox, woy, poly, cx, cy);
      drawCone(lg, hx, hy, P.aim, 165, 0.46, 1.0 * flashOn, '255,238,205');
      lg.globalAlpha = 0.5 * flashOn;
      const fx = hx + Math.cos(P.aim) * 72, fy = hy + Math.sin(P.aim) * 72;
      lg.drawImage(glow('#fff0d0'), fx - 34, fy - 34, 68, 68);
      lg.restore();
    }
    lg.globalCompositeOperation = 'source-over';
    lg.globalAlpha = 0.82;
    lg.drawImage(outsideC, cx, cy, GW, GH, 0, 0, GW, GH);
    lg.globalAlpha = 1;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lightC, 0, 0);

    // ---- brilho aditivo ----
    g.globalCompositeOperation = 'lighter';
    for (const l of D.lights) {
      const lx = l.x - cx, ly = l.y - cy, R = l.r * 1.3;
      if (l.i <= 0.01 || lx < -R || ly < -R || lx > GW + R || ly > GH + R) continue;
      g.globalAlpha = 0.2 * l.i;
      g.drawImage(glow(l.c), lx - R / 2, ly - R / 2, R, R);
    }
    if (flashOn > 0) {
      g.save(); clipPoly(g, wox, woy, poly, cx, cy);
      drawCone(g, hx, hy, P.aim, 140, 0.4, 0.09 * flashOn, '255,235,200');
      g.restore();
      g.globalAlpha = 0.9 * flashOn; g.fillStyle = '#fff6d8';
      g.fillRect(Math.round(hx + Math.cos(P.aim) * 3), Math.round(hy + Math.sin(P.aim) * 2), 1, 1);
    }
    if (!o.cam) for (const m of motes) {
      const mx = m.x - cx, my = m.y - cy;
      let b = 0.05;
      if (flashOn > 0) {
        const dx = mx - hx, dy = my - hy, d = Math.hypot(dx, dy);
        let ad = Math.atan2(dy, dx) - P.aim; while (ad > Math.PI) ad -= Math.PI * 2; while (ad < -Math.PI) ad += Math.PI * 2;
        if (d < 150 && Math.abs(ad) < 0.45) b = Math.max(b, (1 - d / 150) * (1 - Math.abs(ad) / 0.45) * 0.9 * flashOn);
      }
      b *= 0.6 + 0.4 * Math.sin(game.t * 3 + m.ph);
      if (b < 0.03) continue;
      g.globalAlpha = b; g.fillStyle = '#fff4dc';
      g.fillRect(Math.round(mx), Math.round(my), 1, 1);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawGame() {
    setRes(GW, GH);
    if (sec.seated && sec.cams) { drawCams(); return; }
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    const cx = Math.round(cam.x + sx), cy = Math.round(cam.y + sy);
    drawScene(cx, cy, { flash: !sec.seated || true });

    if (game.debug) {
      g.globalAlpha = 1;
      g.drawImage(getMaskCanvas(), cx, cy, GW, GH, 0, 0, GW, GH);
      g.strokeStyle = '#ff0'; g.lineWidth = 1;
      for (const it of D.interact) g.strokeRect(it.r[0] - cx + 0.5, it.r[1] - cy + 0.5, it.r[2], it.r[3]);
      g.fillStyle = '#fff'; g.font = `8px ${FONT}`; g.textBaseline = 'top';
      g.fillText(`${P.x | 0},${P.y | 0}`, 4, GH - 12);
    }

    drawHUD();
    if (sec.seated) drawSeatedHUD();
    if (game.map) drawMap();
    if (game.ui) drawUI();

    const fadeIn = clamp(game.t / 2.2, 0, 1);
    let tpFade = 1;
    if (game.tp) tpFade = game.tp.t < 0.7 ? 1 - game.tp.t / 0.7 : clamp((game.tp.t - 0.7) / 0.8, 0, 1);
    post.fade = fadeIn * tpFade;
    post.flash = 0;
  }

  function text(s, x, y, col, align = 'left', alpha = 1) {
    g.globalAlpha = alpha;
    g.font = `8px ${FONT}`; g.textAlign = align; g.textBaseline = 'top';
    g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1);
    g.fillStyle = col; g.fillText(s, x, y);
    g.globalAlpha = 1; g.textAlign = 'left';
  }

  function drawHUD() {
    if (!fontReady) return;
    // nome da sala (máquina de escrever)
    if (game.room) {
      const name = game.room.name, t = game.roomT;
      const n = Math.min(name.length, Math.floor(t * 18));
      const alpha = t < 3 ? 1 : clamp(1 - (t - 3) / 1.2, 0, 1);
      if (alpha > 0) {
        text(name.slice(0, n) + (n < name.length && Math.floor(t * 8) % 2 ? '_' : ''), 10, 10, '#f0e2c0', 'left', alpha);
        g.globalAlpha = alpha * 0.7; g.fillStyle = '#c04a6a';
        g.fillRect(10, 21, Math.min(1, t * 1.4) * (name.length * 8), 1);
        g.globalAlpha = 1;
      }
    }
    // dica de controles
    if (game.hintT < 9) {
      const al = clamp(Math.min(game.hintT - 1.5, 9 - game.hintT), 0, 1) * 0.85;
      if (isTouch) text('ANALOGICO: ANDAR  F: LANTERNA  E: USAR', GW / 2, GH - 14, '#a89cc0', 'center', al);
      else {
        text('WASD ANDAR  SHIFT CORRER  F LANTERNA', GW / 2, GH - 24, '#a89cc0', 'center', al);
        text('E PORTAS / INTERAGIR  M MAPA', GW / 2, GH - 13, '#a89cc0', 'center', al);
      }
    }
    // prompt
    // objetivo
    if (!game.ui && game.t > 3) {
      let obj = null;
      if (!game.gen) obj = '> LIGAR O GERADOR';
      else if (!game.powered) obj = '> PAINEL ELETRICO';
      else if (game.t - game.powerT < 6) obj = '> ENERGIA OK';
      if (obj) text(obj, GW - 10, 22, game.powered ? '#8dff7a' : '#c8b8e8', 'right', 0.55 + 0.15 * Math.sin(game.t * 2));
    }
    if (game.powered && !sec.seated) energyHUD(GW - 10, game.t - game.powerT < 6 ? 34 : 22, 'right');
    if (game.prompt && !game.tp && !game.ui) {
      const pulse = 0.65 + 0.35 * Math.sin(game.t * 6);
      text(isTouch ? game.prompt.label.replace('[E]', '(E)') : game.prompt.label, GW / 2, GH - 46, '#ffe9a8', 'center', pulse);
    }
    // mensagem
    if (game.msg && game.msgT < 4) {
      const n = Math.min(game.msg.length, Math.floor(game.msgT * 24));
      const al = game.msgT > 3 ? 1 - (game.msgT - 3) : 1;
      text(game.msg.slice(0, n), GW / 2, GH / 2 + 34, '#e8d8ff', 'center', al);
    }
    // indicador da lanterna
    const bx = GW - 20, by = 10;
    g.globalAlpha = 0.75;
    g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, 12, 7);
    g.fillStyle = P.flash ? '#ffe9a8' : '#3a3448'; g.fillRect(bx, by, 7, 5); g.fillRect(bx + 7, by - 1, 3, 7);
    g.globalAlpha = 1;
  }

  function drawMap() {
    g.fillStyle = 'rgba(4,2,10,0.88)'; g.fillRect(0, 0, GW, GH);
    const s = (GW - 24) / MW, w = MW * s, h = MH * s, ox = (GW - w) / 2, oy = (GH - h) / 2 + 4;
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.92; g.drawImage(img.map, ox, oy, w, h);
    g.imageSmoothingEnabled = false; g.globalAlpha = 1;
    g.strokeStyle = 'rgba(200,180,255,0.35)'; g.strokeRect(ox - 0.5, oy - 0.5, w + 1, h + 1);
    if (Math.floor(game.t * 3) % 2 === 0) {
      g.fillStyle = '#ff3050';
      g.fillRect(Math.round(ox + P.x * s) - 2, Math.round(oy + (P.y - 6) * s) - 2, 4, 4);
      g.fillStyle = '#fff'; g.fillRect(Math.round(ox + P.x * s) - 1, Math.round(oy + (P.y - 6) * s) - 1, 2, 2);
    }
    if (!game.powered && Math.floor(game.t * 2) % 2 === 0) {
      const o = game.gen ? PANEL_POS : GEN_POS;
      g.strokeStyle = '#ffd24a'; g.lineWidth = 1;
      g.strokeRect(Math.round(ox + o[0] * s) - 4.5, Math.round(oy + o[1] * s) - 4.5, 9, 9);
    }
    if (fontReady) text('MAPA', 12, 4, '#f0e2c0');
  }

  // =====================================================================
  //  ENERGIA — gerador (Power RM 2) e painel de distribuição (Power RM 1)
  // =====================================================================
  const GEN_POS = [1220, 200], PANEL_POS = [1003, 192];
  const N = 1, E = 2, S = 4, Wb = 8;
  const DIRS = [[N, 0, -1, S], [E, 1, 0, Wb], [S, 0, 1, N], [Wb, -1, 0, E]];
  const rotM = m => ((m << 1) | (m >> 3)) & 15;
  const PC = 6, PR = 4, SRC = 1, OUTS = [0, 2, 3], OUT_NAMES = ['ARCADES', 'COZINHA', 'SALOES'];
  const CELL = 24, GX = 108, GY = 52;

  function circuitLevel(l) {
    if (l.g === 'emg') return 1;
    if (l.g === 'secW' || l.g === 'secE') return game.powered && sec.light[l.g.slice(3)] ? (Math.random() < 0.04 ? 0.4 : 1) : 0;
    if (l.g === 'gen') {
      if (!game.gen) return 0;
      const t = game.t - game.genT;
      return t < 1.2 ? (Math.random() < 0.4 ? 1 : 0.1) : 1;
    }
    if (!game.powered) return 0;
    const t = game.t - game.powerT;
    if (t < l.onAt) return 0;
    if (t < l.onAt + 0.55) return Math.random() < 0.45 ? 1 : 0.05;
    return 1;
  }

  const actionPressed = () => consume('e') || consume(' ') || consume('enter');
  const closePressed = () => consume('escape') || consume('q') || consume('x');
  const uiMouse = () => [mouse.x * GW, mouse.y * GH];

  function openGen() {
    game.ui = { type: 'gen', t: 0, ph: 0, needle: 0, speed: 2.2, hits: 0, zone: newZone(0.22), flash: 0, flashC: '#5f5', done: -1, shake: 0 };
    Sfx.click();
  }
  function newZone(w) { const a = rnd(0.12, 0.88 - w); return [a, a + w]; }

  function makePanel() {
    const base = new Array(PC * PR).fill(0), seen = new Array(PC * PR).fill(false);
    const st = [[0, SRC]]; seen[SRC * PC] = true;
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const opts = DIRS.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < PC && ny < PR && !seen[ny * PC + nx]; });
      if (!opts.length) { st.pop(); continue; }
      const [b, dx, dy, ob] = opts[(Math.random() * opts.length) | 0];
      base[y * PC + x] |= b; base[(y + dy) * PC + x + dx] |= ob; seen[(y + dy) * PC + x + dx] = true;
      st.push([x + dx, y + dy]);
    }
    base[SRC * PC] |= Wb;
    OUTS.forEach(r => { base[r * PC + PC - 1] |= E; });
    const ui = { type: 'panel', t: 0, base, rot: base.map(() => 0), ang: base.map(() => 0), cur: [0, SRC], lit: [], outs: [], solved: false, doneT: 0, kb: false };
    do {
      for (let i = 0; i < base.length; i++) { ui.rot[i] = (Math.random() * 4) | 0; ui.ang[i] = ui.rot[i] * Math.PI / 2; }
      flow(ui);
    } while (ui.outs.filter(Boolean).length > 0);
    return ui;
  }
  function tileMask(ui, i) { let m = ui.base[i]; for (let k = 0; k < ui.rot[i] % 4; k++) m = rotM(m); return m; }
  function flow(ui) {
    const lit = new Array(PC * PR).fill(false);
    const q = [];
    if (tileMask(ui, SRC * PC) & Wb) { lit[SRC * PC] = true; q.push(SRC * PC); }
    while (q.length) {
      const i = q.shift(), x = i % PC, y = (i / PC) | 0, m = tileMask(ui, i);
      for (const [b, dx, dy, ob] of DIRS) {
        if (!(m & b)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= PC || ny >= PR) continue;
        const j = ny * PC + nx;
        if (!lit[j] && (tileMask(ui, j) & ob)) { lit[j] = true; q.push(j); }
      }
    }
    ui.lit = lit;
    ui.outs = OUTS.map(r => lit[r * PC + PC - 1] && !!(tileMask(ui, r * PC + PC - 1) & E));
  }
  function openPanel() { game.ui = makePanel(); Sfx.click(); }

  function rotateTile(ui, i) {
    const before = ui.outs.filter(Boolean).length;
    ui.rot[i]++; Sfx.tick(); flow(ui);
    const after = ui.outs.filter(Boolean).length;
    if (after > before) Sfx.ding(after - 1);
    if (after === OUTS.length) { ui.solved = true; ui.doneT = 0; Sfx.success(); post.glitch = 0.4; }
  }

  function startPowerOn() {
    game.powered = true; game.powerT = game.t; game.energy = 100;
    for (const l of D.lights) if (l.g === 'main') { l.onAt = 0.5 + Math.hypot(l.x - PANEL_POS[0], l.y - PANEL_POS[1]) / 420 + rnd(0, 0.35); l.lit = false; }
    Sfx.clunk(); setTimeout(() => Sfx.powerUp(), 350);
    cam.shake = 3; post.glitch = 1;
    showMsg('A energia voltou.');
    game.surge = rnd(40, 80);
  }

  function updateUI(dt) {
    const ui = game.ui; ui.t += dt;
    if (closePressed() && !(ui.type === 'panel' && ui.solved) && !(ui.type === 'gen' && ui.done >= 0)) { game.ui = null; Sfx.click(); return; }
    const click = consume('click');
    const [mx, my] = uiMouse();
    // botão fechar (canto do painel)
    if (click && mx > 322 && mx < 342 && my > 20 && my < 34) { game.ui = null; Sfx.click(); return; }

    if (ui.type === 'gen') {
      ui.flash = Math.max(0, ui.flash - dt * 3); ui.shake = Math.max(0, ui.shake - dt * 10);
      if (ui.done >= 0) {
        ui.done += dt;
        ui.needle = lerp(ui.needle, 0.92 + Math.sin(ui.t * 40) * 0.02, dt * 4);
        if (ui.done > 1.6) { game.ui = null; showMsg('O gerador ligou. Agora o painel elétrico.'); }
        return;
      }
      ui.ph += ui.speed * dt;
      ui.needle = 0.5 - 0.5 * Math.cos(ui.ph);
      if (actionPressed() || click) {
        if (ui.needle >= ui.zone[0] && ui.needle <= ui.zone[1]) {
          ui.hits++; ui.flash = 1; ui.flashC = '#6f6'; Sfx.pull(true); cam.shake = 1.5;
          if (ui.hits >= 3) {
            ui.done = 0; game.gen = true; game.genT = game.t; Sfx.engineStart(); post.glitch = 0.6; cam.shake = 3;
          } else { ui.zone = newZone(0.22 - ui.hits * 0.05); ui.speed += 0.7; }
        } else {
          ui.hits = Math.max(0, ui.hits - 1); ui.flash = 1; ui.flashC = '#f44'; ui.shake = 4; Sfx.pull(false);
        }
      }
      return;
    }

    // painel
    for (let i = 0; i < ui.ang.length; i++) {
      const tgt = ui.rot[i] * Math.PI / 2;
      ui.ang[i] += (tgt - ui.ang[i]) * Math.min(1, dt * 18);
    }
    if (ui.solved) {
      ui.doneT += dt;
      if (ui.doneT > 1.8) { game.ui = null; startPowerOn(); }
      return;
    }
    const mv = (dx, dy) => { ui.kb = true; ui.cur = [clamp(ui.cur[0] + dx, 0, PC - 1), clamp(ui.cur[1] + dy, 0, PR - 1)]; };
    if (consume('arrowleft') || consume('a')) mv(-1, 0);
    if (consume('arrowright') || consume('d')) mv(1, 0);
    if (consume('arrowup') || consume('w')) mv(0, -1);
    if (consume('arrowdown') || consume('s')) mv(0, 1);
    if (actionPressed()) { ui.kb = true; rotateTile(ui, ui.cur[1] * PC + ui.cur[0]); }
    if (click) {
      const tx = Math.floor((mx - GX) / CELL), ty = Math.floor((my - GY) / CELL);
      if (tx >= 0 && ty >= 0 && tx < PC && ty < PR) { ui.kb = false; ui.cur = [tx, ty]; rotateTile(ui, ty * PC + tx); }
    }
  }

  function frame9(x, y, w, h) {
    g.fillStyle = 'rgba(2,1,6,0.72)'; g.fillRect(0, 0, GW, GH);
    g.fillStyle = '#0b0910'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#3a3346'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#17141c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#211d29'; g.fillRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = '#5a5068';
    for (const [rx, ry] of [[x + 4, y + 4], [x + w - 6, y + 4], [x + 4, y + h - 6], [x + w - 6, y + h - 6]]) g.fillRect(rx, ry, 2, 2);
    // listras de aviso
    for (let i = 0; i < w - 16; i += 8) { g.fillStyle = (i / 8) % 2 ? '#2a2410' : '#5a4a14'; g.fillRect(x + 8 + i, y + h - 10, 8, 3); }
    text('ESC', x + w - 22, y + 6, '#6a6078');
  }

  function drawUI() {
    const ui = game.ui;
    if (ui.type === 'gen') return drawGen(ui);
    drawPanel(ui);
  }

  function drawGen(ui) {
    const sx = Math.round((Math.random() - 0.5) * ui.shake);
    frame9(40 + sx, 18, 304, 180);
    text('PARTIDA DO GERADOR', GW / 2 + sx, 28, '#f0e2c0', 'center');
    const cx = GW / 2 + sx, cy = 128, R = 62;
    g.lineCap = 'butt';
    g.lineWidth = 12; g.strokeStyle = '#0d0b12';
    g.beginPath(); g.arc(cx, cy, R, Math.PI, Math.PI * 2); g.stroke();
    g.lineWidth = 10; g.strokeStyle = '#2b2533';
    g.beginPath(); g.arc(cx, cy, R, Math.PI, Math.PI * 2); g.stroke();
    if (ui.done < 0) {
      g.strokeStyle = '#2f9a44';
      g.beginPath(); g.arc(cx, cy, R, Math.PI + ui.zone[0] * Math.PI, Math.PI + ui.zone[1] * Math.PI); g.stroke();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.strokeStyle = '#3fff70'; g.lineWidth = 14;
      g.beginPath(); g.arc(cx, cy, R, Math.PI + ui.zone[0] * Math.PI, Math.PI + ui.zone[1] * Math.PI); g.stroke();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    } else {
      g.strokeStyle = '#8a2a20';
      g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.8, Math.PI * 2); g.stroke();
    }
    g.lineWidth = 1; g.strokeStyle = '#6a6078';
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI, r0 = R - 10, r1 = i % 5 ? R - 14 : R - 18;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    const na = Math.PI + ui.needle * Math.PI;
    g.lineWidth = 2; g.strokeStyle = '#ff5a40';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(na) * (R - 4), cy + Math.sin(na) * (R - 4)); g.stroke();
    g.lineWidth = 1;
    g.fillStyle = '#4a4252'; g.fillRect(cx - 5, cy - 5, 10, 10);
    g.fillStyle = '#8a8098'; g.fillRect(cx - 2, cy - 2, 4, 4);
    if (ui.flash > 0) { g.globalAlpha = ui.flash * 0.5; g.fillStyle = ui.flashC; g.fillRect(cx - R - 8, cy - R - 8, R * 2 + 16, R + 12); g.globalAlpha = 1; }
    // tentativas
    for (let i = 0; i < 3; i++) {
      const px = cx - 22 + i * 18, py = 142;
      g.fillStyle = '#0d0b12'; g.fillRect(px - 1, py - 1, 12, 12);
      g.fillStyle = i < ui.hits ? '#ffd24a' : '#2b2533'; g.fillRect(px, py, 10, 10);
      if (i < ui.hits) { g.fillStyle = '#fff3b0'; g.fillRect(px + 2, py + 2, 3, 3); }
    }
    if (ui.done >= 0) text('GERADOR LIGADO', cx, 164, '#8dff7a', 'center');
    else text(isTouch ? 'TOQUE NA ZONA VERDE' : 'E / CLIQUE NA ZONA VERDE', cx, 164, '#a89cc0', 'center');
  }

  function drawWire(m, col, w) {
    const h = w / 2;
    if (m & N) g.fillRect(-h, -CELL / 2, w, CELL / 2 + h);
    if (m & S) g.fillRect(-h, -h, w, CELL / 2 + h);
    if (m & E) g.fillRect(-h, -h, CELL / 2 + h, w);
    if (m & Wb) g.fillRect(-CELL / 2, -h, CELL / 2 + h, w);
  }

  function drawPanel(ui) {
    frame9(40, 18, 304, 180);
    text('PAINEL DE DISTRIBUIÇÃO', GW / 2, 26, '#f0e2c0', 'center');
    const pulse = 0.75 + 0.25 * Math.sin(game.t * 8);
    // gerador (entrada)
    const sy = GY + SRC * CELL;
    g.fillStyle = '#0d0b12'; g.fillRect(50, sy + 1, 46, 22);
    g.fillStyle = '#2b2533'; g.fillRect(51, sy + 2, 44, 20);
    text('GER', 56, sy + 8, '#ffd24a');
    g.fillStyle = '#ffd24a'; g.fillRect(86, sy + 9, 6, 6);
    g.fillStyle = '#ffd24a'; g.fillRect(96, sy + CELL / 2 - 2, GX - 96, 4);
    // peças
    for (let y = 0; y < PR; y++) for (let x = 0; x < PC; x++) {
      const i = y * PC + x, px = GX + x * CELL, py = GY + y * CELL;
      g.fillStyle = '#0d0b12'; g.fillRect(px, py, CELL, CELL);
      g.fillStyle = (x + y) % 2 ? '#1c1924' : '#1f1b28'; g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
      g.fillStyle = '#2e2838';
      g.fillRect(px + 2, py + 2, 1, 1); g.fillRect(px + CELL - 3, py + 2, 1, 1); g.fillRect(px + 2, py + CELL - 3, 1, 1); g.fillRect(px + CELL - 3, py + CELL - 3, 1, 1);
      const lit = ui.lit[i], m = ui.base[i];
      g.save(); g.translate(px + CELL / 2, py + CELL / 2); g.rotate(ui.ang[i]);
      if (lit) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25 * pulse; g.fillStyle = '#ff8a20'; drawWire(m, 0, 8);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      g.fillStyle = lit ? '#ffd24a' : '#4a4252'; drawWire(m, 0, 4);
      const single = [N, E, S, Wb].filter(b => m & b).length === 1;
      g.fillStyle = lit ? '#fff3b0' : '#5a5068';
      if (single) { g.fillRect(-4, -4, 8, 8); g.fillStyle = lit ? '#ff9a20' : '#2b2533'; g.fillRect(-2, -2, 4, 4); }
      else g.fillRect(-3, -3, 6, 6);
      g.restore();
    }
    // cursor
    if (ui.kb && !ui.solved && Math.floor(game.t * 4) % 2 === 0) {
      g.strokeStyle = '#7fe0ff'; g.lineWidth = 1;
      g.strokeRect(GX + ui.cur[0] * CELL + 0.5, GY + ui.cur[1] * CELL + 0.5, CELL - 1, CELL - 1);
    }
    // saídas
    OUTS.forEach((r, k) => {
      const on = ui.outs[k], oy = GY + r * CELL;
      const ex = GX + PC * CELL;
      g.fillStyle = on ? '#ffd24a' : '#3a3346'; g.fillRect(ex, oy + CELL / 2 - 2, 8, 4);
      g.fillStyle = '#0d0b12'; g.fillRect(ex + 8, oy + 7, 10, 10);
      g.fillStyle = on ? '#7dff6a' : '#24301f'; g.fillRect(ex + 9, oy + 8, 8, 8);
      if (on) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * pulse;
        g.drawImage(glow('#7dff6a'), ex + 1, oy - 1, 24, 24);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      text(OUT_NAMES[k], ex + 22, oy + 8, on ? '#c8ffb8' : '#6a6078');
    });
    if (ui.solved) {
      const a = Math.min(1, ui.doneT * 3);
      text('ENERGIA RESTAURADA', GW / 2, 160, '#8dff7a', 'center', a);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, 0.3 - ui.doneT * 0.3);
      g.fillStyle = '#ffe080'; g.fillRect(GX, GY, PC * CELL, PR * CELL);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    } else {
      text('LEVE A ENERGIA ATE AS 3 SAIDAS', GW / 2, 158, '#c8b8e8', 'center');
      text(isTouch ? 'TOQUE NAS PEÇAS PARA GIRAR' : 'CLIQUE OU SETAS + E PARA GIRAR', GW / 2, 170, '#7a6f8a', 'center');
    }
  }

  // =====================================================================
  //  INTERAÇÕES — portas, fliperamas, pontos fixos
  // =====================================================================
  function playerInDoor(d) {
    const bot = d.y + d.h + (d.horiz ? 7 : 0);
    return P.x + 4 > d.x && P.x - 4 < d.x + d.w && P.y > d.y && P.y - 5 < bot;
  }
  function findPrompt() {
    for (const it of D.interact) {
      if (!inR(P.x, P.y - 2, it.r)) continue;
      return { label: it.label, run: () => runInteract(it) };
    }
    // fliperama: em frente à tela
    for (const c of Wd.cabinets) {
      if (!c.screen) continue;
      if (Math.abs(P.x - (c.x + 8)) < 8 && P.y - (c.y + 22) >= 0 && P.y - (c.y + 22) < 12) {
        return { label: '[E] jogar', run: () => playCabinet(c) };
      }
    }
    // portas
    let best = null, bd = 1e9;
    for (const d of Wd.doors) {
      if (d.type === 'arch') continue;
      let dist;
      if (d.horiz) { if (Math.abs(P.x - d.cx) > d.w / 2 + 3) continue; dist = Math.abs((P.y - 3) - d.cy); if (dist > 17) continue; }
      else { if (Math.abs((P.y - 3) - d.cy) > d.h / 2 + 3) continue; dist = Math.abs(P.x - d.cx); if (dist > 15) continue; }
      if (dist < bd) { bd = dist; best = d; }
    }
    if (best) {
      const d = best;
      if (d.type === 'exit') return { label: '[E] porta', run: () => { Sfx.rattle(); cam.shake = 2; showMsg(d.msg); } };
      if (d.type === 'security') return d.open ? null : { label: '[E] porta de segurança', run: () => { Sfx.deny(); showMsg('Só abre pela mesa de segurança.'); } };
      return {
        label: d.open ? '[E] fechar porta' : '[E] abrir porta',
        run: () => {
          if (d.open) { if (playerInDoor(d)) return; d.open = false; Sfx.doorClose(); }
          else { d.open = true; Sfx.doorOpen(); }
        }
      };
    }
    return null;
  }
  function runInteract(it) {
    if (it.id === 'gen') { if (game.gen) showMsg('O gerador já está funcionando.'); else openGen(); }
    else if (it.id === 'panel') {
      if (game.powered) showMsg('A energia já está ligada.');
      else if (!game.gen) { Sfx.deny(); showMsg('Sem corrente. O gerador está parado.'); }
      else openPanel();
    } else if (it.id === 'desk') sitDown();
    else if (it.to) teleport(it.to, it.msg);
  }
  const ARCADE_MSG = ['GAME OVER', 'INSERT COIN', 'HIGH SCORE: ???', 'PLAYER 1 READY', 'CONTINUE? 9...', 'TOP SCORE: H.A.W.'];
  function playCabinet(c) {
    if (!game.powered) { Sfx.deny(); showMsg('Está desligado.'); return; }
    c.playT = 1.4; Sfx.coin(); setTimeout(() => Sfx.blip(3), 180);
    showMsg(ARCADE_MSG[(Math.random() * ARCADE_MSG.length) | 0]);
  }

  // =====================================================================
  //  SALA DE SEGURANÇA — portas, luzes e câmeras
  // =====================================================================
  function sitDown() {
    sec.seated = true; sec.cams = false;
    P.x = CHAIR[0]; P.y = CHAIR[1]; P.dir = 'up'; P.frame = 0; P.aim = -Math.PI / 2;
    Sfx.click();
    if (!game.powered) showMsg('Sem energia. Nada responde.');
  }
  function standUp() { sec.seated = false; sec.cams = false; Sfx.click(); }
  function toggleSecDoor(k) {
    if (!game.powered) { Sfx.deny(); showMsg('Sem energia.'); return; }
    const d = sec.door[k]; d.open = !d.open; Sfx.secDoor(!d.open); cam.shake = 1.5;
  }
  function toggleSecLight(k) {
    if (!game.powered) { Sfx.deny(); showMsg('Sem energia.'); return; }
    sec.light[k] = !sec.light[k]; Sfx.lightToggle(sec.light[k]);
  }
  function openCams() {
    if (!game.powered) { Sfx.deny(); showMsg('Sem energia.'); return; }
    sec.cams = true; sec.camStatic = 0.35; Sfx.camSwitch();
  }
  // botões da barra inferior (mouse/toque)
  const SEAT_BTNS = [
    { k: 'doorW', label: 'PORTA O', key: 'A' }, { k: 'lightW', label: 'LUZ O', key: 'Q' },
    { k: 'cams', label: 'CAMERAS', key: 'S' },
    { k: 'lightE', label: 'LUZ L', key: 'E' }, { k: 'doorE', label: 'PORTA L', key: 'D' },
  ];
  const btnRect = i => [8 + i * 74, GH - 26, 70, 18];
  function seatAction(k) {
    if (k === 'doorW') toggleSecDoor('W'); else if (k === 'doorE') toggleSecDoor('E');
    else if (k === 'lightW') toggleSecLight('W'); else if (k === 'lightE') toggleSecLight('E');
    else if (k === 'cams') openCams();
  }
  function updateSeated(dt) {
    sec.camStatic = Math.max(0, sec.camStatic - dt);
    if (sec.cams) { updateCams(); return; }
    if (consume('escape') || consume('w') || consume('arrowup')) { standUp(); return; }
    if (consume('a') || consume('arrowleft')) seatAction('doorW');
    if (consume('d') || consume('arrowright')) seatAction('doorE');
    if (consume('q')) seatAction('lightW');
    if (consume('e')) seatAction('lightE');
    if (consume('s') || consume(' ') || consume('c') || consume('arrowdown')) seatAction('cams');
    if (consume('click')) {
      const [mx, my] = uiMouse();
      SEAT_BTNS.forEach((b, i) => { const r = btnRect(i); if (mx >= r[0] && my >= r[1] && mx < r[0] + r[2] && my < r[1] + r[3]) seatAction(b.k); });
      if (mx > GW - 70 && my < 22) standUp();
    }
  }
  // painel do mapa das câmeras (planta enviada)
  const CMAP = { x: GW - 160, y: GH - 92, w: 154, h: Math.round(154 * 768 / 1376) };
  const camBtn = c => [Math.round(CMAP.x + c.x * CMAP.w / MW) - 5, Math.round(CMAP.y + c.y * CMAP.h / MH) - 3, 11, 7];
  function setCam(i) { if (i === sec.cam) return; sec.cam = (i + Wd.cameras.length) % Wd.cameras.length; sec.camStatic = 0.3; Sfx.camSwitch(); }
  function updateCams() {
    if (consume('escape') || consume('s') || consume(' ') || consume('arrowdown') || consume('c')) { sec.cams = false; Sfx.camSwitch(); return; }
    if (!game.powered) { sec.cams = false; return; }
    for (let n = 1; n <= 9; n++) if (consume(String(n))) setCam(n - 1);
    if (consume('0')) setCam(9);
    if (consume('arrowleft') || consume('a')) setCam(sec.cam - 1);
    if (consume('arrowright') || consume('d')) setCam(sec.cam + 1);
    if (consume('click')) {
      const [mx, my] = uiMouse();
      Wd.cameras.forEach((c, i) => { const r = camBtn(c); if (mx >= r[0] - 1 && my >= r[1] - 1 && mx < r[0] + r[2] + 1 && my < r[1] + r[3] + 1) setCam(i); });
      if (mx < 60 && my > GH - 22) { sec.cams = false; Sfx.camSwitch(); }
    }
  }

  // dígitos 3x5 para os botões do mapa
  const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function tinyNum(n, x, y, col) {
    g.fillStyle = col;
    String(n).split('').forEach((ch, k) => { const p = DIG[+ch]; for (let i = 0; i < 15; i++) if (p[i] === '1') g.fillRect(x + k * 4 + (i % 3), y + ((i / 3) | 0), 1, 1); });
  }

  function energyHUD(x, y, align) {
    const e = Math.max(0, Math.ceil(game.energy));
    const col = e > 30 ? '#8dff7a' : e > 12 ? '#ffd24a' : '#ff5a4a';
    text(`ENERGIA ${e}%`, x, y, col, align, 0.85);
    const n = game.usage || 1, bx = align === 'right' ? x - 5 * 6 : x;
    for (let i = 0; i < 5; i++) { g.fillStyle = i < n ? (i < 2 ? '#8dff7a' : i < 4 ? '#ffd24a' : '#ff5a4a') : '#2a2434'; g.fillRect(bx + i * 6, y + 11, 4, 4); }
  }

  function drawSeatedHUD() {
    text('MESA DE SEGURANÇA', 10, 10, '#f0e2c0');
    if (game.powered) energyHUD(10, 22, 'left');
    else text('SEM ENERGIA', 10, 22, '#ff5a4a', 'left', 0.6 + 0.4 * Math.sin(game.t * 5));
    text('ESC', GW - 10, 10, '#7a6f8a', 'right');
    SEAT_BTNS.forEach((b, i) => {
      const [x, y, w, h] = btnRect(i);
      const on = b.k === 'doorW' ? !sec.door.W.open : b.k === 'doorE' ? !sec.door.E.open : b.k === 'lightW' ? sec.light.W : b.k === 'lightE' ? sec.light.E : false;
      g.fillStyle = '#0b0910'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = on ? (b.k.startsWith('door') ? '#7a2020' : '#6a6020') : '#211d29'; g.fillRect(x, y, w, h);
      g.fillStyle = on ? (b.k.startsWith('door') ? '#ff4040' : '#ffe060') : '#3a3346'; g.fillRect(x + 3, y + 7, 4, 4);
      if (!game.powered) g.fillStyle = '#2a2434', g.fillRect(x + 3, y + 7, 4, 4);
      text(b.label, x + w / 2 + 4, y + 6, game.powered ? '#e8dcff' : '#5a5068', 'center');
      if (!isTouch) text(b.key, x + w - 2, y - 9, '#6a6078', 'right', 0.8);
    });
  }

  function drawCams() {
    const c = Wd.cameras[sec.cam];
    const cx = Math.round(clamp(c.x - GW / 2, 0, MW - GW)), cy = Math.round(clamp(c.y - GH / 2, 0, MH - GH));
    if (game.powered) {
      drawScene(cx, cy, { flash: false, cam: true });
      // filtro de câmera de segurança
      g.globalCompositeOperation = 'saturation'; g.globalAlpha = 0.8; g.fillStyle = '#808080'; g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.fillStyle = '#c8f4d4'; g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.06; g.fillStyle = '#4aff8a'; g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect((Math.random() * GW) | 0, (Math.random() * GH) | 0, 1, 1); }
      const band = (game.t * 50) % (GH + 20) - 10;
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, band, GW, 5);
    } else { g.fillStyle = '#000'; g.fillRect(0, 0, GW, GH); }
    // estática ao trocar
    const stc = game.powered ? sec.camStatic / 0.3 : 1;
    if (stc > 0) {
      for (let y = 0; y < GH; y += 2) { const v = Math.random() * 200 | 0; g.fillStyle = `rgba(${v},${v},${v},${Math.min(1, stc)})`; g.fillRect(0, y, GW, 2); }
    }
    // textos
    text(`CAM ${String(c.n).padStart(2, '0')}`, 10, 10, '#e8ffe8');
    text(c.name, 10, 22, '#b8e8c8');
    if (Math.floor(game.t * 2) % 2) { g.fillStyle = '#ff3030'; g.fillRect(GW - 52, 12, 5, 5); }
    text('REC', GW - 10, 11, '#ffd0d0', 'right');
    const secs = Math.floor(game.t);
    text(`00:${String((secs / 60 | 0) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, GW - 10, 23, '#b8e8c8', 'right');
    if (!game.powered) text('SEM SINAL', GW / 2, GH / 2 - 4, '#e8e8e8', 'center');
    // mapa (planta) com os botões das câmeras
    const M = CMAP;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(M.x - 3, M.y - 3, M.w + 6, M.h + 6);
    g.imageSmoothingEnabled = true; g.globalAlpha = 0.8; g.drawImage(img.map, M.x, M.y, M.w, M.h); g.globalAlpha = 1; g.imageSmoothingEnabled = false;
    g.strokeStyle = '#4aff8a'; g.lineWidth = 1; g.strokeRect(M.x - 2.5, M.y - 2.5, M.w + 5, M.h + 5);
    // jogador (você)
    g.fillStyle = '#ffffff'; g.fillRect(Math.round(M.x + P.x * M.w / MW) - 1, Math.round(M.y + P.y * M.h / MH) - 2, 3, 3);
    Wd.cameras.forEach((cm, i) => {
      const [x, y, w, h] = camBtn(cm), sel = i === sec.cam;
      g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = sel ? (Math.floor(game.t * 4) % 2 ? '#4aff8a' : '#2a9a5a') : '#2a3a34'; g.fillRect(x, y, w, h);
      tinyNum(cm.n, x + (cm.n > 9 ? 2 : 4), y + 1, sel ? '#002010' : '#c8ffd8');
    });
    text(isTouch ? 'SAIR' : 'ESC SAIR', 10, GH - 14, '#7a8a7f');
    if (!isTouch) text('1-9 / SETAS', 10, GH - 26, '#5a6a5f');
    post.fade = 1;
  }

  function blackout() {
    game.energy = 0; game.powered = false; game.gen = false;
    Sfx.powerDown(); Sfx.engineStop();
    sec.door.W.open = sec.door.E.open = true; sec.light.W = sec.light.E = false; sec.cams = false;
    for (const l of D.lights) l.lit = false;
    post.glitch = 1; cam.shake = 3;
    showMsg('A energia acabou.');
  }

  // =====================================================================
  //  LOOP
  // =====================================================================
  function resize() {
    const cv = Post.canvas;
    const vw = innerWidth, vh = innerHeight, ar = 16 / 9;
    let w = vw, h = vw / ar;
    if (h > vh) { h = vh; w = vh * ar; }
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (pw > 2560) { ph = Math.round(ph * 2560 / pw); pw = 2560; }
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  }
  addEventListener('resize', resize);

  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; now += dt;
    resize();
    if (state === 'loading') { state = 'title'; }
    if (state === 'title') { drawTitle(now); post.fade = 1; post.glitch = Math.random() < 0.02 ? 0.5 : 0; post.flash = 0; }
    else if (state === 'cutscene') { anyInput(); drawCutscene(dt); }
    else if (state === 'game') { updateGame(dt); drawGame(); }
    for (const k in pressed) pressed[k] = false;
    Post.render(buf, { time: now, glitch: post.glitch, flash: post.flash, curv: post.curv, fade: post.fade });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // atalho de depuração: ?play pula direto para o jogo
  if (/[?&]play\b/.test(location.search)) {
    const iv = setInterval(() => { if (loaded === toLoad.length) { clearInterval(iv); try { Sfx.init(); } catch (e) {} startGame(); } }, 50);
    window.__hawton = { P, game, cam, setPos: (x, y) => { P.x = x; P.y = y; cam.x = clamp(x - GW / 2, 0, MW - GW); cam.y = clamp(y - GH / 2, 0, MH - GH); } };
  }
  if (/[?&]cut\b/.test(location.search)) {
    const iv = setInterval(() => { if (loaded === toLoad.length) { clearInterval(iv); try { Sfx.init(); } catch (e) {} startCutscene(); } }, 50);
  }
})();
