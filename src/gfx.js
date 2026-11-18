// Iluminação "deluxe" em WebGL para o jogo 2D: relevo por pixel (normal map
// gerado da própria arte), brilho especular, telas/neons emissivos, tone mapping
// de cinema e dithering em pixel art. Usa o mapa de luz do jogo (que já respeita
// paredes e a lanterna) como base, então nenhuma luz atravessa parede.
window.Gfx = (() => {
  const MAXL = 32;
  let gl, prog, U = {}, ok = false, canvas, texA, texL, texN, quad, W = 0, H = 0;

  const VS = `attribute vec2 p; varying vec2 v;
    void main(){ v = p*0.5+0.5; v.y = 1.0 - v.y; gl_Position = vec4(p,0.0,1.0); }`;
  const FS = `precision highp float;
    varying vec2 v;
    uniform sampler2D albedo, lightm, nmap;
    uniform vec2 view, world, cam, pl;
    uniform float time, expo, specK, emK;
    uniform vec4 L[${MAXL}];
    uniform vec4 LC[${MAXL}];
    uniform int NL;
    float bayer(vec2 p){
      vec2 q = mod(floor(p), 4.0); float i = q.y*4.0 + q.x;
      float m = 0.0;
      if(i<1.) m=0.; else if(i<2.) m=8.; else if(i<3.) m=2.; else if(i<4.) m=10.;
      else if(i<5.) m=12.; else if(i<6.) m=4.; else if(i<7.) m=14.; else if(i<8.) m=6.;
      else if(i<9.) m=3.; else if(i<10.) m=11.; else if(i<11.) m=1.; else if(i<12.) m=9.;
      else if(i<13.) m=15.; else if(i<14.) m=7.; else if(i<15.) m=13.; else m=5.;
      return (m+0.5)/16.0 - 0.5;
    }
    vec3 aces(vec3 x){ return clamp(x*(2.51*x+0.03)/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    void main(){
      vec2 px = v*view;
      vec3 a = texture2D(albedo, v).rgb;
      vec3 lm = texture2D(lightm, v).rgb;
      vec4 nm = texture2D(nmap, (cam + px)/world);
      vec2 nxy = nm.xy*2.0 - 1.0;
      vec3 N = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
      float gloss = nm.b, h = nm.a;
      vec3 lin = a*a, lml = lm*lm;
      vec3 P = vec3(px, h*10.0);
      // vista: muda um pouco com a posição do jogador (reflexos "andam")
      vec3 V = normalize(vec3((px - pl)*0.0025, 1.0) + vec3(0.0, 0.55, 0.0));
      float rel = 0.0, wsum = 0.0; vec3 spec = vec3(0.0);
      for (int i = 0; i < ${MAXL}; i++) {
        if (i >= NL) break;
        vec3 d = vec3(L[i].xy, 16.0) - P; float dist = length(d); vec3 Ld = d/dist;
        float att = clamp(1.0 - dist/(L[i].w*2.6), 0.0, 1.0); att *= att;
        float w = att*LC[i].a;
        rel += max(dot(N, Ld), 0.0)*w; wsum += w;
        vec3 Hh = normalize(Ld + V);
        spec += pow(max(dot(N, Hh), 0.0), 28.0)*att*LC[i].rgb*LC[i].a;
      }
      float rf = mix(1.0, 0.45 + 0.85*rel/max(wsum, 1e-4), clamp(wsum*2.5, 0.0, 1.0));
      float vis = clamp(dot(lml, vec3(0.33))*4.0, 0.0, 1.0);
      // brilho do piso "vivo": ondulação lenta no especular
      float shim = 0.85 + 0.15*sin(px.x*0.07 + px.y*0.05 + time*1.3)*sin(px.y*0.09 - time*0.9);
      vec3 col = lin*lml*rf*expo + spec*gloss*vis*specK*shim;
      // emissivos: telas, letreiros e neons (só objetos/paredes, nunca o chão)
      float mx = max(a.r, max(a.g, a.b)), mn = min(a.r, min(a.g, a.b));
      float sat = mx > 0.0 ? (mx - mn)/mx : 0.0;
      float em = step(0.2, h)*step(0.7, mx)*step(0.45, sat);
      col += lin*em*emK*(0.9 + 0.1*sin(time*6.0 + px.x*0.3));
      col = aces(col*1.1);
      col = pow(col, vec3(1.0/2.2));
      // sombras frias, luzes quentes
      float lu = dot(col, vec3(0.3, 0.59, 0.11));
      col += (1.0 - clamp(lu*3.0, 0.0, 1.0))*vec3(0.0, 0.008, 0.028);
      col = mix(col, col*vec3(1.04, 1.0, 0.96), clamp(lu*1.5, 0.0, 1.0));
      // paleta + dithering (pixel art)
      col = floor(clamp(col, 0.0, 1.0)*20.0 + 0.5 + bayer(px)) / 20.0;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  function mkTex() { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; }

  // mapa de relevo/material do mundo inteiro (calculado uma vez)
  function buildNormals(Wd) {
    const w = Wd.W, hh = Wd.H;
    const alb = Wd.canvas.getContext('2d').getImageData(0, 0, w, hh).data;
    const oal = Wd.objCanvas.getContext('2d').getImageData(0, 0, w, hh).data;
    const n = w * hh, lum = new Float32Array(n), hgt = new Float32Array(n), cls = new Uint8Array(n);
    for (let i = 0; i < n; i++) lum[i] = (alb[i * 4] * 0.3 + alb[i * 4 + 1] * 0.59 + alb[i * 4 + 2] * 0.11) / 255;
    for (let ty = 0; ty < Wd.TH; ty++) for (let tx = 0; tx < Wd.TW; tx++) {
      const t = Wd.tileAt(tx * 8 + 4, ty * 8 + 4);
      for (let y = ty * 8; y < ty * 8 + 8; y++) for (let x = tx * 8; x < tx * 8 + 8; x++) {
        const i = y * w + x, obj = oal[i * 4 + 3] > 128;
        if (obj) { hgt[i] = 0.35 + lum[i] * 0.25; cls[i] = 2; }
        else if (t === 0 || t === 2 || t === 3) { hgt[i] = 1; cls[i] = 3; }
        else if (t === Wd.FLOOR && Wd.solid[i]) { hgt[i] = 0.7; cls[i] = 4; }
        else cls[i] = 1;
      }
    }
    const out = new Uint8Array(n * 4);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const b = k => lum[k] + hgt[k] * 3;
      const gx = (x > 0 && x < w - 1) ? (b(i + 1) - b(i - 1)) * 0.5 : 0;
      const gy = (y > 0 && y < hh - 1) ? (b(i + w) - b(i - w)) * 0.5 : 0;
      const k = cls[i] === 1 ? 2.2 : cls[i] === 2 ? 1.6 : 1.0;
      let nx = -gx * k, ny = -gy * k, nz = 1;
      if (cls[i] === 4) { nx *= 0.3; ny = 1.0; nz = 0.45; }
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
      out[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i * 4 + 2] = Math.round((cls[i] === 1 ? 0.55 : cls[i] === 2 ? 0.45 : 0.12) * 255);
      out[i * 4 + 3] = Math.round(hgt[i] * 255);
    }
    return out;
  }

  function init(Wd) {
    try {
      canvas = document.createElement('canvas');
      gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
      if (!gl) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      for (const k of ['albedo', 'lightm', 'nmap', 'view', 'world', 'cam', 'pl', 'time', 'expo', 'specK', 'emK', 'NL']) U[k] = gl.getUniformLocation(prog, k);
      U.L = gl.getUniformLocation(prog, 'L'); U.LC = gl.getUniformLocation(prog, 'LC');
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      texA = mkTex(); texL = mkTex(); texN = mkTex();
      gl.bindTexture(gl.TEXTURE_2D, texN);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Wd.W, Wd.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildNormals(Wd));
      gl.uniform1i(U.albedo, 0); gl.uniform1i(U.lightm, 1); gl.uniform1i(U.nmap, 2);
      gl.uniform2f(U.world, Wd.W, Wd.H);
      ok = true;
    } catch (e) { console.warn('Gfx desligado:', e); ok = false; }
    return ok;
  }

  const Lbuf = new Float32Array(MAXL * 4), Cbuf = new Float32Array(MAXL * 4);
  // lights: [{x, y, r, rgb:[r,g,b] 0..1, k}] já em coordenadas da tela
  function compose(albedoCanvas, lightCanvas, cx, cy, lights, p) {
    if (!ok) return null;
    const vw = albedoCanvas.width, vh = albedoCanvas.height;
    if (vw !== W || vh !== H) { W = canvas.width = vw; H = canvas.height = vh; gl.viewport(0, 0, vw, vh); }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, albedoCanvas);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lightCanvas);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texN);
    const n = Math.min(MAXL, lights.length);
    for (let i = 0; i < n; i++) {
      const l = lights[i];
      Lbuf[i * 4] = l.x; Lbuf[i * 4 + 1] = l.y; Lbuf[i * 4 + 2] = 16; Lbuf[i * 4 + 3] = l.r;
      Cbuf[i * 4] = l.rgb[0]; Cbuf[i * 4 + 1] = l.rgb[1]; Cbuf[i * 4 + 2] = l.rgb[2]; Cbuf[i * 4 + 3] = l.k;
    }
    gl.uniform4fv(U.L, Lbuf); gl.uniform4fv(U.LC, Cbuf); gl.uniform1i(U.NL, n);
    gl.uniform2f(U.view, vw, vh); gl.uniform2f(U.cam, cx, cy); gl.uniform2f(U.pl, p.px, p.py);
    gl.uniform1f(U.time, p.time); gl.uniform1f(U.expo, p.expo); gl.uniform1f(U.specK, p.specK); gl.uniform1f(U.emK, p.emK);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }

  return { init, compose, get ok() { return ok; } };
})();
