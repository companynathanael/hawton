// Pós-processamento em WebGL: tela CRT curva, aberração cromática, bloom,
// scanlines, granulado, faixa de interferência e glitch.
window.Post = (() => {
  let gl, prog, tex, U = {}, ok = false, ctx2d = null, canvas;

  const VS = `attribute vec2 p; varying vec2 v;
    void main(){ v = p*0.5+0.5; v.y = 1.0 - v.y; gl_Position = vec4(p,0.0,1.0); }`;

  const FS = `precision mediump float;
    varying vec2 v;
    uniform sampler2D tex;
    uniform vec2 src, res;
    uniform float time, glitch, flash, scan, curv, fade;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec2 bend(vec2 uv){ uv = uv*2.0-1.0; vec2 o = uv.yx*uv.yx*curv; uv += uv*o; return uv*0.5+0.5; }
    vec3 S(vec2 uv){ return texture2D(tex, uv).rgb; }
    void main(){
      vec2 uv = bend(v);
      if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
      float line = floor(uv.y*src.y);
      float tq = floor(time*24.0);
      float gl1 = glitch*step(0.82, hash(vec2(line*0.13, tq)));
      uv.x += (hash(vec2(line, tq))-0.5)*0.04*gl1;
      float band = floor(uv.y*12.0);
      uv.x += glitch*0.012*step(0.9, hash(vec2(band, tq+3.0)));
      vec2 d = uv-0.5;
      float ca = 0.0016 + 0.006*glitch + dot(d,d)*0.010;
      vec3 col;
      col.r = S(uv + d*ca).r;
      col.g = S(uv).g;
      col.b = S(uv - d*ca).b;
      vec3 b = vec3(0.0);
      vec2 px = 1.0/src;
      for(int i=0;i<8;i++){
        float a = float(i)*0.7854 + 0.39;
        vec2 o = vec2(cos(a), sin(a));
        b += max(S(uv+o*px*2.5)-0.42, 0.0);
        b += max(S(uv+o*px*6.0)-0.42, 0.0)*0.7;
        b += max(S(uv+o*px*11.0)-0.45, 0.0)*0.45;
      }
      col += b*0.10;
      float sl = sin(uv.y*src.y*6.28318)*0.5+0.5;
      col *= mix(1.0, 0.72+0.28*sl, scan);
      float mask = mod(gl_FragCoord.x, 3.0);
      vec3 m = mask<1.0 ? vec3(1.0,0.92,0.92) : (mask<2.0 ? vec3(0.92,1.0,0.92) : vec3(0.92,0.92,1.0));
      col *= mix(vec3(1.0), m, scan*0.6);
      float roll = fract(time*0.06);
      col += 0.025*exp(-pow((uv.y-roll)*25.0, 2.0));
      col += (hash(uv*res + fract(time*7.3)*91.0)-0.5)*0.075;
      float vig = uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y);
      vig = clamp(pow(16.0*vig, 0.28), 0.0, 1.0);
      col *= vig;
      col = mix(col, vec3(dot(col, vec3(0.3,0.59,0.11))), 0.08);
      col *= 1.0 + 0.015*sin(time*120.0);
      col += flash;
      col *= fade;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init(cv) {
    canvas = cv;
    try {
      gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('sem webgl');
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      for (const n of ['tex', 'src', 'res', 'time', 'glitch', 'flash', 'scan', 'curv', 'fade']) U[n] = gl.getUniformLocation(prog, n);
      ok = true;
    } catch (e) {
      console.warn('WebGL indisponível, usando modo simples:', e);
      ok = false;
    }
  }

  function render(src, p) {
    if (ok) {
      try {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.uniform1i(U.tex, 0);
        gl.uniform2f(U.src, src.width, src.height);
        gl.uniform2f(U.res, canvas.width, canvas.height);
        gl.uniform1f(U.time, p.time);
        gl.uniform1f(U.glitch, p.glitch);
        gl.uniform1f(U.flash, p.flash);
        gl.uniform1f(U.scan, Math.min(1, Math.max(0, (canvas.height / src.height - 1.5) / 2)));
        gl.uniform1f(U.curv, p.curv);
        gl.uniform1f(U.fade, p.fade);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return;
      } catch (e) {
        // canvas "contaminado" (abrindo via file://) → cai para o modo 2D
        console.warn('Falha no WebGL, usando modo 2D. Rode com um servidor local para o efeito CRT.', e);
        ok = false;
        const nc = canvas.cloneNode();
        canvas.replaceWith(nc); canvas = nc;
      }
    }
    if (!ctx2d) ctx2d = canvas.getContext('2d');
    ctx2d.imageSmoothingEnabled = false;
    ctx2d.globalAlpha = 1;
    ctx2d.fillStyle = '#000';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.globalAlpha = p.fade;
    ctx2d.drawImage(src, 0, 0, canvas.width, canvas.height);
    ctx2d.globalAlpha = 1;
    if (p.flash > 0) { ctx2d.fillStyle = `rgba(255,255,255,${Math.min(1, p.flash)})`; ctx2d.fillRect(0, 0, canvas.width, canvas.height); }
  }

  return { init, render, get canvas() { return canvas; } };
})();
