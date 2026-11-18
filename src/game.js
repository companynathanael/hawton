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
  const toLoad = [['facade', 'assets/facade.jpg']];
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
  // visão por sala (só no artifact de teste): window.HAWTON_VISION = true ou ?vis
  const VISION = !!window.HAWTON_VISION || /[?&]vis\b/.test(location.search);
  const camX = x => VISION ? x : clamp(x, 0, MW - GW), camY = y => VISION ? y : clamp(y, 0, MH - GH);
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
  // gráficos novos: perfil das luzes por sala
  const GFX_ON = !!window.Gfx && !/[?&]lowgfx\b/.test(location.search);
  const ARC_ROOMS = /^(arcade[1-5]|lobby)$/, DIM_ROOMS = /^(kitchen|hallA|hallB)$/;
  const mixHex = (a, b, k) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  D.lights.forEach(l => {
    const rm = D.rooms.find(r => inR(l.x, l.y, r.r));
    l.room = rm ? rm.id : null; l.gi = 1; l.ph2 = Math.random() * 6.28;
    l.kind = l.cab ? 'cab' : Wd.doors.some(d => d.neon && Math.abs(d.cx - l.x) < 2 && Math.abs(d.cy - l.y) < 2) ? 'neon' : 'room';
    if (!GFX_ON) return;
    if (l.kind === 'neon') { l.r = 10; l.gi = 0.6; }
    else if (ARC_ROOMS.test(l.room || '')) {
      if (l.kind === 'cab') { l.r *= 1.7; l.gi = 1.25; }
      else if (l.g === 'main') { l.c = mixHex(l.c, '#d8d0e8', 0.8); l.gi = 0.35; }
    } else if (DIM_ROOMS.test(l.room || '') && l.g === 'main') l.gi = 0.6;
    else if (/^(c1|c5|c6|v|mid|stairs)$/.test(l.room || '') && l.g === 'main') { l.c = mixHex(l.c, '#d8d0e8', 0.65); l.gi = 0.6; }
    l.rgb = hex(l.c).map(v => v / 255);
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

  let gfxReady = false;
  function startGame() {
    if (GFX_ON && !gfxReady) { gfxReady = true; window.Gfx.init(Wd); }
    state = 'game';
    setRes(GW, GH);
    Sfx.interior();
    game.t = 0; game.fadeT = 0; game.hintT = 0;
    P.x = D.spawn[0]; P.y = D.spawn[1]; P.dir = 'up'; P.aim = -Math.PI / 2;
    cam.x = camX(P.x - GW / 2); cam.y = camY(P.y - 8 - GH / 2 - 30); vis.id = vis.prev = null;
    game.room = null;
    motes.length = 0;
    for (let i = 0; i < 140; i++) motes.push({ x: cam.x + rnd(0, GW), y: cam.y + rnd(0, GH), vx: rnd(-3, 3), vy: rnd(-2, 2), ph: Math.random() * 6 });
    if (touch.el) touch.el.classList.add('on');
    game.gen = game.powered = false; game.ui = null; game.intro = false; game.energy = 100; game.hasKey = false;
    sec.seated = sec.cams = false; sec.light.W = sec.light.E = false;
    for (const d of Wd.doors) { d.open = d.type === 'arch' || d.type === 'security'; d.anim = d.open ? 1 : 0; d.locked = !!d.lock; d.broken = false; }
    resetBreaks();
    resetScares();
    if (/[?&]lit\b/.test(location.search)) { game.hasKey = true; Wd.doors.forEach(d => d.locked = false); game.gen = true; game.genT = -99; game.powered = true; game.powerT = -99; }
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
    if (!game.intro && game.t > 2.6) { game.intro = true; if (!game.powered) showMsg('Está tudo apagado.'); }
    if (consume('k') || consume('`')) game.debug = !game.debug;
    if (consume('g') && GFX_ON) { game.gfx = game.gfx === false; showMsg(game.gfx === false ? 'Gráficos: simples' : 'Gráficos: altos'); }

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
      const pk = game.powered ? 1 : 0.16;
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
        cam.x = camX(P.x - GW / 2); cam.y = camY(P.y - 8 - GH / 2); vis.id = vis.prev = null;
        motes.forEach(m => { m.x = cam.x + rnd(0, GW); m.y = cam.y + rnd(0, GH); });
        post.glitch = 1;
        if (tp.msg) showMsg(tp.msg);
      }
      if (tp.t > 1.5) game.tp = null;
    }

    // câmera
    const lookX = sec.seated ? 0 : Math.cos(P.aim) * 16, lookY = sec.seated ? -10 : Math.sin(P.aim) * 12;
    const tx = camX(P.x + lookX - GW / 2), ty = camY(P.y - 8 + lookY - GH / 2);
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
      l.i = (l.off > 0 ? 0.08 : wob) * lv * (l.g === 'main' ? game.power : 1) * l.gi;
      if (GFX_ON && l.kind === 'cab') l.i *= 0.8 + 0.2 * Math.sin(game.t * 1.7 + l.ph2 * 3) * Math.sin(game.t * 0.6 + l.ph2);
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
    updateScares(dt);
    updateBreaks(dt);
    updateVision(dt);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) puffs.splice(i, 1);
    }
  }

  // =====================================================================
  //  SUSTOS — só antes da energia voltar (tijolos, lâmpadas, portas...)
  // =====================================================================
  const debris = [], falling = [], sparks = [], smoke = [], flashes = [];
  const SCARE_ORDER = ['bricks', 'cabinet', 'lamp', 'slam', 'flash', 'rumble', 'bricks', 'lamp'];
  const scare = { t: 9, n: 0, last: '', pending: [] };
  function resetScares() {
    debris.length = falling.length = sparks.length = smoke.length = flashes.length = 0;
    scare.t = 9; scare.n = 0; scare.last = ''; scare.pending.length = 0; game.flashOut = 0;
  }
  const clearSpot = (x, y) => Wd.walkable(x, y) && Wd.walkable(x - 4, y) && Wd.walkable(x + 4, y) && Wd.walkable(x, y - 3) && !Wd.occludes(x, y - 4);
  function spotAhead(min, max) {
    for (let k = 0; k < 24; k++) {
      const d = rnd(min, max), a = P.aim + rnd(-0.35, 0.35);
      const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      // linha de visão livre até o ponto
      let ok = clearSpot(x, y);
      for (let s = 0.2; ok && s < 1; s += 0.2) if (Wd.occludes(P.x + (x - P.x) * s, P.y - 6 + (y - P.y) * s)) ok = false;
      if (ok) return [x, y];
    }
    return null;
  }
  const later = (dt, fn) => scare.pending.push({ t: dt, fn });
  function dropThing(x, y, kind, delay, h) {
    falling.push({ x, y, h: h || rnd(70, 95), vh: 0, kind, delay, spin: Math.random() * 6, landed: false });
  }
  function dustBurst(x, y, n, spread) {
    for (let i = 0; i < n; i++) smoke.push({ x: x + rnd(-spread, spread), y: y + rnd(-spread / 2, spread / 2), vx: rnd(-14, 14), vy: rnd(-8, 4), r: rnd(3, 7), life: rnd(1.2, 2.6), max: 2.6 });
  }
  function doScare(kind) {
    if (kind === 'bricks') {
      const sp = spotAhead(26, 52); if (!sp) return false;
      Sfx.pebbles(); cam.shake = 1;
      for (let i = 0; i < 7; i++) falling.push({ x: sp[0] + rnd(-6, 6), y: sp[1] + rnd(-3, 3), h: rnd(60, 90), vh: 0, kind: 'grit', delay: rnd(0, 0.5), landed: false });
      const n = 9 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) dropThing(sp[0] + rnd(-13, 13), sp[1] + rnd(-6, 6), 'brick', 0.8 + i * 0.05 + rnd(0, 0.08));
      dropThing(sp[0] + rnd(-4, 4), sp[1] + rnd(-2, 2), 'slab', 0.78);
      if (Math.random() < 0.6) dropThing(sp[0] + rnd(-10, 10), sp[1] + rnd(-4, 4), 'slab', 0.95);
      later(0.95, () => { Sfx.crash(1); cam.shake = 6; post.glitch = Math.max(post.glitch, 0.35); dustBurst(sp[0], sp[1], 34, 14); });
      return true;
    }
    if (kind === 'lamp') {
      const sp = spotAhead(24, 46); if (!sp) return false;
      Sfx.zap(); flashes.push({ x: sp[0], y: sp[1] - 30, life: 0.35, max: 0.35, c: '#d8f0ff', r: 90 });
      dropThing(sp[0], sp[1], 'tube', 0.25, 80);
      later(0.62, () => {
        Sfx.glass(); cam.shake = 3.5;
        flashes.push({ x: sp[0], y: sp[1], life: 0.5, max: 0.5, c: '#bfe6ff', r: 120 });
        for (let i = 0; i < 26; i++) sparks.push({ x: sp[0], y: sp[1], z: 2, vx: rnd(-60, 60), vy: rnd(-30, 30), vz: rnd(20, 80), life: rnd(0.3, 0.9) });
        dustBurst(sp[0], sp[1], 8, 6);
      });
      return true;
    }
    if (kind === 'slam') {
      let best = null, bd = 170;
      for (const d of Wd.doors) {
        if (d.type !== 'door' || !d.open || playerInDoor(d)) continue;
        const dist = Math.hypot(d.cx - P.x, d.cy - P.y);
        if (dist < bd && dist > 30) { bd = dist; best = d; }
      }
      if (!best) return false;
      best.open = false; best.anim = Math.min(best.anim, 0.3); Sfx.slam(); cam.shake = 4; post.glitch = Math.max(post.glitch, 0.3);
      dustBurst(best.cx, best.cy + 6, 10, 8);
      return true;
    }
    if (kind === 'cabinet') {
      let best = null, bd = 150;
      for (const c of Wd.cabinets) {
        if (!c.screen) continue;
        const dist = Math.hypot(c.x + 8 - P.x, c.y + 20 - P.y);
        if (dist < bd && dist > 24) { bd = dist; best = c; }
      }
      if (!best) return false;
      best.playT = 1.4; Sfx.glitchCab(); Sfx.sting(); post.glitch = Math.max(post.glitch, 0.6); cam.shake = 2;
      return true;
    }
    if (kind === 'flash') {
      if (!P.flash) return false;
      game.flashOut = 3.2; Sfx.zap();
      later(0.9, () => Sfx.heartbeat()); later(1.9, () => Sfx.heartbeat());
      later(2.7, () => { Sfx.sting(); cam.shake = 2.5; });
      return true;
    }
    if (kind === 'rumble') {
      Sfx.rumble(2.6); cam.shake = 2;
      for (let i = 0; i < 6; i++) later(0.3 + i * 0.25, () => {
        cam.shake = Math.max(cam.shake, 3);
        const x = cam.x + rnd(20, GW - 20), y = cam.y + rnd(30, GH - 10);
        if (!clearSpot(x, y)) return;
        for (let j = 0; j < 5; j++) falling.push({ x: x + rnd(-4, 4), y: y + rnd(-2, 2), h: rnd(50, 90), vh: 0, kind: 'grit', delay: rnd(0, 0.3), landed: false });
        later(0.5, () => dustBurst(x, y, 5, 4));
      });
      later(1.6, () => { if (Math.random() < 0.6) { const sp = spotAhead(30, 60); if (sp) { dropThing(sp[0], sp[1], 'brick', 0); later(0.35, () => { Sfx.crash(0.6); cam.shake = 4; dustBurst(sp[0], sp[1], 8, 5); }); } } });
      return true;
    }
    return false;
  }
  function updateScares(dt) {
    for (let i = scare.pending.length - 1; i >= 0; i--) { const p = scare.pending[i]; p.t -= dt; if (p.t <= 0) { scare.pending.splice(i, 1); p.fn(); } }
    const active = !game.powered && !game.ui && !sec.seated && !game.tp && !game.map && state === 'game';
    if (active && game.t > 5) {
      scare.t -= dt;
      if (scare.t <= 0) {
        let kinds = scare.n < SCARE_ORDER.length ? [SCARE_ORDER[scare.n]] : [];
        kinds = kinds.concat(['bricks', 'lamp', 'slam', 'cabinet', 'flash', 'rumble'].filter(k => k !== scare.last).sort(() => Math.random() - 0.5));
        const k = kinds.find(doScare);
        if (k) { scare.last = k; scare.n++; scare.t = rnd(14, 26); } else scare.t = 2;
      }
    }
    // objetos caindo
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.vh += 420 * dt; f.h -= f.vh * dt; f.spin += dt * 14;
      if (f.h <= 0) {
        falling.splice(i, 1);
        if (f.kind === 'brick') { debris.push({ x: f.x, y: f.y, kind: 'brick', r: Math.random() < 0.5, c: Math.random() }); for (let j = 0; j < 3; j++) debris.push({ x: f.x + rnd(-5, 5), y: f.y + rnd(-3, 3), kind: 'chip', c: Math.random() }); }
        else if (f.kind === 'slab') { debris.push({ x: f.x, y: f.y, kind: 'slab', c: Math.random() }); for (let j = 0; j < 6; j++) debris.push({ x: f.x + rnd(-9, 9), y: f.y + rnd(-4, 4), kind: 'chip', c: Math.random() * 0.5 }); }
        else if (f.kind === 'tube') { debris.push({ x: f.x - 4, y: f.y, kind: 'tube' }); for (let j = 0; j < 12; j++) debris.push({ x: f.x + rnd(-10, 10), y: f.y + rnd(-5, 5), kind: 'glass' }); }
        else if (f.kind === 'grit' && Math.random() < 0.5) debris.push({ x: f.x, y: f.y, kind: 'chip', c: Math.random() });
      }
    }
    if (debris.length > 900) debris.splice(0, debris.length - 900);
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.vz -= 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z = Math.max(0, s.z + s.vz * dt); if (s.z === 0) { s.vz *= -0.3; s.vx *= 0.6; s.vy *= 0.6; } if (s.life <= 0) sparks.splice(i, 1); }
    for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy *= 0.97; s.r += dt * 4; if (s.life <= 0) smoke.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
    // lanterna falhando
    if (game.flashOut > 0) {
      game.flashOut -= dt;
      game.flashFlick = game.flashOut > 2.6 ? (Math.random() < 0.5 ? 0 : 0.8) : game.flashOut > 0.4 ? 0 : (Math.random() < 0.5 ? 0.2 : 1);
    }
  }
  function drawDebris(cx, cy) {
    for (const d of debris) {
      const x = Math.round(d.x - cx), y = Math.round(d.y - cy);
      if (x < -10 || y < -10 || x > VW + 10 || y > VH + 10) continue;
      if (d.kind === 'brick') {
        const w = d.r ? 4 : 7, h = d.r ? 6 : 4;
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - w / 2 + 1, y - h + 1, w, h);
        g.fillStyle = d.c < 0.5 ? '#8a3e2e' : '#7a3a30'; g.fillRect(x - w / 2, y - h, w, h);
        g.fillStyle = '#b25a40'; g.fillRect(x - w / 2, y - h, w, 1);
        g.fillStyle = '#4a2018'; g.fillRect(x - w / 2, y - 1, w, 1);
      } else if (d.kind === 'slab') {
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - 6, y - 4, 14, 6);
        g.fillStyle = d.c < 0.5 ? '#6e6a66' : '#625e5a'; g.fillRect(x - 7, y - 6, 13, 6); g.fillRect(x - 5, y - 7, 8, 1);
        g.fillStyle = '#8e8a84'; g.fillRect(x - 7, y - 6, 13, 1);
        g.fillStyle = '#3e3a38'; g.fillRect(x - 2, y - 5, 1, 3); g.fillRect(x - 1, y - 3, 3, 1); g.fillRect(x - 7, y - 1, 13, 1);
        g.fillStyle = '#7a3a30'; g.fillRect(x + 2, y - 5, 3, 2);
      } else if (d.kind === 'chip') {
        g.fillStyle = d.c < 0.4 ? '#9a9088' : d.c < 0.7 ? '#7a3a30' : '#5a5450'; g.fillRect(x, y, 1 + (d.c > 0.8), 1);
      } else if (d.kind === 'tube') {
        g.fillStyle = '#c8d4dc'; g.fillRect(x, y - 1, 5, 2); g.fillRect(x + 7, y, 4, 2);
        g.fillStyle = '#5a6068'; g.fillRect(x - 1, y - 1, 1, 2); g.fillRect(x + 11, y, 1, 2);
      } else if (d.kind === 'glass') {
        g.fillStyle = 'rgba(220,240,255,0.7)'; g.fillRect(x, y, 1, 1);
      }
    }
  }
  function drawFalling(cx, cy) {
    for (const f of falling) {
      if (f.delay > 0) continue;
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy), hy = Math.round(y - f.h);
      const sh = clamp(1 - f.h / 100, 0.15, 1);
      g.fillStyle = `rgba(0,0,0,${0.45 * sh})`;
      g.beginPath(); g.ellipse(x, y, 1 + 3 * sh, 0.6 + 1.2 * sh, 0, 0, Math.PI * 2); g.fill();
      if (f.kind === 'brick') {
        const r = Math.floor(f.spin) % 2, w = r ? 4 : 7, h = r ? 6 : 4;
        g.fillStyle = '#8a3e2e'; g.fillRect(x - w / 2, hy - h, w, h);
        g.fillStyle = '#b25a40'; g.fillRect(x - w / 2, hy - h, w, 1);
      } else if (f.kind === 'slab') {
        g.fillStyle = '#6e6a66'; g.fillRect(x - 7, hy - 6, 13, 6); g.fillStyle = '#8e8a84'; g.fillRect(x - 7, hy - 6, 13, 1);
      } else if (f.kind === 'tube') {
        const r = Math.floor(f.spin / 2) % 2;
        g.fillStyle = '#e8f4ff'; if (r) g.fillRect(x - 6, hy - 2, 12, 2); else g.fillRect(x - 1, hy - 8, 2, 10);
        g.fillStyle = '#5a6068'; if (r) { g.fillRect(x - 7, hy - 2, 1, 2); g.fillRect(x + 6, hy - 2, 1, 2); }
      } else { g.fillStyle = '#8a8078'; g.fillRect(x, hy, 1, 1); }
    }
    for (const s of smoke) {
      const a = 0.35 * clamp(s.life / s.max, 0, 1) * clamp(s.life * 3, 0, 1);
      g.fillStyle = `rgba(150,140,130,${a})`;
      g.beginPath(); g.arc(s.x - cx, s.y - cy - 3, s.r, 0, Math.PI * 2); g.fill();
    }
  }
  function lightScares(cx, cy) {
    for (const f of flashes) {
      const R = f.r * 2;
      lg.globalAlpha = (f.life / f.max) * (Math.random() < 0.3 ? 0.4 : 1);
      lg.drawImage(glow(f.c), f.x - cx - R / 2, f.y - cy - R / 2, R, R);
    }
    for (const s of sparks) { lg.globalAlpha = 0.5 * Math.min(1, s.life * 2); lg.drawImage(glow('#ffd890'), s.x - cx - 8, s.y - s.z - cy - 8, 16, 16); }
  }
  function drawSparks(cx, cy) {
    for (const s of sparks) {
      g.globalAlpha = Math.min(1, s.life * 2); g.fillStyle = s.life > 0.4 ? '#fff6c0' : '#ffa040';
      g.fillRect(Math.round(s.x - cx), Math.round(s.y - s.z - cy), 1, 1);
    }
    g.globalAlpha = 1;
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

  let VW = GW, VH = GH;
  let plC = null;
  function drawScene(cx, cy, o) {
    if (lightC.width !== VW || lightC.height !== VH) { lightC.width = VW; lightC.height = VH; }
    const st = { powered: game.powered, gen: game.gen, camOn: sec.cams };
    const px = Math.round(P.x) - cx, py = Math.round(P.y) - cy;
    const hx = px + Math.cos(P.aim) * 4, hy = py - 9 + Math.sin(P.aim) * 3;
    const flashOn = o.flash && P.flash ? game.flashFlick : 0;

    // mundo
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#05040a'; g.fillRect(0, 0, VW, VH);
    g.drawImage(Wd.canvas, cx, cy, VW, VH, 0, 0, VW, VH);
    Wd.drawDynamic(g, cx, cy, VW, VH, game.t, st);

    drawDebris(cx, cy);
    // sombra + jogador + o que fica na frente dele
    if (px > -20 && py > -20 && px < VW + 20 && py < VH + 30) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.ellipse(px, py - 1, 6, 2.2, 0, 0, Math.PI * 2); g.fill();
      const spr = Sprite.frames[P.dir][P.frame];
      g.drawImage(spr, px - 7, py - 20);
      for (const p of puffs) { g.fillStyle = `rgba(160,150,180,${p.life})`; g.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), 2, 1); }
      Wd.drawFront(g, cx, cy, Math.round(P.x), Math.round(P.y), game.t, st);
    }

    drawKey(cx, cy);
    drawFalling(cx, cy);
    // ---- mapa de luz ----
    lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
    const a = o.amb || game.amb, pw = 0.35 + 0.65 * game.power;
    const ak = o.cam ? Math.min(2.1, 150 / Math.max(a[0], a[1], a[2], 1)) : 1;
    lg.fillStyle = `rgb(${a[0] * pw * ak | 0},${a[1] * pw * ak | 0},${a[2] * pw * ak | 0})`;
    lg.fillRect(0, 0, VW, VH);
    lg.globalCompositeOperation = 'lighter';
    for (const l of D.lights) {
      const lx = l.x - cx, ly = l.y - cy, R = l.r * 2.4;
      if (l.i <= 0.01 || lx < -R || ly < -R || lx > VW + R || ly > VH + R) continue;
      lg.globalAlpha = l.i;
      if (l.clip) { lg.save(); lg.beginPath(); lg.rect(l.clip[0] - cx, l.clip[1] - cy, l.clip[2], l.clip[3]); lg.clip(); }
      lg.drawImage(glow(l.c), lx - R / 2, ly - R / 2, R, R);
      if (l.clip) lg.restore();
    }
    // telas de fliperama sendo jogadas
    for (const c of Wd.cabinets) if (c.playT > 0) { lg.globalAlpha = 0.8; lg.drawImage(glow('#ffffff'), c.x + 8 - cx - 20, c.y + 10 - cy - 20, 40, 40); }
    lightScares(cx, cy);
    let poly = null;
    const wox = hx + cx, woy = hy + cy;
    if (!o.cam) {
      lg.globalAlpha = 0.5;
      lg.drawImage(glow('#ffe2b8'), px - 26, py - 36, 52, 52);
    }
    if (flashOn > 0) {
      const FL = game.powered ? 210 : 290;
      poly = castCone(wox, woy, P.aim, FL, 0.46, 110);
      lg.save(); clipPoly(lg, wox, woy, poly, cx, cy);
      drawCone(lg, hx, hy, P.aim, FL - 5, 0.44, 1.15 * flashOn, '255,238,205');
      lg.globalAlpha = 0.5 * flashOn;
      const fx = hx + Math.cos(P.aim) * 90, fy = hy + Math.sin(P.aim) * 90;
      lg.drawImage(glow('#fff0d0'), fx - 34, fy - 34, 68, 68);
      lg.restore();
    }
    lg.globalCompositeOperation = 'source-over';
    lg.globalAlpha = 0.82;
    lg.drawImage(outsideC, cx, cy, VW, VH, 0, 0, VW, VH);
    lg.globalAlpha = 1;
    let composed = null;
    if (GFX_ON && !o.cam && window.Gfx.ok && game.gfx !== false) {
      const vl = [];
      for (const l of D.lights) {
        if (l.i <= 0.03 || !l.rgb) continue;
        const lx = l.x - cx, ly = l.y - cy, R = l.r * 2.6;
        if (lx < -R || ly < -R || lx > VW + R || ly > VH + R) continue;
        vl.push({ x: lx, y: ly, r: l.r, rgb: l.rgb, k: l.i, s: l.i * l.r / (40 + Math.hypot(lx - VW / 2, ly - VH / 2)) });
      }
      vl.sort((a, b) => b.s - a.s);
      if (flashOn > 0) vl.unshift({ x: hx + Math.cos(P.aim) * 40, y: hy + Math.sin(P.aim) * 40, r: game.powered ? 50 : 70, rgb: [1, 0.9, 0.75], k: 0.5 * flashOn });
      const rid = game.room ? game.room.id : '';
      const dim = DIM_ROOMS.test(rid);
      const pwr = game.powered ? 1 : 0;
      composed = window.Gfx.compose(buf, lightC, cx, cy, vl, { px, py, time: game.t, expo: dim ? 1.0 : 1.75, specK: dim ? 0.45 : 1.0, emK: (dim ? 0.45 : 0.85) * pwr });
    }
    if (composed) { g.globalCompositeOperation = 'copy'; g.drawImage(composed, 0, 0); g.globalCompositeOperation = 'source-over'; }
    else { g.globalCompositeOperation = 'multiply'; g.drawImage(lightC, 0, 0); }
    // jogador sempre legível: camada leve por cima da luz (atrás de móveis continua escondido)
    if (!o.cam && px > -20 && py > -20 && px < VW + 20 && py < VH + 30) {
      if (!plC) { plC = document.createElement('canvas'); }
      if (plC.width !== VW || plC.height !== VH) { plC.width = VW; plC.height = VH; }
      const pc = plC.getContext('2d');
      pc.globalCompositeOperation = 'source-over'; pc.clearRect(0, 0, VW, VH);
      pc.drawImage(Sprite.frames[P.dir][P.frame], px - 7, py - 20);
      pc.globalCompositeOperation = 'destination-out';
      Wd.drawFront(pc, cx, cy, Math.round(P.x), Math.round(P.y), game.t, st);
      pc.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = game.powered ? 0.4 : 0.5;
      g.drawImage(plC, 0, 0); g.globalAlpha = 1;
    }

    // ---- brilho aditivo ----
    g.globalCompositeOperation = 'lighter';
    for (const l of D.lights) {
      const lx = l.x - cx, ly = l.y - cy, R = l.r * 1.3;
      if (l.i <= 0.01 || lx < -R || ly < -R || lx > VW + R || ly > VH + R) continue;
      g.globalAlpha = (composed ? 0.12 : 0.2) * l.i;
      g.drawImage(glow(l.c), lx - R / 2, ly - R / 2, R, R);
    }
    if (flashOn > 0) {
      g.save(); clipPoly(g, wox, woy, poly, cx, cy);
      drawCone(g, hx, hy, P.aim, game.powered ? 180 : 250, 0.4, 0.09 * flashOn, '255,235,200');
      g.restore();
      g.globalAlpha = 0.9 * flashOn; g.fillStyle = '#fff6d8';
      g.fillRect(Math.round(hx + Math.cos(P.aim) * 3), Math.round(hy + Math.sin(P.aim) * 2), 1, 1);
    }
    drawSparks(cx, cy);
    if (!game.hasKey && !o.cam) {
      const kx = 716 - cx, ky = 612 - cy, tw = Math.max(0, Math.sin(game.t * 3));
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25 + 0.5 * tw; g.drawImage(glow('#ffe090'), kx - 6, ky - 5, 12, 12);
      g.globalAlpha = tw; g.fillStyle = '#fff4c0'; g.fillRect(kx, ky - 2, 1, 5); g.fillRect(kx - 2, ky, 5, 1);
      g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    }
    if (!o.cam) for (const m of motes) {
      const mx = m.x - cx, my = m.y - cy;
      let b = 0.05;
      if (flashOn > 0) {
        const dx = mx - hx, dy = my - hy, d = Math.hypot(dx, dy);
        let ad = Math.atan2(dy, dx) - P.aim; while (ad > Math.PI) ad -= Math.PI * 2; while (ad < -Math.PI) ad += Math.PI * 2;
        if (d < 240 && Math.abs(ad) < 0.45) b = Math.max(b, (1 - d / 240) * (1 - Math.abs(ad) / 0.45) * 0.9 * flashOn);
      }
      b *= 0.6 + 0.4 * Math.sin(game.t * 3 + m.ph);
      if (b < 0.03) continue;
      g.globalAlpha = b; g.fillStyle = '#fff4dc';
      g.fillRect(Math.round(mx), Math.round(my), 1, 1);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // =====================================================================
  //  VISÃO POR SALA — só o cômodo atual aparece; o resto fica preto
  // =====================================================================
  const maskCache = {};
  const vis = { id: null, prev: null, t: 1 };
  function getMask(id) {
    let m = maskCache[id];
    if (m) return m;
    m = document.createElement('canvas'); m.width = MW; m.height = MH;
    const c = m.getContext('2d');
    c.fillStyle = '#030208'; c.fillRect(0, 0, MW, MH);
    c.globalCompositeOperation = 'destination-out';
    const def = Wd.ROOMS.find(r => r.id === id);
    for (const [x0, y0, x1, y1] of def.rects) c.fillRect((x0 - 1) * 8, (y0 - 1) * 8, (x1 - x0 + 3) * 8, (y1 - y0 + 3) * 8);
    // portas do cômodo
    for (const d of Wd.DOORS) {
      const [a, b, e, f] = d.r;
      if (def.rects.some(([x0, y0, x1, y1]) => a >= x0 - 1 && e <= x1 + 1 && b >= y0 - 1 && f <= y1 + 1)) c.fillRect(a * 8 - 2, b * 8 - 8, (e - a + 1) * 8 + 4, (f - b + 1) * 8 + 10);
    }
    return (maskCache[id] = m);
  }
  function updateVision(dt) {
    const rm = roomAt(P.x, P.y - 4);
    if (rm && rm.id !== vis.id) { vis.prev = vis.id; vis.id = rm.id; vis.t = vis.prev ? 0 : 1; }
    vis.t = Math.min(1, vis.t + dt / 0.25);
  }
  // luzes da sala de segurança: abrem um pedaço do corredor do lado de fora
  const SEC_PEEK = { W: { x: 68, y: 158, r: 64, clip: [56, 120, 32, 150] }, E: { x: 252, y: 96, r: 70, clip: [208, 32, 150, 96] } };
  let visTmp = null;
  function roomMask(cx, cy) {
    if (!vis.id) return;
    if (!visTmp) { visTmp = document.createElement('canvas'); visTmp.width = GW; visTmp.height = GH; }
    const v = visTmp.getContext('2d');
    v.globalCompositeOperation = 'source-over'; v.globalAlpha = 1; v.clearRect(0, 0, GW, GH);
    if (vis.prev && vis.t < 1) {
      v.globalAlpha = 1 - vis.t; v.drawImage(getMask(vis.prev), cx, cy, GW, GH, 0, 0, GW, GH);
      v.globalAlpha = vis.t;
    }
    v.drawImage(getMask(vis.id), cx, cy, GW, GH, 0, 0, GW, GH);
    v.globalAlpha = 1;
    // portas abertas: mostra um pedaço do cômodo do outro lado
    {
      const T = 8;
      const cur = Wd.ROOMS.find(r => r.id === vis.id);
      const inRects = (rm, tx, ty) => rm && rm.rects.some(([x0, y0, x1, y1]) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1);
      const roomOfT = (tx, ty) => Wd.ROOMS.find(r => inRects(r, tx, ty));
      v.globalCompositeOperation = 'destination-out';
      for (const d of Wd.doors) {
        if (d.type === 'exit' || d.anim < 0.3) continue;
        const [a, b, e, f] = d.r;
        if (!cur.rects.some(([x0, y0, x1, y1]) => a >= x0 - 1 && e <= x1 + 1 && b >= y0 - 1 && f <= y1 + 1)) continue;
        const sides = d.horiz ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (const [sx, sy] of sides) {
          const tx = sx < 0 ? a - 1 : sx > 0 ? e + 1 : Math.round((a + e) / 2), ty = sy < 0 ? b - 1 : sy > 0 ? f + 1 : Math.round((b + f) / 2);
          const nb = roomOfT(tx, ty);
          if (!nb || nb.id === vis.id || nb.id === 'secret') continue;
          const L = 64, al = Math.min(1, (d.anim - 0.3) / 0.5);
          const x0 = a * T, y0 = b * T, x1 = (e + 1) * T, y1 = (f + 1) * T;
          let rx, ry, rw, rh, gx0, gy0, gx1, gy1;
          if (sy) { rx = x0 - 24; rw = x1 - x0 + 48; ry = sy < 0 ? y0 - L : y1; rh = L; gx0 = gx1 = 0; gy0 = sy < 0 ? y0 : y1; gy1 = sy < 0 ? y0 - L : y1 + L; }
          else { ry = y0 - 24; rh = y1 - y0 + 48; rx = sx < 0 ? x0 - L : x1; rw = L; gy0 = gy1 = 0; gx0 = sx < 0 ? x0 : x1; gx1 = sx < 0 ? x0 - L : x1 + L; }
          v.save(); v.beginPath();
          for (const [p0, q0, p1, q1] of nb.rects) v.rect(p0 * T - cx, (q0 - 1) * T - cy, (p1 - p0 + 1) * T, (q1 - q0 + 2) * T);
          v.rect(x0 - cx, y0 - cy, x1 - x0, y1 - y0);
          v.clip();
          const gr = sy ? v.createLinearGradient(0, gy0 - cy, 0, gy1 - cy) : v.createLinearGradient(gx0 - cx, 0, gx1 - cx, 0);
          gr.addColorStop(0, `rgba(0,0,0,${0.9 * al})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
          v.fillStyle = gr; v.fillRect(rx - cx, ry - cy, rw, rh); v.restore();
        }
      }
      v.globalCompositeOperation = 'source-over';
    }
    if (vis.id === 'security' && game.powered) {
      v.globalCompositeOperation = 'destination-out';
      for (const k of ['W', 'E']) {
        if (!sec.light[k]) continue;
        const pk = SEC_PEEK[k], l = D.lights.find(l => l.g === 'sec' + k), a = l ? clamp(l.i, 0, 1) : 1;
        v.save(); v.beginPath(); v.rect(pk.clip[0] - cx, pk.clip[1] - cy, pk.clip[2], pk.clip[3]); v.clip();
        const gr = v.createRadialGradient(pk.x - cx, pk.y - cy, 6, pk.x - cx, pk.y - cy, pk.r);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.85})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        v.fillStyle = gr; v.fillRect(0, 0, GW, GH); v.restore();
      }
    }
    g.drawImage(visTmp, 0, 0);
  }
  function drawGame() {
    setRes(GW, GH);
    if (sec.seated && sec.cams) { drawCams(); if (game.ui) drawUI(); return; }
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    const cx = Math.round(cam.x + sx), cy = Math.round(cam.y + sy);
    drawScene(cx, cy, { flash: !sec.seated || true });
    if (VISION) roomMask(cx, cy);

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
      if (!game.hasKey) obj = '> PEGAR A CHAVE NA RECEPCAO';
      else if (!game.gen) obj = '> LIGAR O GERADOR';
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
    if (game.hasKey) { const kx = bx - 18, ky = by; g.fillStyle = '#000'; g.fillRect(kx - 1, ky - 1, 12, 7); g.fillStyle = '#e8c050'; g.fillRect(kx, ky, 4, 4); g.fillRect(kx + 4, ky + 1, 6, 2); g.fillRect(kx + 8, ky + 3, 2, 2); g.fillStyle = '#000'; g.fillRect(kx + 1, ky + 1, 2, 2); }
    g.globalAlpha = 1;
  }

  // =====================================================================
  //  MAPA ESQUEMÁTICO — caixas = salas, linhas = corredores
  // =====================================================================
  const CORR = {
    c1: [[26.5, 12.5], [28.5, 12.5], [28.5, 5.5], [108.5, 5.5], [108.5, 11.5], [114.5, 11.5]],
    v: [[71.5, 5.5], [71.5, 65.5]],
    c5: [[71.5, 65.5], [140.5, 65.5]],
    c6: [[8.5, 15.5], [8.5, 89.5], [50.5, 89.5], [50.5, 70]],
    mid: [[41.5, 36.5], [41.5, 62.5]],
    service: [[140.5, 22.5], [140.5, 39.5], [140.5, 32], [133.5, 32]],
    stairs: [[105.5, 65.5], [105.5, 82.5]],
  };
  const MAP_LABEL = {
    security: ['SEGURANCA', 'SEG'], arcade1: ['ARCADE 1', 'A1'], arcade2: ['ARCADE 2', 'A2'], arcade3: ['ARCADE 3', 'A3'],
    arcade4: ['ARCADE 4', 'A4'], arcade5: ['ARCADE 5', 'A5'], kitchen: ['COZINHA', 'COZ'], lobby: ['LOBBY', 'LOB'],
    hallA: ['SALAO A', 'SA'], hallB: ['SALAO B', 'SB'], power1: ['FORCA 1', 'F1'], power2: ['FORCA 2', 'F2'], basement: ['PORAO', 'P'],
  };
  const HIDDEN_ROOMS = { secret: 1 };
  const troomS = new Int16Array(Wd.TW * Wd.TH).fill(-1);
  Wd.ROOMS.forEach((rm, i) => { if (!CORR[rm.id] && !HIDDEN_ROOMS[rm.id]) rm.rects.forEach(([x0, y0, x1, y1]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) troomS[y * Wd.TW + x] = i; }); });
  const roomIdAtTile = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= Wd.TW || y >= Wd.TH) return null; for (const rm of Wd.ROOMS) for (const [x0, y0, x1, y1] of rm.rects) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return rm.id; return null; };
  function nearestOn(poly, px, py) {
    let best = null, bd = 1e9;
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[i + 1], dx = bx - ax, dy = by - ay;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(px - qx, py - qy);
      if (d < bd) { bd = d; best = [qx, qy]; }
    }
    return best;
  }
  // segmentos (em tiles) que formam a rede de corredores e ligações das portas
  const MAP_LINES = [], MAP_EXITS = [];
  for (const id in CORR) { const p = CORR[id]; for (let i = 0; i < p.length - 1; i++) MAP_LINES.push([p[i], p[i + 1]]); }
  for (const d of Wd.DOORS) {
    const [x0, y0, x1, y1] = d.r, cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, horiz = (x1 - x0) >= (y1 - y0) && !(x0 === x1 && y1 > y0);
    if (d.type === 'exit') { MAP_EXITS.push([x0, y0, x1 + 1, y1 + 1]); continue; }
    const sides = horiz ? [[cx, y0 - 0.5], [cx, y1 + 1.5]] : [[x0 - 0.5, cy], [x1 + 1.5, cy]];
    MAP_LINES.push([sides[0], sides[1]]);
    for (const [sx, sy] of sides) { const id = roomIdAtTile(sx, sy); if (CORR[id]) MAP_LINES.push([[cx, cy], nearestOn(CORR[id], cx, cy)]); }
  }
  const schemCache = {};
  // th = tema: cores {fill, edge, line, exit}
  function schematic(w, h, th, key) {
    const k = key + w + 'x' + h; if (schemCache[k]) return schemCache[k];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'), sx = w / Wd.TW, sy = h / Wd.TH;
    const id = new Int16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) id[y * w + x] = troomS[Math.floor((y + 0.5) / sy) * Wd.TW + Math.floor((x + 0.5) / sx)];
    const im = c.createImageData(w, h), px = im.data;
    const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const F = hex(th.fill), E = hex(th.edge);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = id[y * w + x]; if (v < 0) continue;
      const nb = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h ? -2 : id[yy * w + xx];
      const edge = nb(x - 1, y) !== v || nb(x + 1, y) !== v || nb(x, y - 1) !== v || nb(x, y + 1) !== v;
      const col = edge ? E : F, o = (y * w + x) * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    const lw = th.lw || 1;
    c.fillStyle = th.line;
    for (const [[ax, ay], [bx, by]] of MAP_LINES) {
      const x0 = ax * sx, y0 = ay * sy, x1 = bx * sx, y1 = by * sy, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + (x1 - x0) * i / n - lw / 2), Math.round(y0 + (y1 - y0) * i / n - lw / 2), lw, lw);
    }
    c.fillStyle = th.exit;
    for (const [x0, y0, x1, y1] of MAP_EXITS) c.fillRect(Math.floor(x0 * sx), Math.floor(y0 * sy), Math.max(1, Math.round((x1 - x0) * sx)), Math.max(1, Math.round((y1 - y0) * sy)));
    if (th.labels) {
      Wd.ROOMS.forEach(rm => {
        const L = MAP_LABEL[rm.id]; if (!L) return;
        const r = rm.rects.reduce((a, b) => (b[2] - b[0]) * (b[3] - b[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? b : a);
        const bw = (r[2] - r[0] + 1) * sx, bh = (r[3] - r[1] + 1) * sy;
        c.font = `8px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'center';
        const s = c.measureText(L[0]).width <= bw - 6 ? L[0] : L[1];
        if (c.measureText(s).width > bw - 2 || bh < 10) return;
        c.fillStyle = th.text; c.fillText(s, Math.round(((r[0] + r[2] + 1) / 2) * sx), Math.round(((r[1] + r[3] + 1) / 2) * sy) + 1);
      });
    }
    schemCache[k] = cv;
    return cv;
  }
  const MAP_THEME = { fill: '#1c1729', edge: '#9c8cc8', line: '#e8dcff', exit: '#ff4a5a', text: '#8a7cb0', lw: 2, labels: true };
  const CAM_THEME = { fill: '#0f2a1a', edge: '#3fae66', line: '#a8ffc4', exit: '#ff4a4a', lw: 1 };

  function drawMap() {
    g.fillStyle = 'rgba(4,2,10,0.96)'; g.fillRect(0, 0, GW, GH);
    const s = (GW - 24) / MW, w = Math.round(MW * s), h = Math.round(MH * s), ox = Math.round((GW - w) / 2), oy = Math.round((GH - h) / 2 + 4);
    if (fontReady) g.drawImage(schematic(w, h, MAP_THEME, 'big'), ox, oy);
    // sala atual em destaque
    const rm = roomAt(P.x, P.y);
    const def = rm && Wd.ROOMS.find(r => r.id === rm.id);
    if (def && !CORR[def.id] && !HIDDEN_ROOMS[def.id]) {
      g.globalAlpha = 0.18 + 0.08 * Math.sin(game.t * 4); g.fillStyle = '#c8b8ff';
      for (const [x0, y0, x1, y1] of def.rects) g.fillRect(ox + Math.round(x0 * 8 * s), oy + Math.round(y0 * 8 * s), Math.round((x1 - x0 + 1) * 8 * s), Math.round((y1 - y0 + 1) * 8 * s));
      g.globalAlpha = 1;
    }
    if (Math.floor(game.t * 3) % 2 === 0) {
      g.fillStyle = '#ff3050';
      g.fillRect(Math.round(ox + P.x * s) - 2, Math.round(oy + (P.y - 6) * s) - 2, 4, 4);
      g.fillStyle = '#fff'; g.fillRect(Math.round(ox + P.x * s) - 1, Math.round(oy + (P.y - 6) * s) - 1, 2, 2);
    }
    if (!game.powered && Math.floor(game.t * 2) % 2 === 0) {
      const o = !game.hasKey ? [714, 612] : game.gen ? PANEL_POS : GEN_POS;
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
    if (ui.type === 'arcade') { updateArcade(ui, dt, click, mx, my); return; }
    if (ui.type === 'wires') { updateWires(ui, dt, click, mx, my); return; }
    if (ui.type === 'tune') { updateTune(ui, dt, click, mx, my); return; }

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
    if (ui.type === 'arcade') return drawArcade(ui);
    if (ui.type === 'wires') return drawWires(ui);
    if (ui.type === 'tune') return drawTune(ui);
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
      if (it.id === 'key' && game.hasKey) continue;
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
      if (d.type === 'security' && d.broken) return { label: '[E] consertar porta', run: () => openWires(d.id === 'secW' ? 'W' : 'E') };
      if (d.locked) return { label: '[E] porta trancada', run: () => {
        if (game.hasKey) { d.locked = false; d.open = true; Sfx.coin(); Sfx.doorOpen(); showMsg('Destrancada com a chave.'); }
        else { Sfx.rattle(); cam.shake = 1.5; showMsg('Trancada. A chave deve estar na recepção.'); }
      } };
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
    else if (it.id === 'key') { game.hasKey = true; Sfx.coin(); setTimeout(() => Sfx.ding(2), 150); showMsg('Você pegou a chave do corredor de serviço.'); }
    else if (it.to) teleport(it.to, it.msg);
  }
  // =====================================================================
  //  FLIPERAMAS — puzzles jogáveis (sem recompensa)
  // =====================================================================
  const ARC_GAMES = ['luzes', 'deslize', 'memoria', 'torre', 'sequencia'];
  const ARC_TITLE = { luzes: 'APAGUE AS LUZES', deslize: 'DESLIZE 15', memoria: 'MEMORIA', torre: 'TORRE', sequencia: 'SEQUENCIA' };
  const ARC_HELP = {
    luzes: 'APAGUE TODAS', deslize: 'ORDENE 1 A 15', memoria: 'ACHE OS PARES',
    torre: 'TUDO PARA A DIREITA', sequencia: 'REPITA A SEQUENCIA',
  };
  const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
  const AF = { x: 40, y: 18, w: 304, h: 180 };
  function playCabinet(c) {
    if (!game.powered) { Sfx.deny(); showMsg('Está desligado.'); return; }
    c.playT = 1.0; Sfx.coin(); setTimeout(() => Sfx.blip(3), 180);
    const kind = ARC_GAMES[Wd.cabinets.indexOf(c) % ARC_GAMES.length];
    game.ui = newArcade(kind, c);
  }
  function newArcade(kind, cab) {
    const ui = { type: 'arcade', kind, cab, t: 0, moves: 0, won: false, wonT: 0, cur: [0, 0], col: cab ? cab.c.scr : '#4aff8a' };
    if (kind === 'luzes') {
      ui.n = 7; ui.cell = 16; ui.b = new Array(49).fill(0);
      do { for (let i = 0; i < 40; i++) arcFlip(ui, (Math.random() * 49) | 0); } while (ui.b.filter(v => v).length < 12);
      ui.cur = [3, 3];
    } else if (kind === 'deslize') {
      const n = 4; ui.n = n; ui.cell = 26; ui.b = []; for (let i = 1; i < n * n; i++) ui.b.push(i); ui.b.push(0);
      let last = -1;
      for (let i = 0; i < 900 || arcSolved(ui); i++) {
        const e = ui.b.indexOf(0), ex = e % n, ey = (e / n) | 0;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [ex + dx, ey + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n).map(([x, y]) => y * n + x).filter(j => j !== last);
        const j = nb[(Math.random() * nb.length) | 0]; ui.b[e] = ui.b[j]; ui.b[j] = 0; last = e;
      }
      ui.cur = [1, 1];
    } else if (kind === 'memoria') {
      ui.n = 6; ui.cell = 20;
      const v = []; for (let i = 0; i < 18; i++) v.push(i, i);
      for (let i = v.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [v[i], v[j]] = [v[j], v[i]]; }
      ui.b = v; ui.open = new Array(36).fill(0); ui.pick = []; ui.hideT = 0;
    } else if (kind === 'torre') {
      ui.pegs = [[6, 5, 4, 3, 2, 1], [], []]; ui.held = -1; ui.cur = [0, 0];
    } else if (kind === 'sequencia') {
      ui.seq = [(Math.random() * 4) | 0]; ui.step = 0; ui.show = 0.8; ui.lit = -1; ui.litT = 0; ui.goal = 30; ui.fail = 0; ui.play = 1;
    }
    return ui;
  }
  function arcFlip(ui, i) {
    const n = ui.n, x = i % n, y = (i / n) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < n && yy < n) ui.b[yy * n + xx] ^= 1; }
  }
  function arcSolved(ui) {
    if (ui.kind === 'luzes') return ui.b.every(v => !v);
    if (ui.kind === 'deslize') return ui.b.every((v, i) => v === (i + 1) % (ui.n * ui.n));
    if (ui.kind === 'memoria') return ui.open.every(v => v === 2);
    if (ui.kind === 'torre') return ui.pegs[2].length === 6;
    if (ui.kind === 'sequencia') return ui.seq.length > ui.goal;
    return false;
  }
  const arcBoard = ui => { const s = ui.n * ui.cell; return [Math.round(GW / 2 - s / 2), 50]; };
  const TOWER_X = [112, 192, 272], TOWER_BASE = 164;
  const PAD = [[150, 52], [196, 52], [150, 98], [196, 98]], PAD_S = 40, PAD_C = ['#ff4a5a', '#4aff8a', '#4a9aff', '#ffd24a'];
  function arcPress(ui, i) {
    if (ui.kind === 'luzes') { arcFlip(ui, i); ui.moves++; Sfx.blip(1); }
    else if (ui.kind === 'deslize') {
      const n = ui.n, e = ui.b.indexOf(0), d = Math.abs(e % n - i % n) + Math.abs(((e / n) | 0) - ((i / n) | 0));
      if (d === 1) { ui.b[e] = ui.b[i]; ui.b[i] = 0; ui.moves++; Sfx.tick(); } else Sfx.deny();
    } else if (ui.kind === 'memoria') {
      if (ui.hideT > 0 || ui.open[i]) return;
      ui.open[i] = 1; ui.pick.push(i); Sfx.blip(1);
      if (ui.pick.length === 2) {
        ui.moves++;
        const [a, b] = ui.pick;
        if (ui.b[a] === ui.b[b]) { ui.open[a] = ui.open[b] = 2; ui.pick = []; Sfx.ding(2); }
        else ui.hideT = 0.8;
      }
    } else if (ui.kind === 'torre') {
      const p = ui.pegs[i];
      if (ui.held < 0) { if (p.length) { ui.held = i; Sfx.tick(); } }
      else if (ui.held === i) { ui.held = -1; Sfx.tick(); }
      else {
        const d = ui.pegs[ui.held][ui.pegs[ui.held].length - 1];
        if (!p.length || p[p.length - 1] > d) { p.push(ui.pegs[ui.held].pop()); ui.held = -1; ui.moves++; Sfx.clunk(); }
        else { Sfx.deny(); ui.shake = 3; }
      }
    } else if (ui.kind === 'sequencia') {
      if (ui.show > 0) return;
      ui.lit = i; ui.litT = 0.25; Sfx.ding(i);
      if (ui.seq[ui.step] === i) {
        ui.step++;
        if (ui.step >= ui.seq.length) { ui.moves = ui.seq.length; ui.seq.push((Math.random() * 4) | 0); ui.step = 0; ui.show = 0.9; }
      } else { Sfx.deny(); ui.fail = 0.6; ui.seq = [(Math.random() * 4) | 0]; ui.step = 0; ui.show = 1.2; ui.moves = 0; }
    }
    if (arcSolved(ui)) { ui.won = true; ui.wonT = 0; Sfx.success(); }
  }
  function updateArcade(ui, dt, click, mx, my) {
    if (ui.cab) ui.cab.playT = Math.max(ui.cab.playT, 0);
    ui.shake = Math.max(0, (ui.shake || 0) - dt * 12);
    if (ui.won) {
      ui.wonT += dt;
      if (ui.wonT > 0.6 && (actionPressed() || click)) { game.ui = newArcade(ui.kind, ui.cab); Sfx.coin(); }
      return;
    }
    if (ui.kind === 'memoria' && ui.hideT > 0) { ui.hideT -= dt; if (ui.hideT <= 0) { for (const i of ui.pick) ui.open[i] = 0; ui.pick = []; } }
    if (ui.kind === 'sequencia') {
      ui.litT -= dt; ui.fail = Math.max(0, ui.fail - dt);
      if (ui.show > 0) { ui.show -= dt; if (ui.show <= 0) { ui.play = 0; ui.playT = 0.2; } }
      else if (ui.play < ui.seq.length) {
        ui.playT -= dt;
        if (ui.playT <= 0) { const v = ui.seq[ui.play]; ui.play++; ui.playT = Math.max(0.28, 0.6 - ui.seq.length * 0.012); ui.lit = v; ui.litT = ui.playT * 0.7; Sfx.ding(v); }
        return;
      }
    }
    // cursor
    const cols = ui.kind === 'torre' ? 3 : ui.kind === 'sequencia' ? 2 : ui.n, rows = ui.kind === 'torre' ? 1 : ui.kind === 'sequencia' ? 2 : ui.n;
    const mv = (dx, dy) => { ui.cur = [clamp(ui.cur[0] + dx, 0, cols - 1), clamp(ui.cur[1] + dy, 0, rows - 1)]; ui.kb = true; };
    if (consume('arrowleft') || consume('a')) mv(-1, 0);
    if (consume('arrowright') || consume('d')) mv(1, 0);
    if (consume('arrowup') || consume('w')) mv(0, -1);
    if (consume('arrowdown') || consume('s')) mv(0, 1);
    const busy = ui.kind === 'sequencia' && (ui.show > 0 || ui.play < ui.seq.length);
    if (actionPressed() && !busy) arcPress(ui, ui.cur[1] * cols + ui.cur[0]);
    if (click && !busy) {
      let hit = -1;
      if (ui.kind === 'torre') TOWER_X.forEach((x, i) => { if (Math.abs(mx - x) < 38 && my > 60 && my < TOWER_BASE + 8) hit = i; });
      else if (ui.kind === 'sequencia') PAD.forEach(([x, y], i) => { if (mx >= x && my >= y && mx < x + PAD_S && my < y + PAD_S) hit = i; });
      else { const [bx, by] = arcBoard(ui), tx = Math.floor((mx - bx) / ui.cell), ty = Math.floor((my - by) / ui.cell); if (tx >= 0 && ty >= 0 && tx < ui.n && ty < ui.n) hit = ty * ui.n + tx; }
      if (hit >= 0) { ui.kb = false; ui.cur = [hit % cols, (hit / cols) | 0]; arcPress(ui, hit); }
    }
  }
  const MEM_SHAPES = [];
  ['#ff4a5a', '#4aff8a', '#4a9aff', '#ffd24a', '#ff7aff', '#ffffff'].forEach(c => ['sq', 'ci', 'tr', 'di'].slice(0, 3).forEach(k => MEM_SHAPES.push([c, k])));
  function shape(kind, cx, cy, r, col) {
    g.fillStyle = col;
    if (kind === 'sq') g.fillRect(cx - r, cy - r, r * 2, r * 2);
    else for (let y = -r; y <= r; y++) {
      const w = kind === 'ci' ? Math.round(Math.sqrt(r * r - y * y)) : kind === 'di' ? r - Math.abs(y) : Math.round((y + r) / 2);
      g.fillRect(cx - w, cy + y, w * 2 + (kind === 'tr' ? 1 : 0), 1);
    }
  }
  function drawArcade(ui) {
    const { x, y, w, h } = AF, col = ui.col, sh = Math.round((Math.random() - 0.5) * (ui.shake || 0));
    g.fillStyle = 'rgba(2,1,6,0.96)'; g.fillRect(0, 0, GW, GH);
    // gabinete: moldura colorida + tela preta
    g.fillStyle = '#0b0910'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle = col; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#05040a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#000'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    text(ARC_TITLE[ui.kind], GW / 2, y + 8, col, 'center');
    text('ESC', x + w - 22, y + 6, '#6a6078');
    const tgl = Math.floor(ui.t * 4) % 2;
    g.save(); g.translate(sh, 0);
    if (ui.kind === 'luzes' || ui.kind === 'deslize' || ui.kind === 'memoria') {
      const [bx, by] = arcBoard(ui), c = ui.cell;
      for (let i = 0; i < ui.n * ui.n; i++) {
        const cx = bx + (i % ui.n) * c, cy = by + ((i / ui.n) | 0) * c;
        if (ui.kind === 'luzes') {
          g.fillStyle = ui.b[i] ? '#ffe070' : '#1c1a24'; g.fillRect(cx + 1, cy + 1, c - 2, c - 2);
          if (ui.b[i]) { g.fillStyle = '#fff8c0'; g.fillRect(cx + 3, cy + 3, c - 10, 2); }
        } else if (ui.kind === 'deslize') {
          if (!ui.b[i]) continue;
          const ok = ui.b[i] === i + 1;
          g.fillStyle = ok ? shade(col, 0.6) : '#2a2636'; g.fillRect(cx + 1, cy + 1, c - 2, c - 2);
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(cx + 1, cy + 1, c - 2, 2);
          text(String(ui.b[i]), cx + c / 2 + 1, cy + c / 2 - 3, ok ? '#fff' : '#c8c0d8', 'center');
        } else {
          const o = ui.open[i];
          g.fillStyle = o ? '#141220' : '#2c2840'; g.fillRect(cx + 1, cy + 1, c - 2, c - 2);
          if (o) { const [sc, sk] = MEM_SHAPES[ui.b[i]]; shape(sk, cx + c / 2, cy + c / 2, 5, o === 2 ? sc : shade(sc, 0.8)); }
          else { g.fillStyle = '#3c3858'; g.fillRect(cx + c / 2 - 1, cy + c / 2 - 1, 2, 2); }
        }
      }
      if (ui.kb !== false && tgl) {
        g.strokeStyle = col; g.lineWidth = 1;
        g.strokeRect(bx + ui.cur[0] * c + 0.5, by + ui.cur[1] * c + 0.5, c - 1, c - 1);
      }
    } else if (ui.kind === 'torre') {
      const discC = ['#ff4a5a', '#ff9a3a', '#ffd24a', '#4aff8a', '#4a9aff', '#b07aff'];
      g.fillStyle = '#3a3346'; g.fillRect(70, TOWER_BASE, 244, 4);
      TOWER_X.forEach((px, i) => {
        g.fillStyle = i === 2 ? shade(col, 0.6) : '#3a3346'; g.fillRect(px - 1, 80, 3, TOWER_BASE - 80);
        ui.pegs[i].forEach((d, k) => {
          const up = ui.held === i && k === ui.pegs[i].length - 1;
          const dw = 10 + d * 10, dy = up ? 66 + Math.round(Math.sin(ui.t * 6) * 2) : TOWER_BASE - 10 - k * 10;
          g.fillStyle = discC[d - 1]; g.fillRect(px - dw / 2, dy, dw, 9);
          g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(px - dw / 2, dy, dw, 2);
        });
        if (ui.kb !== false && ui.cur[0] === i && tgl) { g.fillStyle = col; g.fillRect(px - 4, TOWER_BASE + 8, 9, 2); }
      });
    } else if (ui.kind === 'sequencia') {
      PAD.forEach(([px, py], i) => {
        const on = ui.lit === i && ui.litT > 0;
        g.fillStyle = on ? PAD_C[i] : shade(PAD_C[i], 0.28); g.fillRect(px, py, PAD_S - 2, PAD_S - 2);
        if (on) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillRect(px + 4, py + 4, PAD_S - 10, 4); g.globalAlpha = 1; }
        if (ui.kb !== false && ui.cur[1] * 2 + ui.cur[0] === i && tgl && ui.show <= 0) { g.strokeStyle = '#fff'; g.strokeRect(px - 1.5, py - 1.5, PAD_S + 1, PAD_S + 1); }
      });
      text(ui.fail > 0 ? 'ERROU!' : ui.show > 0 || ui.play < ui.seq.length ? 'OBSERVE' : 'SUA VEZ', GW / 2, 144, ui.fail > 0 ? '#ff5a4a' : '#c8c0d8', 'center');
      // progresso
      for (let i = 0; i < ui.goal; i++) { g.fillStyle = i < ui.seq.length - 1 ? col : '#2a2636'; g.fillRect(GW / 2 - ui.goal * 3 + i * 6, 158, 5, 4); }
    }
    g.restore();
    const footer = ui.kind === 'sequencia' ? `${ARC_HELP[ui.kind]}` : `${ARC_HELP[ui.kind]}   JOGADAS ${ui.moves}`;
    text(footer, GW / 2, y + h - 16, '#7a6f8a', 'center');
    if (ui.won) {
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
      text('COMPLETO!', GW / 2, 88, tgl ? '#ffffff' : col, 'center');
      if (ui.kind !== 'sequencia') text(`${ui.moves} JOGADAS`, GW / 2, 104, '#c8c0d8', 'center');
      if (ui.wonT > 0.6) text(isTouch ? 'TOQUE: DE NOVO' : 'E: DE NOVO   ESC: SAIR', GW / 2, 128, '#7a6f8a', 'center');
    }
  }

  // =====================================================================
  //  QUEBRAS — portas de segurança e câmeras quebram (com energia)
  // =====================================================================
  const brk = { t: 70, cams: new Set() };
  const doorName = k => k === 'W' ? 'PORTA OESTE' : 'PORTA LESTE';
  function updateBreaks(dt) {
    if (!game.powered || game.t - game.powerT < 20) return;
    brk.t -= dt;
    if (brk.t > 0) return;
    brk.t = rnd(55, 95);
    const doors = ['W', 'E'].filter(k => !sec.door[k].broken);
    const cams = Wd.cameras.map((c, i) => i).filter(i => !brk.cams.has(i));
    if ((Math.random() < 0.5 && doors.length) || !cams.length) {
      if (!doors.length) return;
      const k = doors[(Math.random() * doors.length) | 0], d = sec.door[k];
      d.broken = true; d.open = true;
      Sfx.zap(); Sfx.clank(); cam.shake = 3; post.glitch = Math.max(post.glitch, 0.5);
      for (let i = 0; i < 20; i++) sparks.push({ x: d.cx, y: d.cy + 4, z: 14, vx: rnd(-50, 50), vy: rnd(-20, 30), vz: rnd(10, 60), life: rnd(0.3, 0.9) });
      showMsg(`A ${doorName(k)} quebrou! Conserte perto dela.`);
    } else {
      const i = cams[(Math.random() * cams.length) | 0];
      brk.cams.add(i); Sfx.zap();
      showMsg(`A CAM ${String(Wd.cameras[i].n).padStart(2, '0')} caiu. Conserte pelo painel das câmeras.`);
    }
  }
  function resetBreaks() { brk.t = 70; brk.cams.clear(); for (const k of ['W', 'E']) if (sec.door[k]) sec.door[k].broken = false; }

  // ---------- puzzle: religar fios (porta) ----------
  const WIRE_C = ['#ff4a4a', '#4aa8ff', '#ffd23a'];
  function openWires(k) {
    const n = 6, left = [], right = [];
    for (let i = 0; i < n; i++) left.push({ c: i % 3, st: i >= 3 });
    for (let i = left.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [left[i], left[j]] = [left[j], left[i]]; }
    for (let i = 0; i < n; i++) right.push(i);
    for (let i = right.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [right[i], right[j]] = [right[j], right[i]]; }
    game.ui = { type: 'wires', k, t: 0, n, left, right, link: new Array(n).fill(-1), side: 0, row: 0, sel: -1, err: 0, shake: 0, done: -1 };
    Sfx.click();
  }
  const WX0 = 96, WX1 = 288, WY = i => 54 + i * 19;
  function wirePick(ui, side, row) {
    if (side === 0) { if (ui.link[row] >= 0) return; ui.sel = row; ui.side = 1; Sfx.tick(); return; }
    if (ui.sel < 0) return;
    if (ui.link.includes(row)) return;
    const a = ui.left[ui.sel], b = ui.left[ui.right[row]];
    if (a.c === b.c && a.st === b.st) {
      ui.link[ui.sel] = row; ui.sel = -1; ui.side = 0; Sfx.clunk();
      const nx = ui.link.indexOf(-1); if (nx >= 0) ui.row = nx;
      if (!ui.link.includes(-1)) { ui.done = 0; Sfx.success(); }
    } else { ui.err++; ui.shake = 5; Sfx.zap(); cam.shake = 1.5; ui.sel = -1; ui.side = 0; }
  }
  function updateWires(ui, dt, click, mx, my) {
    ui.shake = Math.max(0, ui.shake - dt * 12);
    if (ui.done >= 0) {
      ui.done += dt;
      if (ui.done > 1.2) { const d = sec.door[ui.k]; d.broken = false; game.ui = null; showMsg(`${doorName(ui.k)} consertada.`); }
      return;
    }
    if (consume('arrowup') || consume('w')) ui.row = (ui.row + ui.n - 1) % ui.n;
    if (consume('arrowdown') || consume('s')) ui.row = (ui.row + 1) % ui.n;
    if (consume('arrowleft') || consume('a')) ui.side = 0;
    if (consume('arrowright') || consume('d')) ui.side = 1;
    if (actionPressed()) wirePick(ui, ui.side, ui.row);
    if (click) for (let i = 0; i < ui.n; i++) {
      if (Math.abs(my - WY(i) - 3) < 8) { if (Math.abs(mx - WX0) < 18) { ui.row = i; wirePick(ui, 0, i); } else if (Math.abs(mx - WX1) < 18) { ui.row = i; wirePick(ui, 1, i); } }
    }
  }
  function plug(x, y, w, l, flip) {
    g.fillStyle = WIRE_C[l.c]; g.fillRect(x, y, w, 7);
    if (l.st) { g.fillStyle = '#f0f0f0'; for (let i = 0; i < w; i += 3) g.fillRect(x + i, y + 2, 1, 3); }
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, w, 1);
    g.fillStyle = '#9a9aa8'; g.fillRect(flip ? x - 3 : x + w, y + 2, 3, 3);
  }
  function drawWires(ui) {
    const sx = Math.round((Math.random() - 0.5) * ui.shake);
    frame9(40 + sx, 18, 304, 180);
    text(`RELIGAR FIOS - ${doorName(ui.k)}`, GW / 2 + sx, 28, '#f0e2c0', 'center');
    g.fillStyle = '#0d0b12'; g.fillRect(60 + sx, 44, 264, 122);
    // fios ligados
    for (let i = 0; i < ui.n; i++) {
      const r = ui.link[i]; if (r < 0) continue;
      const l = ui.left[i], x0 = WX0 + 12, y0 = WY(i) + 3, x1 = WX1 - 14, y1 = WY(r) + 3;
      for (let s = 0; s <= 1; s += 1 / 120) {
        const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s + Math.sin(s * Math.PI) * 8;
        g.fillStyle = l.st && ((s * 120) | 0) % 4 < 2 ? '#f0f0f0' : WIRE_C[l.c]; g.fillRect(Math.round(x) + sx, Math.round(y), 2, 2);
      }
    }
    // fio selecionado seguindo o cursor
    if (ui.sel >= 0) {
      const l = ui.left[ui.sel], y0 = WY(ui.sel) + 3, y1 = WY(ui.row) + 3;
      for (let s = 0; s <= 1; s += 1 / 60) { g.fillStyle = WIRE_C[l.c]; g.globalAlpha = 0.6; g.fillRect(Math.round(WX0 + 12 + (WX1 - 26 - WX0) * s * (ui.side ? 1 : 0.5)) + sx, Math.round(y0 + (y1 - y0) * s), 2, 2); }
      g.globalAlpha = 1;
    }
    for (let i = 0; i < ui.n; i++) {
      plug(WX0 - 10 + sx, WY(i), 20, ui.left[i], false);
      const tl = ui.left[ui.right[i]], lit = ui.link.includes(i);
      g.fillStyle = '#2a2632'; g.fillRect(WX1 - 12 + sx, WY(i) - 2, 24, 11);
      plug(WX1 - 8 + sx, WY(i), 16, tl, true);
      g.fillStyle = lit ? '#6aff7a' : '#3a2a2a'; g.fillRect(WX1 + 14 + sx, WY(i) + 2, 3, 3);
    }
    if (Math.floor(ui.t * 4) % 2 || ui.sel >= 0) {
      const x = (ui.side ? WX1 - 14 : WX0 - 12) + sx;
      g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(x - 0.5, WY(ui.row) - 2.5, 26, 12);
    }
    text(ui.done >= 0 ? 'PORTA CONSERTADA!' : 'LIGUE CADA FIO NA COR IGUAL', GW / 2 + sx, 172, ui.done >= 0 ? '#7aff8a' : '#9a8fb0', 'center');
    if (ui.err) text(`ERROS ${ui.err}`, 60 + sx, 28, '#ff6a5a');
  }

  // ---------- puzzle: sintonizar sinal (câmera) ----------
  function openTune(ci) {
    const ui = { type: 'tune', ci, t: 0, round: 0, row: 0, hold: 0, done: -1 };
    newTuneRound(ui);
    game.ui = ui; Sfx.camSwitch();
  }
  function newTuneRound(ui) {
    ui.tgt = { f: 1.5 + ((Math.random() * 13) | 0) * 0.25, p: ((Math.random() * 16) | 0) * Math.PI / 8, a: 0.35 + ((Math.random() * 12) | 0) * 0.05 };
    ui.cur = { f: ui.tgt.f + (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 6) | 0) * 0.25), p: ui.round >= 1 ? ((ui.tgt.p / (Math.PI / 8) + 4 + ((Math.random() * 8) | 0)) % 16) * Math.PI / 8 : ui.tgt.p, a: ui.round >= 2 ? (ui.tgt.a > 0.6 ? 0.35 : 0.9) : ui.tgt.a };
    ui.cur.f = clamp(ui.cur.f, 1, 5); ui.row = 0; ui.hold = 0;
  }
  const TUNE_P = [['FREQ', 'f', 0.25, 1, 5], ['FASE', 'p', Math.PI / 8, 0, Math.PI * 2], ['AMPL', 'a', 0.05, 0.3, 0.95]];
  const tuneOk = ui => Math.abs(ui.cur.f - ui.tgt.f) < 0.01 && (ui.round < 1 || Math.abs(((ui.cur.p - ui.tgt.p) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) < 0.01) && (ui.round < 2 || Math.abs(ui.cur.a - ui.tgt.a) < 0.01);
  function tuneAdj(ui, row, dir) {
    const [, k, st, lo, hi] = TUNE_P[row];
    if (k === 'p') ui.cur.p = ((ui.cur.p + dir * st) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    else ui.cur[k] = Math.round(clamp(ui.cur[k] + dir * st, lo, hi) * 100) / 100;
    Sfx.tick();
  }
  function updateTune(ui, dt, click, mx, my) {
    if (ui.done >= 0) { ui.done += dt; if (ui.done > 1.2) { brk.cams.delete(ui.ci); game.ui = null; sec.camStatic = 0.35; showMsg('Câmera consertada.'); } return; }
    const rows = ui.round + 1;
    if (consume('arrowup') || consume('w')) ui.row = (ui.row + rows - 1) % rows;
    if (consume('arrowdown') || consume('s')) ui.row = (ui.row + 1) % rows;
    if (consume('arrowleft') || consume('a')) tuneAdj(ui, ui.row, -1);
    if (consume('arrowright') || consume('d')) tuneAdj(ui, ui.row, 1);
    if (click) for (let r = 0; r < rows; r++) {
      const y = 148 + r * 13;
      if (my >= y - 2 && my < y + 10) { ui.row = r; if (mx >= 108 && mx < 122) tuneAdj(ui, r, -1); if (mx >= 262 && mx < 276) tuneAdj(ui, r, 1); }
    }
    ui.hold = tuneOk(ui) ? ui.hold + dt : 0;
    if (ui.hold > 0.8) {
      Sfx.ding(ui.round);
      if (ui.round >= 2) { ui.done = 0; Sfx.success(); } else { ui.round++; newTuneRound(ui); }
    }
  }
  function drawTune(ui) {
    frame9(40, 18, 304, 180);
    const c = Wd.cameras[ui.ci];
    text(`SINTONIZAR CAM ${String(c.n).padStart(2, '0')}`, GW / 2, 28, '#f0e2c0', 'center');
    const X = 60, Y = 42, Wd2 = 264, Hh = 92;
    g.fillStyle = '#04120a'; g.fillRect(X, Y, Wd2, Hh);
    g.fillStyle = '#0c2a18'; for (let x = 0; x < Wd2; x += 22) g.fillRect(X + x, Y, 1, Hh); for (let y = 0; y < Hh; y += 23) g.fillRect(X, Y + y, Wd2, 1);
    const wave = (p, col, dot, noise) => {
      g.fillStyle = col;
      for (let x = 0; x < Wd2; x++) {
        if (dot && x % 3) continue;
        const v = Math.sin(x / Wd2 * Math.PI * 2 * p.f + p.p) * p.a + (noise ? (Math.random() - 0.5) * noise : 0);
        g.fillRect(X + x, Math.round(Y + Hh / 2 - v * (Hh / 2 - 4)), 1, dot ? 1 : 2);
      }
    };
    wave(ui.tgt, '#2e7a4a', true, 0);
    const ok = tuneOk(ui);
    wave(ui.cur, ok ? '#c8ffd8' : '#5aff8a', false, ok ? 0 : 0.12);
    text(ok ? 'SINAL OK - SEGURE...' : `ETAPA ${ui.round + 1}/3`, GW / 2, 136, ok ? '#c8ffd8' : '#7a9a88', 'center');
    for (let r = 0; r <= ui.round; r++) {
      const [lab, k, , lo, hi] = TUNE_P[r], y = 148 + r * 13, sel = r === ui.row;
      text(lab, 62, y, sel ? '#e8ffe8' : '#6a8a78');
      g.fillStyle = sel ? '#5aff8a' : '#2a4a38'; g.fillRect(108, y, 12, 9); g.fillRect(264, y, 12, 9);
      g.fillStyle = '#000'; g.fillRect(112, y + 4, 4, 1); g.fillRect(268, y + 4, 4, 1); g.fillRect(270, y + 2, 1, 5);
      g.fillStyle = '#12261a'; g.fillRect(126, y + 3, 132, 3);
      const v = k === 'p' ? ui.cur.p / (Math.PI * 2) : (ui.cur[k] - lo) / (hi - lo);
      g.fillStyle = sel ? '#c8ffd8' : '#5a8a6a'; g.fillRect(126 + Math.round(v * 128), y, 4, 9);
    }
    if (ui.done >= 0) text('CAMERA CONSERTADA!', GW / 2, 100, '#ffffff', 'center');
  }

  // ---------- chave da recepção ----------
  function drawKey(cx, cy) {
    if (game.hasKey) return;
    const x = 712 - cx, y = 612 - cy;
    g.fillStyle = '#c8a040'; g.fillRect(x, y, 3, 3); g.fillRect(x + 3, y + 1, 5, 1); g.fillRect(x + 6, y + 2, 1, 1); g.fillRect(x + 8, y + 1, 1, 2);
    g.fillStyle = '#5a4a20'; g.fillRect(x + 1, y + 1, 1, 1);
    if (Math.floor(game.t * 2) % 3 === 0) { g.fillStyle = '#fff8d0'; g.fillRect(x + 4, y, 1, 1); }
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
    const d = sec.door[k];
    if (d.broken) { Sfx.deny(); showMsg(`${doorName(k)} quebrada. Conserte perto dela.`); return; }
    d.open = !d.open; Sfx.secDoor(!d.open); cam.shake = 1.5;
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
    { k: 'doorW', label: 'PORTA O', key: 'A' },
    { k: 'cams', label: 'CAMERAS', key: 'S' },
    { k: 'doorE', label: 'PORTA L', key: 'D' },
  ];
  const btnRect = i => [GW / 2 - 117 + i * 80, GH - 26, 74, 18];
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
    if (consume('s') || consume(' ') || consume('c') || consume('arrowdown')) seatAction('cams');
    if (consume('click')) {
      const [mx, my] = uiMouse();
      SEAT_BTNS.forEach((b, i) => { const r = btnRect(i); if (mx >= r[0] && my >= r[1] && mx < r[0] + r[2] && my < r[1] + r[3]) seatAction(b.k); });
      if (mx > GW - 70 && my < 22) standUp();
    }
  }
  // painel do mapa das câmeras (planta enviada)
  const CMAP = { x: GW - 146, y: GH - 82, w: 140, h: Math.round(140 * 768 / 1376) };
  const camBtn = c => [Math.round(CMAP.x + (c.ix || c.x) * CMAP.w / MW) - 5, Math.round(CMAP.y + (c.iy || c.y) * CMAP.h / MH) - 3, 11, 7];
  function setCam(i) { if (i === sec.cam) return; sec.cam = (i + Wd.cameras.length) % Wd.cameras.length; sec.camStatic = 0.3; Sfx.camSwitch(); }
  function updateCams() {
    if (consume('escape') || consume('s') || consume(' ') || consume('arrowdown') || consume('c')) { sec.cams = false; Sfx.camSwitch(); return; }
    if (!game.powered) { sec.cams = false; return; }
    for (let n = 1; n <= 9; n++) if (consume(String(n))) setCam(n - 1);
    if (consume('0')) setCam(9);
    if (brk.cams.has(sec.cam) && (consume('r') || consume('e') || consume('enter'))) { openTune(sec.cam); return; }
    if (consume('arrowleft') || consume('a')) setCam(sec.cam - 1);
    if (consume('arrowright') || consume('d')) setCam(sec.cam + 1);
    if (consume('click')) {
      const [mx, my] = uiMouse();
      Wd.cameras.forEach((c, i) => { const r = camBtn(c); if (mx >= r[0] - 1 && my >= r[1] - 1 && mx < r[0] + r[2] + 1 && my < r[1] + r[3] + 1) setCam(i); });
      if (mx < 60 && my > GH - 22) { sec.cams = false; Sfx.camSwitch(); }
      if (brk.cams.has(sec.cam) && mx > GW / 2 - 70 && mx < GW / 2 + 70 && my > GH / 2 + 4 && my < GH / 2 + 22) openTune(sec.cam);
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
      const on = b.k === 'doorW' ? !sec.door.W.open : b.k === 'doorE' ? !sec.door.E.open : false;
      const broke = (b.k === 'doorW' && sec.door.W.broken) || (b.k === 'doorE' && sec.door.E.broken);
      g.fillStyle = '#0b0910'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = on ? (b.k.startsWith('door') ? '#7a2020' : '#6a6020') : '#211d29'; g.fillRect(x, y, w, h);
      g.fillStyle = on ? (b.k.startsWith('door') ? '#ff4040' : '#ffe060') : '#3a3346'; g.fillRect(x + 3, y + 7, 4, 4);
      if (!game.powered) g.fillStyle = '#2a2434', g.fillRect(x + 3, y + 7, 4, 4);
      text(broke ? 'QUEBRADA' : b.label, x + w / 2 + 4, y + 6, broke ? (Math.floor(game.t * 3) % 2 ? '#ff5a4a' : '#8a2a20') : game.powered ? '#e8dcff' : '#5a5068', 'center');
      if (!isTouch) text(b.key, x + w - 2, y - 9, '#6a6078', 'right', 0.8);
    });
  }

  let camC = null;
  function drawCams() {
    const c = Wd.cameras[sec.cam];
    let c3 = null;
    if (game.powered && window.Cam3D) { try { c3 = window.Cam3D.render(c.n, { powered: game.powered, t: game.t }); } catch (e) { console.warn(e); window.Cam3D = null; } }
    if (game.powered && c3) {
      g.imageSmoothingEnabled = false; g.drawImage(c3, 0, 0, GW, GH);
    } else if (game.powered) {
      // renderiza a sala inteira numa área maior e reduz para a tela
      const vw = c.w || GW, vh = Math.round(vw * 9 / 16);
      const cx = Math.round(c.x - vw / 2), cy = Math.round(c.y - vh / 2);
      const rm = roomAt(c.x, c.y);
      const amb = rm ? [34 + rm.rgb[0] * rm.amb * 3, 28 + rm.rgb[1] * rm.amb * 3, 54 + rm.rgb[2] * rm.amb * 3] : game.amb;
      VW = vw; VH = vh; setRes(vw, vh);
      drawScene(cx, cy, { flash: false, cam: true, amb });
      if (!camC) camC = document.createElement('canvas');
      if (camC.width !== vw || camC.height !== vh) { camC.width = vw; camC.height = vh; }
      const cc = camC.getContext('2d'); cc.clearRect(0, 0, vw, vh); cc.drawImage(buf, 0, 0);
      VW = GW; VH = GH; setRes(GW, GH);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(camC, 0, 0, vw, vh, 0, 0, GW, GH);
      g.imageSmoothingEnabled = false;
    }
    if (game.powered) {
      // filtro de câmera de segurança
      const gamer = !!(c3 && window.Cam3D && window.Cam3D.isGamer && window.Cam3D.isGamer(c.n));
      g.globalCompositeOperation = 'saturation'; g.globalAlpha = gamer ? 0.35 : 0.8; g.fillStyle = '#808080'; g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = gamer ? 0.5 : 1; g.fillStyle = '#c8f4d4'; g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.06; g.fillStyle = '#4aff8a'; g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect((Math.random() * GW) | 0, (Math.random() * GH) | 0, 1, 1); }
      const band = (game.t * 50) % (GH + 20) - 10;
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, band, GW, 5);
    } else { g.fillStyle = '#000'; g.fillRect(0, 0, GW, GH); }
    // estática ao trocar
    const stc = game.powered ? (brk.cams.has(sec.cam) ? 0.85 + Math.random() * 0.15 : sec.camStatic / 0.3) : 1;
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
    else if (brk.cams.has(sec.cam)) {
      text('CAMERA DANIFICADA', GW / 2, GH / 2 - 14, '#ff8a7a', 'center');
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(GW / 2 - 70, GH / 2 + 4, 140, 18);
      g.strokeStyle = '#5aff8a'; g.strokeRect(GW / 2 - 69.5, GH / 2 + 4.5, 139, 17);
      text(isTouch ? 'TOQUE: CONSERTAR' : '[R] CONSERTAR', GW / 2, GH / 2 + 9, '#c8ffd8', 'center');
    }
    // mapa (planta) com os botões das câmeras
    const M = CMAP;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(M.x - 3, M.y - 3, M.w + 6, M.h + 6);
    if (fontReady) g.drawImage(schematic(M.w, M.h, CAM_THEME, 'cam'), M.x, M.y);
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
    if (game.powered) energyHUD(10, 36, 'left');
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
    window.__hawton = { P, game, cam, doScare, scare, forceBreak: () => { brk.t = 0; game.powerT = -100; updateBreaks(0.01); }, brkInfo: () => ({ doors: ['W', 'E'].filter(k => sec.door[k].broken), cams: [...brk.cams] }), secCam: () => sec.cam, setPos: (x, y) => { P.x = x; P.y = y; cam.x = camX(x - GW / 2); cam.y = camY(y - 8 - GH / 2); } };
  }
  if (/[?&]cut\b/.test(location.search)) {
    const iv = setInterval(() => { if (loaded === toLoad.length) { clearInterval(iv); try { Sfx.init(); } catch (e) {} startCutscene(); } }, 50);
  }
})();
