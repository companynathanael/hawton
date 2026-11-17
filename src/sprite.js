// Sprite do jogador desenhado pixel a pixel (sem assets externos).
// Gera quadros para 4 direções x 5 quadros (0 = parado, 1-4 = andando), com contorno automático.
window.Sprite = (() => {
  const C = {
    out: '#0b0612',
    hair: '#3a2216', hairH: '#64402a',
    skin: '#eab48a', skinS: '#c08460', eye: '#160c1c',
    hood: '#c9452f', hoodS: '#8e2a1e', hoodH: '#f07a52',
    jeans: '#2b3566', jeansS: '#1b2148',
    shoe: '#ececf4', shoeS: '#9a9ab4',
    lamp: '#b8bcc8', lens: '#fff2b0'
  };
  const W = 14, H = 21; // 12x19 + 1px de contorno

  function frame(dir, f) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const walking = f > 0;
    const i = (f - 1 + 4) % 4;
    const s = walking ? [1, 0, -1, 0][i] : 0;     // passada
    const b = walking ? [0, 1, 0, 1][i] : 0;      // balanço do corpo
    const P = (x, y, c) => { g.fillStyle = c; g.fillRect(x + 1, y + 1, 1, 1); };
    const R = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) P(x, y, c); };

    if (dir === 'down' || dir === 'up') {
      // pernas
      const lLift = s > 0 ? 1 : 0, rLift = s < 0 ? 1 : 0;
      for (let y = 14; y <= 17; y++) {
        if (y <= 17 - lLift) { R(3, 5, y, C.jeans); P(5, y, C.jeansS); }
        if (y <= 17 - rLift) { R(6, 8, y, C.jeans); P(6, y, C.jeansS); }
      }
      R(3, 5, 18 - lLift, C.shoe); P(3, 18 - lLift, C.shoeS);
      R(6, 8, 18 - rLift, C.shoe); P(8, 18 - rLift, C.shoeS);
      // quadril
      R(3, 8, 13 + 0, C.jeans);
      // tronco
      const o = b;
      R(3, 8, 8 + o, C.hood);
      for (let y = 9; y <= 12; y++) { R(2, 9, y + o, C.hood); P(2, y + o, C.hoodS); P(9, y + o, C.hoodS); }
      // braços
      for (let y = 9; y <= 11; y++) { P(1, y + o - s, C.hoodS); P(10, y + o + s, C.hoodS); }
      P(1, 12 + o - s, C.skin); P(10, 12 + o + s, C.skin);
      if (dir === 'down') {
        for (let y = 9; y <= 12; y++) P(6, y + o, C.hoodS);
        P(4, 9 + o, C.hoodH); P(7, 9 + o, C.hoodH);
        R(3, 8, 12 + o, C.hoodS);
        // lanterna na mão direita
        P(11, 12 + o + s, C.lamp); P(11, 13 + o + s, C.lens);
        // cabeça
        R(4, 7, 0 + o, C.hair);
        R(3, 8, 1 + o, C.hair); R(5, 6, 1 + o, C.hairH);
        R(2, 9, 2 + o, C.hair);
        R(2, 9, 3 + o, C.hair); P(4, 3 + o, C.hairH);
        P(2, 4 + o, C.hair); P(3, 4 + o, C.hair); R(4, 7, 4 + o, C.skin); P(8, 4 + o, C.hair); P(9, 4 + o, C.hair);
        P(2, 5 + o, C.hair); R(3, 8, 5 + o, C.skin); P(9, 5 + o, C.hair); P(4, 5 + o, C.eye); P(7, 5 + o, C.eye);
        R(3, 8, 6 + o, C.skin); P(3, 6 + o, C.skinS); P(8, 6 + o, C.skinS);
        R(4, 7, 7 + o, C.skinS);
      } else {
        R(3, 8, 8 + o, C.hoodS); R(4, 7, 9 + o, C.hoodS);
        R(4, 7, 0 + o, C.hair);
        R(3, 8, 1 + o, C.hair); R(5, 6, 1 + o, C.hairH);
        for (let y = 2; y <= 5; y++) R(2, 9, y + o, C.hair);
        P(5, 3 + o, C.hairH); P(6, 2 + o, C.hairH);
        R(3, 8, 6 + o, C.hair);
        R(4, 7, 7 + o, C.skinS);
      }
    } else { // lado (direita; esquerda é espelhada)
      const front = 5 + s, back = 5 - s;
      for (let y = 14; y <= 17; y++) {
        R(back, back + 1, y, C.jeansS);
        R(front, front + 1, y, C.jeans);
      }
      R(back, back + 2, 18, C.shoeS);
      R(front, front + 2, 18, C.shoe);
      R(4, 7, 13, C.jeans);
      const o = b;
      for (let y = 8; y <= 12; y++) { R(4, 8, y + o, C.hood); P(4, y + o, C.hoodS); }
      P(8, 8 + o, C.hoodH);
      // braço da frente com lanterna
      for (let y = 9; y <= 11; y++) P(6 + (y > 10 ? s : 0), y + o, C.hoodS);
      P(7 + s, 12 + o, C.skin);
      P(8 + s, 12 + o, C.lamp); P(9 + s, 12 + o, C.lamp); P(10 + s, 12 + o, C.lens);
      // cabeça
      R(4, 7, 0 + o, C.hair);
      R(3, 8, 1 + o, C.hair); R(5, 7, 1 + o, C.hairH);
      R(3, 9, 2 + o, C.hair);
      R(3, 9, 3 + o, C.hair);
      R(3, 5, 4 + o, C.hair); R(6, 9, 4 + o, C.skin);
      R(3, 4, 5 + o, C.hair); R(5, 10, 5 + o, C.skin); P(8, 5 + o, C.eye);
      P(3, 6 + o, C.hair); R(4, 9, 6 + o, C.skin); P(5, 6 + o, C.skinS);
      R(5, 8, 7 + o, C.skinS);
    }

    // contorno
    const id = g.getImageData(0, 0, W, H), d = id.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push([x, y]);
    }
    g.fillStyle = C.out;
    for (const [x, y] of add) g.fillRect(x, y, 1, 1);
    return cv;
  }

  function flip(src) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.translate(W, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return cv;
  }

  const frames = { down: [], up: [], right: [], left: [] };
  for (let f = 0; f < 5; f++) {
    frames.down.push(frame('down', f));
    frames.up.push(frame('up', f));
    const r = frame('side', f);
    frames.right.push(r);
    frames.left.push(flip(r));
  }
  return { frames, W, H };
})();
