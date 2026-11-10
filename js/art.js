/* Tijolo Clicker — ícones 16x16 e fonte de pixels 3x5, tudo desenhado por código. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // Fonte de pixels 3x5 (placas, letreiros e números no prédio)
  // ---------------------------------------------------------------
  const GLYPHS = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
    8: '111101111101111', 9: '111101111001110',
    '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000', '!': '010010010000010',
    '/': '001001010100100', '$': '011110010011110', '*': '000101010101000',
  };

  function textWidth(str) { return str.length * 4 - 1; }

  function drawText(g, str, x, y, color) {
    g.fillStyle = color;
    str = String(str).toUpperCase();
    for (let c = 0; c < str.length; c++) {
      const gl = GLYPHS[str[c]] || GLYPHS[' '];
      for (let i = 0; i < 15; i++) {
        if (gl[i] === '1') g.fillRect(x + c * 4 + (i % 3), y + Math.floor(i / 3), 1, 1);
      }
    }
  }

  // ---------------------------------------------------------------
  // Ícones 16x16
  // ---------------------------------------------------------------
  const C = {
    k: '#2b1d14', skin: '#e9b48a', skin2: '#c98d63', white: '#f4f4f0', steel: '#c9d1d6', steel2: '#8a959c',
    wood: '#a0652f', wood2: '#6e4220', yellow: '#f2c14e', yellow2: '#c9952a', orange: '#ef7d2d', orange2: '#b85a1c',
    blue: '#3b6fb6', blue2: '#2a4f86', glass: '#7ec8e3', glass2: '#c4ecf7', red: '#c0603f', red2: '#8e3b26',
    brick: '#b5523b', brick2: '#d07355', green: '#5ca04a', green2: '#3d7333', gray: '#9aa0a6', gray2: '#6e747a',
    dark: '#3b3b46', pink: '#e86a92', purple: '#8a6bc8', teal: '#3aa39a',
  };

  const R = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

  function head(g, helmet, helmet2, shirt, shirt2, opts = {}) {
    // capacete
    R(g, helmet, 5, 1, 6, 1); R(g, helmet, 4, 2, 8, 2); R(g, helmet2, 3, 4, 10, 1); R(g, C.white, 6, 2, 1, 1);
    // rosto
    R(g, C.skin, 5, 5, 6, 4); R(g, C.skin2, 5, 8, 6, 1);
    R(g, C.k, 6, 6, 1, 1); R(g, C.k, 9, 6, 1, 1); R(g, C.red2, 7, 8, 2, 1);
    if (opts.hair) { R(g, opts.hair, 4, 5, 1, 4); R(g, opts.hair, 11, 5, 1, 5); R(g, opts.hair, 12, 7, 1, 3); }
    // corpo
    R(g, shirt, 3, 10, 10, 6); R(g, shirt2, 3, 15, 10, 1); R(g, C.skin, 7, 10, 2, 1);
    if (opts.stripe) { R(g, opts.stripe, 3, 12, 10, 1); R(g, opts.stripe, 3, 14, 10, 1); }
  }

  const ICONS = {
    servente(g) { head(g, C.orange, C.orange2, C.orange, C.orange2, { stripe: '#f5f0a0' }); R(g, C.brick, 12, 9, 4, 2); R(g, C.brick2, 12, 9, 4, 1); },
    pedreiro(g) { head(g, C.yellow, C.yellow2, C.blue, C.blue2); R(g, C.steel, 12, 11, 3, 3); R(g, C.wood, 13, 9, 1, 2); },
    betoneira(g) {
      R(g, C.orange, 3, 3, 8, 8); R(g, C.orange2, 4, 10, 6, 1); R(g, C.orange, 2, 5, 10, 4);
      R(g, C.yellow, 4, 4, 1, 6); R(g, C.yellow, 7, 3, 1, 8); R(g, C.k, 11, 6, 3, 2);
      R(g, C.gray2, 5, 11, 5, 2); R(g, C.k, 2, 13, 3, 3); R(g, C.k, 10, 13, 3, 3); R(g, C.steel, 3, 14, 1, 1); R(g, C.steel, 11, 14, 1, 1);
    },
    mestre(g) { head(g, C.white, C.steel, C.white, C.steel, {}); R(g, C.wood, 11, 10, 4, 6); R(g, C.white, 12, 11, 2, 3); R(g, C.k, 12, 12, 2, 1); },
    caminhao(g) {
      R(g, C.red, 9, 5, 6, 7); R(g, C.glass, 11, 6, 3, 3); R(g, C.red2, 9, 11, 6, 1);
      R(g, C.gray2, 1, 9, 8, 3); R(g, C.brick, 1, 5, 7, 4); R(g, C.brick2, 1, 5, 7, 1); R(g, C.brick2, 1, 7, 7, 1);
      R(g, C.k, 2, 12, 3, 3); R(g, C.k, 10, 12, 3, 3); R(g, C.steel, 3, 13, 1, 1); R(g, C.steel, 11, 13, 1, 1);
    },
    guindaste(g) {
      R(g, C.yellow, 5, 3, 2, 13); for (let y = 4; y < 16; y += 2) R(g, C.yellow2, 5 + (y / 2) % 2, y, 1, 1);
      R(g, C.yellow, 0, 2, 16, 2); R(g, C.yellow2, 0, 3, 16, 1); R(g, C.dark, 12, 1, 3, 1);
      R(g, C.gray2, 12, 4, 3, 3); R(g, C.k, 2, 4, 1, 6); R(g, C.brick, 0, 10, 5, 2); R(g, C.blue, 4, 0, 3, 2);
    },
    engenheira(g) { head(g, C.white, C.steel, C.teal, '#2b7a73', { hair: '#5a3a22' }); R(g, C.glass2, 12, 11, 4, 2); R(g, C.blue, 12, 13, 4, 1); },
    bomba(g) {
      R(g, C.gray, 1, 9, 12, 3); R(g, C.blue, 10, 6, 5, 6); R(g, C.glass, 12, 7, 2, 2);
      R(g, C.yellow, 3, 2, 2, 7); R(g, C.yellow, 3, 2, 11, 2); R(g, C.k, 13, 4, 1, 4);
      R(g, C.k, 2, 12, 3, 3); R(g, C.k, 10, 12, 3, 3);
    },
    impressora(g) {
      R(g, C.blue, 1, 1, 2, 15); R(g, C.blue, 13, 1, 2, 15); R(g, C.blue, 1, 1, 14, 2); R(g, C.blue2, 1, 3, 14, 1);
      R(g, C.orange, 6, 4, 4, 3); R(g, C.k, 7, 7, 2, 2);
      for (let y = 10; y < 16; y += 2) { R(g, C.gray, 4, y, 8, 2); R(g, C.gray2, 4, y + 1, 8, 1); }
    },
    robo(g) {
      R(g, C.steel, 3, 2, 10, 8); R(g, C.steel2, 3, 9, 10, 1); R(g, C.dark, 4, 4, 8, 3);
      R(g, '#6cf0ff', 5, 5, 2, 1); R(g, '#6cf0ff', 9, 5, 2, 1); R(g, C.red, 7, 0, 2, 2);
      R(g, C.steel2, 4, 11, 8, 4); R(g, C.yellow, 6, 12, 4, 1); R(g, C.k, 4, 15, 3, 1); R(g, C.k, 9, 15, 3, 1);
    },
    fabrica(g) {
      R(g, C.gray, 0, 8, 16, 8); R(g, C.gray2, 0, 15, 16, 1);
      for (let x = 0; x < 12; x += 4) { R(g, C.gray, x, 6, 4, 2); R(g, C.gray2, x + 3, 5, 1, 3); }
      R(g, C.red, 12, 1, 3, 7); R(g, C.white, 12, 3, 3, 1); R(g, C.steel, 11, 0, 2, 1);
      R(g, C.glass, 2, 10, 3, 2); R(g, C.glass, 7, 10, 3, 2); R(g, C.wood2, 12, 11, 3, 5);
    },
    consorcio(g) {
      R(g, C.blue2, 1, 6, 5, 10); R(g, C.glass, 7, 1, 5, 15); R(g, C.gray2, 12, 8, 4, 8);
      for (let y = 3; y < 15; y += 2) R(g, C.glass2, 8, y, 3, 1);
      for (let y = 8; y < 15; y += 2) R(g, C.yellow, 2, y, 3, 1);
      R(g, C.yellow, 9, 0, 1, 1);
    },
    janela(g) {
      R(g, C.white, 1, 1, 14, 13); R(g, C.glass, 2, 2, 5, 5); R(g, C.glass, 9, 2, 5, 5); R(g, C.glass, 2, 8, 5, 5); R(g, C.glass, 9, 8, 5, 5);
      R(g, C.glass2, 3, 3, 1, 1); R(g, C.glass2, 4, 4, 1, 1); R(g, C.glass2, 10, 3, 1, 1); R(g, C.glass2, 3, 9, 1, 1); R(g, C.glass2, 10, 9, 1, 1);
      R(g, C.gray, 0, 14, 16, 2);
    },
    porta(g) {
      R(g, C.white, 3, 1, 10, 12); R(g, C.glass, 4, 2, 8, 11); R(g, C.white, 8, 2, 1, 11); R(g, C.glass2, 5, 3, 1, 2);
      R(g, C.gray, 0, 13, 16, 1); R(g, C.dark, 0, 9, 16, 1); for (let x = 0; x < 16; x += 3) R(g, C.dark, x, 9, 1, 4);
      R(g, C.gray2, 0, 14, 16, 2);
    },
    floreira(g) {
      R(g, C.wood, 1, 10, 14, 5); R(g, C.wood2, 1, 14, 14, 1); R(g, C.green, 2, 6, 12, 4); R(g, C.green2, 3, 9, 10, 1);
      R(g, C.pink, 3, 5, 2, 2); R(g, C.yellow, 7, 4, 2, 2); R(g, C.purple, 11, 5, 2, 2); R(g, C.red, 5, 7, 1, 1); R(g, C.white, 9, 7, 1, 1);
    },
    ar(g) {
      R(g, C.white, 1, 3, 14, 10); R(g, C.steel, 1, 12, 14, 1); R(g, C.steel2, 1, 13, 14, 1);
      for (let y = 5; y < 11; y += 2) R(g, C.steel2, 3, y, 10, 1); R(g, C.blue, 12, 4, 2, 1); R(g, '#6cf0ff', 3, 14, 1, 2); R(g, '#6cf0ff', 7, 14, 1, 1);
    },
    lona(g) {
      R(g, C.blue, 0, 2, 16, 10); R(g, C.blue2, 0, 11, 16, 1);
      for (let i = 0; i < 9; i++) R(g, C.blue2, 2 + i, 3 + i, 1, 1);
      R(g, C.white, 0, 2, 2, 2); R(g, C.white, 14, 2, 2, 2); R(g, C.wood, 2, 12, 1, 4); R(g, C.wood, 13, 12, 1, 4);
    },
    epi(g) {
      R(g, C.yellow, 4, 0, 8, 1); R(g, C.yellow, 3, 1, 10, 3); R(g, C.yellow2, 2, 4, 12, 1); R(g, C.white, 5, 1, 1, 1);
      R(g, C.orange, 2, 7, 12, 9); R(g, C.k, 7, 7, 2, 9); R(g, '#f5f0a0', 2, 10, 5, 1); R(g, '#f5f0a0', 9, 10, 5, 1);
      R(g, '#f5f0a0', 2, 13, 5, 1); R(g, '#f5f0a0', 9, 13, 5, 1);
    },
    laudo(g) {
      R(g, C.white, 2, 0, 11, 16); R(g, C.steel, 12, 1, 1, 15);
      for (let y = 2; y < 9; y += 2) R(g, C.steel2, 4, y, 7, 1);
      R(g, C.red, 6, 10, 6, 5); R(g, C.white, 7, 11, 4, 3); R(g, C.red, 8, 12, 2, 1);
    },
    'click-0'(g) { R(g, C.wood, 3, 4, 9, 10); R(g, C.wood2, 3, 13, 9, 1); R(g, C.wood, 12, 7, 3, 3); R(g, C.wood2, 3, 4, 2, 7); R(g, C.wood2, 6, 2, 2, 4); R(g, C.wood2, 9, 2, 2, 4); R(g, C.wood, 6, 2, 1, 2); R(g, C.wood, 9, 2, 1, 2); },
    'click-1'(g) { R(g, C.steel, 1, 7, 8, 6); R(g, C.steel2, 1, 12, 8, 1); R(g, C.steel, 2, 6, 6, 1); R(g, C.gray2, 8, 6, 3, 2); R(g, C.wood, 10, 3, 2, 4); R(g, C.wood, 11, 1, 3, 3); R(g, C.wood2, 13, 1, 1, 3); },
    'click-2'(g) { R(g, C.skin, 2, 6, 12, 5); R(g, C.skin2, 2, 10, 12, 1); R(g, C.skin, 4, 3, 5, 4); R(g, C.skin2, 6, 4, 2, 1); R(g, C.blue, 12, 5, 4, 7); R(g, C.k, 2, 5, 1, 1); },
    ritmo(g) { R(g, C.wood, 4, 1, 8, 14); R(g, C.wood2, 3, 14, 10, 2); R(g, C.white, 5, 3, 6, 9); R(g, C.k, 7, 4, 1, 7); R(g, C.k, 8, 4, 1, 1); R(g, C.red, 6, 4, 1, 1); R(g, C.yellow, 7, 9, 2, 2); },
    'rent-0'(g) { R(g, C.yellow, 2, 6, 5, 5); R(g, C.k, 3, 7, 3, 3); R(g, C.yellow, 4, 8, 1, 1); R(g, C.yellow, 7, 8, 8, 2); R(g, C.yellow, 12, 10, 1, 2); R(g, C.yellow, 14, 10, 1, 3); },
    'rent-1'(g) { R(g, C.yellow, 6, 3, 4, 1); R(g, C.yellow, 4, 4, 8, 6); R(g, C.yellow2, 3, 10, 10, 2); R(g, C.k, 7, 12, 2, 2); R(g, C.white, 6, 5, 1, 3); R(g, C.wood, 1, 14, 14, 2); },
    'rent-2'(g) { R(g, C.steel, 2, 0, 12, 16); R(g, C.steel2, 7, 2, 2, 14); R(g, C.glass, 3, 2, 4, 14); R(g, C.glass, 9, 2, 4, 14); R(g, C.yellow, 13, 6, 2, 2); R(g, C.k, 5, 0, 6, 2); R(g, C.red, 7, 0, 2, 1); },
    'rent-3'(g) { R(g, C.dark, 1, 4, 3, 8); R(g, C.dark, 12, 4, 3, 8); R(g, C.gray2, 0, 6, 1, 4); R(g, C.gray2, 15, 6, 1, 4); R(g, C.steel, 4, 7, 8, 2); },
    'rent-4'(g) { R(g, C.white, 0, 4, 16, 10); R(g, C.glass, 1, 5, 14, 8); R(g, C.glass2, 2, 6, 3, 1); R(g, C.glass2, 8, 9, 4, 1); R(g, C.steel, 12, 1, 1, 5); R(g, C.steel, 14, 1, 1, 5); R(g, C.steel, 12, 2, 3, 1); },
    'rent-5'(g) { R(g, C.gray2, 0, 1, 16, 14); R(g, C.gray, 1, 2, 14, 12); R(g, C.yellow, 4, 4, 2, 8); R(g, C.yellow, 10, 4, 2, 8); R(g, C.yellow, 6, 7, 4, 2); },
    'rent-6'(g) { R(g, C.green, 3, 3, 10, 9); R(g, C.green2, 4, 11, 8, 2); R(g, C.green2, 7, 3, 1, 12); R(g, C.green2, 5, 6, 2, 1); R(g, C.green2, 8, 8, 2, 1); R(g, C.wood, 7, 13, 1, 3); },
    mystery(g) {
      R(g, C.steel2, 5, 2, 6, 2); R(g, C.steel2, 4, 3, 2, 3); R(g, C.steel2, 10, 3, 2, 4); R(g, C.steel2, 8, 7, 2, 2);
      R(g, C.steel2, 7, 9, 2, 2); R(g, C.steel2, 7, 12, 2, 2);
    },
    estrela(g) {
      R(g, C.yellow, 7, 1, 2, 3); R(g, C.yellow, 1, 5, 14, 3); R(g, C.yellow, 3, 8, 10, 2); R(g, C.yellow, 2, 10, 5, 3); R(g, C.yellow, 9, 10, 5, 3);
      R(g, C.yellow, 6, 3, 4, 3); R(g, C.yellow2, 2, 12, 3, 2); R(g, C.yellow2, 11, 12, 3, 2); R(g, C.white, 7, 4, 1, 1);
    },
    trofeu(g) {
      R(g, C.yellow, 3, 1, 10, 7); R(g, C.yellow, 4, 8, 8, 2); R(g, C.yellow2, 7, 10, 2, 3); R(g, C.wood, 4, 13, 8, 3);
      R(g, C.yellow, 0, 2, 3, 1); R(g, C.yellow, 0, 2, 1, 4); R(g, C.yellow, 13, 2, 3, 1); R(g, C.yellow, 15, 2, 1, 4); R(g, C.white, 5, 2, 1, 4);
    },
    tijolo(g) {
      R(g, '#cfc1a8', 0, 3, 16, 10);
      [[0, 3, 7], [8, 3, 8], [0, 8, 3], [4, 8, 8], [13, 8, 3]].forEach(([x, y, w]) => { R(g, C.brick, x, y + 1, w, 3); R(g, C.brick2, x, y + 1, w, 1); R(g, C.red2, x, y + 3, w, 1); });
    },
  };

  const TIER_COLORS = ['#c98a4a', '#c9d1d6', '#f2c14e', '#5fd08a', '#ff5c7a', '#9be7ff'];

  function iconFor(key) {
    if (ICONS[key]) return ICONS[key];
    if (/^ritmo-/.test(key)) return ICONS.ritmo;
    return ICONS.mystery;
  }

  // Desenha um ícone num canvas 16x16; "tier" acrescenta um selo colorido no canto
  function paintIcon(canvas, key, tier) {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 16, 16);
    iconFor(key)(g);
    if (tier != null) {
      const c = TIER_COLORS[tier % TIER_COLORS.length];
      g.fillStyle = '#1a120d'; g.fillRect(10, 10, 6, 6);
      g.fillStyle = c; g.fillRect(11, 11, 4, 4);
      g.fillStyle = '#ffffff'; g.fillRect(11, 11, 1, 1);
    }
  }

  function makeIcon(key, tier, cls = 'item-icon') {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16; c.className = cls;
    paintIcon(c, key, tier);
    return c;
  }

  root.ART = { GLYPHS, drawText, textWidth, ICONS, paintIcon, makeIcon, TIER_COLORS, C };
})(window);
