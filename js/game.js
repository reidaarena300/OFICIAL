/* Tijolo Clicker v0.2 — clique, assente tijolos, feche pavimentos, ganhe aluguel e enfrente os imprevistos da obra. */
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
    { id: 'lona',     cat: 'Segurança',   name: 'Lona de proteção',   desc: 'A chuva não para a equipe',     base: 250,  growth: 1, once: true, limit: () => 1 },
    { id: 'epi',      cat: 'Segurança',   name: 'Kit de EPI',         desc: 'O fiscal sempre aprova a obra', base: 600,  growth: 1, once: true, limit: () => 1 },
    { id: 'laudo',    cat: 'Segurança',   name: 'Laudo do engenheiro', desc: 'Evita rachaduras na obra',     base: 1500, growth: 1, once: true, limit: () => 1 },
  ];

  const fresh = () => ({
    v: 1, bricks: 0, floors: 0, money: 0,
    totalBricks: 0, totalMoney: 0, clicks: 0,
    owned: { colher: 0, servente: 0, pedreiro: 0, mestre: 0, janela: 0, porta: 0, lona: 0, epi: 0, laudo: 0 },
    stats: { cranes: 0, cracks: 0, inspections: 0, fines: 0, choices: 0 },
    seen: {}, muted: false, lastSave: Date.now(),
  });
  let S = fresh();

  const cost = it => Math.floor(it.base * Math.pow(it.growth, S.owned[it.id]));
  const perClick = () => 1 + S.owned.colher;
  const bps = () => ITEMS.reduce((a, it) => a + (it.bps || 0) * S.owned[it.id], 0);
  const rentMult = () => 1 + 0.15 * S.owned.janela + 0.35 * S.owned.porta;
  const rent = () => baseRent(S.floors) * rentMult();

  // ================================================================
  // Eventos (estado só em memória; não é salvo)
  // ================================================================
  const rand = (a, b) => a + Math.random() * (b - a);
  const EV = {
    effects: [], crane: null, crack: null, inspector: null, choice: null, pendingCrack: null,
    nextCrane: 25, nextBad: 75, nextChoice: 130, drops: [],
  };
  const effMult = key => EV.effects.reduce((m, e) => m * (e[key] || 1), 1);
  const clickPower = () => perClick() * effMult('click');
  const bpsNow = () => bps() * effMult('bps');
  const rentNow = () => rent() * effMult('rent') * (EV.crack ? 0.7 : 1);
  const hasEffect = id => EV.effects.some(e => e.id === id);

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
    lona: sprite([
      '............',
      'hbbbbbbbbbbh',
      'bBbbbbbbbbbb',
      'bbBbbbbbbbbb',
      'bbbBbbbbbbbb',
      'bbbbBbbbbbbb',
      'bbbbbBbbbbbb',
      'bbbbbbBbbbbb',
      'bbbbbbbBbbbb',
      'hbbbbbbbBbbh',
      '.k........k.',
      '.k........k.',
    ]),
    epi: sprite([
      '....yyyy....',
      '..yyyhyyyy..',
      '.yyyyyyyyyy.',
      'kkkkkkkkkkkk',
      '............',
      '.ooo....ooo.',
      'oooooooooooo',
      'ohhhhhhhhhho',
      'oooooooooooo',
      'ohhhhhhhhhho',
      'oooooooooooo',
      '.oooooooooo.',
    ]),
    laudo: sprite([
      '.hhhhhhhh...',
      '.hkkkkkkhh..',
      '.hhhhhhhhhh.',
      '.hkkkkkkkkh.',
      '.hhhhhhhhhh.',
      '.hkkkkkhhhh.',
      '.hhhhhhhhhh.',
      '.hhhhhrrrhh.',
      '.hkkhrhhhrh.',
      '.hhhhrhhhrh.',
      '.hhhhhrrrhh.',
      '.hhhhhhhhhh.',
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

  // ================================================================
  // Eventos da obra
  // ================================================================
  function addEffect(e) {
    const i = EV.effects.findIndex(x => x.id === e.id);
    const fx = Object.assign({}, e, { t: e.dur });
    if (i >= 0) EV.effects[i] = fx; else EV.effects.push(fx);
  }

  // ---------- Guindaste com material (evento bom, clicável) ----------
  function spawnCrane() {
    EV.crane = { t: 0, life: 13, x: BX + 22 + Math.random() * (WALL_W - 44), y: -30, phase: Math.random() * 6, gone: false };
    sfx.crane();
    if (!S.stats.cranes) toast('O guindaste trouxe material! Clique nele!');
  }

  const craneX = c => c.x + Math.sin(c.t * 1.7 + c.phase) * 6;

  function updateCrane(dt) {
    const c = EV.crane;
    if (!c) return;
    c.t += dt;
    const hover = 44;
    if (c.gone || c.t > c.life) c.y -= 90 * dt;
    else c.y += (hover - c.y) * Math.min(1, dt * 2.5);
    if ((c.gone || c.t > c.life) && c.y < -34) EV.crane = null;
  }

  function hitCrane(x, y) {
    const c = EV.crane;
    if (!c || c.gone) return false;
    const cx = craneX(c);
    return x > cx - 15 && x < cx + 15 && y > c.y - 6 && y < c.y + 18;
  }

  function collectCrane() {
    const c = EV.crane;
    c.gone = true;
    S.stats.cranes++;
    const cx = craneX(c);
    const r = Math.random();
    sfx.collect();
    dust(cx, c.y + 8, 12, ['#f2c14e', '#fff0a6', '#ffffff']);
    if (r < 0.45) {
      const n = Math.ceil(Math.max(25 * perClick(), 40 * bps()));
      addBricks(n, true);
      floatText('+' + fmt(n) + ' tijolos', cx, c.y + 10, 'money');
      toast(`Entrega de material: +${fmt(n)} tijolos!`);
    } else if (r < 0.8) {
      const m = Math.ceil(Math.max(30 + 10 * S.floors, 75 * rent()));
      addMoney(m);
      floatText('+' + money(m), cx, c.y + 10, 'money');
      toast(`Material revendido: +${money(m)}!`);
    } else {
      addEffect({ id: 'estagiario', label: 'Estagiário animado', kind: 'good', dur: 15, click: 7, desc: 'cliques ×7' });
      floatText('Cliques ×7!', cx, c.y + 10, 'money');
      toast('Estagiário animado: cliques ×7 por 15s!');
    }
  }

  function drawCrane() {
    const c = EV.crane;
    if (!c) return;
    const x = Math.round(craneX(c)), y = Math.round(c.y);
    // cabo vindo do topo da tela
    ctx.fillStyle = '#3b3b46';
    ctx.fillRect(x, -2, 1, y + 2);
    // gancho
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillStyle = '#3b3b46'; ctx.fillRect(x - 6, y + 2, 1, 4); ctx.fillRect(x + 6, y + 2, 1, 4);
    ctx.fillRect(x - 6, y + 2, 13, 1);
    // tijolos no palete
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        const bx = x - 9 + k * 6 + (r % 2 ? 1 : 0), by = y + 6 + r * 3;
        ctx.fillStyle = '#7d3423'; ctx.fillRect(bx, by, 6, 3);
        ctx.fillStyle = '#b5523b'; ctx.fillRect(bx, by, 5, 2);
        ctx.fillStyle = '#d07355'; ctx.fillRect(bx, by, 5, 1);
      }
    }
    // palete de madeira
    ctx.fillStyle = '#a0652f'; ctx.fillRect(x - 10, y + 15, 21, 2);
    ctx.fillStyle = '#6e4220'; ctx.fillRect(x - 9, y + 17, 2, 1); ctx.fillRect(x - 1, y + 17, 2, 1); ctx.fillRect(x + 7, y + 17, 2, 1);
    // brilho piscando para chamar atenção
    if (!c.gone && Math.floor(c.t * 3) % 2 === 0) {
      ctx.fillStyle = '#fff0a6';
      ctx.fillRect(x - 13, y + 4, 1, 3); ctx.fillRect(x - 14, y + 5, 3, 1);
      ctx.fillRect(x + 13, y + 9, 1, 3); ctx.fillRect(x + 12, y + 10, 3, 1);
    }
  }

  // ---------- Rachadura (evento ruim, clicável) ----------
  const CRACK = [[3, 0], [4, 1], [3, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 7], [3, 8], [4, 9], [5, 10], [6, 11], [5, 3], [6, 4], [7, 4], [2, 7], [1, 8], [0, 9]];

  function spawnCrack() {
    if (S.floors < 1 || EV.crack || S.owned.laudo) return false;
    EV.crack = { x: BX + 8 + Math.floor(Math.random() * (WALL_W - 24)), yo: 6 + Math.floor(Math.random() * 20), hp: 6, t: 0 };
    sfx.crack();
    shake = 0.3;
    toast('Rachadura! Aluguel −30%. Clique nela para consertar.');
    return true;
  }

  const crackPos = () => ({ x: EV.crack.x, y: Math.round(floorBase(S.floors - 1) - WALL_H + EV.crack.yo) });

  function hitCrack(x, y) {
    if (!EV.crack) return false;
    const p = crackPos();
    return x > p.x - 6 && x < p.x + 14 && y > p.y - 6 && y < p.y + 18;
  }

  function repairCrack() {
    const p = crackPos();
    EV.crack.hp--;
    dust(p.x + 4, p.y + 6, 6);
    if (EV.crack.hp <= 0) {
      EV.crack = null;
      S.stats.cracks++;
      sfx.buy();
      floatText('Consertado!', p.x + 4, p.y, 'money');
      toast('Rachadura consertada! O aluguel voltou ao normal.');
    } else {
      sfx.fix();
      floatText('Reboco! ' + EV.crack.hp, p.x + 4, p.y);
    }
  }

  function drawCrack() {
    const c = EV.crack;
    if (!c) return;
    c.t += 1 / 60;
    const p = crackPos();
    const n = Math.ceil(CRACK.length * c.hp / 6);
    ctx.fillStyle = '#2b1d14';
    for (let i = 0; i < n; i++) ctx.fillRect(p.x + CRACK[i][0], p.y + CRACK[i][1], 2, 1);
    ctx.fillStyle = '#5e3820';
    for (let i = 0; i < n; i++) ctx.fillRect(p.x + CRACK[i][0] + 2, p.y + CRACK[i][1], 1, 1);
    if (Math.floor(c.t * 3) % 2 === 0) {
      ctx.fillStyle = '#ff4d3d';
      const x0 = p.x - 3, y0 = p.y - 3, x1 = p.x + 10, y1 = p.y + 14;
      ctx.fillRect(x0, y0, 3, 1); ctx.fillRect(x0, y0, 1, 3);
      ctx.fillRect(x1 - 2, y0, 3, 1); ctx.fillRect(x1, y0, 1, 3);
      ctx.fillRect(x0, y1, 3, 1); ctx.fillRect(x0, y1 - 2, 1, 3);
      ctx.fillRect(x1 - 2, y1, 3, 1); ctx.fillRect(x1, y1 - 2, 1, 3);
    }
  }

  // ---------- Chuva (evento ruim) ----------
  function startRain() {
    const protectedByLona = S.owned.lona > 0;
    addEffect(protectedByLona
      ? { id: 'chuva', label: 'Chuva', kind: 'neutral', dur: 30, desc: 'a lona protege a equipe', rain: true }
      : { id: 'chuva', label: 'Chuva', kind: 'bad', dur: 30, bps: 0.5, desc: 'equipe −50%', rain: true });
    toast(protectedByLona ? 'Começou a chover. A lona protegeu a obra!' : 'Chuva! A equipe trabalha na metade do ritmo.');
    if (!EV.drops.length) {
      for (let i = 0; i < 80; i++) EV.drops.push({ x: Math.random() * (W + 40), y: Math.random() * H, sp: 160 + Math.random() * 80 });
    }
  }

  function updateRain(dt) {
    if (!hasEffect('chuva')) return;
    for (const d of EV.drops) {
      d.y += d.sp * dt; d.x -= d.sp * 0.25 * dt;
      if (d.y > H) { d.y = -4; d.x = Math.random() * (W + 40); }
    }
  }

  function drawRain() {
    const e = EV.effects.find(x => x.id === 'chuva');
    if (!e) return;
    const fade = Math.min(1, Math.min(e.t, e.dur - e.t) / 2);
    ctx.globalAlpha = 0.22 * fade;
    ctx.fillStyle = '#2a3445';
    ctx.fillRect(-2, -2, W + 4, H + 4);
    ctx.globalAlpha = 0.7 * fade;
    ctx.fillStyle = '#a9c8e8';
    for (const d of EV.drops) { ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3); }
    ctx.globalAlpha = 1;
  }

  // ---------- Fiscal da prefeitura (evento ruim ou bom, depende do EPI) ----------
  function startInspector() {
    EV.inspector = { x: BX - 8, state: 'in', t: 0, dir: 1 };
    sfx.whistle();
    toast('O fiscal da prefeitura chegou para vistoriar a obra.');
  }

  function updateInspector(dt) {
    const f = EV.inspector;
    if (!f) return;
    f.t += dt;
    const mid = BX + WALL_W / 2 - 3;
    if (f.state === 'in') {
      f.x += 16 * dt;
      if (f.x >= mid) { f.x = mid; f.state = 'check'; f.t = 0; }
    } else if (f.state === 'check') {
      if (f.t > 3) { verdict(); f.state = 'out'; f.t = 0; }
    } else {
      f.x += 22 * dt;
      if (f.x > BX + WALL_W + 4) EV.inspector = null;
    }
  }

  function verdict() {
    S.stats.inspections++;
    const fx = BX + WALL_W / 2, fy = floorBase(S.floors) - 20;
    if (S.owned.epi) {
      const bonus = Math.ceil(Math.max(40, 90 * rent()));
      addMoney(bonus);
      sfx.collect();
      floatText('+' + money(bonus), fx, fy, 'money');
      toast(`Fiscal: obra exemplar, todos com EPI! Bônus de ${money(bonus)}.`);
    } else {
      const fine = Math.floor(Math.min(S.money * 0.2, Math.max(20, rent() * 120)));
      S.money -= fine;
      S.stats.fines++;
      sfx.deny();
      floatText('−' + money(fine), fx, fy, 'bad');
      toast(fine > 0 ? `Multa: equipe sem EPI! −${money(fine)}. Compre o Kit de EPI.` : 'Fiscal: equipe sem EPI. Desta vez foi só advertência.');
    }
  }

  function drawInspector() {
    const f = EV.inspector;
    if (!f) return;
    const x = Math.round(f.x), y = Math.round(floorBase(S.floors)) - 10;
    const step = f.state === 'check' ? 0 : Math.floor(f.t * 6) % 2;
    ctx.fillStyle = '#1f3b73'; ctx.fillRect(x, y, 5, 2); ctx.fillRect(x - 1, y + 2, 7, 1);   // chapéu
    ctx.fillStyle = '#e9b48a'; ctx.fillRect(x + 1, y + 3, 3, 2);
    ctx.fillStyle = '#1d1d1d'; ctx.fillRect(x + 3, y + 3, 1, 1);
    ctx.fillStyle = '#2f3542'; ctx.fillRect(x, y + 5, 5, 3);                                  // terno
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(x + 2, y + 5, 1, 2);
    ctx.fillStyle = '#c9a26b'; ctx.fillRect(x + 5, y + 5, 2, 3);                              // prancheta
    ctx.fillStyle = '#2b2b33';
    if (step) { ctx.fillRect(x, y + 8, 1, 2); ctx.fillRect(x + 4, y + 8, 1, 2); ctx.fillRect(x + 1, y + 8, 3, 1); }
    else { ctx.fillRect(x + 1, y + 8, 1, 2); ctx.fillRect(x + 3, y + 8, 1, 2); }
    if (f.state === 'check') {
      // balão "..."
      ctx.fillStyle = '#f4f4f0'; ctx.fillRect(x - 2, y - 9, 11, 6); ctx.fillRect(x + 1, y - 3, 2, 2);
      ctx.fillStyle = '#2b1d14';
      const dots = 1 + Math.floor(f.t * 2) % 3;
      for (let i = 0; i < dots; i++) ctx.fillRect(x + i * 3, y - 7, 1, 2);
    }
  }

  // ---------- Eventos de escolha ----------
  function makeChoice() {
    const opts = [];
    if (S.bricks > need(S.floors) * 0.3) {
      const pay = reward(S.floors) * 2;
      opts.push({
        title: 'Mudança de planta',
        text: `O cliente quer mudar a planta deste pavimento. Você desmancha 40% dos tijolos assentados, mas ele paga ${money(pay)} na hora.`,
        yes: () => { S.bricks *= 0.6; addMoney(pay); toast(`Planta alterada! +${money(pay)}.`); },
      });
    }
    if (bps() > 0) {
      const price = Math.max(30, Math.floor(rent() * 40 + bps() * 10));
      if (S.money >= price) {
        const risk = !S.owned.laudo;
        opts.push({
          title: 'Material barato',
          text: `Um fornecedor oferece tijolo pela metade do preço: ${money(price)} e a equipe rende o dobro por 60s.` + (risk ? ' Mas o material pode causar rachaduras.' : ' Seu laudo garante a qualidade.'),
          yes: () => {
            if (S.money < price) { toast('Dinheiro insuficiente.'); return; }
            S.money -= price;
            addEffect({ id: 'fornecedor', label: 'Material barato', kind: 'good', dur: 60, bps: 2, desc: 'equipe ×2' });
            toast('Material comprado: equipe ×2 por 60s!');
            if (risk && Math.random() < 0.4) EV.pendingCrack = 8 + Math.random() * 10;
          },
        });
      }
      opts.push({
        title: 'Hora extra',
        text: 'A equipe topa fazer hora extra no fim de semana: rende o triplo por 30s, mas depois fica cansada e rende a metade por 30s.',
        yes: () => {
          addEffect({ id: 'horaextra', label: 'Hora extra', kind: 'good', dur: 30, bps: 3, desc: 'equipe ×3',
            then: { id: 'cansada', label: 'Equipe cansada', kind: 'bad', dur: 30, bps: 0.5, desc: 'equipe −50%' } });
          toast('Hora extra: equipe ×3 por 30s!');
        },
      });
    }
    if (!opts.length) return null;
    return opts[Math.floor(Math.random() * opts.length)];
  }

  const choiceEl = document.getElementById('choice');
  function openChoice() {
    const c = makeChoice();
    if (!c) return;
    EV.choice = Object.assign(c, { t: 20, dur: 20 });
    document.getElementById('choice-title').textContent = c.title;
    document.getElementById('choice-text').textContent = c.text;
    choiceEl.hidden = false;
    sfx.crane();
  }
  function closeChoice(accept) {
    const c = EV.choice;
    if (!c) return;
    EV.choice = null;
    choiceEl.hidden = true;
    S.stats.choices++;
    if (accept) { c.yes(); sfx.buy(); }
  }
  document.getElementById('choice-yes').addEventListener('click', () => closeChoice(true));
  document.getElementById('choice-no').addEventListener('click', () => closeChoice(false));

  // ---------- Agendador ----------
  function startBadEvent() {
    const opts = [];
    if (!hasEffect('chuva')) opts.push(startRain);
    if (!EV.crack && !S.owned.laudo && S.floors >= 1) opts.push(spawnCrack);
    if (!EV.inspector) opts.push(startInspector);
    if (opts.length) opts[Math.floor(Math.random() * opts.length)]();
  }

  function updateEvents(dt) {
    for (let i = EV.effects.length - 1; i >= 0; i--) {
      const e = EV.effects[i];
      e.t -= dt;
      if (e.t <= 0) {
        EV.effects.splice(i, 1);
        if (e.then) { addEffect(e.then); toast(`${e.then.label}: ${e.then.desc} por ${e.then.dur}s.`); }
      }
    }
    updateCrane(dt);
    updateInspector(dt);
    updateRain(dt);
    if (EV.choice) {
      EV.choice.t -= dt;
      document.getElementById('choice-bar').style.width = Math.max(0, EV.choice.t / EV.choice.dur * 100) + '%';
      if (EV.choice.t <= 0) closeChoice(false);
    }
    if (EV.pendingCrack != null) {
      EV.pendingCrack -= dt;
      if (EV.pendingCrack <= 0) { EV.pendingCrack = null; spawnCrack(); }
    }
    if (S.floors < 1 || !document.getElementById('offline').hidden) return;
    EV.nextCrane -= dt;
    if (EV.nextCrane <= 0 && !EV.crane) { spawnCrane(); EV.nextCrane = rand(50, 110); }
    EV.nextBad -= dt;
    if (EV.nextBad <= 0) { startBadEvent(); EV.nextBad = rand(80, 160); }
    EV.nextChoice -= dt;
    if (EV.nextChoice <= 0 && !EV.choice) { openChoice(); EV.nextChoice = rand(140, 240); }
  }

  function resetEvents() {
    EV.effects.length = 0; EV.crane = null; EV.crack = null; EV.inspector = null; EV.pendingCrack = null;
    if (EV.choice) { EV.choice = null; choiceEl.hidden = true; }
    EV.nextCrane = 25; EV.nextBad = 75; EV.nextChoice = 130;
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
    drawCrack();
    drawWorkers();
    drawInspector();
    drawFalling();
    drawCrane();
    drawParticles();
    drawRain();
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
    crane: () => { tone(660, 0.08, 'square', 0.04); tone(990, 0.12, 'square', 0.04, 0.1); },
    collect: () => { tone(784, 0.07, 'square', 0.04); tone(1047, 0.07, 'square', 0.04, 0.07); tone(1568, 0.15, 'square', 0.04, 0.14); },
    crack: () => { tone(90, 0.25, 'sawtooth', 0.06); tone(60, 0.3, 'sawtooth', 0.05, 0.08); },
    fix: () => tone(320 + Math.random() * 60, 0.05, 'triangle', 0.1),
    whistle: () => { tone(1800, 0.12, 'sine', 0.05); tone(1500, 0.2, 'sine', 0.05, 0.14); },
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
    const n = clickPower();
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
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (hitCrane(x, y)) { collectCrane(); updateHud(); return; }
    if (hitCrack(x, y)) { repairCrack(); updateHud(); return; }
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
    if (it.id === 'laudo' && EV.crack) { EV.crack = null; toast('O engenheiro mandou consertar a rachadura.'); }
    if (S.owned[it.id] === 1) {
      const msgs = { lona: 'Lona pronta: a chuva não atrapalha mais.', epi: 'Equipe equipada: o fiscal vai aprovar!', laudo: 'Laudo emitido: sem rachaduras na obra.', servente: 'O servente chegou na obra!', pedreiro: 'Um pedreiro entrou na equipe!', mestre: 'O mestre de obras assumiu!', janela: 'Primeira janela instalada!', porta: 'Primeira porta instalada!', colher: 'Colher nova: mais tijolos por clique!' };
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
      } else if (atLimit && it.once) {
        r.costEl.textContent = 'Comprado';
        r.costEl.classList.add('locked');
      } else if (atLimit) {
        r.costEl.textContent = S.floors === 0 ? 'Termine o 1º pavimento' : `Limite: ${it.limitMsg}`;
        r.costEl.classList.add('locked');
      } else {
        r.costEl.textContent = money(c);
        r.costEl.classList.remove('locked');
      }
      r.btn.disabled = mystery || atLimit || S.money < c;
      r.owned.textContent = S.owned[it.id] > 0 ? (it.once ? '✓' : S.owned[it.id]) : '';
      r.btn.setAttribute('aria-label', mystery ? 'Item desconhecido' : `${it.name}, ${it.desc}, custa ${money(c)}, você tem ${S.owned[it.id]}`);
    }
  }

  // ---------- Painel ----------
  function setStat(id, text, ratio) {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle('up', ratio > 1.001);
    el.classList.toggle('down', ratio < 0.999);
  }

  const effectsEl = $('effects');
  let effectsSig = '';
  function renderEffects() {
    const list = EV.effects.map(e => ({ kind: e.kind, text: `${e.label} · ${e.desc} · ${Math.ceil(e.t)}s` }));
    if (EV.crack) list.push({ kind: 'bad', text: 'Rachadura · aluguel −30% · clique nela' });
    if (EV.inspector) list.push({ kind: S.owned.epi ? 'good' : 'bad', text: 'Fiscal vistoriando a obra' });
    const sig = list.map(c => c.kind + c.text).join('|');
    if (sig === effectsSig) return;
    effectsSig = sig;
    effectsEl.textContent = '';
    for (const c of list) {
      const el = document.createElement('span');
      el.className = 'chip ' + c.kind;
      el.textContent = c.text;
      effectsEl.appendChild(el);
    }
    effectsEl.hidden = list.length === 0;
  }

  function updateHud() {
    $('st-money').textContent = money(S.money);
    setStat('st-rent', money(rentNow()) + '/s', rentNow() / (rent() || 1));
    setStat('st-bps', fmt(bpsNow()), bpsNow() / (bps() || 1));
    setStat('st-click', fmt(clickPower()), effMult('click'));
    renderEffects();
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
      resetEvents();
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
      S = Object.assign(base, d, { owned: Object.assign(base.owned, d.owned || {}), stats: Object.assign(base.stats, d.stats || {}), seen: d.seen || {} });
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
      const b = bpsNow();
      if (b > 0) addBricks(b * dt, true);
      addMoney(rentNow() * dt);
    }
    updateEvents(dt);
    for (const c of clouds) { c.x += c.sp * dt; if (c.x > W + 10) c.x = -c.w - 10; }

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
