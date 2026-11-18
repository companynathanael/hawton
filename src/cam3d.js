// Câmeras de segurança em 3D (pixel art): cada câmera monta só a própria sala
// com chão, paredes, teto, portas e objetos a partir da arte do mapa.
import * as THREE from './vendor/three.module.min.js';

const Wd = window.World, T = 8, GW = 384, GH = 216;

// posição [x, y do mapa, altura] e alvo [x, y do mapa, altura] de cada câmera (por número)
const CAMS = {
  1: { room: 'lobby', pos: [600, 726, 36], look: [630, 590, 8] },
  2: { room: 'arcade1', gamer: true, pos: [180, 282, 38], look: [340, 150, 8], amb: 0.5, li: 1.6 },
  3: { room: 'arcade2', gamer: true, pos: [196, 470, 36], look: [196, 320, 8], amb: 0.5 },
  4: { room: 'arcade3', gamer: true, pos: [232, 678, 36], look: [232, 520, 8], amb: 0.5 },
  5: { room: 'arcade4', gamer: true, pos: [460, 542, 38], look: [460, 310, 8], amb: 0.5 },
  6: { room: 'arcade5', gamer: true, pos: [760, 486, 38], look: [760, 330, 8], amb: 0.5 },
  7: { room: 'kitchen', pos: [700, 306, 36], look: [770, 120, 8], amb: 0.3, li: 1.0 },
  8: { room: 'hallA', pos: [1124, 168, 38], look: [1124, 50, 8], amb: 0.45 },
  9: { room: 'hallB', pos: [1056, 486, 38], look: [1056, 330, 8], amb: 0.45 },
  10: { room: 'c1', pos: [800, 48, 30], look: [400, 46, 14], fov: 62, amb: 1.0, li: 1.8 },
  11: { room: 'c6', pos: [72, 300, 34], look: [72, 120, 16], fov: 62, amb: 1.1, li: 1.8 },
  12: { room: 'c5', pos: [1184, 530, 30], look: [560, 526, 14], fov: 62, amb: 1.0, li: 1.8 },
  13: { room: 'power2', pos: [1240, 296, 34], look: [1240, 190, 8], amb: 0.5 },
  14: { room: 'basement', pos: [1004, 728, 34], look: [1004, 610, 8], amb: 0.5 },
};

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(GW, GH, false);
renderer.useLegacyLights = true;

const tileT = (x, y) => Wd.tileAt(x * T + 4, y * T + 4);
const solidAt = (x, y) => Wd.solid[(y * T + 4) * Wd.W + x * T + 4];
const texOf = c => { const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
function crop(src, x, y, w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h); return c; }
function avgCol(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return n ? new THREE.Color(r / n / 255, g / n / 255, b / n / 255) : new THREE.Color('#222');
}
const shadeHex = (h, k) => { const c = new THREE.Color(h); c.multiplyScalar(k); return '#' + c.getHexString(); };

// fliperama visto de frente
function cabFront(o) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 32; const g = c.getContext('2d'), p = o.c;
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(0, 0, 16, 32, p.dark); R(1, 0, 14, 32, p.body);
  R(1, 1, 14, 5, p.mq); R(2, 2, 12, 1, '#ffffff'); R(3, 4, 10, 1, shadeHex(p.mq, 0.6));
  R(1, 6, 14, 1, p.dark);
  R(2, 8, 12, 9, '#05070a'); R(3, 9, 10, 7, p.scr);
  for (let i = 0; i < 4; i++) R(4 + i * 2, 11 + (i % 2) * 2, 1, 1, '#ffffff'); R(4, 14, 8, 1, shadeHex(p.scr, 0.5));
  R(1, 18, 14, 4, p.lite); R(1, 22, 14, 1, p.dark);
  R(4, 19, 2, 2, '#202020'); R(5, 18, 1, 1, '#e0e0e0'); R(9, 19, 2, 2, '#ff3a3a'); R(12, 19, 2, 2, '#3a7aff');
  R(5, 25, 6, 4, shadeHex(p.body, 0.6)); R(7, 26, 2, 2, '#d0a020');
  R(1, 30, 14, 2, '#111');
  return c;
}
function cabGlow(front) {
  const e = document.createElement('canvas'); e.width = 16; e.height = 32; const q = e.getContext('2d');
  q.fillStyle = '#000'; q.fillRect(0, 0, 16, 32);
  q.drawImage(front, 1, 1, 14, 5, 1, 1, 14, 5); q.drawImage(front, 3, 9, 10, 7, 3, 9, 10, 7);
  return e;
}
const TALL = new Set(['fridge', 'vending', 'locker', 'shelf', 'claw', 'change', 'ecab', 'rack', 'boiler', 'gen', 'prize', 'transformer', 'safe', 'pipes', 'panel']);
const BILL = new Set(['balloons', 'plant', 'ext', 'stanchion', 'sign', 'trash', 'bucket', 'chair', 'stool', 'speaker', 'bin', 'barrel', 'spool']);
const FLAT = new Set(['mattress', 'bean', 'sack', 'gift', 'rug']);

function build(cfg) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#05030a');
  scene.fog = new THREE.Fog('#05030a', 120, 420);
  const main = Wd.ROOMS.find(r => r.id === cfg.room);
  const roomOf = (tx, ty) => Wd.ROOMS.find(r => r.rects.some(([x0, y0, x1, y1]) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1));
  const near = (d, rm) => { const [a, b, e, f] = d.r; return rm.rects.some(([x0, y0, x1, y1]) => a >= x0 - 1 && e <= x1 + 1 && b >= y0 - 1 && f <= y1 + 1); };
  // salas vizinhas: ligadas por porta ou encostadas (ex.: corredor e escada)
  const rooms = [main];
  const addRoom = r => { if (r && !rooms.includes(r) && r.id !== 'secret') rooms.push(r); };
  for (const d of Wd.DOORS) if (d.type !== 'exit' && near(d, main)) { const [a, b, e, f] = d.r; for (let y = b - 1; y <= f + 1; y++) for (let x = a - 1; x <= e + 1; x++) addRoom(roomOf(x, y)); }
  for (const [x0, y0, x1, y1] of main.rects) { for (let x = x0; x <= x1; x++) { addRoom(roomOf(x, y0 - 1)); addRoom(roomOf(x, y1 + 1)); } for (let y = y0; y <= y1; y++) { addRoom(roomOf(x0 - 1, y)); addRoom(roomOf(x1 + 1, y)); } }
  const allRects = rooms.flatMap(r => r.rects);
  const inRoom = (tx, ty) => allRects.some(([x0, y0, x1, y1]) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1);
  const def = { rects: allRects };
  const H = 44;
  const dyn = { lights: [], screens: [], doors: [], neons: [], pools: [] };
  // chão e teto
  for (const [x0, y0, x1, y1] of def.rects) {
    const w = (x1 - x0 + 1) * T, h = (y1 - y0 + 1) * T;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texOf(crop(Wd.canvas, x0 * T, y0 * T, w, h)) }));
    m.rotation.x = -Math.PI / 2; m.position.set(x0 * T + w / 2, 0, y0 * T + h / 2); scene.add(m);
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h; const q = cc.getContext('2d');
    q.fillStyle = '#34303e'; q.fillRect(0, 0, w, h); q.fillStyle = '#1e1b26';
    for (let x = 0; x < w; x += 16) q.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 16) q.fillRect(0, y, w, 1);
    for (let i = 0; i < w * h / 90; i++) { q.fillStyle = Math.random() < 0.5 ? '#3c3848' : '#262230'; q.fillRect(Math.random() * w | 0, Math.random() * h | 0, 1, 1); }
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texOf(cc) }));
    cm.rotation.x = Math.PI / 2; cm.position.set(x0 * T + w / 2, H, y0 * T + h / 2); scene.add(cm);
  }
  // paredes com a arte da "face" da sala
  const fr = main.rects[0], face = crop(Wd.canvas, Math.floor((fr[0] + fr[2]) / 2) * T, fr[1] * T, 16, 8);
  const wc = document.createElement('canvas'); wc.width = 16; wc.height = H; const wq = wc.getContext('2d');
  wq.fillStyle = '#' + avgCol(face).multiplyScalar(0.8).getHexString(); wq.fillRect(0, 0, 16, H);
  for (let y = H - 8; y > H - 32; y -= 8) wq.drawImage(face, 0, y);
  wq.fillStyle = 'rgba(0,0,0,0.35)'; wq.fillRect(0, H - 34, 16, 1); wq.fillRect(0, 0, 16, 3);
  wq.fillStyle = 'rgba(0,0,0,0.5)'; wq.fillRect(0, H - 2, 16, 2);
  for (let i = 0; i < 18; i++) { wq.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; wq.fillRect(Math.random() * 16 | 0, Math.random() * (H - 34) | 0, 1, 2); }
  const wallMat = new THREE.MeshLambertMaterial({ map: texOf(wc) }), capMat = new THREE.MeshLambertMaterial({ color: '#0c0a10' });
  const wallGeo = new THREE.BoxGeometry(T, H, T), seen = new Set();
  for (const [x0, y0, x1, y1] of def.rects) for (let ty = y0 - 1; ty <= y1 + 1; ty++) for (let tx = x0 - 1; tx <= x1 + 1; tx++) {
    const k = tx + ',' + ty; if (seen.has(k)) continue; seen.add(k);
    const t = tileT(tx, ty);
    const isFace = inRoom(tx, ty) && solidAt(tx, ty) && !inRoom(tx, ty - 1);
    const wall = !inRoom(tx, ty) && t !== Wd.FLOOR && t !== Wd.DOOR;
    if (!wall && !isFace) continue;
    const m = new THREE.Mesh(wallGeo, [wallMat, wallMat, capMat, capMat, wallMat, wallMat]);
    m.position.set(tx * T + T / 2, H / 2, ty * T + T / 2); scene.add(m);
  }
  // portas (somem quando abertas) + chão da soleira
  Wd.DOORS.forEach((d, i) => {
    const [a, b, e, f] = d.r;
    if (!rooms.some(r => near(d, r))) return;
    { const w = (e - a + 1) * T, h = (f - b + 1) * T;
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texOf(crop(Wd.canvas, a * T, b * T, w, h)) }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(a * T + w / 2, 0.05, b * T + h / 2); scene.add(fl); }
    const horiz = (e - a) >= (f - b) && !(a === e && f > b);
    const len = horiz ? (e - a + 1) * T : (f - b + 1) * T, dh = 34;
    const c = document.createElement('canvas'); c.width = len; c.height = dh; const q = c.getContext('2d');
    q.fillStyle = d.type === 'security' ? '#5a5e68' : d.type === 'exit' ? '#6a2a2a' : '#3e3450'; q.fillRect(0, 0, len, dh);
    if (d.type === 'security') { q.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 3; y < dh; y += 4) q.fillRect(0, y, len, 1); q.fillStyle = '#d0a020'; for (let x = 0; x < len; x += 6) q.fillRect(x, dh - 5, 3, 4); }
    else { q.fillStyle = 'rgba(255,255,255,0.08)'; q.fillRect(2, 2, len / 2 - 3, dh - 4); q.fillRect(len / 2 + 1, 2, len / 2 - 3, dh - 4); q.fillStyle = '#c8b070'; q.fillRect(len / 2 - 3, dh / 2, 2, 3); q.fillRect(len / 2 + 1, dh / 2, 2, 3); }
    q.fillStyle = '#121016'; q.fillRect(0, 0, 1, dh); q.fillRect(len - 1, 0, 1, dh); q.fillRect(0, 0, len, 1);
    const grp = new THREE.Group();
    const door = new THREE.Mesh(new THREE.PlaneGeometry(len, dh), new THREE.MeshLambertMaterial({ map: texOf(c), side: THREE.DoubleSide }));
    door.position.y = dh / 2; grp.add(door);
    const top = new THREE.Mesh(new THREE.BoxGeometry(len, H - dh, T), wallMat); top.position.y = dh + (H - dh) / 2; grp.add(top);
    if (horiz) grp.position.set(a * T + len / 2, 0, (b + 0.5) * T); else { grp.position.set((a + 0.5) * T, 0, b * T + len / 2); grp.rotation.y = Math.PI / 2; }
    scene.add(grp);
    dyn.doors.push({ mesh: door, d: Wd.doors[i] });
  });
  const cam = new THREE.PerspectiveCamera(cfg.fov || 70, GW / GH, 1, 2000);
  cam.position.set(cfg.pos[0], cfg.pos[2], cfg.pos[1]); cam.lookAt(cfg.look[0], cfg.look[2] ?? 6, cfg.look[1]);
  // objetos
  for (const o of Wd.objects) {
    const bx = o.x + o.w / 2, by = o.y + o.h - 1;
    if (!inRoom(Math.floor(bx / T), Math.floor(by / T))) continue;
    if (o.kind === 'cab') {
      const front = cabFront(o), side = avgCol(crop(front, 0, 0, 2, 32)).multiplyScalar(0.7);
      const sm = new THREE.MeshLambertMaterial({ color: side });
      const fm = new THREE.MeshLambertMaterial({ map: texOf(front), emissive: '#ffffff', emissiveMap: texOf(cabGlow(front)), emissiveIntensity: 0 });
      const bc = document.createElement('canvas'); bc.width = 16; bc.height = 32; const bq = bc.getContext('2d');
      bq.fillStyle = o.c.dark; bq.fillRect(0, 0, 16, 32); bq.fillStyle = 'rgba(0,0,0,0.4)';
      for (let y = 6; y < 14; y += 2) bq.fillRect(4, y, 8, 1); bq.fillRect(6, 22, 4, 3);
      const m = new THREE.Mesh(new THREE.BoxGeometry(14, 30, 10), [sm, sm, sm, sm, fm, new THREE.MeshLambertMaterial({ map: texOf(bc) })]);
      const f = o.facing || 'down', rot = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[f] ?? 0;
      m.rotation.y = rot;
      m.position.set(bx, 15, f === 'left' || f === 'right' ? o.y + o.h / 2 + 2 : o.y + o.h - 5); scene.add(m);
      let pl = null;
      if (dyn.screens.filter(s => s.pl).length < (cfg.gamer ? 20 : 10)) {
        pl = new THREE.PointLight(o.c.scr, 0, cfg.gamer ? 55 : 40, 1);
        pl.position.set(m.position.x + Math.sin(rot) * 10, 14, m.position.z + Math.cos(rot) * 10); scene.add(pl);
      }
      dyn.screens.push({ mat: fm, pl, o });
      continue;
    }
    const spr = crop(Wd.objCanvas, o.x, o.y, o.w, o.h);
    if (BILL.has(o.kind)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshLambertMaterial({ map: texOf(spr), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      m.position.set(bx, o.h / 2, by); m.rotation.y = Math.atan2(cam.position.x - bx, cam.position.z - by); scene.add(m); continue;
    }
    const tall = TALL.has(o.kind);
    let fh = FLAT.has(o.kind) ? 2 : Math.round(o.h * (tall ? 0.6 : 0.42)); fh = Math.max(2, Math.min(fh, o.h - 2));
    const th = o.h - fh, height = FLAT.has(o.kind) ? 3 : fh * (tall ? 1.6 : 1.5);
    const front = crop(spr, 0, th, o.w, fh), topc = crop(spr, 0, 0, o.w, th);
    const sm = new THREE.MeshLambertMaterial({ color: avgCol(front).multiplyScalar(0.6) });
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, height, th), [sm, sm, new THREE.MeshLambertMaterial({ map: texOf(topc) }), sm, new THREE.MeshLambertMaterial({ map: texOf(front) }), sm]);
    m.position.set(bx, height / 2, o.y + th / 2 + fh * 0.3); scene.add(m);
  }
  // luzes do teto (seguem os circuitos do jogo)
  scene.add(new THREE.AmbientLight('#8a80b0', cfg.gamer ? 0.35 : (cfg.amb ?? 0.32)));
  const inR = (rm, l) => rm.rects.some(([x0, y0, x1, y1]) => l.x >= x0 * T && l.x < (x1 + 1) * T && l.y >= y0 * T && l.y < (y1 + 1) * T);
  const ls = [];
  rooms.forEach((rm, k) => ls.push(...Wd.lights.filter(l => !l.cab && inR(rm, l)).sort((a, b) => b.r - a.r).slice(0, k ? 4 : 14)));
  for (const l of ls) {
    const pl = new THREE.PointLight(l.c, 0, l.r * 3.6, 1); pl.position.set(l.x, H - 6, l.y); scene.add(pl);
    let lamp = null;
    if (l.r > 40) { lamp = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), new THREE.MeshBasicMaterial({ color: '#e8f0ff' })); lamp.rotation.x = Math.PI / 2; lamp.position.set(l.x, H - 0.5, l.y); scene.add(lamp); }
    dyn.lights.push({ pl, lamp, l, k: cfg.li ?? 1.3 });
  }
  if (cfg.gamer) {
    // brilhos "gamer": faixas de neon nas paredes e poças de luz das telas
    const NEON = ['#b04aff', '#ffd23a', '#ff8a2a', '#ff4ad0', '#3ae8ff', '#7a4aff'];
    let k = 0;
    for (const [x0, y0, x1, y1] of main.rects) {
      const segs = [[x0 * T, y0 * T + 0.6, (x1 + 1) * T, y0 * T + 0.6, 0, 1], [x0 * T, (y1 + 1) * T - 0.6, (x1 + 1) * T, (y1 + 1) * T - 0.6, 0, -1], [x0 * T + 0.6, y0 * T, x0 * T + 0.6, (y1 + 1) * T, 1, 1], [(x1 + 1) * T - 0.6, y0 * T, (x1 + 1) * T - 0.6, (y1 + 1) * T, 1, -1]];
      for (const [ax, az, bx, bz, vert, inward] of segs) {
        const len = vert ? bz - az : bx - ax, n = Math.max(1, Math.round(len / 48)), sl = len / n;
        for (let i = 0; i < n; i++) {
          const c = NEON[k % NEON.length], cxp = vert ? ax : ax + sl * (i + 0.5), czp = vert ? az + sl * (i + 0.5) : az;
          const mats = [];
          for (const [hy, th] of [[H - 8, 1.6], [1.2, 1.2]]) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(vert ? 0.8 : sl - 6, th, vert ? sl - 6 : 0.8), new THREE.MeshBasicMaterial({ color: c }));
            m.position.set(cxp, hy, czp); scene.add(m);
            const halo = new THREE.Mesh(new THREE.BoxGeometry(vert ? 0.6 : sl - 2, th * 4, vert ? sl - 2 : 0.6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
            halo.position.copy(m.position); scene.add(halo);
            mats.push(m.material, halo.material);
          }
          let pl = null;
          if (k % 2 === 0 || n === 1) { pl = new THREE.PointLight(c, 0, 110, 1); pl.position.set(cxp + (vert ? 6 * inward : 0), H - 12, czp + (vert ? 0 : 6 * inward)); scene.add(pl); }
          dyn.neons.push({ mats, pl, ph: k * 0.9 });
          k++;
        }
      }
    }
    for (const o of Wd.objects) {
      if (o.kind !== 'cab') continue;
      const bx = o.x + o.w / 2, by = o.y + o.h - 1;
      if (!main.rects.some(([x0, y0, x1, y1]) => bx / T >= x0 && bx / T < x1 + 1 && by / T >= y0 && by / T < y1 + 1)) continue;
      const f = o.facing || 'down', rot = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[f] ?? 0;
      const z0 = f === 'left' || f === 'right' ? o.y + o.h / 2 + 2 : o.y + o.h - 5;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(12, 16), new THREE.MeshBasicMaterial({ color: o.c.scr, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(bx + Math.sin(rot) * 11, 0.3, z0 + Math.cos(rot) * 11); scene.add(pool);
      dyn.pools.push(pool);
    }
  }
  return { scene, cam, dyn };
}

const cache = {};
window.Cam3D = {
  ready: true,
  isGamer: n => !!(CAMS[n] && CAMS[n].gamer),
  canvas: renderer.domElement,
  render(n, st) {
    const cfg = CAMS[n]; if (!cfg) return null;
    const s = cache[n] || (cache[n] = build(cfg));
    for (const L of s.dyn.lights) {
      const i = Math.max(0, L.l.i || 0);
      L.pl.intensity = i * L.k;
      if (L.lamp) L.lamp.material.color.setScalar(0.15 + 0.85 * Math.min(1, i));
    }
    for (const S of s.dyn.screens) {
      const on = st.powered ? 1 : 0, play = S.o.playT > 0 ? (Math.floor(st.t * 12) % 2 ? 1.6 : 0.8) : 1;
      S.mat.emissiveIntensity = 0.9 * on * play;
      if (S.pl) S.pl.intensity = (cfg.gamer ? 1.5 : 0.9) * on * play;
    }
    for (const N of s.dyn.neons) {
      const v = st.powered ? (0.85 + 0.15 * Math.sin(st.t * 2.2 + N.ph)) * (Math.random() < 0.01 ? 0.3 : 1) : 0;
      for (const m of N.mats) { if (m.transparent) m.opacity = 0.4 * v; else m.color.set(m.userData.c || (m.userData.c = '#' + m.color.getHexString())).multiplyScalar(v); }
      if (N.pl) N.pl.intensity = 2.3 * v;
    }
    for (const p of s.dyn.pools) p.material.opacity = st.powered ? 0.18 + 0.06 * Math.sin(st.t * 3 + p.position.x) : 0;
    for (const D of s.dyn.doors) D.mesh.visible = !D.d || D.d.anim < 0.5;
    renderer.render(s.scene, s.cam);
    return renderer.domElement;
  },
};
