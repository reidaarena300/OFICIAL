/* Tijolo Clicker — mundo em pixel art: céu, cidade, rua, prédio e efeitos. */
(function (root) {
  'use strict';

  const W = 320, H = 384;
  const BW = 8, BH = 4, ROWS = 10;
  const WALL_H = ROWS * BH;          // 40
  const SLAB_H = 4;
  const FLOOR_H = WALL_H + SLAB_H;   // 44
  const GROUND_Y = H - 58;           // nível da calçada
  const FOUND_H = 4;
  const DAY_LEN = 300;
  const TOP_TARGET = 172;            // altura (na tela) do topo da parede em construção
  const PAD = 14;                    // folga lateral no cache de fachada

  function hash(a, b) {
    let x = Math.imul((a | 0) + 1, 73856093) ^ Math.imul((b | 0) + 7, 19349663);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const shade = (h, f) => rgb(hex(h).map(v => Math.max(0, Math.min(255, Math.round(v * f)))));

  // ---------------------------------------------------------------
  // Estilos de cada obra
  // ---------------------------------------------------------------
  const STYLE = {
    casa:        { walls: ['#f1e3c6', '#f2b8a0', '#bfe3c8', '#b9d8ec', '#e3cff0', '#f5dd8a'], trim: '#f7f3ea', slab: '#d8d2c4', window: 'madeira', alt: ['madeira', 'madeira', 'arco'], awnings: true, shutters: ['#4f8a55', '#3b6fb6', '#b5523b', '#6e4220'], decos: ['cano', 'luminaria', 'trepadeira', 'vaso', 'passaro', 'gato', 'ventilacao'] },
    sobrado:     { alt: ['arco', 'arco', 'madeira'], shutters: ['#4f8a55', '#2f3542', '#6e4220'], bricks: [['#b5523b', '#d07355', '#7d3423'], ['#c46a3c', '#de8d5c', '#8a4723'], ['#9c4a35', '#bd6a52', '#6b2f22'], ['#c7834f', '#e0a56e', '#8e5a32']], trim: '#f4f0e6', slab: '#e9e4d8', window: 'arco', decos: ['cano', 'luminaria', 'trepadeira', 'grafite', 'passaro', 'ventilacao'] },
    residencial: { walls: ['#e8d3b0', '#d98c6c', '#9fb4c9', '#b8b77f', '#efe6d6', '#c9a0a0', '#a7c4a0', '#d6b3d9'], trim: '#6e747a', slab: '#b8bec4', window: 'aluminio', alt: ['aluminio', 'aluminio', 'madeira'], shutters: ['#3b6fb6', '#6e747a', '#b5523b'], awnings: true, decos: ['cano', 'parabolica', 'varal', 'gato', 'placa', 'ventilacao', 'mural', 'passaro'] },
    comercial:   { walls: ['#cfc8b8', '#bdb6a6', '#d8d2c4', '#a9a294', '#c2cbd1', '#d9c7b0'], trim: '#5c6670', slab: '#8a919a', window: 'fita', alt: ['fita', 'fita', 'aluminio'], bands: ['#3aa39a', '#b5523b', '#3b6fb6', '#d9a441'], decos: ['relogio', 'placa', 'brise', 'ventilacao', 'cano'] },
    hotel:       { walls: ['#f2e6cf', '#f4dcc0', '#e8c9a8', '#f0d9b5', '#dcc2a6', '#f4e2d0', '#e6d3c3'], trim: '#b5523b', trims: ['#b5523b', '#3b6fb6', '#5f9e6e', '#8a6bc8', '#c9952a'], slab: '#c98a5a', window: 'francesa', alt: ['francesa', 'francesa', 'arco'], awnings: true, decos: ['luminaria', 'bandeira', 'vaso', 'mural', 'passaro'] },
    vidro:       { glass: ['#5b8fb9', '#4f86a8', '#6a9cc0', '#57819f'], trim: '#c9d1d6', slab: '#8a959c', window: 'painel', decos: ['brise'] },
    torre:       { glass: ['#4d7f9e', '#5a8fa8', '#3f7090'], trim: '#d4b25a', slab: '#7a8088', window: 'painel', decos: ['brise'] },
  };
  const DEFAULT_BRICKS = [['#b5523b', '#d07355', '#7d3423'], ['#a8472f', '#c4664a', '#72301f'], ['#c0603f', '#db8461', '#86402a']];
  const MORTAR = '#cfc1a8';

  function World(canvas, G) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const { drawText, textWidth } = root.ART;

    let camY = 0, dayTime = 80, clock = 0, flash = 0, shake = 0;
    let geo = null;
    const particles = [], falling = [], inflight = new Set(), cars = [], workers = [], rings = [];
    let farCache = null, farKey = '';
    const smoke = [];
    let cacheKeyProject = '';
    const facadeCache = new Map();
    const lights = [];   // luzes noturnas desta moldura: [x, y, w, h, cor]
    let plane = null, birds = null, nextPlane = 30, nextBirds = 12, nextCar = 1;

    // -------------------------------------------------------------
    // Geometria
    // -------------------------------------------------------------
    function updateGeo() {
      const S = G.S;
      const p = root.TC.project(S);
      const ww = p.cols * BW;
      const bx = Math.round((W - ww) / 2);
      geo = { p, style: STYLE[p.style], ww, bx, per: p.cols * ROWS, complete: S.floors >= p.floors };
      const key = p.id + ':' + (p.record ? 'r' : '');
      if (key !== cacheKeyProject) { cacheKeyProject = key; facadeCache.clear(); }
    }

    const floorBase = i => GROUND_Y - FOUND_H - i * FLOOR_H + camY;
    const targetCam = () => Math.max(0, TOP_TARGET - (GROUND_Y - FOUND_H - WALL_H) + G.S.floors * FLOOR_H);
    const visibleCount = () => {
      const S = G.S;
      if (geo.complete) return 0;
      return Math.min(geo.per, Math.floor(S.bricks / root.TC.needFor(S, S.floors) * geo.per));
    };

    // -------------------------------------------------------------
    // Pequenos desenhos
    // -------------------------------------------------------------
    const R = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

    function disc(g, cx, cy, r, color) {
      g.fillStyle = color;
      for (let dy = -r; dy <= r; dy++) {
        const dx = Math.floor(Math.sqrt(r * r - dy * dy));
        g.fillRect(Math.round(cx - dx), Math.round(cy + dy), dx * 2 + 1, 1);
      }
    }

    function brick(g, x, y, col) {
      R(g, MORTAR, x, y, BW, BH);
      R(g, col[0], x, y + 1, BW - 1, BH - 1);
      R(g, col[1], x, y + 1, BW - 1, 1);
      R(g, col[2], x, y + BH - 1, BW - 1, 1);
    }

    function brickWall(g, x0, y0, w, palette, seed, count = Infinity, skip = null) {
      g.save();
      g.beginPath(); g.rect(x0, y0, w, WALL_H); g.clip();
      const cols = w / BW;
      const total = Math.min(count, cols * ROWS);
      for (let k = 0; k < total; k++) {
        if (skip && skip.has(k)) continue;
        const row = Math.floor(k / cols), col = k % cols;
        const x = x0 + col * BW - (row % 2 ? BW / 2 : 0);
        const y = y0 + WALL_H - (row + 1) * BH;
        brick(g, x, y, palette[Math.floor(hash(seed, k) * palette.length)]);
        if (row % 2 && col === cols - 1) brick(g, x + BW, y, palette[Math.floor(hash(seed, k + 999) * palette.length)]);
      }
      g.restore();
    }

    function plaster(g, x, y, w, h, color, seed) {
      R(g, color, x, y, w, h);
      const lo = shade(color, 0.93), hi = shade(color, 1.05);
      for (let i = 0; i < w * h / 22; i++) {
        const r1 = hash(seed, i * 2), r2 = hash(seed + 7, i * 2 + 1);
        R(g, r1 > 0.5 ? lo : hi, x + Math.floor(r1 * w * 7.3) % w, y + Math.floor(r2 * h));
      }
      R(g, shade(color, 0.82), x, y, w, 1);          // sombra da laje
      R(g, shade(color, 0.9), x, y + h - 1, w, 1);
      // manchas de chuva escorrendo
      if (hash(seed, 77) > 0.55) {
        const sx = x + Math.floor(hash(seed, 78) * (w - 6));
        for (let j = 0; j < 6 + hash(seed, 79) * 10; j++) R(g, shade(color, 0.88), sx + (j % 3 === 0 ? 1 : 0), y + 1 + j, 1, 1);
      }
    }

    // ---------- Janelas ----------
    function windowRect(style, ww) {
      const w = { madeira: 16, arco: 14, aluminio: 20, fita: Math.round(ww * 0.34), francesa: 14, painel: 0 }[style];
      const h = { madeira: 16, arco: 22, aluminio: 16, fita: 14, francesa: 26, painel: 0 }[style];
      return { w, h };
    }

    function drawWindow(g, st, x, y, w, h, seed, glassOut) {
      const kind = st.window;
      if (kind === 'madeira') {
        const sh = pick(st.shutters, hash(seed, 3));
        R(g, '#5e3820', x - 1, y - 1, w + 2, h + 2);
        R(g, '#7ec8e3', x, y, w, h); R(g, '#c4ecf7', x + 1, y + 1, 2, 1); R(g, '#c4ecf7', x + 1, y + 2, 1, 1);
        R(g, '#5e3820', x + w / 2, y, 1, h); R(g, '#5e3820', x, y + h / 2, w, 1);
        // venezianas
        R(g, sh, x - 7, y - 1, 6, h + 2); R(g, sh, x + w + 1, y - 1, 6, h + 2);
        for (let j = 1; j < h; j += 2) { R(g, shade(sh, 0.75), x - 6, y + j, 4, 1); R(g, shade(sh, 0.75), x + w + 2, y + j, 4, 1); }
        R(g, '#efe7d6', x - 2, y + h + 1, w + 4, 2);
        glassOut.push([x, y, w, h]);
      } else if (kind === 'arco') {
        R(g, '#f4f0e6', x - 2, y - 2, w + 4, h + 3); R(g, '#f4f0e6', x - 1, y - 4, w + 2, 2); R(g, '#f4f0e6', x + 2, y - 5, w - 4, 1);
        R(g, '#7ec8e3', x, y, w, h); R(g, '#7ec8e3', x + 1, y - 2, w - 2, 2); R(g, '#7ec8e3', x + 3, y - 3, w - 6, 1);
        R(g, '#c4ecf7', x + 2, y + 1, 1, 3); R(g, '#c4ecf7', x + 3, y + 1, 1, 1);
        R(g, '#f4f0e6', x + w / 2, y - 2, 1, h + 2); R(g, '#f4f0e6', x, y + 8, w, 1);
        R(g, '#d8d2c4', x - 3, y + h + 1, w + 6, 2);
        glassOut.push([x, y - 2, w, h + 2]);
      } else if (kind === 'aluminio') {
        R(g, '#aeb5bb', x - 1, y - 1, w + 2, h + 2);
        R(g, '#79b4d2', x, y, w / 2, h); R(g, '#8cc6e0', x + w / 2, y, w / 2, h);
        R(g, '#aeb5bb', x + w / 2, y, 1, h); R(g, '#d7eef8', x + 2, y + 2, 3, 1); R(g, '#d7eef8', x + w / 2 + 3, y + 5, 2, 1);
        R(g, '#8a919a', x - 2, y + h + 1, w + 4, 1);
        glassOut.push([x, y, w, h]);
      } else if (kind === 'fita') {
        R(g, '#4a525b', x - 1, y - 1, w + 2, h + 2);
        R(g, '#5f8fa8', x, y, w, h);
        for (let i = 0; i < w; i++) if ((i + Math.floor(seed * 3)) % 9 < 2) R(g, '#8fbfd4', x + i, y + 1 + (i % 4), 1, 3);
        for (let i = 7; i < w; i += 8) R(g, '#4a525b', x + i, y, 1, h);
        glassOut.push([x, y, w, h]);
      } else if (kind === 'francesa') {
        const cur = pick(['#c84b4b', '#4b7bc8', '#d9a441', '#5f9e6e'], hash(seed, 5));
        R(g, '#efe7d6', x - 2, y - 2, w + 4, h + 2);
        R(g, '#7ec8e3', x, y, w, h); R(g, cur, x, y, 3, h); R(g, cur, x + w - 3, y, 3, h);
        R(g, '#efe7d6', x + w / 2, y, 1, h);
        // sacadinha de ferro
        R(g, '#2b2b33', x - 3, y + h - 8, w + 6, 1); R(g, '#2b2b33', x - 3, y + h - 1, w + 6, 1);
        for (let i = 0; i <= w + 6; i += 2) R(g, '#2b2b33', x - 3 + i, y + h - 8, 1, 8);
        glassOut.push([x + 3, y, w - 6, h - 8]);
      }
    }

    function drawBoarded(g, st, x, y, w, h, seed, sign) {
      if (st.window === 'painel') return;
      if (st.window === 'arco') { y -= 2; h += 2; }
      const kind = hash(seed, 9);
      if (kind < 0.5) {
        // tábuas pregadas
        R(g, '#6b4a2b', x - 1, y - 1, w + 2, h + 2);
        R(g, '#b88a55', x, y, w, h);
        for (let i = 3; i < w; i += 4) R(g, '#9a6f40', x + i, y, 1, h);
        R(g, '#8a6038', x, y + 3, w, 2); R(g, '#8a6038', x, y + h - 5, w, 2);
        R(g, '#3b3b46', x + 1, y + 3, 1, 1); R(g, '#3b3b46', x + w - 2, y + 3, 1, 1);
      } else if (kind < 0.75) {
        // lona azul amarrada
        R(g, '#2a3a4a', x - 1, y - 1, w + 2, h + 2);
        R(g, '#3b6fb6', x, y, w, h);
        for (let i = 0; i < Math.min(w, h); i += 2) R(g, '#2a4f86', x + i, y + i * h / w, 2, 1);
        R(g, '#5a8fd6', x, y, w, 1); R(g, '#f4f0e6', x, y, 2, 2); R(g, '#f4f0e6', x + w - 2, y, 2, 2);
      } else {
        // vão fechado com tijolos
        R(g, '#cfc1a8', x - 1, y - 1, w + 2, h + 2);
        for (let r = 0; r * 3 < h; r++) for (let c = -1; c * 6 < w; c++) {
          const bx = x + c * 6 + (r % 2 ? 3 : 0);
          const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + 5);
          if (x1 > x0) R(g, hash(seed + r, c) > 0.5 ? '#a8472f' : '#b5523b', x0, y + r * 3, x1 - x0, Math.min(2, y + h - (y + r * 3)));
        }
      }
      if (sign && hash(seed, 10) > 0.4) {
        const sx = x + w / 2 - 11, sy = y + h / 2 - 4;
        R(g, '#3b3b46', sx + 4, sy - 3, 1, 3); R(g, '#3b3b46', sx + 18, sy - 3, 1, 3);
        R(g, '#f2c14e', sx, sy, 23, 9); R(g, '#c9952a', sx, sy + 8, 23, 1);
        drawText(g, 'ALUGA', sx + 2, sy + 2, '#2b1d14');
      }
    }

    // ---------- Portas e sacadas ----------
    function drawEntrance(g, st, x, base, owned, seed, glassOut) {
      const w = 18, h = 28, y = base - h;
      if (!owned) { drawBoarded(g, { window: 'x' }, x, y, w, h, seed, false); return; }
      const kind = st.window;
      if (kind === 'madeira' || kind === 'arco') {
        R(g, '#efe7d6', x - 2, y - 3, w + 4, h + 3);
        if (kind === 'arco') { R(g, '#efe7d6', x, y - 6, w, 3); R(g, '#7a4a2a', x + 2, y - 4, w - 4, 2); }
        R(g, '#7a4a2a', x, y, w, h); R(g, '#5e3820', x + 3, y + 3, w - 6, 9); R(g, '#5e3820', x + 3, y + 15, w - 6, 10);
        R(g, '#7a4a2a', x + 4, y + 4, w - 8, 7); R(g, '#7a4a2a', x + 4, y + 16, w - 8, 8);
        R(g, '#f2c14e', x + w - 4, y + 14, 2, 2);
        R(g, '#b8bec4', x - 4, base - 2, w + 8, 2);
        if (kind === 'madeira') { R(g, '#b5523b', x - 5, y - 6, w + 10, 3); R(g, '#8e3b26', x - 5, y - 4, w + 10, 1); }
      } else if (kind === 'fita') {
        // loja com toldo listrado
        const c = pick(['#c84b4b', '#3b6fb6', '#5f9e6e', '#d9a441'], hash(seed, 4));
        R(g, '#4a525b', x - 14, y - 2, w + 28, h + 2); R(g, '#5f8fa8', x - 13, y + 4, w + 26, h - 4);
        R(g, '#4a525b', x, y + 4, 1, h - 4); R(g, '#4a525b', x + w, y + 4, 1, h - 4);
        for (let i = 0; i < w + 32; i += 4) { R(g, c, x - 16 + i, y - 4, 2, 6); R(g, '#f4f0e6', x - 14 + i, y - 4, 2, 6); }
        R(g, shade(c, 0.7), x - 16, y + 2, w + 32, 1);
        glassOut.push([x - 13, y + 4, w + 26, h - 4]);
      } else if (kind === 'francesa') {
        R(g, '#b5523b', x - 8, y - 6, w + 16, 4); drawText(g, 'HOTEL', x + w / 2 - 9, y - 5, '#f2c14e');
        R(g, '#d9c08f', x - 2, y - 2, w + 4, h + 2); R(g, '#7ec8e3', x, y, w, h);
        R(g, '#d9c08f', x + w / 2, y, 1, h); R(g, '#c84b4b', x - 6, base - 1, w + 12, 1);
        glassOut.push([x, y, w, h]);
      } else {
        // portaria de vidro com marquise
        R(g, '#c9d1d6', x - 8, y - 4, w + 16, 3); R(g, '#8a959c', x - 8, y - 1, w + 16, 1);
        R(g, '#8a959c', x - 1, y, w + 2, h); R(g, '#7ec8e3', x, y, w, h); R(g, '#8a959c', x + w / 2, y, 1, h);
        R(g, '#c4ecf7', x + 2, y + 2, 1, 5); R(g, '#c4ecf7', x + w / 2 + 2, y + 2, 1, 5);
        if (kind === 'aluminio') { R(g, '#f4f0e6', x + w + 4, y + 4, 9, 6); drawText(g, String(100 + Math.floor(seed * 900)), x + w + 4, y + 5, '#3b3b46'); }
        glassOut.push([x, y, w, h]);
      }
    }

    function drawBalcony(g, st, x, base, seed, glassOut, deco) {
      const w = 18, h = 28, y = base - h;
      R(g, shade('#ffffff', 0.85), x - 1, y - 1, w + 2, h + 1);
      R(g, '#7ec8e3', x, y, w, h); R(g, '#c4ecf7', x + 2, y + 2, 1, 4); R(g, '#e8e4da', x + w / 2, y, 1, h);
      glassOut.push([x, y, w, h]);
      const kind = st.window;
      R(g, '#9aa0a6', x - 6, base - 2, w + 12, 2);
      if (kind === 'aluminio' || kind === 'painel') {
        R(g, 'rgba(180,225,240,0.55)', x - 6, base - 11, w + 12, 9); R(g, '#c9d1d6', x - 6, base - 11, w + 12, 1);
      } else if (kind === 'fita') {
        R(g, '#bdb6a6', x - 6, base - 10, w + 12, 8); R(g, '#a9a294', x - 6, base - 3, w + 12, 1);
      } else {
        R(g, '#2b2b33', x - 6, base - 11, w + 12, 1);
        for (let i = 0; i <= w + 12; i += 3) R(g, '#2b2b33', x - 6 + i, base - 11, 1, 9);
      }
      if (deco === 'varal') {
        R(g, '#6e747a', x - 4, y + 6, w + 8, 1);
        const cols = ['#c84b4b', '#f4f0e6', '#3b6fb6', '#f2c14e', '#5f9e6e'];
        for (let i = 0; i < 4; i++) R(g, cols[(i + Math.floor(seed * 5)) % 5], x - 2 + i * 6, y + 7, 4, 5 + (i % 2) * 2);
      } else if (hash(seed, 31) > 0.5) {
        // vaso de planta
        R(g, '#b5523b', x + w + 1, base - 6, 4, 4); R(g, '#5ca04a', x + w, base - 11, 6, 5); R(g, '#3d7333', x + w + 2, base - 9, 2, 3);
      }
    }

    // ---------- Decorações ----------
    function drawDeco(g, kind, st, x, y0, ww, seed, ctxInfo) {
      const yb = y0 + WALL_H;
      switch (kind) {
        case 'cano': {
          const cx = ctxInfo.ox + (hash(seed, 41) > 0.5 ? 2 : ww - 4);
          R(g, '#8a959c', cx, y0 - SLAB_H, 2, FLOOR_H); R(g, '#c9d1d6', cx, y0 - SLAB_H, 1, FLOOR_H);
          R(g, '#6e747a', cx - 1, y0 + 8, 4, 1); R(g, '#6e747a', cx - 1, y0 + 30, 4, 1);
          break;
        }
        case 'luminaria':
          R(g, '#3b3b46', x, y0 + 12, 1, 3); R(g, '#3b3b46', x - 1, y0 + 14, 3, 1); R(g, '#f2e6a0', x - 1, y0 + 15, 3, 3);
          ctxInfo.lamps.push([x - 1, y0 + 15, 3, 3]);
          break;
        case 'trepadeira': {
          const cx = ctxInfo.ox + (hash(seed, 42) > 0.5 ? 1 : ww - 9);
          for (let j = 0; j < 30; j++) {
            const yy = yb - 1 - Math.floor(hash(seed, 50 + j) * (WALL_H - 4));
            const xx = cx + Math.floor(hash(seed, 80 + j) * 8);
            R(g, j % 3 ? '#4f8a55' : '#6fb35f', xx, yy, 2, 1);
          }
          break;
        }
        case 'vaso':
          R(g, '#3b3b46', x - 3, y0 + 10, 7, 1); R(g, '#b5523b', x - 2, y0 + 11, 5, 4); R(g, '#5ca04a', x - 3, y0 + 15, 7, 3);
          R(g, '#e86a92', x - 2, y0 + 16, 1, 1); R(g, '#e86a92', x + 2, y0 + 17, 1, 1);
          break;
        case 'grafite': {
          const c1 = pick(['#e86a92', '#3aa39a', '#f2c14e', '#8a6bc8'], hash(seed, 43)), c2 = pick(['#f4f4f0', '#2b2b33'], hash(seed, 44));
          const gx = x - 8, gy = yb - 14;
          R(g, c1, gx, gy, 16, 7); R(g, c2, gx + 2, gy + 2, 3, 3); R(g, c2, gx + 7, gy + 1, 2, 5); R(g, c2, gx + 11, gy + 2, 3, 3);
          R(g, shade(c1, 0.7), gx, gy + 7, 16, 1);
          break;
        }
        case 'ventilacao':
          R(g, '#6e747a', x - 3, y0 + 4, 7, 5); for (let i = 0; i < 3; i++) R(g, '#3b3b46', x - 2, y0 + 5 + i * 1.5, 5, 1);
          break;
        case 'parabolica':
          R(g, '#e8e4da', x - 3, y0 + 6, 6, 6); R(g, '#c9d1d6', x - 2, y0 + 7, 4, 4); R(g, '#6e747a', x, y0 + 12, 1, 3); R(g, '#3b3b46', x + 2, y0 + 8, 2, 1);
          break;
        case 'placa':
          R(g, '#6e747a', x - 3, y0 + 4, 7, 5); R(g, '#3b3b46', x - 2, y0 + 5, 5, 1); R(g, '#3b3b46', x - 2, y0 + 7, 5, 1);
          break;
        case 'relogio':
          disc(g, x, y0 + 12, 5, '#f4f0e6'); disc(g, x, y0 + 12, 4, '#ffffff');
          R(g, '#2b2b33', x, y0 + 9, 1, 4); R(g, '#2b2b33', x, y0 + 12, 3, 1); R(g, '#5c6670', x - 6, y0 + 12, 1, 1);
          break;
        case 'bandeira': {
          const c = pick(['#c84b4b', '#3b6fb6', '#5f9e6e', '#f2c14e'], hash(seed, 45));
          const fx = ctxInfo.ox - 1;
          R(g, '#8a959c', fx - 8, y0 + 6, 9, 1); R(g, c, fx - 8, y0 + 7, 7, 5); R(g, '#f4f4f0', fx - 6, y0 + 9, 3, 1);
          break;
        }
        case 'mural': {
          const c = pick(['#e86a92', '#3aa39a', '#d9a441', '#8a6bc8', '#3b6fb6'], hash(seed, 46));
          R(g, c, x - 2, y0 + 4, 4, WALL_H - 8); R(g, shade(c, 1.2), x - 2, y0 + 4, 1, WALL_H - 8);
          break;
        }
        case 'passaro':
          if (ctxInfo.sill) { const [sx, sy] = ctxInfo.sill; R(g, '#3b3b46', sx, sy - 2, 3, 2); R(g, '#3b3b46', sx + 3, sy - 3, 1, 1); R(g, '#f2c14e', sx + 4, sy - 3, 1, 1); }
          break;
        case 'gato':
          if (ctxInfo.sill) { const [sx, sy] = ctxInfo.sill; R(g, '#2b2b33', sx + 4, sy - 5, 5, 4); R(g, '#2b2b33', sx + 4, sy - 7, 1, 2); R(g, '#2b2b33', sx + 7, sy - 7, 1, 2); R(g, '#f2c14e', sx + 5, sy - 4, 1, 1); R(g, '#f2c14e', sx + 7, sy - 4, 1, 1); R(g, '#2b2b33', sx + 9, sy - 3, 2, 1); }
          break;
      }
    }

    // ---------- Fachada completa de um pavimento (com cache) ----------
    function finishesFor(i) {
      const o = G.S.owned;
      const wins = Math.max(0, Math.min(2, o.janela - i * 2));
      const flor = Math.max(0, Math.min(wins, o.floreira - i * 2));
      return { wins, flor, door: o.porta > i ? 1 : 0, ac: o.ar > i ? 1 : 0 };
    }

    function facade(i) {
      const f = finishesFor(i);
      const key = `${i}|${f.wins}|${f.flor}|${f.door}|${f.ac}`;
      let c = facadeCache.get(key);
      if (c) return c;
      // limpa versões antigas deste andar
      for (const k of facadeCache.keys()) if (k.startsWith(i + '|')) facadeCache.delete(k);
      c = buildFacade(i, f);
      facadeCache.set(key, c);
      return c;
    }

    function buildFacade(i, f) {
      const { style: st, ww, p } = geo;
      const cv = document.createElement('canvas');
      cv.width = ww + PAD * 2; cv.height = FLOOR_H;
      const g = cv.getContext('2d');
      const ox = PAD, y0 = SLAB_H;
      const seed = i * 131 + p.id.length * 17 + (p.record ? 5 : 0);
      const glass = [], lamps = [];
      const isGlass = st.window === 'painel';
      const wst = st.alt ? Object.assign({}, st, { window: pick(st.alt, hash(seed, 21)) }) : st;
      const group = Math.floor(i / 5);
      const trim = st.trims ? pick(st.trims, hash(group * 97 + p.id.length, 3)) : st.trim;

      // parede
      if (st.walls) {
        // cor diferente do andar de baixo
        const n = st.walls.length;
        let idx = Math.floor(hash(seed, 1) * n);
        const prev = Math.floor(hash((i - 1) * 131 + p.id.length * 17 + (p.record ? 5 : 0), 1) * n);
        if (idx === prev) idx = (idx + 1 + Math.floor(hash(seed, 2) * (n - 1))) % n;
        plaster(g, ox, y0, ww, WALL_H, st.walls[idx], seed);
        if (p.style === 'residencial') { R(g, shade(st.walls[idx], 0.8), ox, y0, 4, WALL_H); R(g, shade(st.walls[idx], 0.8), ox + ww - 4, y0, 4, WALL_H); }
        if (p.style === 'hotel') { R(g, trim, ox, y0 + WALL_H - 3, ww, 2); R(g, shade(trim, 1.2), ox, y0 + 2, ww, 1); }
        if (st.bands && hash(seed, 23) > 0.35) { const bc = pick(st.bands, hash(group, 24)); R(g, bc, ox, y0 + WALL_H - 6, ww, 3); R(g, shade(bc, 0.75), ox, y0 + WALL_H - 3, ww, 1); }
        if (p.style === 'casa' && i === 0) { for (let x = 0; x < ww; x += 6) R(g, x % 12 ? '#9a8f80' : '#b3a898', ox + x, y0 + WALL_H - 6, 5, 5); }
      } else if (st.bricks) {
        const pal = st.bricks[Math.floor(hash(seed, 1) * st.bricks.length)];
        brickWall(g, ox, y0, ww, [pal, [shade(pal[0], 0.92), shade(pal[1], 0.92), pal[2]], [shade(pal[0], 1.06), pal[1], pal[2]]], seed);
      } else if (isGlass) {
        const tint = pick(st.glass, hash(seed, 1));
        R(g, tint, ox, y0, ww, WALL_H);
        // reflexo do céu em diagonal
        const off = Math.floor(hash(seed, 3) * 60);
        for (let x = 0; x < ww; x++) for (let y = 0; y < WALL_H; y++) {
          const d = (x + y + off) % 70;
          if (d < 6) R(g, shade(tint, 1.25), ox + x, y0 + y);
          else if (d < 9) R(g, shade(tint, 1.12), ox + x, y0 + y);
        }
        // painéis: janelas compradas ficam claras; o resto é painel opaco
        const panels = Math.floor(ww / 16);
        const lit = f.wins === 2 ? panels : f.wins === 1 ? Math.ceil(panels / 2) : 0;
        for (let k = 0; k < panels; k++) {
          const px = ox + k * 16;
          if (k >= lit) R(g, shade(tint, 0.62), px + 1, y0 + 2, 15, WALL_H - 10);
          else glass.push([px + 1, y0 + 2, 15, WALL_H - 10]);
          R(g, st.trim, px, y0, 1, WALL_H);
        }
        R(g, st.trim, ox + ww - 1, y0, 1, WALL_H);
        R(g, shade(tint, 0.5), ox, y0 + WALL_H - 8, ww, 8);
        R(g, st.trim, ox, y0 + WALL_H - 8, ww, 1);
        if (p.style === 'torre') { for (let x = 4; x < ww; x += 16) R(g, '#d4b25a', ox + x + 6, y0, 2, WALL_H); }
        // andar técnico a cada 8 pavimentos
        if (i % 8 === 7) { R(g, '#3b3f48', ox, y0 + 4, ww, WALL_H - 12); for (let y = 6; y < WALL_H - 8; y += 3) R(g, '#5c6670', ox, y0 + y, ww, 1); glass.length = 0; }
      }

      // jardim suspenso na torre a cada 10 andares
      if (p.style === 'torre' && i % 10 === 9) {
        R(g, '#26323a', ox, y0, ww, WALL_H);
        for (let k = 0; k < 6; k++) {
          const tx = ox + 6 + k * (ww - 12) / 5;
          R(g, '#6e4220', tx, y0 + WALL_H - 14, 2, 12); disc(g, tx + 1, y0 + WALL_H - 18, 6, k % 2 ? '#4f8a55' : '#5ca04a'); disc(g, tx - 1, y0 + WALL_H - 20, 3, '#7cc35e');
        }
        R(g, 'rgba(180,225,240,0.35)', ox, y0, ww, WALL_H); R(g, '#d4b25a', ox, y0 + WALL_H - 2, ww, 2);
      }

      // laje e cornija
      R(g, shade(st.slab, 0.75), ox - 3, 0, ww + 6, SLAB_H);
      R(g, st.slab, ox - 3, 0, ww + 6, SLAB_H - 1);
      R(g, shade(st.slab, 1.15), ox - 3, 0, ww + 6, 1);
      if ((i + 1) % 5 === 0) {
        R(g, trim, ox - 4, 0, ww + 8, SLAB_H);
        R(g, shade(trim, 0.7), ox - 4, SLAB_H - 1, ww + 8, 1);
        const label = String(i + 1);
        R(g, shade(trim, 0.55), ox + ww / 2 - textWidth(label) / 2 - 2, y0 + 1, textWidth(label) + 4, 7);
        drawText(g, label, ox + ww / 2 - textWidth(label) / 2, y0 + 2, '#f4f0e6');
      }

      // janelas, sacada e entrada
      const info = { ox, lamps, wins: f.wins, sill: null };
      if (!isGlass && !(p.style === 'torre' && i % 10 === 9)) {
        const { w, h } = windowRect(wst.window, ww);
        const wy = y0 + Math.round((WALL_H - h) / 2) - (wst.window === 'francesa' ? 0 : 2) + (wst.window === 'arco' ? 3 : 0);
        const centers = [Math.round(ww * 0.2), Math.round(ww * 0.8)];
        if (wst.window === 'fita') { centers[0] = Math.round(ww * 0.23); centers[1] = Math.round(ww * 0.77); }
        const awning = st.awnings && hash(seed, 22) > 0.55 ? pick(['#c84b4b', '#3b6fb6', '#5f9e6e', '#d9a441', '#8a6bc8', '#3aa39a'], hash(seed, 25)) : null;
        const signOk = p.style === 'residencial' || p.style === 'comercial';
        centers.forEach((cx, k) => {
          const wx = ox + cx - Math.round(w / 2);
          if (k < f.wins) {
            drawWindow(g, wst, wx, wy, w, h, seed + k, glass);
            if (awning) {
              const ay = wy - (wst.window === 'arco' ? 9 : 6), aw = w + (wst.window === 'madeira' ? 6 : 4);
              for (let j = 0; j < aw; j += 2) R(g, (j / 2) % 2 ? '#f4f0e6' : awning, wx - (aw - w) / 2 + j, ay, 2, 4);
              R(g, shade(awning, 0.7), wx - (aw - w) / 2, ay + 4, aw, 1);
            }
            if (!info.sill) info.sill = [wx + 1, wy + h + 1];
            if (k < f.flor) {
              R(g, '#7a4a2a', wx - 1, wy + h + 2, w + 2, 4); R(g, '#5e3820', wx - 1, wy + h + 5, w + 2, 1);
              R(g, '#5ca04a', wx, wy + h, w, 2);
              for (let j = 0; j < w; j += 3) R(g, pick(['#e86a92', '#f2c14e', '#8a6bc8', '#f4f4f0', '#ef7d2d'], hash(seed + k, j)), wx + j + 1, wy + h - 1 + (j % 2), 2, 2);
            }
          } else {
            drawBoarded(g, wst, wx, wy, w, h, seed + k * 13, signOk && k === 1);
          }
        });
        if (f.ac) {
          const ax = ox + centers[1] + Math.round(w / 2) + (wst.window === 'madeira' ? 8 : 3), ay = wy + h - 8;
          if (ax + 10 < ox + ww + PAD) { R(g, '#f4f4f0', ax, ay, 10, 7); R(g, '#c9d1d6', ax, ay + 6, 10, 1); for (let y = 1; y < 6; y += 2) R(g, '#9aa0a6', ax + 1, ay + y, 6, 1); R(g, '#6e747a', ax + 2, ay + 7, 1, 2); }
        }
      } else if (f.ac) {
        R(g, '#c9d1d6', ox + ww - 12, y0 + WALL_H - 7, 9, 5); R(g, '#8a959c', ox + ww - 11, y0 + WALL_H - 6, 7, 1);
      }

      const doorX = ox + Math.round(ww / 2) - 9;
      const base = y0 + WALL_H;
      const decoPool = st.decos;
      const decoA = pick(decoPool, hash(seed, 11)), decoB = pick(decoPool, hash(seed, 12));
      if (i === 0) {
        drawEntrance(g, st, doorX, base, f.door, seed, glass);
      } else if (f.door && !isGlass) {
        drawBalcony(g, st, doorX, base, seed, glass, decoA === 'varal' || decoB === 'varal' ? 'varal' : '');
      } else if (f.door && isGlass) {
        R(g, 'rgba(200,235,245,0.5)', ox + 4, base - 10, ww - 8, 8); R(g, '#c9d1d6', ox + 4, base - 10, ww - 8, 1); R(g, '#8a959c', ox + 2, base - 2, ww - 4, 2);
      }

      // decorações (sorteadas por andar)
      const free = [ox + Math.round(ww * 0.36), ox + Math.round(ww * 0.64)];
      if (!isGlass) {
        [decoA, decoB].forEach((d, k) => {
          if (d === 'varal' || (k === 1 && d === decoA)) return;
          if (i === 0 && (d === 'placa' || d === 'gato')) return;
          drawDeco(g, d, st, free[k], y0, ww, seed + k, info);
        });
      } else if (hash(seed, 13) > 0.6 && i % 8 !== 7) {
        // brises verticais em alguns andares de vidro
        for (let x = 6; x < ww; x += 6) R(g, 'rgba(230,236,240,0.55)', ox + x, y0 + 2, 2, WALL_H - 10);
      }

      return { cv, glass, lamps };
    }

    // -------------------------------------------------------------
    // Telhados e topo de cada obra
    // -------------------------------------------------------------
    function drawRoof(base) {
      const { style, ww, bx, p } = geo;
      const g = ctx;
      const top = base - FLOOR_H; // topo da última laje (já desenhada)
      const y = Math.round(top);
      switch (p.style) {
        case 'casa': {
          const h = 34;
          for (let r = 0; r < h; r++) {
            const inset = Math.round(r * (ww / 2 + 10) / h);
            const c = r % 4 === 0 ? '#8e3b26' : r % 2 ? '#b5523b' : '#c0603f';
            R(g, c, bx - 10 + inset, y - r, ww + 20 - inset * 2, 1);
          }
          for (let r = 0; r < h; r += 4) for (let x = 0; x < ww + 20; x += 6) R(g, '#a34732', bx - 10 + x + (r % 8 ? 3 : 0), y - r, 1, 3);
          R(g, '#8e3b26', bx - 12, y, ww + 24, 2);
          // chaminé
          const cx = bx + ww - 30;
          R(g, '#9c8f80', cx, y - 34, 8, 20); R(g, '#7a6f62', cx - 1, y - 36, 10, 3);
          if (Math.random() < 0.08) smoke.push({ x: cx + 4, y: y - 38, vx: 4 + Math.random() * 4, vy: -8 - Math.random() * 4, life: 3, r: 2 });
          break;
        }
        case 'sobrado': {
          const h = 26;
          for (let r = 0; r < h; r++) {
            const inset = Math.round(r * 1.4);
            R(g, r % 3 ? '#56606b' : '#48515b', bx - 8 + inset, y - r, ww + 16 - inset * 2, 1);
          }
          // painéis solares
          for (let k = 0; k < 3; k++) {
            const px = bx + 18 + k * 30;
            R(g, '#1f3b73', px, y - 18, 24, 12); R(g, '#c9d1d6', px, y - 18, 24, 1);
            for (let x = 4; x < 24; x += 6) R(g, '#3b6fb6', px + x, y - 17, 1, 11);
            R(g, '#7ec8e3', px + 2, y - 16, 2, 1);
          }
          R(g, '#f4f0e6', bx - 9, y, ww + 18, 2);
          break;
        }
        case 'residencial': {
          R(g, '#b8bec4', bx - 2, y - 6, ww + 4, 6); R(g, '#8a919a', bx - 2, y - 1, ww + 4, 1);
          R(g, '#d8d2c4', bx + 20, y - 26, 34, 20); R(g, '#b8b1a2', bx + 20, y - 8, 34, 2);
          drawText(g, 'AGUA', bx + 29, y - 20, '#3b6fb6');
          R(g, '#6e747a', bx + ww - 24, y - 40, 1, 34); R(g, '#6e747a', bx + ww - 30, y - 34, 13, 1); R(g, '#6e747a', bx + ww - 28, y - 28, 9, 1);
          R(g, '#c9d1d6', bx + ww - 50, y - 12, 12, 6);
          lights.push([bx + ww - 25, y - 42, 2, 2, '#ff4d3d', 'blink']);
          break;
        }
        case 'comercial': {
          R(g, '#8a919a', bx - 2, y - 6, ww + 4, 6);
          const label = 'TIJOLO S.A.';
          const tw = textWidth(label) * 2;
          const sx = bx + ww / 2 - tw / 2 - 4;
          R(g, '#5c6670', sx + 6, y - 14, 2, 8); R(g, '#5c6670', sx + tw - 2, y - 14, 2, 8);
          R(g, '#1d2430', sx, y - 34, tw + 8, 20);
          const tmp = document.createElement('canvas'); tmp.width = textWidth(label); tmp.height = 5;
          drawText(tmp.getContext('2d'), label, 0, 0, '#f2c14e');
          g.drawImage(tmp, sx + 4, y - 29, tw, 10);
          lights.push([sx + 4, y - 29, tw, 10, '#ffd36b', 'sign', tmp]);
          R(g, '#c9d1d6', bx + 8, y - 14, 14, 8); R(g, '#c9d1d6', bx + ww - 22, y - 12, 12, 6);
          break;
        }
        case 'hotel': {
          R(g, '#b5523b', bx - 3, y - 6, ww + 6, 6); R(g, '#8e3b26', bx - 3, y - 1, ww + 6, 1);
          const tmp = document.createElement('canvas'); tmp.width = textWidth('HOTEL'); tmp.height = 5;
          drawText(tmp.getContext('2d'), 'HOTEL', 0, 0, '#ff6b55');
          const tw = tmp.width * 3, sx = bx + ww / 2 - tw / 2;
          R(g, '#3b3b46', sx - 2, y - 8, tw + 4, 2); R(g, '#3b3b46', sx + 4, y - 26, 1, 18); R(g, '#3b3b46', sx + tw - 5, y - 26, 1, 18);
          g.drawImage(tmp, sx, y - 26, tw, 15);
          lights.push([sx, y - 26, tw, 15, '#ff6b55', 'sign', tmp]);
          R(g, '#8a959c', bx + 10, y - 40, 1, 34);
          R(g, Math.sin(clock * 3) > 0 ? '#3b6fb6' : '#4a7fc6', bx + 11, y - 40, 10, 6);
          break;
        }
        case 'vidro': {
          R(g, '#8a959c', bx + 8, y - 12, ww - 16, 12); R(g, '#5b8fb9', bx + 10, y - 11, ww - 20, 9);
          R(g, '#8a959c', bx + 28, y - 24, ww - 56, 12); R(g, '#6a9cc0', bx + 30, y - 23, ww - 60, 9);
          R(g, '#c9d1d6', bx + ww / 2 - 1, y - 64, 2, 40); R(g, '#c9d1d6', bx + ww / 2 - 3, y - 30, 6, 6);
          lights.push([bx + ww / 2 - 1, y - 66, 3, 3, '#ff3b30', 'blink']);
          break;
        }
        case 'torre': {
          for (let k = 0; k < 4; k++) R(g, k % 2 ? '#d4b25a' : '#4d7f9e', bx + 6 + k * 10, y - 10 - k * 10, ww - 12 - k * 20, 10);
          R(g, '#d4b25a', bx + ww / 2 - 1, y - 96, 3, 56); R(g, '#f2d98a', bx + ww / 2 - 1, y - 96, 1, 56);
          R(g, '#d4b25a', bx + ww / 2 - 4, y - 60, 9, 2);
          lights.push([bx + ww / 2 - 1, y - 99, 3, 3, '#ff3b30', 'blink']);
          if (p.record) drawText(g, 'RECORDE', bx + ww / 2 - 13, y - 52, '#f2d98a');
          break;
        }
      }
    }

    // -------------------------------------------------------------
    // Cenário
    // -------------------------------------------------------------
    const SKY = [
      [0.00, '#5fa8e0', '#bde4f6'], [0.42, '#5fa8e0', '#bde4f6'], [0.52, '#4a4e8f', '#f2a65a'],
      [0.62, '#0e1330', '#2a2f5c'], [0.86, '#0e1330', '#2a2f5c'], [0.95, '#6a6fb0', '#f6c6a0'], [1.00, '#5fa8e0', '#bde4f6'],
    ].map(([p, a, b]) => [p, hex(a), hex(b)]);

    function skyAt(p) {
      for (let i = 0; i < SKY.length - 1; i++) {
        const a = SKY[i], b = SKY[i + 1];
        if (p >= a[0] && p <= b[0]) { const t = (p - a[0]) / ((b[0] - a[0]) || 1); return [mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
      }
      return [SKY[0][1], SKY[0][2]];
    }
    function nightness(p) {
      if (p < 0.52) return 0; if (p < 0.62) return (p - 0.52) / 0.1; if (p < 0.86) return 1; if (p < 0.95) return 1 - (p - 0.86) / 0.09; return 0;
    }

    const stars = Array.from({ length: 80 }, (_, i) => ({ x: Math.floor(hash(i, 1) * W), y: Math.floor(hash(i, 2) * 420), tw: hash(i, 3), big: hash(i, 4) > 0.9 }));
    const cloudsFar = Array.from({ length: 6 }, (_, i) => ({ x: hash(i, 5) * (W + 80) - 40, y: hash(i, 6) * 420, w: 22 + hash(i, 7) * 26, sp: 1.5 + hash(i, 8) * 2 }));
    const cloudsNear = Array.from({ length: 5 }, (_, i) => ({ x: hash(i, 15) * (W + 80) - 40, y: hash(i, 16) * 420, w: 34 + hash(i, 17) * 36, sp: 4 + hash(i, 18) * 4 }));
    const cityFar = [], cityNear = [];
    for (let x = -6, i = 0; x < W + 6; i++) { const w = 12 + Math.floor(hash(i, 20) * 18); cityFar.push({ x, w, h: 30 + Math.floor(hash(i, 21) * 70), s: i, top: Math.floor(hash(i, 22) * 4) }); x += w + 1 + Math.floor(hash(i, 23) * 3); }
    for (let x = -10, i = 0; x < W + 10; i++) { const w = 16 + Math.floor(hash(i, 30) * 22); cityNear.push({ x, w, h: 18 + Math.floor(hash(i, 31) * 46), s: i + 100, top: Math.floor(hash(i, 32) * 4) }); x += w + 2 + Math.floor(hash(i, 33) * 6); }

    function cloud(g, x, y, w, col, sh) {
      const h = Math.round(w * 0.3);
      R(g, sh, x + 2, y + h - 2, w - 4, 3);
      R(g, col, x, y + h / 2, w, h / 2);
      disc(g, x + w * 0.3, y + h / 2, Math.round(h * 0.5), col);
      disc(g, x + w * 0.6, y + h * 0.35, Math.round(h * 0.65), col);
      disc(g, x + w * 0.82, y + h * 0.6, Math.round(h * 0.4), col);
      R(g, sh, x + 1, y + h, w - 2, 1);
    }

    function drawSky(p, night) {
      const [top, bot] = skyAt(p);
      // mais alto = céu mais escuro em cima
      const alt = Math.min(1, camY / 3500);
      const topC = mix(top, [10, 24, 70], alt * 0.5 * (1 - night));
      const bands = 24;
      for (let i = 0; i < bands; i++) {
        R(ctx, rgb(mix(topC, bot, i / (bands - 1))), 0, Math.floor(i * H / bands), W, Math.ceil(H / bands) + 1);
      }
      if (night > 0.05) {
        for (const s of stars) {
          const y = ((s.y + camY * 0.03) % 420 + 420) % 420 - 20;
          if (Math.sin(clock * 2 + s.tw * 20) < -0.7) continue;
          ctx.globalAlpha = night * (0.5 + s.tw * 0.5);
          R(ctx, '#fff6d5', s.x, Math.floor(y), 1, 1);
          if (s.big) { R(ctx, '#fff6d5', s.x - 1, Math.floor(y), 3, 1); R(ctx, '#fff6d5', s.x, Math.floor(y) - 1, 1, 3); }
        }
        ctx.globalAlpha = 1;
      }
      if (p < 0.56) {
        const q = p / 0.56, x = 20 + q * 280, y = 96 - Math.sin(Math.PI * q) * 70;
        ctx.globalAlpha = 0.25; disc(ctx, x, y, 14, '#fff3b0'); ctx.globalAlpha = 1;
        disc(ctx, x, y, 9, '#ffd24a'); disc(ctx, x, y, 7, '#fff0a6');
      } else {
        const q = (p - 0.56) / 0.44, x = 20 + q * 280, y = 96 - Math.sin(Math.PI * q) * 70;
        disc(ctx, x, y, 7, '#e8e6d8'); R(ctx, '#c4c1b0', x - 3, y - 2, 3, 3); R(ctx, '#c4c1b0', x + 2, y + 2, 2, 2); R(ctx, '#c4c1b0', x - 1, y + 4, 1, 1);
      }
      const cc = night > 0.5 ? '#4b5079' : '#ffffff', cs = night > 0.5 ? '#3a3e63' : '#dbe9f2';
      for (const c of cloudsFar) {
        const y = Math.floor(((c.y + camY * 0.12) % 420 + 420) % 420 - 30);
        ctx.globalAlpha = 0.8; cloud(ctx, Math.floor(c.x), y, Math.floor(c.w), cc, cs); ctx.globalAlpha = 1;
      }
    }

    function drawBlimp() {
      if (!G.S.owned.consorcio) return;
      const x = ((clock * 6) % (W + 120)) - 60, y = 54 + Math.sin(clock * 0.5) * 3;
      R(ctx, '#c9d1d6', x, y, 44, 12); R(ctx, '#c9d1d6', x + 3, y - 2, 38, 16); R(ctx, '#e8edf0', x + 6, y - 2, 30, 3);
      R(ctx, '#8a959c', x + 3, y + 12, 38, 2); R(ctx, '#8a959c', x - 4, y + 2, 6, 2); R(ctx, '#8a959c', x - 6, y - 1, 3, 9);
      R(ctx, '#b5523b', x + 12, y + 1, 20, 9); drawText(ctx, 'TC', x + 18, y + 3, '#f4f0e6');
      R(ctx, '#3b3b46', x + 16, y + 14, 12, 4); R(ctx, '#7ec8e3', x + 18, y + 15, 2, 2); R(ctx, '#7ec8e3', x + 22, y + 15, 2, 2);
      lights.push([x + 43, y + 5, 2, 2, '#ff3b30', 'blink']);
    }

    function drawPlaneAndBirds(dt) {
      nextPlane -= dt; nextBirds -= dt;
      if (!plane && nextPlane <= 0) { plane = { x: W + 20, y: 20 + Math.random() * 50 }; nextPlane = 70 + Math.random() * 80; }
      if (plane) {
        plane.x -= 34 * dt;
        const x = Math.round(plane.x), y = Math.round(plane.y);
        ctx.globalAlpha = 0.5; R(ctx, '#ffffff', x + 14, y + 2, 40, 1); ctx.globalAlpha = 1;
        R(ctx, '#e8edf0', x, y, 14, 3); R(ctx, '#c9d1d6', x + 10, y - 3, 3, 3); R(ctx, '#c9d1d6', x + 4, y + 2, 5, 2); R(ctx, '#3b6fb6', x + 2, y + 1, 8, 1);
        lights.push([x, y + 1, 1, 1, '#ff3b30', 'blink']);
        if (plane.x < -70) plane = null;
      }
      if (!birds && nextBirds <= 0) { birds = { x: -20, y: 70 + Math.random() * 120, n: 3 + Math.floor(Math.random() * 4) }; nextBirds = 30 + Math.random() * 40; }
      if (birds) {
        birds.x += 26 * dt;
        for (let k = 0; k < birds.n; k++) {
          const bx = Math.round(birds.x - k * 9 - (k % 2) * 3), by = Math.round(birds.y + (k % 2) * 5 + Math.sin(clock * 3 + k) * 2);
          const up = Math.floor(clock * 8 + k) % 2;
          R(ctx, '#2b2b33', bx, by, 1, 1); R(ctx, '#2b2b33', bx - 2, by - up, 2, 1); R(ctx, '#2b2b33', bx + 1, by - up, 2, 1);
        }
        if (birds.x > W + 60) birds = null;
      }
    }

    function drawCity(night) {
      const far = GROUND_Y + camY * 0.35;
      if (far - 110 < H) {
        // montanhas e cidade distante: desenhadas num canvas guardado, refeito só quando a luz muda
        const key = String(Math.round(night * 10));
        if (key !== farKey) {
          farKey = key;
          const nl = Math.round(night * 10) / 10;
          if (!farCache) { farCache = document.createElement('canvas'); farCache.width = W; farCache.height = 260; }
          const g = farCache.getContext('2d');
          g.clearRect(0, 0, W, 260);
          const base = 170;
          const mBody = rgb(mix([138, 168, 196], [24, 30, 60], nl));
          for (let x = 0; x < W; x++) {
            const h = 40 + 18 * Math.sin(x * 0.021 + 2) + 9 * Math.sin(x * 0.067);
            R(g, mBody, x, Math.floor(base - h - 20), 1, Math.ceil(h) + 120);
          }
          const body = rgb(mix([150, 180, 205], [30, 36, 70], nl));
          const edge = rgb(mix([132, 164, 190], [24, 29, 58], nl));
          for (const b of cityFar) {
            const y = Math.floor(base - b.h);
            R(g, body, b.x, y, b.w, b.h + 100); R(g, edge, b.x, y, b.w, 1);
            if (b.top === 1) R(g, edge, b.x + b.w / 2, y - 6, 1, 6);
            if (nl > 0.3) {
              g.globalAlpha = nl;
              for (let wy = 3; wy < b.h; wy += 5) for (let wx = 2; wx < b.w - 1; wx += 3) if (hash(b.s * 37 + wx, wy) > 0.7) R(g, '#ffd36b', b.x + wx, y + wy, 1, 2);
              g.globalAlpha = 1;
            }
          }
        }
        ctx.drawImage(farCache, 0, Math.floor(far) - 170);
      }
      const near = GROUND_Y + camY * 0.6;
      if (near - 80 < H) {
        const body = rgb(mix([112, 140, 166], [22, 26, 52], night));
        const win = rgb(mix([150, 178, 200], [40, 46, 80], night));
        for (const b of cityNear) {
          const y = Math.floor(near - b.h);
          R(ctx, body, b.x, y, b.w, b.h + 80);
          for (let wy = 4; wy < b.h; wy += 6) for (let wx = 3; wx < b.w - 2; wx += 4) {
            const lit = night > 0.3 && hash(b.s * 31 + wx, wy) > 0.55;
            R(ctx, lit ? '#ffd36b' : win, b.x + wx, y + wy, 2, 3);
          }
          if (b.top === 2) { R(ctx, body, b.x + 3, y - 8, 10, 8); R(ctx, win, b.x + 4, y - 7, 8, 1); }
          if (b.top === 3) { R(ctx, body, b.x + b.w - 4, y - 12, 1, 12); lights.push([b.x + b.w - 5, y - 13, 2, 2, '#ff3b30', 'blink']); }
        }
        if (G.S.owned.fabrica) {
          const fx = 4, fy = Math.floor(near);
          R(ctx, rgb(mix([120, 120, 128], [36, 36, 52], night)), fx, fy - 30, 70, 40);
          for (let k = 0; k < 5; k++) { R(ctx, rgb(mix([150, 150, 158], [46, 46, 64], night)), fx + k * 14, fy - 36, 14, 6); R(ctx, '#7ec8e3', fx + k * 14 + 9, fy - 35, 4, 5); }
          R(ctx, '#b5523b', fx + 56, fy - 62, 8, 32); R(ctx, '#f4f0e6', fx + 56, fy - 56, 8, 2);
          if (Math.random() < 0.15) smoke.push({ x: fx + 60, y: fy - 64, vx: 6 + Math.random() * 4, vy: -10 - Math.random() * 6, life: 4, r: 3 });
          drawText(ctx, 'PRE-MOLDADOS', fx + 6, fy - 22, '#f2c14e');
        }
      }
      // faixa de nuvens: o prédio atravessa um "mar de nuvens" por volta do 28º andar
      const cy = GROUND_Y - 28 * FLOOR_H + camY;
      if (cy > -40 && cy < H + 40) {
        const cc = night > 0.5 ? '#454a72' : '#f4f8fb', cs = night > 0.5 ? '#373b5f' : '#d8e6ef';
        for (let k = -1; k < 9; k++) cloud(ctx, k * 40 - 10 + Math.sin(clock * 0.2 + k) * 4, cy - 10 + (k % 3) * 6, 56, cc, cs);
        R(ctx, cc, 0, cy + 10, W, 16);
      }
    }

    function tree(x, y, night, s) {
      const trunk = rgb(mix([110, 74, 42], [44, 30, 22], night));
      const l1 = rgb(mix([79, 138, 85], [26, 52, 40], night)), l2 = rgb(mix([108, 172, 96], [36, 70, 48], night));
      R(ctx, trunk, x - 1, y - 14, 3, 14);
      disc(ctx, x, y - 20, 8 + s, l1); disc(ctx, x - 4, y - 18, 5, l1); disc(ctx, x + 5, y - 17, 5, l1);
      disc(ctx, x - 2, y - 23, 4, l2); disc(ctx, x + 3, y - 21, 2, l2);
    }

    function drawStreet(night, dt) {
      const gy = GROUND_Y + camY;
      if (gy - 50 > H) return;
      // árvores atrás da calçada
      [10, 46, W - 46, W - 10].forEach((x, k) => { if (x < geo.bx - 10 || x > geo.bx + geo.ww + 30) tree(x, gy, night, k % 2); });
      // calçada
      R(ctx, rgb(mix([196, 190, 178], [70, 66, 62], night)), 0, gy, W, 6);
      for (let x = (Math.floor(camY) % 1); x < W; x += 10) R(ctx, rgb(mix([170, 164, 152], [58, 54, 50], night)), x, gy, 1, 6);
      R(ctx, rgb(mix([150, 146, 140], [50, 48, 46], night)), 0, gy + 6, W, 2);
      // rua
      R(ctx, rgb(mix([58, 61, 68], [26, 27, 32], night)), 0, gy + 8, W, 28);
      for (let x = 0; x < W; x += 20) R(ctx, rgb(mix([230, 210, 120], [90, 82, 50], night)), x + 4, gy + 21, 10, 2);
      R(ctx, rgb(mix([150, 146, 140], [50, 48, 46], night)), 0, gy + 36, W, 2);
      R(ctx, rgb(mix([92, 160, 74], [30, 58, 34], night)), 0, gy + 38, W, H);
      for (let x = 0; x < W; x += 3) if (hash(x, 9) > 0.6) R(ctx, rgb(mix([124, 195, 94], [40, 76, 46], night)), x, gy + 38, 1, 2);

      // postes
      [24, W - 24].forEach(x => {
        R(ctx, '#3b3b46', x, gy - 34, 2, 34); R(ctx, '#3b3b46', x - 6, gy - 34, 8, 2); R(ctx, '#f2e6a0', x - 7, gy - 32, 4, 2);
        lights.push([x - 7, gy - 32, 4, 2, '#ffe9a0', 'lamp']);
      });

      // carros
      nextCar -= dt;
      if (nextCar <= 0) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        cars.push({ x: dir > 0 ? -30 : W + 30, dir, sp: 40 + Math.random() * 30, c: pick(['#c84b4b', '#3b6fb6', '#f2c14e', '#f4f4f0', '#5f9e6e', '#2b2b33', '#e86a92'], Math.random()), van: Math.random() < 0.25 });
        nextCar = 3 + Math.random() * 6;
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        c.x += c.dir * c.sp * dt;
        if (c.x < -60 || c.x > W + 60) { cars.splice(i, 1); continue; }
        const y = gy + (c.dir > 0 ? 25 : 12), x = Math.round(c.x);
        const len = c.van ? 24 : 20;
        R(ctx, c.c, x, y, len, 5); R(ctx, c.c, x + 4, y - 4, c.van ? 18 : 11, 4);
        R(ctx, '#7ec8e3', x + 5, y - 3, 4, 3); R(ctx, '#7ec8e3', x + 10, y - 3, c.van ? 10 : 4, 3);
        R(ctx, '#1d1d1d', x + 3, y + 4, 4, 3); R(ctx, '#1d1d1d', x + len - 7, y + 4, 4, 3);
        const fx = c.dir > 0 ? x + len - 1 : x;
        R(ctx, '#ffe9a0', fx, y + 1, 1, 2);
        lights.push([c.dir > 0 ? fx + 1 : fx - 8, y + 1, 8, 2, '#fff2b0', 'lamp']);
      }

      // placa da obra
      const sx = 4;
      if (geo.bx > 60) {
        R(ctx, '#6e4220', sx + 4, gy - 16, 2, 16); R(ctx, '#6e4220', sx + 30, gy - 16, 2, 16);
        R(ctx, '#2f6b45', sx, gy - 38, 36, 24); R(ctx, '#f4f0e6', sx + 1, gy - 37, 34, 1);
        drawText(ctx, 'OBRA', sx + 10, gy - 34, '#f4f0e6');
        R(ctx, '#f4f0e6', sx + 4, gy - 27, 28, 1); R(ctx, '#f4f0e6', sx + 4, gy - 24, 20, 1); R(ctx, '#f4f0e6', sx + 4, gy - 21, 24, 1); R(ctx, '#f2c14e', sx + 4, gy - 18, 12, 2);
      }
      // pilha de tijolos e sacos de cimento
      const px = geo.bx - 24;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4 - r; c++) {
        const x = px + c * 5 + r * 2.5, y = gy - (r + 1) * 3;
        R(ctx, '#7d3423', x, y, 5, 3); R(ctx, '#b5523b', x, y, 4, 2); R(ctx, '#d07355', x, y, 4, 1);
      }
      const cx = geo.bx + geo.ww + 30;
      for (let i = 0; i < 3; i++) {
        const x = cx + (i % 2) * 9 + (i === 2 ? 4 : 0), y = gy - (i === 2 ? 11 : 6);
        R(ctx, '#a8a294', x, y, 10, 6); R(ctx, '#d8d2c4', x, y, 10, 5); R(ctx, '#3b6fb6', x + 3, y + 2, 4, 1);
      }

      // máquinas no chão
      const o = G.S.owned;
      if (o.betoneira) {
        const bx = geo.bx - 50, by = gy;
        R(ctx, '#3b3b46', bx + 2, by - 4, 3, 4); R(ctx, '#3b3b46', bx + 14, by - 4, 3, 4);
        R(ctx, '#ef7d2d', bx, by - 16, 18, 12); R(ctx, '#ef7d2d', bx + 2, by - 18, 14, 16); R(ctx, '#b85a1c', bx, by - 6, 18, 2);
        const rot = Math.floor(clock * 6) % 4;
        for (let k = 0; k < 3; k++) R(ctx, '#f2c14e', bx + 2 + ((k * 5 + rot * 1.5) % 14), by - 17, 2, 14);
        R(ctx, '#3b3b46', bx + 16, by - 14, 4, 4);
      }
      if (o.caminhao) {
        const tx = W - 76, ty = gy + 25;
        R(ctx, '#c84b4b', tx + 40, ty - 12, 16, 12); R(ctx, '#7ec8e3', tx + 47, ty - 10, 7, 5); R(ctx, '#8e3b26', tx + 40, ty - 1, 16, 1);
        R(ctx, '#6e747a', tx, ty - 3, 40, 3);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { R(ctx, '#7d3423', tx + 2 + c * 6 + (r % 2) * 2, ty - 6 - r * 3, 5, 3); R(ctx, '#b5523b', tx + 2 + c * 6 + (r % 2) * 2, ty - 6 - r * 3, 4, 2); }
        R(ctx, '#1d1d1d', tx + 5, ty, 6, 5); R(ctx, '#1d1d1d', tx + 28, ty, 6, 5); R(ctx, '#1d1d1d', tx + 44, ty, 6, 5);
      }
      if (o.bomba) {
        const tx = 6, ty = gy + 25;
        R(ctx, '#3b6fb6', tx, ty - 12, 14, 12); R(ctx, '#7ec8e3', tx + 2, ty - 10, 6, 5);
        R(ctx, '#c9d1d6', tx + 14, ty - 6, 36, 6); R(ctx, '#f2c14e', tx + 18, ty - 10, 30, 3);
        R(ctx, '#f2c14e', tx + 44, ty - 30, 3, 22); R(ctx, '#f2c14e', tx + 44, ty - 30, 22, 3);
        R(ctx, '#1d1d1d', tx + 3, ty, 6, 5); R(ctx, '#1d1d1d', tx + 24, ty, 6, 5); R(ctx, '#1d1d1d', tx + 38, ty, 6, 5);
      }
    }

    // -------------------------------------------------------------
    // Guindaste de torre, andaime, impressora
    // -------------------------------------------------------------
    function drawTowerCrane() {
      if (!G.S.owned.guindaste || geo.complete) return;
      const mx = geo.bx + geo.ww + 12;
      const topY = Math.round(floorBase(G.S.floors) - WALL_H - 38);
      const bottom = Math.min(H, GROUND_Y + camY);
      for (let y = Math.max(topY, -8); y < bottom; y += 8) {
        R(ctx, '#f2c14e', mx, y, 1, 8); R(ctx, '#f2c14e', mx + 7, y, 1, 8); R(ctx, '#c9952a', mx, y, 8, 1);
        for (let k = 0; k < 7; k++) R(ctx, '#c9952a', mx + k, y + k, 1, 1);
      }
      // cabine e lança
      R(ctx, '#f2c14e', mx - 1, topY - 4, 10, 4);
      R(ctx, '#3b3b46', mx + 1, topY - 10, 8, 6); R(ctx, '#7ec8e3', mx + 2, topY - 9, 4, 3);
      const jibL = geo.bx - 14;
      R(ctx, '#f2c14e', jibL, topY - 14, mx - jibL + 30, 3);
      for (let x = jibL; x < mx + 28; x += 4) R(ctx, '#c9952a', x, topY - 15, 1, 1);
      R(ctx, '#f2c14e', mx + 3, topY - 28, 2, 14);
      R(ctx, '#8a959c', mx + 4, topY - 28, 1, 1);
      for (let k = 0; k < 6; k++) { R(ctx, '#c9952a', mx + 4 - k * 6, topY - 27 + k * 2, 2, 1); R(ctx, '#c9952a', mx + 5 + k * 4, topY - 27 + k * 2, 2, 1); }
      R(ctx, '#6e747a', mx + 22, topY - 12, 8, 7);
      lights.push([mx + 3, topY - 30, 2, 2, '#ff3b30', 'blink']);
      // carrinho e gancho
      const tx = Math.round(geo.bx + geo.ww * 0.5 + Math.sin(clock * 0.35) * geo.ww * 0.45);
      R(ctx, '#3b3b46', tx - 2, topY - 11, 5, 2);
      const hookY = topY + 10 + Math.round(Math.sin(clock * 0.9) * 6);
      R(ctx, '#3b3b46', tx, topY - 9, 1, hookY - topY + 9);
      R(ctx, '#f2c14e', tx - 1, hookY, 3, 2);
      R(ctx, '#a0652f', tx - 6, hookY + 8, 13, 2);
      for (let k = 0; k < 2; k++) { R(ctx, '#7d3423', tx - 5 + k * 6, hookY + 4, 5, 4); R(ctx, '#b5523b', tx - 5 + k * 6, hookY + 4, 4, 2); }
      R(ctx, '#3b3b46', tx - 5, hookY + 2, 1, 2); R(ctx, '#3b3b46', tx + 5, hookY + 2, 1, 2);
    }

    function drawScaffold(base) {
      const top = base - WALL_H - 8;
      for (const sx of [geo.bx - 12, geo.bx + geo.ww + 3]) {
        R(ctx, '#8b5a2b', sx, top, 1, base - top); R(ctx, '#8b5a2b', sx + 8, top, 1, base - top);
        for (let y = base - 13; y > top; y -= 13) { R(ctx, '#b07a3e', sx - 1, y, 11, 2); R(ctx, '#8b5a2b', sx - 1, y + 2, 11, 1); }
        for (let k = 0; k < 8; k++) R(ctx, '#6b4320', sx + k, base - 2 - k * 1.5, 1, 1);
      }
      // balde e argamassa na laje
      R(ctx, '#6e747a', geo.bx + 3, base - 5, 7, 5); R(ctx, '#bdb6a6', geo.bx + 4, base - 5, 5, 2);
    }

    function drawGhost(base) {
      ctx.globalAlpha = 0.5;
      const y0 = base - WALL_H;
      for (let x = geo.bx; x < geo.bx + geo.ww; x += 4) R(ctx, '#ffffff', x, y0, 2, 1);
      for (let y = y0; y < base; y += 4) { R(ctx, '#ffffff', geo.bx, y, 1, 2); R(ctx, '#ffffff', geo.bx + geo.ww - 1, y, 1, 2); }
      ctx.globalAlpha = 1;
    }

    function drawPrinter(base) {
      if (!G.S.owned.impressora || geo.complete) return;
      const l = geo.bx - 6, r = geo.bx + geo.ww + 4, top = base - WALL_H - 18;
      R(ctx, '#3b6fb6', l, top, 3, base - top); R(ctx, '#3b6fb6', r, top, 3, base - top);
      R(ctx, '#3b6fb6', l, top, r - l + 3, 3); R(ctx, '#2a4f86', l, top + 3, r - l + 3, 1);
      const hx = Math.round(geo.bx + geo.ww / 2 + Math.sin(clock * 1.3) * (geo.ww / 2 - 6));
      R(ctx, '#ef7d2d', hx - 3, top + 3, 7, 5); R(ctx, '#3b3b46', hx - 1, top + 8, 3, 4);
      const vc = visibleCount();
      const row = Math.floor(vc / (geo.ww / BW));
      const ny = base - (row + 1) * BH;
      if (ny > top + 12) { ctx.globalAlpha = 0.6; R(ctx, '#bdb6a6', hx, top + 12, 1, ny - top - 12); ctx.globalAlpha = 1; }
    }

    // -------------------------------------------------------------
    // Trabalhadores no andar em construção
    // -------------------------------------------------------------
    const WK = {
      servente:   { helmet: '#ef7d2d', body: '#ef7d2d', stripe: '#f5f0a0', legs: '#2a4f86' },
      pedreiro:   { helmet: '#f2c14e', body: '#3b6fb6', stripe: '#2a4f86', legs: '#3b3b46' },
      mestre:     { helmet: '#f4f4f0', body: '#f4f4f0', stripe: '#c9d1d6', legs: '#2b2b33' },
      engenheira: { helmet: '#f4f4f0', body: '#3aa39a', stripe: '#2b7a73', legs: '#2b2b33', hair: '#5a3a22' },
      robo:       { robot: true },
    };

    function syncWorkers() {
      const o = G.S.owned;
      const want = [];
      [['robo', 2], ['engenheira', 1], ['mestre', 1], ['pedreiro', 3], ['servente', 3]].forEach(([t, max]) => {
        for (let i = 0; i < Math.min(o[t] || 0, max); i++) want.push(t);
      });
      while (workers.length > want.length) workers.pop();
      for (let i = 0; i < want.length; i++) {
        if (!workers[i]) workers[i] = { x: geo.bx + 8 + Math.random() * (geo.ww - 20), dir: Math.random() < 0.5 ? -1 : 1, sp: 6 + Math.random() * 8, pause: 0, t: Math.random() * 10 };
        workers[i].type = want[i];
      }
    }

    function updateWorkers(dt) {
      const lo = geo.bx + 2, hi = geo.bx + geo.ww - 8;
      for (const w of workers) {
        w.t += dt;
        if (w.pause > 0) { w.pause -= dt; continue; }
        w.x += w.dir * w.sp * dt;
        if (w.x < lo) { w.x = lo; w.dir = 1; }
        if (w.x > hi) { w.x = hi; w.dir = -1; }
        if (Math.random() < dt * 0.35) w.pause = 0.6 + Math.random() * 1.8;
      }
    }

    function drawWorkers() {
      if (geo.complete) return;
      const feet = Math.round(floorBase(G.S.floors));
      for (const w of workers) {
        const c = WK[w.type];
        const x = Math.round(w.x), y = feet - 11;
        const step = w.pause > 0 ? 0 : Math.floor(w.t * 6) % 2;
        const f = w.dir > 0;
        if (c.robot) {
          R(ctx, '#c9d1d6', x, y + 2, 7, 6); R(ctx, '#3b3b46', x + 1, y + 3, 5, 2); R(ctx, '#6cf0ff', x + (f ? 4 : 1), y + 3, 2, 1);
          R(ctx, '#ff4d3d', x + 3, y, 1, 2); R(ctx, '#8a959c', x, y + 8, 7, 1);
          R(ctx, '#2b2b33', x, y + 9, 7, 2); R(ctx, '#8a959c', x + (step ? 1 : 2), y + 9, 1, 1); R(ctx, '#8a959c', x + (step ? 4 : 5), y + 9, 1, 1);
          continue;
        }
        R(ctx, c.helmet, x + 1, y, 4, 1); R(ctx, c.helmet, x, y + 1, 6, 1);
        R(ctx, '#e9b48a', x + 1, y + 2, 4, 3); R(ctx, '#1d1d1d', x + (f ? 4 : 1), y + 3, 1, 1);
        if (c.hair) { R(ctx, c.hair, f ? x : x + 5, y + 2, 1, 4); }
        R(ctx, c.body, x, y + 5, 6, 3); R(ctx, c.stripe, x, y + 6, 6, 1);
        R(ctx, c.legs, x + 1, y + 8, 4, 1);
        if (step) { R(ctx, c.legs, x, y + 9, 1, 2); R(ctx, c.legs, x + 5, y + 9, 1, 2); }
        else { R(ctx, c.legs, x + 1, y + 9, 1, 2); R(ctx, c.legs, x + 4, y + 9, 1, 2); }
        if (w.type === 'servente') { R(ctx, '#b5523b', f ? x + 3 : x - 2, y - 2, 5, 2); R(ctx, '#d07355', f ? x + 3 : x - 2, y - 2, 5, 1); }
        else if (w.type === 'pedreiro' && w.pause > 0 && Math.floor(w.t * 8) % 2) R(ctx, '#c9d1d6', f ? x + 6 : x - 2, y + 4, 2, 2);
        else if (w.type === 'mestre') R(ctx, '#c9a26b', f ? x + 5 : x - 1, y + 5, 2, 3);
        else if (w.type === 'engenheira') { R(ctx, '#c4ecf7', f ? x + 5 : x - 3, y + 5, 4, 2); R(ctx, '#3b6fb6', f ? x + 5 : x - 3, y + 6, 4, 1); }
      }
    }

    // -------------------------------------------------------------
    // Eventos (desenho)
    // -------------------------------------------------------------
    const CRACK = [[3, 0], [4, 1], [3, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 7], [3, 8], [4, 9], [5, 10], [6, 11], [5, 12], [6, 13], [5, 3], [6, 4], [7, 4], [8, 5], [2, 8], [1, 9], [0, 10]];
    const crackFloor = () => Math.max(0, G.S.floors - 1);
    function crackPos() {
      const c = G.EV.crack;
      return { x: geo.bx + Math.round(c.u * (geo.ww - 20)) + 6, y: Math.round(floorBase(crackFloor()) - WALL_H + c.yo) };
    }

    function drawCrack() {
      const c = G.EV.crack;
      if (!c || G.S.floors < 1) return;
      const p = crackPos();
      const n = Math.ceil(CRACK.length * c.hp / 6);
      for (let i = 0; i < n; i++) { R(ctx, '#2b1d14', p.x + CRACK[i][0], p.y + CRACK[i][1], 2, 1); R(ctx, '#5e3820', p.x + CRACK[i][0] + 2, p.y + CRACK[i][1], 1, 1); }
      if (Math.floor(clock * 3) % 2 === 0) {
        const x0 = p.x - 4, y0 = p.y - 4, x1 = p.x + 12, y1 = p.y + 17;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, dx, dy]) => { R(ctx, '#ff4d3d', Math.min(x, x + dx * 2), y, 3, 1); R(ctx, '#ff4d3d', x, Math.min(y, y + dy * 2), 1, 3); });
      }
    }

    const palletX = c => c.x + Math.sin(c.t * 1.7 + c.phase) * 8;
    function drawPallet() {
      const c = G.EV.crane;
      if (!c) return;
      const x = Math.round(palletX(c)), y = Math.round(c.y);
      R(ctx, '#3b3b46', x, -2, 1, y + 2);
      R(ctx, '#f2c14e', x - 2, y - 1, 5, 3);
      R(ctx, '#3b3b46', x - 9, y + 2, 19, 1); R(ctx, '#3b3b46', x - 9, y + 2, 1, 5); R(ctx, '#3b3b46', x + 9, y + 2, 1, 5);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
        const bx = x - 12 + k * 6 + (r % 2 ? 2 : 0), by = y + 6 + r * 3;
        R(ctx, '#7d3423', bx, by, 6, 3); R(ctx, '#b5523b', bx, by, 5, 2); R(ctx, '#d07355', bx, by, 5, 1);
      }
      R(ctx, '#a0652f', x - 13, y + 18, 27, 2); R(ctx, '#6e4220', x - 12, y + 20, 3, 1); R(ctx, '#6e4220', x - 1, y + 20, 3, 1); R(ctx, '#6e4220', x + 10, y + 20, 3, 1);
      if (!c.gone && Math.floor(c.t * 3) % 2 === 0) {
        R(ctx, '#fff0a6', x - 17, y + 6, 1, 3); R(ctx, '#fff0a6', x - 18, y + 7, 3, 1);
        R(ctx, '#fff0a6', x + 17, y + 12, 1, 3); R(ctx, '#fff0a6', x + 16, y + 13, 3, 1);
        R(ctx, '#fff0a6', x + 2, y - 6, 1, 3); R(ctx, '#fff0a6', x + 1, y - 5, 3, 1);
      }
    }

    function drawInspector() {
      const f = G.EV.inspector;
      if (!f) return;
      const x = Math.round(f.x), y = Math.round(floorBase(G.S.floors)) - 12;
      const step = f.state === 'check' ? 0 : Math.floor(f.t * 6) % 2;
      R(ctx, '#1f3b73', x, y, 6, 2); R(ctx, '#1f3b73', x - 1, y + 2, 8, 1);
      R(ctx, '#e9b48a', x + 1, y + 3, 4, 3); R(ctx, '#1d1d1d', x + 4, y + 4, 1, 1);
      R(ctx, '#2f3542', x, y + 6, 6, 3); R(ctx, '#f4f4f0', x + 2, y + 6, 1, 2); R(ctx, '#c84b4b', x + 2, y + 7, 1, 1);
      R(ctx, '#c9a26b', x + 6, y + 6, 2, 3); R(ctx, '#2b2b33', x + 1, y + 9, 4, 1);
      if (step) { R(ctx, '#2b2b33', x, y + 10, 1, 2); R(ctx, '#2b2b33', x + 5, y + 10, 1, 2); }
      else { R(ctx, '#2b2b33', x + 1, y + 10, 1, 2); R(ctx, '#2b2b33', x + 4, y + 10, 1, 2); }
      if (f.state === 'check') {
        R(ctx, '#f4f4f0', x - 3, y - 10, 13, 7); R(ctx, '#f4f4f0', x + 1, y - 3, 2, 2);
        const dots = 1 + Math.floor(f.t * 2) % 3;
        for (let i = 0; i < dots; i++) R(ctx, '#2b1d14', x - 1 + i * 4, y - 8, 2, 2);
      }
    }

    const drops = Array.from({ length: 120 }, () => ({ x: Math.random() * (W + 60), y: Math.random() * H, sp: 200 + Math.random() * 90 }));
    function drawRain(dt) {
      const e = G.EV.effects.find(x => x.id === 'chuva');
      if (!e) return;
      const fade = Math.min(1, Math.min(e.t, e.dur - e.t) / 2);
      for (const d of drops) { d.y += d.sp * dt; d.x -= d.sp * 0.25 * dt; if (d.y > H) { d.y = -4; d.x = Math.random() * (W + 60); } }
      ctx.globalAlpha = 0.24 * fade; R(ctx, '#2a3445', -2, -2, W + 4, H + 4);
      ctx.globalAlpha = 0.75 * fade;
      for (const d of drops) R(ctx, '#a9c8e8', d.x, d.y, 1, 4);
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------
    // Tijolos caindo, partículas e fumaça
    // -------------------------------------------------------------
    function brickXY(k, base) {
      const cols = geo.ww / BW;
      const row = Math.floor(k / cols), col = k % cols;
      return { x: geo.bx + col * BW - (row % 2 ? BW / 2 : 0), y: base - (row + 1) * BH };
    }
    const currentPalette = () => geo.style.bricks ? geo.style.bricks[Math.floor(hash(G.S.floors * 131 + geo.p.id.length * 17 + (geo.p.record ? 5 : 0), 1) * geo.style.bricks.length)] : null;

    function spawnFalling(k) {
      const base = floorBase(G.S.floors);
      const p = brickXY(k, base);
      inflight.add(k);
      const pal = currentPalette();
      falling.push({ k, x: p.x, y: p.y - 90 - Math.random() * 30, vy: 80, floor: G.S.floors, col: pal || DEFAULT_BRICKS[Math.floor(hash(G.S.floors, k) * 3)] });
    }

    function dust(x, y, n, colors = ['#e6dccb', '#cfc1a8', '#b5a089']) {
      for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 40, life: 0.4 + Math.random() * 0.4, c: colors[i % colors.length] });
    }

    function confetti() {
      const cols = ['#f2c14e', '#c8553d', '#7ec8e3', '#7cc35e', '#f4f4f0', '#e86a92'];
      const y = floorBase(G.S.floors) - 10;
      for (let i = 0; i < 70; i++) particles.push({ x: geo.bx + Math.random() * geo.ww, y, vx: (Math.random() - 0.5) * 160, vy: -50 - Math.random() * 120, life: 1.2 + Math.random(), c: cols[i % cols.length], g: 170 });
      flash = 0.6; shake = 0.3;
    }

    function updateFx(dt) {
      const base = floorBase(G.S.floors);
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        if (f.floor !== G.S.floors) { falling.splice(i, 1); inflight.delete(f.k); continue; }
        const ty = brickXY(f.k, base).y;
        f.vy += 1100 * dt; f.y += f.vy * dt;
        if (f.y >= ty) { inflight.delete(f.k); falling.splice(i, 1); dust(f.x + BW / 2, ty + BH, 4); }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += (p.g || 130) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.life -= dt; if (s.life <= 0) { smoke.splice(i, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * 1.5;
      }
    }

    // ---------- Tijolo de ouro ----------
    function goldPos() {
      const g = G.EV.gold;
      return brickXY(g.k, floorBase(G.S.floors));
    }
    function drawGold() {
      const g = G.EV.gold;
      if (!g || geo.complete) return;
      const p = goldPos();
      const x = Math.round(Math.max(geo.bx, p.x)), w = Math.min(BW - 1, p.x + BW - 1 - x);
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(clock * 10);
      R(ctx, '#fff0a6', x - 3, p.y - 2, w + 6, BH + 4);
      ctx.globalAlpha = 1;
      R(ctx, '#c9952a', x, p.y + 1, w, BH - 1);
      R(ctx, '#f2c14e', x, p.y + 1, w, BH - 2);
      R(ctx, '#fff6d5', x, p.y + 1, w, 1);
      const sh = Math.floor(clock * 8) % (w + 4);
      if (sh < w) R(ctx, '#ffffff', x + sh, p.y + 1, 1, BH - 1);
      // seta pulando em cima do tijolo
      const ay = p.y - 12 - Math.round(Math.abs(Math.sin(clock * 5)) * 4), ax = x + Math.round(w / 2);
      R(ctx, '#2b1d14', ax - 3, ay - 1, 7, 5);
      R(ctx, '#f2c14e', ax - 2, ay, 5, 1); R(ctx, '#f2c14e', ax - 1, ay + 1, 3, 1); R(ctx, '#f2c14e', ax, ay + 2, 1, 1);
      R(ctx, '#f2c14e', ax - 1, ay - 5, 3, 5); R(ctx, '#2b1d14', ax - 2, ay - 6, 5, 1);
      for (let i = 0; i < 3; i++) {
        const a = clock * 3 + i * 2.1;
        const sx = x + w / 2 + Math.cos(a) * 9, sy = p.y + 2 + Math.sin(a) * 6;
        R(ctx, '#fff6d5', sx, sy, 1, 1);
        if ((Math.floor(clock * 6) + i) % 2) { R(ctx, '#fff6d5', sx - 1, sy, 3, 1); R(ctx, '#fff6d5', sx, sy - 1, 1, 3); }
      }
    }

    // ---------- Anéis de impacto do clique ----------
    function drawRings(dt) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        if (r.t > 0.28) { rings.splice(i, 1); continue; }
        const rad = 3 + r.t * 50;
        ctx.globalAlpha = 1 - r.t / 0.28;
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * Math.PI * 2;
          R(ctx, r.c, r.x + Math.cos(a) * rad, r.y + Math.sin(a) * rad, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------
    // Prédio
    // -------------------------------------------------------------
    function drawBuilding() {
      const S = G.S;
      const { bx, ww } = geo;
      const gy = GROUND_Y + camY;
      // fundação
      if (gy - FOUND_H < H + 4) {
        R(ctx, '#6e747a', bx - 5, gy - FOUND_H, ww + 10, FOUND_H + 1);
        R(ctx, '#9aa0a6', bx - 5, gy - FOUND_H, ww + 10, FOUND_H - 1);
        R(ctx, '#b8bec4', bx - 5, gy - FOUND_H, ww + 10, 1);
      }
      const nightGlass = [];
      for (let i = 0; i < S.floors; i++) {
        const base = floorBase(i);
        if (base - FLOOR_H > H + 4) continue;
        if (base < -16) break;
        const f = facade(i);
        const ox = bx - PAD, oy = Math.round(base - FLOOR_H);
        ctx.drawImage(f.cv, ox, oy);
        for (const r of f.glass) nightGlass.push([ox + r[0], oy + r[1], r[2], r[3], i, r[0]]);
        for (const r of f.lamps) lights.push([ox + r[0], oy + r[1], r[2], r[3], '#ffe9a0', 'lamp']);
      }
      if (geo.complete) drawRoof(floorBase(S.floors - 1));
      else {
        const base = floorBase(S.floors);
        if (base > -60) {
          drawScaffold(base);
          drawGhost(base);
          ctx.save(); ctx.translate(bx, base - WALL_H);
          const pal = currentPalette();
          brickWall(ctx, 0, 0, ww, pal ? [pal] : DEFAULT_BRICKS, S.floors * 7 + 3, visibleCount(), inflight);
          ctx.restore();
        }
      }
      return nightGlass;
    }

    // -------------------------------------------------------------
    // Quadro
    // -------------------------------------------------------------
    function render(dt) {
      updateGeo();
      clock += dt;
      dayTime += dt;
      camY += (targetCam() - camY) * Math.min(1, dt * 3.5);
      flash = Math.max(0, flash - dt * 1.5);
      shake = Math.max(0, shake - dt);
      for (const c of cloudsFar) { c.x += c.sp * dt; if (c.x > W + 40) c.x = -c.w - 40; }
      for (const c of cloudsNear) { c.x += c.sp * dt; if (c.x > W + 40) c.x = -c.w - 40; }
      syncWorkers();
      updateWorkers(dt);
      updateFx(dt);
      lights.length = 0;

      const p = (dayTime % DAY_LEN) / DAY_LEN;
      const night = nightness(p);
      ctx.save();
      if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
      drawSky(p, night);
      drawBlimp();
      drawPlaneAndBirds(dt);
      drawCity(night);
      const cc = night > 0.5 ? '#4b5079' : '#ffffff', cs = night > 0.5 ? '#3a3e63' : '#dbe9f2';
      for (const c of cloudsNear) {
        const y = Math.floor(((c.y + camY * 0.3) % 420 + 420) % 420 - 30);
        cloud(ctx, Math.floor(c.x), y, Math.floor(c.w), cc, cs);
      }
      drawStreet(night, dt);
      drawTowerCrane();
      const glass = drawBuilding();
      drawCrack();
      drawGold();
      if (!geo.complete) drawPrinter(floorBase(G.S.floors));
      drawWorkers();
      drawInspector();
      for (const f of falling) brick(ctx, Math.round(f.x), Math.round(f.y), f.col);
      drawPallet();
      for (const s of smoke) { ctx.globalAlpha = Math.min(0.6, s.life / 3); disc(ctx, s.x, s.y, Math.round(s.r), night > 0.5 ? '#5a5f70' : '#d8dde2'); }
      ctx.globalAlpha = 1;
      for (const pt of particles) R(ctx, pt.c, pt.x, pt.y, 1, 1);
      drawRings(dt);
      drawRain(dt);

      if (night > 0) {
        ctx.globalAlpha = night * 0.42; R(ctx, '#0a0e2a', -2, -2, W + 4, H + 4); ctx.globalAlpha = 1;
        if (night > 0.2) {
          const a = Math.min(1, night * 1.2);
          const bucket = Math.floor(clock / 25);
          for (const [x, y, w, h, i, rx] of glass) {
            if (hash(i * 7 + rx, bucket + (i % 3)) < 0.3) continue;
            ctx.globalAlpha = a; R(ctx, '#ffd36b', x, y, w, h); R(ctx, '#fff0b8', x + 1, y + 1, Math.min(3, w - 1), 2);
          }
          for (const [x, y, w, h, col, kind, img] of lights) {
            if (kind === 'blink' && Math.floor(clock * 1.5) % 2) continue;
            if (kind === 'sign') {
              ctx.globalAlpha = a * 0.3; R(ctx, col, x - 3, y - 3, w + 6, h + 6);
              ctx.globalAlpha = 1; ctx.drawImage(img, x, y, w, h);
              continue;
            }
            ctx.globalAlpha = a; R(ctx, col, x, y, w, h);
            if (kind === 'lamp' || kind === 'blink') { ctx.globalAlpha = a * 0.25; R(ctx, col, x - 2, y - 1, w + 4, h + 2); }
          }
          ctx.globalAlpha = 1;
        }
      } else {
        for (const [x, y, w, h, col, kind] of lights) if (kind === 'blink' && Math.floor(clock * 1.5) % 2 === 0) R(ctx, col, x, y, w, h);
      }
      if (flash > 0) { ctx.globalAlpha = flash; R(ctx, '#fff6d5', -2, -2, W + 4, H + 4); ctx.globalAlpha = 1; }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // Interface pública
    // -------------------------------------------------------------
    return {
      W, H, WALL_H, FLOOR_H,
      render,
      snapCamera() { updateGeo(); camY = targetCam(); },
      reset() { falling.length = 0; inflight.clear(); particles.length = 0; workers.length = 0; facadeCache.clear(); cacheKeyProject = ''; updateGeo(); camY = targetCam(); },
      visibleCount: () => { updateGeo(); return visibleCount(); },
      spawnFalling(k) { updateGeo(); spawnFalling(k); },
      clearFalling() { falling.length = 0; inflight.clear(); },
      dust, confetti,
      ring(x, y, hot) { if (rings.length < 12) rings.push({ x, y, t: 0, c: hot ? '#f2c14e' : '#fff6d5' }); },
      goldSpot() { updateGeo(); const vc = visibleCount(); return vc > 12 ? Math.floor(Math.random() * vc) : -1; },
      goldPos: () => { updateGeo(); return goldPos(); },
      hitGold(x, y) {
        if (!G.EV.gold) return false;
        updateGeo();
        const p = goldPos();
        return x > p.x - 7 && x < p.x + BW + 7 && y > p.y - 7 && y < p.y + BH + 7;
      },
      floorTopY: () => floorBase(G.S.floors) - WALL_H,
      floorBaseY: () => floorBase(G.S.floors),
      wallSpan: () => { updateGeo(); return { bx: geo.bx, ww: geo.ww }; },
      palletX,
      hitPallet(x, y) {
        const c = G.EV.crane;
        if (!c || c.gone) return false;
        const cx = palletX(c);
        return x > cx - 18 && x < cx + 18 && y > c.y - 8 && y < c.y + 24;
      },
      crackPos: () => { updateGeo(); return crackPos(); },
      hitCrack(x, y) {
        if (!G.EV.crack || G.S.floors < 1) return false;
        updateGeo();
        const p = crackPos();
        return x > p.x - 8 && x < p.x + 16 && y > p.y - 8 && y < p.y + 22;
      },
    };
  }

  root.World = World;
})(window);
