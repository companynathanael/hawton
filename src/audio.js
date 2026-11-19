// Áudio 100% sintetizado com WebAudio (chuva, vento, trovão, zumbido de neon,
// ambiente interno, passos, rangidos, bipes de fliperama...). Sem arquivos.
window.Sfx = (() => {
  let ac, master, comp, verb, verbIn, ready = false;
  const bufs = {};
  const loops = {};

  function noise(type, sec = 3) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.95 * b2 + 0.048 * w; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.6; }
    }
    return b;
  }

  function impulse(sec, decay) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function init() {
    if (ready) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ac.destination);
    verb = ac.createConvolver(); verb.buffer = impulse(3.2, 2.6);
    verbIn = ac.createGain(); verbIn.gain.value = 0.6;
    verbIn.connect(verb); verb.connect(master);
    bufs.white = noise('white'); bufs.brown = noise('brown', 4); bufs.pink = noise('pink', 4);
    ready = true;
  }

  function src(buf, loop = true) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = loop; return s;
  }

  function loopNoise(name, type, ftype, freq, q, gain, wet = 0) {
    if (loops[name]) return loops[name];
    const s = src(bufs[type]);
    const f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master);
    if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbIn); }
    s.start(0, Math.random() * 2);
    g.gain.linearRampToValueAtTime(gain, ac.currentTime + 2);
    return (loops[name] = { s, f, g, base: gain });
  }

  function stopLoop(name, t = 1.5) {
    const l = loops[name]; if (!l) return;
    l.g.gain.cancelScheduledValues(ac.currentTime);
    l.g.gain.setValueAtTime(l.g.gain.value, ac.currentTime);
    l.g.gain.linearRampToValueAtTime(0, ac.currentTime + t);
    setTimeout(() => { try { l.s.stop(); } catch (e) {} }, t * 1000 + 100);
    if (l.oscs) setTimeout(() => l.oscs.forEach(o => { try { o.stop(); } catch (e) {} }), t * 1000 + 100);
    delete loops[name];
  }

  function exterior() {
    if (!ready) return;
    loopNoise('rain', 'white', 'bandpass', 2600, 0.5, 0.10);
    loopNoise('rainLow', 'pink', 'lowpass', 900, 0.7, 0.16);
    const w = loopNoise('wind', 'brown', 'lowpass', 380, 1.2, 0.22);
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 180; lfo.connect(lg); lg.connect(w.f.frequency); lfo.start();
    w.oscs = [lfo];
    // zumbido do letreiro
    const g = ac.createGain(); g.gain.value = 0;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 2;
    const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 120;
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 60;
    const g2 = ac.createGain(); g2.gain.value = 0.3;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    loops.buzz = { g, oscs: [o1, o2], s: o1, base: 0.05 };
  }

  function buzz(level) {
    const l = loops.buzz; if (!l) return;
    l.g.gain.setTargetAtTime(level * 0.06, ac.currentTime, 0.01);
  }

  function interior() {
    if (!ready) return;
    ['rain', 'rainLow', 'wind', 'buzz'].forEach(n => stopLoop(n, 2.5));
    loopNoise('rainIn', 'pink', 'lowpass', 300, 0.8, 0.05);
    loopNoise('hvac', 'brown', 'lowpass', 140, 1, 0.18);
    loopNoise('air', 'pink', 'bandpass', 700, 0.4, 0.015, 0.4);
    // drone grave
    const g = ac.createGain(); g.gain.value = 0;
    const oscs = [55, 55.35, 82.4, 110.2].map((fr, i) => {
      const o = ac.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = fr;
      const og = ac.createGain(); og.gain.value = i < 2 ? 0.5 : 0.08;
      o.connect(og); og.connect(g); o.start(); return o;
    });
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    g.disconnect(); g.connect(f); f.connect(master);
    g.gain.linearRampToValueAtTime(0.09, ac.currentTime + 4);
    loops.drone = { g, oscs, s: oscs[0] };
    // zumbido fluorescente
    const hg = ac.createGain(); hg.gain.value = 0;
    const ho = ac.createOscillator(); ho.type = 'sawtooth'; ho.frequency.value = 120;
    const hf = ac.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 360; hf.Q.value = 3;
    ho.connect(hf); hf.connect(hg); hg.connect(master); ho.start();
    loops.hum = { g: hg, oscs: [ho], s: ho };
  }

  function setHum(v) { if (loops.hum) loops.hum.g.gain.setTargetAtTime(v * 0.025, ac.currentTime, 0.1); }
  function setDrone(v) { if (loops.drone) loops.drone.g.gain.setTargetAtTime(0.09 * v, ac.currentTime, 0.4); }

  function env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function burst(type, ftype, freq, q, peak, a, d, wet = 0.3, rate = 1) {
    if (!ready) return;
    const t = ac.currentTime;
    const s = src(bufs[type], false); s.playbackRate.value = rate;
    const f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    s.connect(f); f.connect(g); g.connect(master);
    if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbIn); }
    env(g, t, a, peak, d);
    s.start(t, Math.random() * 1.5, a + d + 0.1);
    return { f, t };
  }

  function thunder() {
    if (!ready) return;
    const r = burst('brown', 'lowpass', 260, 0.7, 1.2, 0.05, 4.5, 0.4);
    r.f.frequency.setValueAtTime(900, r.t);
    r.f.frequency.exponentialRampToValueAtTime(120, r.t + 3);
    setTimeout(() => burst('brown', 'lowpass', 180, 0.7, 0.7, 0.2, 3, 0.5), 450);
  }

  function step(surface, run) {
    const v = run ? 1.3 : 1;
    if (surface === 'tile') burst('white', 'bandpass', 2400 + Math.random() * 600, 2.5, 0.12 * v, 0.003, 0.07, 0.35);
    else if (surface === 'wood') burst('white', 'bandpass', 700 + Math.random() * 200, 2, 0.2 * v, 0.004, 0.09, 0.35);
    else if (surface === 'metal') burst('white', 'bandpass', 1500 + Math.random() * 300, 6, 0.18 * v, 0.002, 0.12, 0.5);
    else burst('white', 'bandpass', 1100 + Math.random() * 400, 1.6, 0.09 * v, 0.004, 0.06, 0.3);
  }

  function click() {
    burst('white', 'highpass', 3000, 1, 0.25, 0.001, 0.025, 0.1);
    setTimeout(() => burst('white', 'bandpass', 1800, 3, 0.15, 0.001, 0.03, 0.1), 40);
  }

  function zap() {
    if (!ready) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t);
    o.frequency.linearRampToValueAtTime(40, t + 0.4);
    const g = ac.createGain(); o.connect(g); g.connect(master);
    const w = ac.createGain(); w.gain.value = 0.4; g.connect(w); w.connect(verbIn);
    env(g, t, 0.005, 0.12, 0.45); o.start(t); o.stop(t + 0.5);
    burst('white', 'bandpass', 4000, 1, 0.15, 0.002, 0.2, 0.2);
  }

  function creak() {
    if (!ready) return;
    const t = ac.currentTime, base = 140 + Math.random() * 200;
    const g = ac.createGain(); g.connect(master);
    const w = ac.createGain(); w.gain.value = 1.4; g.connect(w); w.connect(verbIn);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = base * 3; f.Q.value = 8; f.connect(g);
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t + 1.2);
    const am = ac.createOscillator(), amg = ac.createGain(); am.frequency.value = 18 + Math.random() * 20; amg.gain.value = 0.5;
    am.connect(amg); amg.connect(g.gain);
    o.connect(f);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.start(t); am.start(t); o.stop(t + 1.5); am.stop(t + 1.5);
  }

  function clank() {
    burst('white', 'bandpass', 600 + Math.random() * 900, 12, 0.12, 0.002, 0.6, 1.5, 0.6);
  }

  // pequenas melodias "attract mode" de fliperamas abandonados
  function blip(vol = 1) {
    if (!ready) return;
    const scales = [[0, 3, 7, 10, 12], [0, 4, 7, 11, 14], [0, 2, 3, 7, 8]];
    const sc = scales[(Math.random() * scales.length) | 0];
    const root = 220 * Math.pow(2, ((Math.random() * 12) | 0) / 12);
    const t0 = ac.currentTime, n = 4 + ((Math.random() * 6) | 0), dur = 0.09 + Math.random() * 0.05;
    const g = ac.createGain(); g.gain.value = 0.02 * vol;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    g.connect(f); f.connect(master);
    const w = ac.createGain(); w.gain.value = 1.2; f.connect(w); w.connect(verbIn);
    const o = ac.createOscillator(); o.type = 'square';
    for (let i = 0; i < n; i++) {
      const st = sc[(Math.random() * sc.length) | 0] + (Math.random() < 0.3 ? 12 : 0);
      o.frequency.setValueAtTime(root * Math.pow(2, st / 12) * (1 + (Math.random() - 0.5) * 0.01), t0 + i * dur);
    }
    o.connect(g); o.start(t0); o.stop(t0 + n * dur);
  }

  function whoosh() {
    const r = burst('pink', 'bandpass', 300, 1.5, 0.5, 0.4, 1.0, 0.8);
    if (r) { r.f.frequency.setValueAtTime(200, r.t); r.f.frequency.exponentialRampToValueAtTime(1600, r.t + 0.6); r.f.frequency.exponentialRampToValueAtTime(150, r.t + 1.4); }
  }

  function rattle() {
    for (let i = 0; i < 5; i++) setTimeout(() => burst('white', 'bandpass', 500 + Math.random() * 300, 5, 0.3, 0.002, 0.08, 0.5), i * 70 + Math.random() * 30);
  }

  function heartbeat() {
    if (!ready) return;
    [0, 0.22].forEach((d, i) => {
      const t = ac.currentTime + d;
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.15);
      const g = ac.createGain(); o.connect(g); g.connect(master);
      env(g, t, 0.01, i ? 0.25 : 0.35, 0.18); o.start(t); o.stop(t + 0.25);
    });
  }

  function riser(sec) {
    if (!ready) return;
    const t = ac.currentTime;
    const g = ac.createGain(); g.connect(master);
    const w = ac.createGain(); w.gain.value = 0.8; g.connect(w); w.connect(verbIn);
    const oscs = [41.2, 41.7, 61.7].map(fr => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t);
      o.frequency.exponentialRampToValueAtTime(fr * 1.5, t + sec);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(120, t); f.frequency.exponentialRampToValueAtTime(900, t + sec);
      o.connect(f); f.connect(g); o.start(t); o.stop(t + sec + 0.2); return o;
    });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + sec * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + sec + 0.15);
    return oscs;
  }

  // ---------- energia ----------
  function tone(type, f0, f1, dur, peak, wet = 0.3, delay = 0) {
    if (!ready) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); o.connect(g); g.connect(master);
    if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbIn); }
    env(g, t, 0.005, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }

  // puxada da corda do gerador
  function pull(ok) {
    const r = burst('white', 'bandpass', 1400, 2, 0.35, 0.01, 0.35, 0.3);
    if (r) { r.f.frequency.setValueAtTime(1600, r.t); r.f.frequency.exponentialRampToValueAtTime(260, r.t + 0.35); }
    if (ok) {
      tone('sawtooth', 70, 32, 0.6, 0.2, 0.4, 0.15);
      setTimeout(() => burst('brown', 'lowpass', 220, 1, 0.8, 0.01, 0.4, 0.4), 160);
    } else {
      [0.18, 0.3, 0.38].forEach((d, i) => tone('square', 50 - i * 6, 30, 0.08, 0.08, 0.2, d));
    }
  }

  function engineStart() {
    if (!ready || loops.engine) return;
    const t = ac.currentTime;
    const g = ac.createGain(); g.gain.value = 0;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const o1 = ac.createOscillator(); o1.type = 'sawtooth';
    const o2 = ac.createOscillator(); o2.type = 'square';
    o1.frequency.setValueAtTime(18, t); o1.frequency.exponentialRampToValueAtTime(38, t + 1.6);
    o2.frequency.setValueAtTime(36, t); o2.frequency.exponentialRampToValueAtTime(76, t + 1.6);
    const g2 = ac.createGain(); g2.gain.value = 0.35;
    o1.connect(f); o2.connect(g2); g2.connect(f);
    const am = ac.createGain(); am.gain.value = 0.7;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 9.5; lg.gain.value = 0.3;
    lfo.connect(lg); lg.connect(am.gain);
    f.connect(am); am.connect(g); g.connect(master);
    const n = src(bufs.brown), nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 320;
    const ng = ac.createGain(); ng.gain.value = 0.5; n.connect(nf); nf.connect(ng); ng.connect(g);
    [o1, o2, lfo].forEach(o => o.start(t)); n.start(t);
    g.gain.linearRampToValueAtTime(0.16, t + 1.2);
    loops.engine = { g, s: n, oscs: [o1, o2, lfo] };
    burst('brown', 'lowpass', 300, 1, 1, 0.01, 1.2, 0.5);
  }
  function setEngine(v) { if (loops.engine) loops.engine.g.gain.setTargetAtTime(0.16 * v, ac.currentTime, 0.2); }

  function clunk() {
    burst('brown', 'lowpass', 500, 1, 1.4, 0.005, 0.5, 0.9);
    tone('square', 90, 40, 0.25, 0.18, 0.6);
    burst('white', 'bandpass', 2500, 4, 0.3, 0.001, 0.05, 0.4);
  }

  function powerUp() {
    if (!ready) return;
    tone('sine', 50, 420, 1.4, 0.25, 0.5);
    tone('sawtooth', 60, 120, 1.6, 0.05, 0.6);
    // acorde de boot dos fliperamas
    [0, 4, 7, 12, 16].forEach((st, i) => tone('square', 262 * Math.pow(2, st / 12), 262 * Math.pow(2, st / 12), 0.35, 0.05, 1, 1.2 + i * 0.09));
    setTimeout(() => zap(), 900);
  }

  function tick() { burst('white', 'bandpass', 3200, 5, 0.25, 0.001, 0.04, 0.15); tone('square', 900, 700, 0.03, 0.03, 0); }
  function ding(n = 0) { tone('square', 660 * Math.pow(2, (n * 4) / 12), 660 * Math.pow(2, (n * 4) / 12), 0.18, 0.06, 0.5); }
  function deny() { tone('square', 110, 100, 0.25, 0.08, 0.2); tone('square', 104, 96, 0.25, 0.06, 0.2, 0.05); }
  function lampOn() { burst('white', 'highpass', 5000, 1, 0.08, 0.001, 0.03, 0.4); tone('sine', 240, 240, 0.12, 0.03, 0.3, 0.03); }
  function success() { [0, 4, 7, 12].forEach((st, i) => tone('square', 523 * Math.pow(2, st / 12), 523 * Math.pow(2, st / 12), 0.22, 0.06, 0.6, i * 0.08)); }

  function doorOpen() {
    const r = burst('white', 'bandpass', 900, 3, 0.12, 0.05, 0.45, 0.6);
    if (r) { r.f.frequency.setValueAtTime(700, r.t); r.f.frequency.linearRampToValueAtTime(1300, r.t + 0.4); }
    tone('sawtooth', 190, 260, 0.35, 0.015, 0.6, 0.02);
    burst('white', 'bandpass', 2500, 4, 0.15, 0.001, 0.04, 0.2);
  }
  function doorClose() {
    burst('brown', 'lowpass', 300, 1, 1.0, 0.003, 0.25, 0.7);
    burst('white', 'bandpass', 1800, 3, 0.18, 0.001, 0.05, 0.3);
  }
  function secDoor(closing) {
    const r = burst('white', 'bandpass', 600, 2, 0.25, 0.05, 0.5, 0.4);
    if (r) { r.f.frequency.setValueAtTime(closing ? 900 : 400, r.t); r.f.frequency.linearRampToValueAtTime(closing ? 300 : 900, r.t + 0.45); }
    tone('square', 70, 50, 0.4, 0.05, 0.4);
    setTimeout(() => { burst('brown', 'lowpass', 400, 1, 1.4, 0.003, 0.5, 0.9); tone('square', 60, 35, 0.3, 0.15, 0.7); }, 380);
  }
  function lightToggle(on) {
    burst('white', 'highpass', 3000, 1, 0.25, 0.001, 0.02, 0.1);
    if (on) tone('sawtooth', 120, 120, 0.4, 0.02, 0.3, 0.02);
  }
  function camSwitch() { burst('white', 'bandpass', 3000, 0.6, 0.18, 0.005, 0.18, 0.05); }
  function coin() { tone('square', 988, 988, 0.06, 0.05, 0.4); tone('square', 1319, 1319, 0.25, 0.05, 0.5, 0.07); }
  function powerDown() {
    tone('sine', 420, 30, 2.2, 0.3, 0.6); tone('sawtooth', 120, 25, 2.0, 0.06, 0.6);
    burst('brown', 'lowpass', 300, 1, 1.0, 0.01, 1.2, 0.8);
    setTimeout(() => zap(), 150);
  }
  function engineStop() {
    const l = loops.engine; if (!l) return;
    const t = ac.currentTime;
    l.oscs.slice(0, 2).forEach(o => { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(8, t + 2); });
    stopLoop('engine', 2.2);
  }


  // ---- sustos ----
  function pebbles() {
    if (!ready) return;
    for (let i = 0; i < 9; i++) setTimeout(() => burst('white', 'bandpass', 2500 + Math.random() * 2500, 6, 0.06 + Math.random() * 0.05, 0.001, 0.03, 0.6), i * 60 + Math.random() * 60);
    burst('brown', 'lowpass', 160, 1, 0.25, 0.3, 0.8, 0.6);
  }
  function crash(big = 1) {
    if (!ready) return;
    const r = burst('brown', 'lowpass', 500, 0.8, 1.6 * big, 0.002, 1.2, 1.2);
    if (r) { r.f.frequency.setValueAtTime(1400, r.t); r.f.frequency.exponentialRampToValueAtTime(90, r.t + 0.9); }
    tone('sine', 70, 28, 0.6, 0.6 * big, 0.6);
    for (let i = 0; i < 10; i++) setTimeout(() => burst('white', 'bandpass', 500 + Math.random() * 1600, 4, (0.25 + Math.random() * 0.25) * big, 0.001, 0.07 + Math.random() * 0.08, 0.8), 30 + i * (50 + Math.random() * 60));
  }
  function glass() {
    if (!ready) return;
    burst('white', 'highpass', 3500, 0.7, 0.9, 0.001, 0.35, 0.9);
    burst('brown', 'lowpass', 400, 1, 0.5, 0.002, 0.25, 0.6);
    for (let i = 0; i < 14; i++) tone('sine', 2500 + Math.random() * 4000, 2400 + Math.random() * 3000, 0.08 + Math.random() * 0.15, 0.03 + Math.random() * 0.04, 0.8, 0.03 + i * 0.04 + Math.random() * 0.05);
  }
  function rumble(sec = 2.5) {
    if (!ready) return;
    const r = burst('brown', 'lowpass', 140, 0.8, 1.1, sec * 0.4, sec * 0.6, 0.9, 0.7);
    tone('sine', 45, 32, sec, 0.35, 0.5);
    setTimeout(() => creak(), sec * 300);
    return r;
  }
  function sting() {
    if (!ready) return;
    [[880, 840], [932, 990], [1244, 1180], [466, 440]].forEach(([a, b], i) => tone('sawtooth', a, b, 1.3, 0.05, 1.2, i * 0.01));
    burst('white', 'bandpass', 3000, 3, 0.35, 0.005, 0.6, 1.0);
    tone('sine', 60, 30, 0.8, 0.5, 0.6);
  }
  function slam() {
    if (!ready) return;
    burst('brown', 'lowpass', 260, 1, 1.8, 0.002, 0.5, 1.6);
    burst('white', 'bandpass', 1400, 3, 0.35, 0.001, 0.08, 0.8);
    tone('sine', 65, 35, 0.4, 0.5, 0.8);
  }
  function glitchCab() {
    if (!ready) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'square';
    for (let i = 0; i < 14; i++) o.frequency.setValueAtTime(200 + Math.random() * 1400, t + i * 0.08);
    const g = ac.createGain(); o.connect(g); g.connect(master);
    const w = ac.createGain(); w.gain.value = 0.9; g.connect(w); w.connect(verbIn);
    env(g, t, 0.005, 0.09, 1.2); o.start(t); o.stop(t + 1.3);
    burst('white', 'bandpass', 1800, 1, 0.3, 0.002, 1.1, 0.5);
  }


  // ---- animatrônicos ----
  function mstep(v = 1) {
    if (!ready || v < 0.03) return;
    burst('brown', 'lowpass', 220, 1, 0.9 * v, 0.003, 0.18, 0.6);
    burst('white', 'bandpass', 900 + Math.random() * 300, 6, 0.14 * v, 0.002, 0.08, 0.5);
  }
  function scream() {
    if (!ready) return;
    const t = ac.currentTime;
    for (const [f0, f1, type] of [[180, 90, 'sawtooth'], [240, 120, 'square'], [520, 260, 'sawtooth'], [61, 40, 'sawtooth']]) {
      const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 1.3);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 38; lg.gain.value = f0 * 0.18; lfo.connect(lg); lg.connect(o.frequency);
      const g = ac.createGain(); o.connect(g); g.connect(master);
      env(g, t, 0.01, 0.32, 1.4); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
    }
    burst('white', 'highpass', 1800, 0.7, 1.4, 0.005, 1.3, 0.4);
    burst('brown', 'lowpass', 300, 1, 2.2, 0.003, 1.0, 0.6);
  }
  function honk() {
    if (!ready) return;
    for (let i = 0; i < 2; i++) { tone('square', 330, 300, 0.32, 0.22, 0.8, i * 0.38); tone('sawtooth', 220, 210, 0.32, 0.18, 0.8, i * 0.38); }
    laugh(1, 0.9);
  }
  function laugh(v = 1, delay = 0) {
    if (!ready) return;
    for (let i = 0; i < 7; i++) { const f = 520 - i * 25 + Math.random() * 40; tone('sawtooth', f, f * 0.7, 0.13, 0.09 * v, 1.0, delay + i * 0.16); burst('white', 'bandpass', 1400, 2, 0.06 * v, 0.005, 0.1, 0.8); }
  }
  function drum(v = 1) {
    if (!ready || v < 0.03) return;
    tone('sine', 220, 120, 0.15, 0.4 * v, 0.5); burst('white', 'bandpass', 2600, 3, 0.18 * v, 0.001, 0.06, 0.5);
  }
  function croak(v = 1) {
    if (!ready || v < 0.03) return;
    const t = ac.currentTime, o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(70, t + 0.35);
    const am = ac.createOscillator(), amg = ac.createGain(); am.frequency.value = 30; amg.gain.value = 0.5; am.connect(amg);
    const g = ac.createGain(); amg.connect(g.gain); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    o.connect(f); f.connect(g); g.connect(master); env(g, t, 0.02, 0.25 * v, 0.4); o.start(t); am.start(t); o.stop(t + 0.5); am.stop(t + 0.5);
  }
  function squeak(v = 1) { if (!ready || v < 0.03) return; tone('sine', 2400 + Math.random() * 600, 3400, 0.08, 0.08 * v, 0.4); tone('sine', 2800, 2200, 0.07, 0.06 * v, 0.4, 0.09); }
  function snip() { if (!ready) return; burst('white', 'highpass', 4000, 1, 0.5, 0.001, 0.05, 0.3); zap(); }
  function bang() { if (!ready) return; for (let i = 0; i < 3; i++) setTimeout(() => { burst('brown', 'lowpass', 180, 1, 1.6, 0.002, 0.35, 1.2); burst('white', 'bandpass', 700, 3, 0.4, 0.001, 0.1, 0.8); }, i * 260); }
  function fall() { if (!ready) return; burst('brown', 'lowpass', 160, 1, 1.4, 0.002, 0.4, 0.6); tone('sine', 90, 40, 0.3, 0.3, 0.4); }
  // música de piano da Hootsy (caixinha macabra em loop)
  let pianoTimer = null, pianoVol = 0;
  const PIANO = [[69, 0], [72, 1], [76, 2], [75, 3], [72, 4], [69, 5], [68, 6], [69, 7], [64, 8], [65, 9], [68, 10], [72, 11], [71, 12], [68, 13], [64, 14], [65, 15]];
  function pianoNote(m, d, v) {
    const f = 440 * Math.pow(2, (m - 69) / 12), t = ac.currentTime + d;
    for (const [mul, a] of [[1, 1], [2, 0.35], [3, 0.12]]) {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f * mul * (1 + (Math.random() - 0.5) * 0.004);
      const g = ac.createGain(); o.connect(g); g.connect(master); const w = ac.createGain(); w.gain.value = 1.4; g.connect(w); w.connect(verbIn);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * a * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.start(t); o.stop(t + 1.7);
    }
  }
  function piano(on, v = 1) {
    if (!ready) return;
    pianoVol = v;
    if (on && !pianoTimer) {
      let bar = 0;
      const play = () => { PIANO.forEach(([m, k]) => pianoNote(m - (bar % 2 ? 2 : 0), k * 0.42, pianoVol)); pianoNote(45 - (bar % 2 ? 2 : 0), 0, pianoVol * 0.8); pianoNote(52, 3.36, pianoVol * 0.6); bar++; };
      play(); pianoTimer = setInterval(play, 16 * 420);
    } else if (!on && pianoTimer) { clearInterval(pianoTimer); pianoTimer = null; }
  }
  function chime() { if (!ready) return; [0, 4, 7, 12, 7, 12, 16].forEach((st, i) => tone('triangle', 523 * Math.pow(2, st / 12), 523 * Math.pow(2, st / 12), 0.6, 0.16, 1.0, i * 0.28)); }

  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  return { init, exterior, interior, buzz, thunder, step, click, zap, creak, clank, blip, whoosh, rattle, heartbeat, riser, setHum, setDrone, resume,
    pull, engineStart, setEngine, clunk, powerUp, tick, ding, deny, lampOn, success,
    doorOpen, doorClose, mstep, scream, honk, laugh, drum, croak, squeak, snip, bang, fall, piano, chime, pebbles, crash, glass, rumble, sting, slam, glitchCab, secDoor, lightToggle, camSwitch, coin, powerDown, engineStop, get ready() { return ready; } };
})();
