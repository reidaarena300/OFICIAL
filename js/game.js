/* Tijolo Clicker v0.1 — clique, assente tijolos, feche pavimentos, ganhe aluguel. */
(() => {
  'use strict';

  // ================================================================
  // Mundo (coordenadas em "pixels de arte"; o canvas é 200x240)
  // ================================================================
  const W = 200, H = 240;
  const BW = 10, BH = 5;            // célula do tijolo (tijolo 9x4 + 1px de argamassa)
  const COLS = 10, ROWS = 8;
  const WALL_W = COLS * BW;         // 100
  const WALL_H = ROWS * BH;         // 40
  const SLAB_H = 4;                 // laje
  const FLOOR_H = WALL_H + SLAB_H;  // 44
  const PER_FLOOR = COLS * ROWS;    // 80 tijolos desenhados por pavimento
  const BX = (W - WALL_W) / 2;      // 50
  const GROUND_Y = H - 28;
  const FOUND_H = 5;
  const DAY_LEN = 240;              // segundos para um dia completo
  const SAVE_KEY = 'tijolo-clicker-save-v1';
  const OFFLINE_MAX = 8 * 3600;     // no máximo 8h de progresso offline

  // ================================================================
  // Economia
  // ================================================================
  const need = i => Math.ceil(50 * Math.pow(1.14, i));          // tijolos para o pavimento i
  const reward = i => Math.round(20 * Math.pow(1.15, i));       // pagamento ao concluir
  const baseRent = n => (Math.pow(1.08, n) - 1) / 0.08;         // soma do aluguel de n pavimentos

  const ITEMS = [
    { id: 'colher',   cat: 'Ferramentas', name: 'Colher de pedreiro', desc: '+1 tijolo por clique', base: 25,   growth: 1.6 },
    { id: 'servente', cat: 'Equipe',      name: 'Servente',           desc: 'Assenta 0,5 tijolo/s', base: 15,   growth: 1.15, bps: 0.5 },
    { id: 'pedreiro', cat: 'Equipe',      name: 'Pedreiro',           desc: 'Assenta 3 tijolos/s',  base: 150,  growth: 1.15, bps: 3 },
    { id: 'mestre',   cat: 'Equipe',      name: 'Mestre de obras',    desc: 'Assenta 15 tijolos/s', base: 1500, growth: 1.15, bps: 15 },
    { id: 'janela',   cat: 'Peças',       name: 'Janela',             desc: '+15% no aluguel',      base: 40,   growth: 1.22, limit: () => S.floors * 2, limitMsg: '2 por pavimento' },
    { id: 'porta',    cat: 'Peças',       name: 'Porta',              desc: '+35% no aluguel',      base: 120,  growth: 1.3,  limit: () => S.floors,     limitMsg: '1 por pavimento' },
  ];

  const fresh = () => ({
    v: 1, bricks: 0, floors: 0, money: 0,
    totalBricks: 0, totalMoney: 0, clicks: 0,
    owned: { colher: 0, servente: 0, pedreiro: 0, mestre: 0, janela: 0, porta: 0 },
    seen: {}, muted: false, lastSave: Date.now(),
  });
  let S = fresh();

  const cost = it => Math.floor(it.base * Math.pow(it.growth, S.owned[it.id]));
  const perClick = () => 1 + S.owned.colher;
  const bps = () => ITEMS.reduce((a, it) => a + (it.bps || 0) * S.owned[it.id], 0);
  const rentMult = () => 1 + 0.15 * S.owned.janela + 0.35 * S.owned.porta;
  const rent = () => baseRent(S.floors) * rentMult();

  function addBricks(n, withFx) {
    S.bricks += n;
    S.totalBricks += n;
    let done = 0, earned = 0;
    while (S.bricks >= need(S.floors)) {
      S.bricks -= need(S.floors);
      const r = reward(S.floors);
      S.money += r; S.totalMoney += r; earned += r;
      S.floors++; done++;
    }
    if (done) { inflight.clear(); falling.length = 0; }
    if (done && withFx) onFloorComplete(done, earned);
    return done;
  }

  function addMoney(n) { S.money += n; S.totalMoney += n; }

  function simulate(sec) {
    const f0 = S.floors, m0 = S.money, b0 = S.totalBricks;
    let t = sec;
    while (t > 0) {
      const dt = Math.min(1, t);
      addBricks(bps() * dt, false);
      addMoney(rent() * dt);
      t -= dt;
    }
    return { floors: S.floors - f0, money: S.money - m0, bricks: S.totalBricks - b0 };
  }

  // ================================================================
  // Formatação
  // ================================================================
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) {
      if (n < 10 && n % 1 > 0.05) return n.toFixed(1).replace('.', ',');
      return String(Math.floor(n));
    }
    const units = [[1e15, 'qua'], [1e12, 'tri'], [1e9, 'bi'], [1e6, 'mi'], [1e3, 'mil']];
    for (const [v, s] of units) {
      if (n >= v) {
        const x = n / v;
        return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0).replace('.', ',') + ' ' + s;
      }
    }
    return String(Math.floor(n));
  }
  const money = n => 'R$ ' + fmt(n);
  const ordinal = n => n + 'º';

  // ================================================================
  // Pixel art: paleta e sprites
  // ================================================================
  const PAL = {
    k: '#2b1d14', s: '#c9d1d6', S: '#8a959c', w: '#a0652f', W: '#6e4220',
    y: '#f2c14e', o: '#ef7d2d', f: '#e9b48a', b: '#3b6fb6', B: '#2a4f86',
    g: '#7ec8e3', G: '#c4ecf7', e: '#e8e4da', r: '#c0603f', R: '#8e3b26',
    h: '#f4f4f0', n: '#1d1d1d', c: '#9aa0a6', l: '#d77a55', t: '#5ca04a',
  };

  function sprite(rows, map = {}) {
    return rows.map(r => r.padEnd(12, '.').split('').map(ch => map[ch] || ch));
  }

  function drawSprite(ctx, spr, x, y, scale = 1) {
    for (let j = 0; j < spr.length; j++) {
      const row = spr[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        ctx.fillStyle = PAL[ch] || ch;
        ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
      }
    }
  }

  const HEAD = [
    '....CCCC....',
    '...CCCCCC...',
    '..CCChCCCC..',
    '.CCCCCCCCCC.',
    '..ffffffff..',
    '..fnffffnf..',
    '..ffffffff..',
    '...ffkkff...',
    '....ffff....',
    '..VVVVVVVV..',
    '.VVXVVVVXVV.',
    '.VVXVVVVXVV.',
  ];

  const ICONS = {
    colher: sprite([
      '.........kk.',
      '........kwwk',
      '.......kwWk.',
      '......kWwk..',
      '.....kSk....',
      '..kkkSk.....',
      '.kssssk.....',
      'kssssSk.....',
      'ksssSSk.....',
      'kssSSk......',
      'ksSSk.......',
      'kkkk........',
    ]),
    servente: sprite(HEAD, { C: 'o', V: 'o', X: 'y' }),
    pedreiro: sprite(HEAD, { C: 'y', V: 'b', X: 'B' }),
    mestre: sprite(HEAD, { C: 'h', V: 'h', X: 'S' }),
    janela: sprite([
      'eeeeeeeeeeee',
      'eGggggeGggge',
      'egGgggeggGge',
      'eggGggegggGe',
      'egggGgegggGe',
      'eeeeeeeeeeee',
      'eGggggeGggge',
      'egGgggegGgge',
      'eggGggeggGge',
      'eggggGegggge',
      'eeeeeeeeeeee',
      'cccccccccccc',
    ]),
    porta: sprite([
      '..kkkkkkkk..',
      '..kwwwwwwk..',
      '..kwWWWWwk..',
      '..kwWwwWwk..',
      '..kwWWWWwk..',
      '..kwwwwwwk..',
      '..kwwwwwyk..',
      '..kwWWWWwk..',
      '..kwWwwWwk..',
      '..kwWWWWwk..',
      '..kwwwwwwk..',
      'cccccccccccc',
    ]),
    brick: sprite([
      '............',
      '............',
      'eeeeeeeeeeee',
      'elllllelllle',
      'errrrrerrrre',
      'eRRRRReRRRRe',
      'eeeeeeeeeeee',
      'llleelllllle',
      'rrreerrrrrre',
      'RRReeRRRRRRe',
      'eeeeeeeeeeee',
      '............',
    ]),
    mystery: sprite([
      '...kkkkkk...',
      '..kSSSSSSk..',
      '.kSSkkkkSSk.',
      '.kSk....kSk.',
      '........kSk.',
      '......kSSk..',
      '.....kSSk...',
      '.....kSk....',
      '............',
      '.....kSk....',
      '.....kSk....',
      '............',
    ]),
  };

  function iconCanvas(name) {
    const c = document.createElement('canvas');
    c.width = 12; c.height = 12;
    c.className = 'item-icon';
    drawSprite(c.getContext('2d'), ICONS[name], 0, 0, 1);
    return c;
  }

  // Bonequinhos 5x9 da obra
  const WORKER = {
    servente: { helmet: '#ef7d2d', vest: '#ef7d2d', stripe: '#f2e27a', legs: '#2a4f86', carry: true },
    pedreiro: { helmet: '#f2c14e', vest: '#3b6fb6', stripe: '#2a4f86', legs: '#3b3b46', carry: false },
    mestre:   { helmet: '#f4f4f0', vest: '#f4f4f0', stripe: '#8a959c', legs: '#2b2b33', carry: false },
  };

  // ================================================================
  // Canvas e estado visual
  // ================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const BRICK_COLORS = [
    ['#b5523b', '#d07355', '#7d3423'],
    ['#a8472f', '#c4664a', '#72301f'],
    ['#c0603f', '#db8461', '#86402a'],
  ];
  const MORTAR = '#cfc1a8';

  let camY = 0;
  let dayTime = 60;          // começa de manhã
  let flash = 0, shake = 0;
  const inflight = new Set();
  const falling = [];
  const particles = [];
  const workers = [];

  function hash(a, b) {
    let x = Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  // Elementos fixos de cenário
  const stars = Array.from({ length: 46 }, (_, i) => ({ x: Math.floor(hash(i, 1) * W), y: Math.floor(hash(i, 2) * 260), tw: hash(i, 3) }));
  const clouds = Array.from({ length: 5 }, (_, i) => ({ x: hash(i, 4) * (W + 60) - 30, y: 14 + hash(i, 5) * 220, w: 18 + Math.floor(hash(i, 6) * 20), sp: 2 + hash(i, 7) * 3 }));
  const city = [];
  for (let x = -4, i = 0; x < W + 4; i++) {
    const w = 10 + Math.floor(hash(i, 8) * 14);
    city.push({ x, w, h: 16 + Math.floor(hash(i, 9) * 40), seed: i });
    x += w + Math.floor(hash(i, 10) * 4);
  }

  // ---------- Céu e ciclo do dia ----------
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const SKY = [
    [0.00, '#5fa8e0', '#b9e2f5'],
    [0.42, '#5fa8e0', '#b9e2f5'],
    [0.52, '#4a4e8f', '#f2a65a'],
    [0.62, '#0e1330', '#2a2f5c'],
    [0.86, '#0e1330', '#2a2f5c'],
    [0.95, '#6a6fb0', '#f6c6a0'],
    [1.00, '#5fa8e0', '#b9e2f5'],
  ].map(([p, a, b]) => [p, hex(a), hex(b)]);
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  function skyAt(p) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (p >= a[0] && p <= b[0]) {
        const t = (p - a[0]) / ((b[0] - a[0]) || 1);
        return [mix(a[1], b[1], t), mix(a[2], b[2], t)];
      }
    }
    return [SKY[0][1], SKY[0][2]];
  }

  function nightness(p) {
    if (p < 0.52) return 0;
    if (p < 0.62) return (p - 0.52) / 0.1;
    if (p < 0.86) return 1;
    if (p < 0.95) return 1 - (p - 0.86) / 0.09;
    return 0;
  }

  function disc(cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(Math.round(cx - dx), Math.round(cy + dy), dx * 2 + 1, 1);
    }
  }

  function drawSky(p, night) {
    const [top, bot] = skyAt(p);
    const bands = 16;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = rgb(mix(top, bot, i / (bands - 1)));
      ctx.fillRect(0, Math.floor(i * H / bands), W, Math.ceil(H / bands) + 1);
    }
    // estrelas
    if (night > 0.05) {
      for (const s of stars) {
        const y = ((s.y + camY * 0.05) % 260 + 260) % 260 - 10;
        const blink = Math.sin(dayTime * 2 + s.tw * 20) > -0.6;
        if (!blink) continue;
        ctx.globalAlpha = night * (0.5 + s.tw * 0.5);
        ctx.fillStyle = '#fff6d5';
        ctx.fillRect(s.x, Math.floor(y), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    // sol ou lua
    if (p < 0.56) {
      const q = p / 0.56;
      const x = 16 + q * 168, y = 70 - Math.sin(Math.PI * q) * 50;
      disc(x, y, 7, '#ffd24a');
      disc(x, y, 5, '#fff0a6');
    } else {
      const q = (p - 0.56) / 0.44;
      const x = 16 + q * 168, y = 70 - Math.sin(Math.PI * q) * 50;
      disc(x, y, 5, '#e8e6d8');
      ctx.fillStyle = '#c4c1b0';
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 2, 2);
      ctx.fillRect(Math.round(x) + 1, Math.round(y) + 2, 1, 1);
    }
    // nuvens
    const cloudCol = night > 0.5 ? '#4b5079' : '#ffffff';
    const cloudShade = night > 0.5 ? '#3a3e63' : '#dbe9f2';
    for (const c of clouds) {
      const y = Math.floor(((c.y + camY * 0.2) % 260 + 260) % 260 - 20);
      const x = Math.floor(c.x);
      ctx.fillStyle = cloudShade;
      ctx.fillRect(x, y + 4, c.w, 3);
      ctx.fillStyle = cloudCol;
      ctx.fillRect(x + 2, y + 2, c.w - 4, 4);
      ctx.fillRect(x + 5, y, Math.floor(c.w / 3), 3);
      ctx.fillRect(x + Math.floor(c.w / 2), y - 1, Math.floor(c.w / 4), 3);
    }
  }

  function drawBackground(night) {
    // cidade distante
    const cy = GROUND_Y + camY * 0.4;
    if (cy - 60 < H) {
      const body = rgb(mix([143, 179, 201], [28, 34, 68], night));
      const roof = rgb(mix([120, 158, 182], [22, 27, 56], night));
      for (const b of city) {
        ctx.fillStyle = body;
        ctx.fillRect(b.x, Math.floor(cy - b.h), b.w, b.h + 40);
        ctx.fillStyle = roof;
        ctx.fillRect(b.x, Math.floor(cy - b.h), b.w, 1);
        if (night > 0.3) {
          ctx.fillStyle = '#ffd36b';
          ctx.globalAlpha = night;
          for (let wy = 4; wy < b.h - 3; wy += 5) {
            for (let wx = 2; wx < b.w - 2; wx += 3) {
              if (hash(b.seed * 31 + wx, wy) > 0.72) ctx.fillRect(b.x + wx, Math.floor(cy - b.h + wy), 1, 2);
            }
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    // morros
    const hy = GROUND_Y + camY * 0.7;
    if (hy - 30 < H) {
      ctx.fillStyle = rgb(mix([79, 138, 85], [26, 46, 40], night));
      for (let x = 0; x < W; x++) {
        const h = 10 + 6 * Math.sin(x * 0.045 + 1) + 4 * Math.sin(x * 0.13);
        ctx.fillRect(x, Math.floor(hy - h), 1, Math.ceil(h) + 40);
      }
    }
  }

  function drawGround(night) {
    const gy = GROUND_Y + camY;
    if (gy > H) return;
    ctx.fillStyle = rgb(mix([122, 82, 50], [52, 36, 26], night));
    ctx.fillRect(0, gy, W, H - gy + 1);
    ctx.fillStyle = rgb(mix([94, 61, 36], [40, 27, 19], night));
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash(i, 11) * W), y = gy + 4 + Math.floor(hash(i, 12) * 24);
      ctx.fillRect(x, y, 2, 1);
    }
    ctx.fillStyle = rgb(mix([92, 160, 74], [36, 66, 38], night));
    ctx.fillRect(0, gy, W, 3);
    ctx.fillStyle = rgb(mix([124, 195, 94], [48, 86, 50], night));
    ctx.fillRect(0, gy, W, 1);
    for (let x = 0; x < W; x += 3) if (hash(x, 13) > 0.5) ctx.fillRect(x, gy - 1, 1, 1);

    // pilha de tijolos
    const px = 10, py = gy;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4 - r; c++) {
        const x = px + c * 7 + r * 3, y = py - (r + 1) * 4;
        ctx.fillStyle = '#7d3423'; ctx.fillRect(x, y, 6, 4);
        ctx.fillStyle = '#b5523b'; ctx.fillRect(x, y, 6, 3);
        ctx.fillStyle = '#d07355'; ctx.fillRect(x, y, 6, 1);
      }
    }
    // sacos de cimento
    const sx = 164;
    for (let i = 0; i < 3; i++) {
      const x = sx + (i % 2) * 9 + (i === 2 ? 4 : 0), y = gy - (i === 2 ? 12 : 6);
      ctx.fillStyle = '#a8a294'; ctx.fillRect(x, y, 10, 6);
      ctx.fillStyle = '#d8d2c4'; ctx.fillRect(x, y, 10, 5);
      ctx.fillStyle = '#3b6fb6'; ctx.fillRect(x + 3, y + 2, 4, 1);
    }
    // fundação
    ctx.fillStyle = '#6e747a';
    ctx.fillRect(BX - 4, gy - FOUND_H, WALL_W + 8, FOUND_H + 2);
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(BX - 4, gy - FOUND_H, WALL_W + 8, FOUND_H - 1);
    ctx.fillStyle = '#b8bec4';
    ctx.fillRect(BX - 4, gy - FOUND_H, WALL_W + 8, 1);
  }

  // ---------- Prédio ----------
  const floorBase = i => GROUND_Y - FOUND_H - i * FLOOR_H + camY;

  function brickXY(k, base) {
    const row = Math.floor(k / COLS), col = k % COLS;
    return { x: BX + col * BW - (row % 2 ? BW / 2 : 0), y: base - (row + 1) * BH, row, col };
  }

  function drawBrickAt(x, y, colors) {
    ctx.fillStyle = MORTAR;
    ctx.fillRect(x, y, BW, BH);
    ctx.fillStyle = colors[0]; ctx.fillRect(x, y + 1, BW - 1, BH - 1);
    ctx.fillStyle = colors[1]; ctx.fillRect(x, y + 1, BW - 1, 1);
    ctx.fillStyle = colors[2]; ctx.fillRect(x, y + BH - 1, BW - 1, 1);
  }

  function drawWall(floor, base, count) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(BX, base - WALL_H, WALL_W, WALL_H);
    ctx.clip();
    for (let k = 0; k < count; k++) {
      if (inflight.has(k) && floor === S.floors) continue;
      const p = brickXY(k, base);
      const colors = BRICK_COLORS[Math.floor(hash(floor, k) * 3)];
      drawBrickAt(p.x, p.y, colors);
      if (p.row % 2 && p.col === COLS - 1) {
        drawBrickAt(p.x + BW, p.y, BRICK_COLORS[Math.floor(hash(floor, k + 500) * 3)]);
      }
    }
    ctx.restore();
  }

  function drawSlab(base) {
    const y = base - FLOOR_H;
    ctx.fillStyle = '#6e747a'; ctx.fillRect(BX - 3, y, WALL_W + 6, SLAB_H);
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(BX - 3, y, WALL_W + 6, SLAB_H - 1);
    ctx.fillStyle = '#b8bec4'; ctx.fillRect(BX - 3, y, WALL_W + 6, 1);
  }

  const glassRects = [];

  function drawWindow(x, y, w, h) {
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#7ec8e3';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c4ecf7';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + 2 + i, y + 2 + i, 1, 1);
      ctx.fillRect(x + w / 2 + 2 + i, y + 2 + i, 1, 1);
    }
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(x + w / 2, y, 1, h);
    ctx.fillRect(x, y + h / 2, w, 1);
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - 2, y + h + 1, w + 4, 2);
    glassRects.push([x, y, w, h, true]);
  }

  function drawDoor(x, base, ground) {
    const w = 18, h = 28, y = base - h;
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 1);
    if (ground) {
      ctx.fillStyle = '#7a4a2a'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#5e3820';
      ctx.fillRect(x + 3, y + 3, w - 6, 9);
      ctx.fillRect(x + 3, y + 15, w - 6, 10);
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(x + 4, y + 4, w - 8, 7);
      ctx.fillRect(x + 4, y + 16, w - 8, 8);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + w - 4, y + 14, 2, 2);
      ctx.fillStyle = '#9aa0a6'; ctx.fillRect(x - 3, base - 1, w + 6, 1);
    } else {
      ctx.fillStyle = '#7ec8e3'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(x + w / 2, y, 1, h);
      ctx.fillStyle = '#c4ecf7';
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 2 + i, y + 3 + i, 1, 1);
      glassRects.push([x, y, w, h, false]);
      // sacada
      ctx.fillStyle = '#9aa0a6'; ctx.fillRect(x - 5, base - 1, w + 10, 2);
      ctx.fillStyle = '#4a4f55';
      ctx.fillRect(x - 5, base - 10, w + 10, 1);
      for (let i = 0; i <= w + 10; i += 3) ctx.fillRect(x - 5 + i, base - 10, 1, 9);
    }
  }

  function drawFinishes(i, base) {
    const wins = Math.max(0, Math.min(2, S.owned.janela - i * 2));
    const door = S.owned.porta > i;
    const wy = base - WALL_H + 9;
    if (wins >= 1) drawWindow(BX + 12, wy, 20, 16);
    if (wins >= 2) drawWindow(BX + 68, wy, 20, 16);
    if (door) drawDoor(BX + 41, base, i === 0);
  }

  function drawScaffold(base) {
    const top = base - WALL_H - 6;
    for (const sx of [BX - 10, BX + WALL_W + 3]) {
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(sx, top, 1, base - top);
      ctx.fillRect(sx + 6, top, 1, base - top);
      ctx.fillStyle = '#b07a3e';
      for (let y = base - 14; y > top; y -= 14) ctx.fillRect(sx - 1, y, 9, 2);
      ctx.fillStyle = '#6b4320';
      for (let i = 0; i < 6; i++) ctx.fillRect(sx + i, base - 2 - i * 2, 1, 1);
    }
  }

  function drawGhost(base) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    const y0 = base - WALL_H;
    for (let x = BX; x < BX + WALL_W; x += 4) { ctx.fillRect(x, y0, 2, 1); }
    for (let y = y0; y < base; y += 4) { ctx.fillRect(BX, y, 1, 2); ctx.fillRect(BX + WALL_W - 1, y, 1, 2); }
    ctx.globalAlpha = 1;
  }

  function drawBuilding() {
    glassRects.length = 0;
    for (let i = 0; i <= S.floors; i++) {
      const base = floorBase(i);
      if (base - FLOOR_H > H + 4) continue;
      if (base < -12) break;
      if (i < S.floors) {
        drawWall(i, base, PER_FLOOR);
        drawSlab(base);
        drawFinishes(i, base);
      } else {
        drawScaffold(base);
        drawGhost(base);
        drawWall(i, base, visibleCount());
      }
    }
  }

  const visibleCount = () => Math.min(PER_FLOOR, Math.floor(S.bricks / need(S.floors) * PER_FLOOR));

  // ---------- Trabalhadores ----------
  function syncWorkers() {
    const want = [];
    for (const type of ['mestre', 'pedreiro', 'servente']) {
      const n = Math.min(S.owned[type], type === 'servente' ? 4 : 3);
      for (let i = 0; i < n; i++) want.push(type);
    }
    want.length = Math.min(want.length, 8);
    while (workers.length > want.length) workers.pop();
    for (let i = 0; i < want.length; i++) {
      if (!workers[i]) {
        workers[i] = { type: want[i], x: BX + 8 + Math.random() * (WALL_W - 20), dir: Math.random() < 0.5 ? -1 : 1, sp: 6 + Math.random() * 7, pause: 0, t: Math.random() * 10 };
      }
      workers[i].type = want[i];
    }
  }

  function updateWorkers(dt) {
    for (const w of workers) {
      w.t += dt;
      if (w.pause > 0) { w.pause -= dt; continue; }
      w.x += w.dir * w.sp * dt;
      if (w.x < BX + 2) { w.x = BX + 2; w.dir = 1; }
      if (w.x > BX + WALL_W - 7) { w.x = BX + WALL_W - 7; w.dir = -1; }
      if (Math.random() < dt * 0.35) w.pause = 0.6 + Math.random() * 1.6;
    }
  }

  function drawWorkers() {
    const feet = floorBase(S.floors);
    for (const w of workers) {
      const c = WORKER[w.type];
      const x = Math.round(w.x), y = Math.round(feet) - 9;
      const step = w.pause > 0 ? 0 : Math.floor(w.t * 6) % 2;
      ctx.fillStyle = c.helmet; ctx.fillRect(x + 1, y, 3, 1); ctx.fillRect(x, y + 1, 5, 1);
      ctx.fillStyle = '#e9b48a'; ctx.fillRect(x + 1, y + 2, 3, 2);
      ctx.fillStyle = '#1d1d1d'; ctx.fillRect(x + (w.dir > 0 ? 3 : 1), y + 2, 1, 1);
      ctx.fillStyle = c.vest; ctx.fillRect(x, y + 4, 5, 3);
      ctx.fillStyle = c.stripe; ctx.fillRect(x, y + 5, 5, 1);
      ctx.fillStyle = c.legs;
      if (step) { ctx.fillRect(x, y + 7, 1, 2); ctx.fillRect(x + 4, y + 7, 1, 2); ctx.fillRect(x + 1, y + 7, 3, 1); }
      else { ctx.fillRect(x + 1, y + 7, 1, 2); ctx.fillRect(x + 3, y + 7, 1, 2); }
      if (c.carry) {
        ctx.fillStyle = '#b5523b'; ctx.fillRect(x + (w.dir > 0 ? 3 : -1), y - 1, 4, 2);
        ctx.fillStyle = '#d07355'; ctx.fillRect(x + (w.dir > 0 ? 3 : -1), y - 1, 4, 1);
      } else if (w.type === 'pedreiro' && w.pause > 0 && Math.floor(w.t * 8) % 2) {
        ctx.fillStyle = '#c9d1d6'; ctx.fillRect(x + (w.dir > 0 ? 5 : -2), y + 3, 2, 2);
      } else if (w.type === 'mestre') {
        ctx.fillStyle = '#c9a26b'; ctx.fillRect(x + (w.dir > 0 ? 4 : -1), y + 4, 2, 3);
      }
    }
  }

  // ---------- Tijolos caindo e partículas ----------
  function spawnFalling(k) {
    const base = floorBase(S.floors);
    const p = brickXY(k, base);
    inflight.add(k);
    falling.push({ k, x: p.x, y: p.y - 70 - Math.random() * 20, ty: p.y, vy: 60, floor: S.floors, colors: BRICK_COLORS[Math.floor(hash(S.floors, k) * 3)] });
  }

  function updateFalling(dt) {
    const base = floorBase(S.floors);
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      if (f.floor !== S.floors) { falling.splice(i, 1); continue; }
      f.ty = brickXY(f.k, base).y;
      f.vy += 900 * dt;
      f.y += f.vy * dt;
      if (f.y >= f.ty) {
        inflight.delete(f.k);
        falling.splice(i, 1);
        dust(f.x + BW / 2, f.ty + BH, 4);
      }
    }
  }

  function drawFalling() {
    for (const f of falling) drawBrickAt(Math.round(f.x), Math.round(f.y), f.colors);
  }

  function dust(x, y, n, colors = ['#e6dccb', '#cfc1a8', '#b5a089']) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.4 + Math.random() * 0.3, c: colors[i % colors.length] });
    }
  }

  function confetti() {
    const cols = ['#f2c14e', '#c8553d', '#7ec8e3', '#7cc35e', '#f4f4f0'];
    for (let i = 0; i < 40; i++) {
      particles.push({ x: BX + Math.random() * WALL_W, y: floorBase(S.floors - 1) - FLOOR_H, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 90, life: 1 + Math.random() * 0.8, c: cols[i % cols.length], g: 160 });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += (p.g || 120) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }

  // ---------- Quadro ----------
  function targetCam() {
    const wallTop0 = GROUND_Y - FOUND_H - WALL_H;
    return Math.max(0, 96 - wallTop0 + S.floors * FLOOR_H);
  }

  function render(dt) {
    const p = (dayTime % DAY_LEN) / DAY_LEN;
    const night = nightness(p);
    ctx.save();
    if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 2), Math.round((Math.random() - 0.5) * 2));
    drawSky(p, night);
    drawBackground(night);
    drawGround(night);
    drawBuilding();
    drawWorkers();
    drawFalling();
    drawParticles();
    if (night > 0) {
      ctx.globalAlpha = night * 0.38;
      ctx.fillStyle = '#0a0e2a';
      ctx.fillRect(-2, -2, W + 4, H + 4);
      ctx.globalAlpha = 1;
      if (night > 0.2) {
        ctx.globalAlpha = Math.min(1, night * 1.2);
        for (const [x, y, w, h, mull] of glassRects) {
          ctx.fillStyle = '#ffd36b'; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#fff0b8'; ctx.fillRect(x + 1, y + 1, 3, 2);
          ctx.fillStyle = '#e8e4da';
          ctx.fillRect(x + w / 2, y, 1, h);
          if (mull) ctx.fillRect(x, y + h / 2, w, 1);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#fff6d5';
      ctx.fillRect(-2, -2, W + 4, H + 4);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ================================================================
  // Som (WebAudio, só depois do primeiro clique)
  // ================================================================
  let audio = null;
  function tone(freq, dur, type = 'square', vol = 0.05, when = 0) {
    if (S.muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + when;
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* sem áudio */ }
  }
  const sfx = {
    place: () => tone(150 + Math.random() * 60, 0.06, 'triangle', 0.12),
    floor: () => { tone(523, 0.12, 'square', 0.05); tone(659, 0.12, 'square', 0.05, 0.1); tone(784, 0.25, 'square', 0.05, 0.2); },
    buy: () => { tone(880, 0.06, 'square', 0.04); tone(1320, 0.1, 'square', 0.04, 0.06); },
    deny: () => tone(110, 0.12, 'sawtooth', 0.04),
  };

  // ================================================================
  // Interface (DOM)
  // ================================================================
  const $ = id => document.getElementById(id);
  const screenEl = $('screen'), fxEl = $('fx'), hintEl = $('hint'), toastsEl = $('toasts');

  function floatText(text, x, y, cls = '') {
    const el = document.createElement('span');
    el.className = 'float ' + cls;
    el.textContent = text;
    el.style.left = (x / W * 100) + '%';
    el.style.top = (y / H * 100) + '%';
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    toastsEl.appendChild(el);
    while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
    setTimeout(() => el.remove(), 3100);
  }

  function onFloorComplete(done, earned) {
    flash = 0.6; shake = 0.25;
    confetti();
    sfx.floor();
    floatText('+' + money(earned), W / 2, 110, 'money');
    toast(done > 1 ? `${done} pavimentos concluídos!` : `${ordinal(S.floors)} pavimento concluído!`);
    if (S.floors === 1) toast('Agora você recebe aluguel. Compre janelas!');
  }

  function placeBrick(clientX, clientY) {
    S.clicks++;
    const before = visibleCount();
    const n = perClick();
    const done = addBricks(n, true);
    sfx.place();
    if (!done) {
      const after = visibleCount();
      for (let k = before; k < after && k < before + 4; k++) spawnFalling(k);
    }
    let x = W / 2, y = 120;
    if (clientX != null) {
      const r = canvas.getBoundingClientRect();
      x = (clientX - r.left) / r.width * W;
      y = (clientY - r.top) / r.height * H;
    }
    floatText('+' + fmt(n), x, y);
    if (S.clicks >= 12) hintEl.hidden = true;
    updateHud();
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    placeBrick(e.clientX, e.clientY);
  });
  canvas.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) placeBrick();
    }
  });

  // ---------- Loja ----------
  const shopEl = $('shop');
  const rows = {};

  function buildShop() {
    shopEl.textContent = '';
    let cat = null;
    for (const it of ITEMS) {
      if (it.cat !== cat) {
        cat = it.cat;
        const h = document.createElement('h2');
        h.className = 'shop-cat';
        h.textContent = cat;
        shopEl.appendChild(h);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item';
      btn.id = 'buy-' + it.id;
      const icon = iconCanvas(it.id);
      const text = document.createElement('span');
      text.className = 'item-text';
      const name = document.createElement('span');
      name.className = 'item-name';
      const desc = document.createElement('span');
      desc.className = 'item-desc';
      const costEl = document.createElement('span');
      costEl.className = 'item-cost';
      text.append(name, desc, costEl);
      const owned = document.createElement('span');
      owned.className = 'item-owned';
      btn.append(icon, text, owned);
      btn.addEventListener('click', () => buy(it));
      shopEl.appendChild(btn);
      rows[it.id] = { btn, icon, name, desc, costEl, owned, mystery: null };
    }
  }

  function buy(it) {
    const c = cost(it);
    const lim = it.limit ? it.limit() : Infinity;
    if (S.money < c || S.owned[it.id] >= lim) { sfx.deny(); return; }
    S.money -= c;
    S.owned[it.id]++;
    sfx.buy();
    if (it.bps) syncWorkers();
    if (S.owned[it.id] === 1) {
      const msgs = { servente: 'O servente chegou na obra!', pedreiro: 'Um pedreiro entrou na equipe!', mestre: 'O mestre de obras assumiu!', janela: 'Primeira janela instalada!', porta: 'Primeira porta instalada!', colher: 'Colher nova: mais tijolos por clique!' };
      toast(msgs[it.id]);
    }
    updateHud(true);
  }

  function updateShop() {
    for (const it of ITEMS) {
      const r = rows[it.id];
      const c = cost(it);
      const lim = it.limit ? it.limit() : Infinity;
      const known = S.seen[it.id] || S.owned[it.id] > 0 || S.totalMoney >= it.base * 0.5;
      if (known) S.seen[it.id] = true;
      const mystery = !known;
      if (r.mystery !== mystery) {
        r.mystery = mystery;
        r.btn.classList.toggle('mystery', mystery);
        const g = r.icon.getContext('2d');
        g.clearRect(0, 0, 12, 12);
        drawSprite(g, ICONS[mystery ? 'mystery' : it.id], 0, 0, 1);
        r.name.textContent = mystery ? '???' : it.name;
        r.desc.textContent = mystery ? 'Junte mais dinheiro para descobrir' : it.desc;
      }
      const atLimit = S.owned[it.id] >= lim;
      if (mystery) {
        r.costEl.textContent = money(c);
        r.costEl.classList.remove('locked');
      } else if (atLimit) {
        r.costEl.textContent = S.floors === 0 ? 'Termine o 1º pavimento' : `Limite: ${it.limitMsg}`;
        r.costEl.classList.add('locked');
      } else {
        r.costEl.textContent = money(c);
        r.costEl.classList.remove('locked');
      }
      r.btn.disabled = mystery || atLimit || S.money < c;
      r.owned.textContent = S.owned[it.id] > 0 ? S.owned[it.id] : '';
      r.btn.setAttribute('aria-label', mystery ? 'Item desconhecido' : `${it.name}, ${it.desc}, custa ${money(c)}, você tem ${S.owned[it.id]}`);
    }
  }

  // ---------- Painel ----------
  function updateHud() {
    $('st-money').textContent = money(S.money);
    $('st-rent').textContent = money(rent()) + '/s';
    $('st-bps').textContent = fmt(bps());
    $('st-click').textContent = fmt(perClick());
    const nd = need(S.floors);
    $('pv-name').textContent = ordinal(S.floors + 1) + ' pavimento';
    $('pv-count').textContent = `${fmt(Math.floor(S.bricks))} / ${fmt(nd)} tijolos`;
    $('pv-fill').style.width = Math.min(100, S.bricks / nd * 100) + '%';
    updateShop();
  }

  // ---------- Rodapé ----------
  const soundBtn = $('btn-sound');
  function updateSoundBtn() { soundBtn.textContent = S.muted ? 'Som: desligado' : 'Som: ligado'; }
  soundBtn.addEventListener('click', () => { S.muted = !S.muted; updateSoundBtn(); save(); });

  $('btn-save').addEventListener('click', () => { save(); toast('Jogo salvo!'); });

  const resetWrap = $('reset-wrap');
  function showResetIdle() {
    resetWrap.textContent = '';
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'btn-reset'; b.textContent = 'Recomeçar';
    b.addEventListener('click', showResetConfirm);
    resetWrap.appendChild(b);
  }
  function showResetConfirm() {
    resetWrap.textContent = '';
    const q = document.createElement('span'); q.textContent = 'Apagar tudo?';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'danger'; yes.textContent = 'Sim, recomeçar';
    const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Não';
    yes.addEventListener('click', () => {
      const muted = S.muted;
      S = fresh(); S.muted = muted;
      workers.length = 0; falling.length = 0; inflight.clear(); particles.length = 0;
      camY = 0; hintEl.hidden = false;
      for (const id in rows) rows[id].mystery = null;
      save(); updateHud(); showResetIdle();
      toast('Obra nova começando!');
    });
    no.addEventListener('click', showResetIdle);
    resetWrap.append(q, yes, no);
    no.focus();
  }
  $('btn-reset').addEventListener('click', showResetConfirm);

  // ================================================================
  // Salvar / carregar
  // ================================================================
  function save() {
    S.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* armazenamento indisponível */ }
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      const base = fresh();
      S = Object.assign(base, d, { owned: Object.assign(base.owned, d.owned || {}), seen: d.seen || {} });
    } catch (e) { S = fresh(); }
  }

  function showOffline(gain, secs) {
    const h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60);
    const time = h > 0 ? `${h}h ${m}min` : `${m} min`;
    const parts = [`Você ficou fora por ${time}.`, `Sua equipe assentou ${fmt(gain.bricks)} tijolos`];
    let txt = parts.join(' ');
    txt += gain.floors > 0 ? ` e concluiu ${gain.floors} pavimento${gain.floors > 1 ? 's' : ''}.` : '.';
    txt += ` Você ganhou ${money(gain.money)}.`;
    $('offline-text').textContent = txt;
    $('offline').hidden = false;
    $('offline-ok').focus();
  }
  $('offline-ok').addEventListener('click', () => { $('offline').hidden = true; canvas.focus(); });

  // ================================================================
  // Laço principal
  // ================================================================
  let last = performance.now();
  let hudTimer = 0, saveTimer = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 2) {
      // aba ficou em segundo plano: aplica o tempo perdido de uma vez
      simulate(Math.min(dt, OFFLINE_MAX));
      dt = 0;
    }
    dt = Math.min(dt, 0.1);

    if (dt > 0) {
      const b = bps();
      if (b > 0) addBricks(b * dt, true);
      addMoney(rent() * dt);
    }

    dayTime += dt;
    camY += (targetCam() - camY) * Math.min(1, dt * 4);
    flash = Math.max(0, flash - dt * 1.5);
    shake = Math.max(0, shake - dt);
    updateWorkers(dt);
    updateFalling(dt);
    updateParticles(dt);
    render(dt);

    hudTimer += dt;
    if (hudTimer > 0.1) { hudTimer = 0; updateHud(); }
    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; save(); }

    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  // ================================================================
  // Início
  // ================================================================
  function start() {
    const logo = $('logo-icon');
    drawSprite(logo.getContext('2d'), ICONS.brick, 0, 0, 1);
    load();
    buildShop();
    syncWorkers();
    updateSoundBtn();
    if (S.clicks >= 12 || S.floors > 0) hintEl.hidden = true;

    const away = Math.min((Date.now() - (S.lastSave || Date.now())) / 1000, OFFLINE_MAX);
    if (away > 30 && (bps() > 0 || rent() > 0)) {
      const gain = simulate(away);
      showOffline(gain, away);
    }
    camY = targetCam();
    updateHud();
    save();
    requestAnimationFrame(t => { last = t; frame(t); });
  }

  start();
})();
