/* Tijolo Clicker v1.1 — lógica do jogo, eventos, interface e salvamento. */
(() => {
  'use strict';

  const TC = window.TC, ART = window.ART;
  const { fmt } = TC;
  const SAVE_KEY = 'tijolo-clicker-save-v2';
  const OLD_SAVE_KEY = 'tijolo-clicker-save-v1';
  const OFFLINE_MAX = 8 * 3600;

  const money = n => 'R$ ' + fmt(n);
  const ordinal = n => n + 'º';
  const rand = (a, b) => a + Math.random() * (b - a);
  const $ = id => document.getElementById(id);

  // ================================================================
  // Estado
  // ================================================================
  const G = {
    S: TC.freshState(),
    EV: { effects: [], crane: null, crack: null, inspector: null, choice: null, pendingCrack: null, gold: null, nextCrane: 25, nextBad: 75, nextChoice: 130, nextGold: 18 },
  };
  let S = G.S;
  const EV = G.EV;
  let qty = 1;

  const effMult = key => EV.effects.reduce((m, e) => m * (e[key] || 1), 1);
  const bpsNow = () => TC.bps(S) * effMult('bps');
  const clickNow = () => TC.clickPower(S, bpsNow()) * effMult('click');
  const rentNow = () => TC.rent(S) * effMult('rent') * (EV.crack ? 0.7 : 1);
  const hasEffect = id => EV.effects.some(e => e.id === id);
  const perk = (key, def) => TC.perkVal(S, key, def);

  // Combo de cliques: clicar rápido aumenta o multiplicador
  const combo = { n: 0, idle: 9 };
  const comboMax = () => perk('comboMax', 2.5);
  const comboMult = () => 1 + (comboMax() - 1) * Math.min(combo.n, 50) / 50;

  // ================================================================
  // Mundo
  // ================================================================
  const canvas = $('game');
  const world = window.World(canvas, G);
  const W = world.W, H = world.H;

  // ================================================================
  // Som
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
    ach: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, i * 0.08)); },
    deliver: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.04, i * 0.1)); },
  };

  // ================================================================
  // Efeitos de texto
  // ================================================================
  const fxEl = $('fx'), hintEl = $('hint'), toastsEl = $('toasts');

  function floatText(text, x, y, cls = '') {
    while (fxEl.childElementCount >= 24) fxEl.firstChild.remove();
    const el = document.createElement('span');
    el.className = 'float ' + cls;
    el.textContent = text;
    el.style.setProperty('--x', (x / W * fxEl.clientWidth + (Math.random() - 0.5) * 36).toFixed(1) + 'px');
    el.style.setProperty('--y', (y / H * fxEl.clientHeight + (Math.random() - 0.5) * 14).toFixed(1) + 'px');
    el.addEventListener('animationend', () => el.remove());
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' t-' + kind : '');
    el.textContent = text;
    toastsEl.appendChild(el);
    while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
    setTimeout(() => el.remove(), 3600);
  }

  // ================================================================
  // Tijolos e pavimentos
  // ================================================================
  function giveBricks(n, withFx) {
    const before = S.floors;
    const r = TC.addBricks(S, n);
    if (r.done) {
      world.clearFalling();
      if (withFx) {
        world.confetti();
        sfx.floor();
        floatText('+' + money(r.earned), W / 2, 150, 'money');
        const P = TC.project(S);
        if (S.floors >= P.floors) {
          toast(`${P.name} concluída! Entregue a obra para ganhar Reputação.`, 'big');
          sfx.deliver();
        } else {
          toast(r.done > 1 ? `${r.done} pavimentos concluídos!` : `${ordinal(S.floors)} pavimento concluído!`);
        }
      }
      if (before === 0 && S.floors >= 1 && S.tut === 0) startTutorial();
      maybeOfferPerk();
    }
    return r;
  }

  function placeBrick(clientX, clientY) {
    S.clicks++;
    combo.n = combo.idle < 0.9 ? combo.n + 1 : Math.max(1, Math.floor(combo.n * 0.5));
    combo.idle = 0;
    if (combo.n > S.stats.bestCombo) S.stats.bestCombo = combo.n;
    const before = world.visibleCount();
    const n = clickNow() * comboMult();
    const r = giveBricks(n, true);
    tone(150 + Math.min(combo.n, 50) * 6 + Math.random() * 40, 0.06, 'triangle', 0.12);
    if (!r.done) {
      const after = world.visibleCount();
      for (let k = before; k < after && k < before + 5; k++) world.spawnFalling(k);
    }
    let x = W / 2, y = 160;
    if (clientX != null) {
      const rc = canvas.getBoundingClientRect();
      x = (clientX - rc.left) / rc.width * W;
      y = (clientY - rc.top) / rc.height * H;
    }
    const hot = combo.n >= 10;
    floatText('+' + fmt(n), x, y, hot ? 'combo-hot' : '');
    world.ring(x, y, hot);
    if (S.clicks >= 12) hintEl.hidden = true;
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const rc = canvas.getBoundingClientRect();
    const x = (e.clientX - rc.left) / rc.width * W, y = (e.clientY - rc.top) / rc.height * H;
    if (world.hitGold(x, y)) { collectGold(); return; }
    if (world.hitPallet(x, y)) { collectPallet(); return; }
    if (world.hitCrack(x, y)) { repairCrack(); return; }
    placeBrick(e.clientX, e.clientY);
  });
  canvas.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) placeBrick(); }
  });

  // ================================================================
  // Eventos da obra
  // ================================================================
  function addEffect(e) {
    const i = EV.effects.findIndex(x => x.id === e.id);
    const fx = Object.assign({}, e, { t: e.dur });
    if (i >= 0) EV.effects[i] = fx; else EV.effects.push(fx);
  }

  // Entrega de material (clicável)
  function spawnPallet() {
    const { bx, ww } = world.wallSpan();
    EV.crane = { t: 0, life: 13, x: bx + 26 + Math.random() * (ww - 52), y: -40, phase: Math.random() * 6, gone: false };
    sfx.crane();
    if (!S.stats.cranes) toast('Chegou uma entrega de material! Clique no palete!');
  }

  function updatePallet(dt) {
    const c = EV.crane;
    if (!c) return;
    c.t += dt;
    const leaving = c.gone || c.t > c.life;
    if (leaving) c.y -= 110 * dt; else c.y += (70 - c.y) * Math.min(1, dt * 2.5);
    if (leaving && c.y < -44) EV.crane = null;
  }

  function collectPallet() {
    const c = EV.crane;
    c.gone = true;
    S.stats.cranes++;
    const cx = world.palletX(c);
    sfx.collect();
    world.dust(cx, c.y + 10, 14, ['#f2c14e', '#fff0a6', '#ffffff']);
    const r = Math.random();
    const boost = perk('crane');
    if (r < 0.45) {
      const n = Math.ceil(Math.max(30 * clickNow(), 60 * TC.bps(S)) * boost);
      giveBricks(n, true);
      floatText('+' + fmt(n) + ' tijolos', cx, c.y + 12, 'money');
      toast(`Entrega de material: +${fmt(n)} tijolos!`);
    } else if (r < 0.75) {
      const m = Math.ceil(Math.max(30 + 15 * S.floors, 90 * TC.rent(S), S.money * 0.05) * boost);
      TC.addMoney(S, m);
      floatText('+' + money(m), cx, c.y + 12, 'money');
      toast(`Material revendido: +${money(m)}!`);
    } else if (r < 0.9) {
      addEffect({ id: 'estagiario', label: 'Estagiário animado', kind: 'good', dur: 15, click: 7, desc: 'cliques ×7' });
      floatText('Cliques ×7!', cx, c.y + 12, 'money');
      toast('Estagiário animado: cliques ×7 por 15s!');
    } else {
      addEffect({ id: 'mutirao', label: 'Mutirão', kind: 'good', dur: 30, bps: 4, desc: 'equipe ×4' });
      floatText('Equipe ×4!', cx, c.y + 12, 'money');
      toast('Mutirão da vizinhança: equipe ×4 por 30s!');
    }
  }

  // Tijolo de ouro: aparece na parede em construção; clique nele antes que suma
  function spawnGold() {
    const k = world.goldSpot();
    if (k < 0) return;
    EV.gold = { k, t: 0, life: 9 };
    tone(1568, 0.08, 'sine', 0.04); tone(2093, 0.12, 'sine', 0.04, 0.08);
    if (!S.stats.golden) toast('Um tijolo de ouro brilha na parede! Clique nele!');
  }

  function collectGold() {
    const p = world.goldPos();
    EV.gold = null;
    S.stats.golden++;
    const boost = perk('gold');
    sfx.collect();
    world.dust(p.x + 4, p.y + 2, 18, ['#f2c14e', '#fff0a6', '#ffffff', '#c9952a']);
    const r = Math.random();
    if (r < 0.5) {
      const n = Math.ceil(Math.max(40 * clickNow(), 90 * TC.bps(S)) * boost);
      giveBricks(n, true);
      floatText('+' + fmt(n) + ' tijolos', p.x + 4, p.y - 6, 'money');
    } else if (r < 0.8) {
      const m = Math.ceil(Math.max(50 + 20 * S.floors, 120 * TC.rent(S), S.money * 0.08) * boost);
      TC.addMoney(S, m);
      floatText('+' + money(m), p.x + 4, p.y - 6, 'money');
    } else {
      addEffect({ id: 'febre', label: 'Febre do ouro', kind: 'good', dur: 12 * boost, click: 10, desc: 'cliques ×10' });
      floatText('Cliques ×10!', p.x + 4, p.y - 6, 'money');
      toast('Febre do ouro: cliques ×10!');
    }
  }

  // Rachadura
  function spawnCrack() {
    if (S.floors < 1 || EV.crack || S.owned.laudo) return false;
    EV.crack = { u: Math.random(), yo: 6 + Math.floor(Math.random() * 16), hp: 6 };
    sfx.crack();
    toast('Rachadura! Aluguel −30%. Clique nela para consertar.', 'bad');
    return true;
  }

  function repairCrack() {
    const p = world.crackPos();
    EV.crack.hp--;
    world.dust(p.x + 4, p.y + 7, 7);
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

  // Chuva
  function startRain() {
    const lona = S.owned.lona > 0;
    addEffect(lona
      ? { id: 'chuva', label: 'Chuva', kind: 'neutral', dur: 30, desc: 'a lona protege a equipe' }
      : { id: 'chuva', label: 'Chuva', kind: 'bad', dur: 30, bps: 0.5, desc: 'equipe −50%' });
    toast(lona ? 'Começou a chover. A lona protegeu a obra!' : 'Chuva! A equipe trabalha na metade do ritmo.', lona ? '' : 'bad');
  }

  // Fiscal
  function startInspector() {
    const { bx } = world.wallSpan();
    EV.inspector = { x: bx - 10, state: 'in', t: 0 };
    sfx.whistle();
    toast('O fiscal da prefeitura chegou para vistoriar a obra.');
  }

  function updateInspector(dt) {
    const f = EV.inspector;
    if (!f) return;
    f.t += dt;
    const { bx, ww } = world.wallSpan();
    const mid = bx + ww / 2 - 3;
    if (f.state === 'in') { f.x += 18 * dt; if (f.x >= mid) { f.x = mid; f.state = 'check'; f.t = 0; } }
    else if (f.state === 'check') { if (f.t > 3) { verdict(); f.state = 'out'; f.t = 0; } }
    else { f.x += 24 * dt; if (f.x > bx + ww + 6) EV.inspector = null; }
  }

  function verdict() {
    S.stats.inspections++;
    const fx = W / 2, fy = world.floorBaseY() - 24;
    if (S.owned.epi) {
      S.stats.approved++;
      const bonus = Math.ceil(Math.max(40, 120 * TC.rent(S)));
      TC.addMoney(S, bonus);
      sfx.collect();
      floatText('+' + money(bonus), fx, fy, 'money');
      toast(`Fiscal: obra exemplar, todos com EPI! Bônus de ${money(bonus)}.`);
    } else {
      const fine = Math.floor(Math.min(S.money * 0.15, Math.max(20, TC.rent(S) * 120)));
      S.money -= fine;
      S.stats.fines++;
      sfx.deny();
      floatText('−' + money(fine), fx, fy, 'bad');
      toast(fine > 0 ? `Multa: equipe sem EPI! −${money(fine)}. Compre o Kit de EPI.` : 'Fiscal: equipe sem EPI. Desta vez foi só advertência.', 'bad');
    }
  }

  // Propostas (escolhas)
  function makeChoice() {
    const opts = [];
    const P = TC.project(S);
    if (S.floors < P.floors && S.bricks > TC.needFor(S, S.floors) * 0.3) {
      const pay = TC.reward(S.floors) * 2;
      opts.push({
        title: 'Mudança de planta',
        text: `O cliente quer mudar a planta deste pavimento. Você desmancha 40% dos tijolos assentados, mas ele paga ${money(pay)} na hora.`,
        yes: () => { S.bricks *= 0.6; TC.addMoney(S, pay); toast(`Planta alterada! +${money(pay)}.`); },
      });
    }
    const b = TC.bps(S);
    if (b > 0) {
      const price = Math.max(30, Math.floor(TC.rent(S) * 40 + b * 15));
      if (S.money >= price) {
        const risk = !S.owned.laudo;
        opts.push({
          title: 'Material barato',
          text: `Um fornecedor oferece tijolo pela metade do preço: ${money(price)} e a equipe rende o dobro por 60s.` + (risk ? ' Mas o material pode causar rachaduras.' : ' Seu laudo garante a qualidade.'),
          yes: () => {
            if (S.money < price) { toast('Dinheiro insuficiente.', 'bad'); return; }
            S.money -= price;
            addEffect({ id: 'fornecedor', label: 'Material barato', kind: 'good', dur: 60, bps: 2, desc: 'equipe ×2' });
            toast('Material comprado: equipe ×2 por 60s!');
            if (risk && Math.random() < 0.4) EV.pendingCrack = rand(8, 18);
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
      if (S.money > 200) {
        const cost = Math.floor(S.money * 0.25);
        opts.push({
          title: 'Festa da laje',
          text: `A equipe quer comemorar com um churrasco na laje. Custa ${money(cost)}, mas todo mundo volta animado: equipe ×2 e cliques ×2 por 90s.`,
          yes: () => {
            if (S.money < cost) { toast('Dinheiro insuficiente.', 'bad'); return; }
            S.money -= cost;
            addEffect({ id: 'festa', label: 'Festa da laje', kind: 'good', dur: 90, bps: 2, click: 2, desc: 'equipe e cliques ×2' });
            toast('Churrasco na laje! Equipe e cliques ×2 por 90s.');
          },
        });
      }
    }
    if (!opts.length) return null;
    return opts[Math.floor(Math.random() * opts.length)];
  }

  const choiceEl = $('choice');
  function openChoice() {
    const c = makeChoice();
    if (!c) return;
    EV.choice = Object.assign(c, { t: 20, dur: 20 });
    $('choice-title').textContent = c.title;
    $('choice-text').textContent = c.text;
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
  $('choice-yes').addEventListener('click', () => closeChoice(true));
  $('choice-no').addEventListener('click', () => closeChoice(false));

  function startBadEvent() {
    if (perk('immune', 0)) return;
    const opts = [];
    if (!hasEffect('chuva')) opts.push(startRain);
    if (!EV.crack && !S.owned.laudo && S.floors >= 1) opts.push(spawnCrack);
    if (!EV.inspector && TC.project(S).floors > S.floors) opts.push(startInspector);
    if (opts.length) opts[Math.floor(Math.random() * opts.length)]();
  }

  function updateEvents(dt) {
    for (let i = EV.effects.length - 1; i >= 0; i--) {
      const e = EV.effects[i];
      e.t -= dt;
      if (e.t <= 0) {
        EV.effects.splice(i, 1);
        if (e.then) { addEffect(e.then); toast(`${e.then.label}: ${e.then.desc} por ${e.then.dur}s.`, 'bad'); }
      }
    }
    updatePallet(dt);
    updateInspector(dt);
    if (EV.choice) {
      EV.choice.t -= dt;
      $('choice-bar').style.width = Math.max(0, EV.choice.t / EV.choice.dur * 100) + '%';
      if (EV.choice.t <= 0) closeChoice(false);
    }
    if (EV.pendingCrack != null) { EV.pendingCrack -= dt; if (EV.pendingCrack <= 0) { EV.pendingCrack = null; spawnCrack(); } }
    if (EV.gold) { EV.gold.t += dt; if (EV.gold.t > EV.gold.life || EV.gold.k >= world.visibleCount()) EV.gold = null; }
    if (S.floors < 1 || !$('offline').hidden || !$('perk-modal').hidden) return;
    EV.nextGold -= dt * perk('gold');
    if (EV.nextGold <= 0 && !EV.gold) { spawnGold(); EV.nextGold = rand(25, 60); }
    EV.nextCrane -= dt * perk('crane');
    if (EV.nextCrane <= 0 && !EV.crane) { spawnPallet(); EV.nextCrane = rand(45, 100); }
    EV.nextBad -= dt;
    if (EV.nextBad <= 0) { startBadEvent(); EV.nextBad = rand(80, 160); }
    EV.nextChoice -= dt;
    if (EV.nextChoice <= 0 && !EV.choice) { openChoice(); EV.nextChoice = rand(140, 240); }
  }

  function resetEvents() {
    EV.effects.length = 0; EV.crane = null; EV.crack = null; EV.inspector = null; EV.pendingCrack = null; EV.gold = null; EV.nextGold = 18;
    if (EV.choice) { EV.choice = null; choiceEl.hidden = true; }
    EV.nextCrane = 25; EV.nextBad = 75; EV.nextChoice = 130;
  }

  // ================================================================
  // Loja
  // ================================================================
  const shop = { producers: {}, finishes: {}, safety: {}, upgTiles: new Map(), selectedUpg: null };

  function makeRow(iconKey, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item';
    const icon = ART.makeIcon(iconKey);
    const text = document.createElement('span'); text.className = 'item-text';
    const name = document.createElement('span'); name.className = 'item-name';
    const desc = document.createElement('span'); desc.className = 'item-desc';
    const cost = document.createElement('span'); cost.className = 'item-cost';
    text.append(name, desc, cost);
    const owned = document.createElement('span'); owned.className = 'item-owned';
    btn.append(icon, text, owned);
    btn.addEventListener('click', onClick);
    return { btn, icon, name, desc, cost, owned, iconKey, sig: '' };
  }

  function setRow(r, o) {
    const sig = JSON.stringify(o);
    if (sig === r.sig) return;
    r.sig = sig;
    if (o.icon !== r.iconKey) { ART.paintIcon(r.icon, o.icon); r.iconKey = o.icon; }
    r.name.textContent = o.name;
    r.desc.textContent = o.desc;
    r.cost.textContent = o.cost;
    r.cost.className = 'item-cost' + (o.costClass ? ' ' + o.costClass : '');
    r.owned.textContent = o.owned;
    r.btn.disabled = o.disabled;
    r.btn.classList.toggle('mystery', !!o.mystery);
    r.btn.hidden = !!o.hidden;
    r.btn.setAttribute('aria-label', o.aria || o.name);
  }

  function buildShop() {
    const pe = $('producers'); pe.textContent = '';
    TC.PRODUCERS.forEach(p => { const r = makeRow(p.id, () => buyProducer(p)); shop.producers[p.id] = r; pe.appendChild(r.btn); });
    const fe = $('finishes'); fe.textContent = '';
    TC.FINISHES.forEach(f => { const r = makeRow(f.id, () => buyFinish(f)); shop.finishes[f.id] = r; fe.appendChild(r.btn); });
    const se = $('safety'); se.textContent = '';
    TC.SAFETY.forEach(s => { const r = makeRow(s.id, () => buySafety(s)); shop.safety[s.id] = r; se.appendChild(r.btn); });
  }

  // quantidade a comprar com ×1/×10/×100; "max" limita (acabamentos)
  function buyQty(costFn, max) {
    const n = Math.max(0, Math.min(qty, max));
    return { n, cost: n > 0 ? costFn(n) : Infinity };
  }

  function buyProducer(p) {
    const { n, cost } = buyQty(k => TC.prodCost(S, p, k), Infinity);
    if (!n || S.money < cost) { sfx.deny(); return; }
    S.money -= cost;
    S.owned[p.id] += n;
    TC.dirty();
    sfx.buy();
    if (S.owned[p.id] === n) toast(`${p.name} entrou na obra!`);
    refreshShop();
  }

  function buyFinish(f) {
    const room = f.limit(S) - S.owned[f.id];
    const { n, cost } = buyQty(k => TC.finishCost(S, f, k), room);
    if (!n || S.money < cost) { sfx.deny(); return; }
    S.money -= cost;
    S.owned[f.id] += n;
    TC.dirty();
    sfx.buy();
    refreshShop();
  }

  function buySafety(s) {
    if (S.owned[s.id] || S.money < s.base) { sfx.deny(); return; }
    S.money -= s.base;
    S.owned[s.id] = 1;
    sfx.buy();
    const msgs = { lona: 'Lona pronta: a chuva não atrapalha mais.', epi: 'Equipe equipada: o fiscal vai aprovar!', laudo: 'Laudo emitido: sem rachaduras na obra.' };
    toast(msgs[s.id]);
    if (s.id === 'laudo' && EV.crack) { EV.crack = null; toast('O engenheiro mandou consertar a rachadura.'); }
    refreshShop();
  }

  function buyUpgrade(u) {
    if (S.upg[u.id] || !u.unlock(S)) return;
    if (S.money < u.cost) { sfx.deny(); showUpgDetail(u); return; }
    S.money -= u.cost;
    S.upg[u.id] = true;
    TC.dirty();
    sfx.buy();
    toast(`Melhoria: ${u.name}!`);
    shop.selectedUpg = null;
    refreshShop();
  }

  const upgIconKey = u => u.kind === 'prod' ? u.prod : u.kind === 'click' ? 'click-' + u.tier : u.kind === 'ritmo' ? 'ritmo' : 'rent-' + u.tier;

  function showUpgDetail(u) {
    const el = $('upg-detail');
    el.textContent = '';
    if (!u) {
      const m = document.createElement('span'); m.className = 'muted';
      m.textContent = 'Passe o mouse ou toque numa melhoria para ver o que ela faz.';
      el.appendChild(m);
      return;
    }
    shop.selectedUpg = u;
    const n = document.createElement('strong'); n.textContent = u.name;
    const d = document.createElement('span'); d.textContent = u.desc;
    const can = S.money >= u.cost;
    const c = document.createElement('span'); c.className = can ? 'gold' : 'danger';
    c.textContent = money(u.cost) + (can ? ' · clique para comprar' : ' · falta dinheiro');
    el.append(n, d, c);
  }

  function refreshUpgrades() {
    const box = $('upgrades');
    const avail = TC.UPGRADES.filter(u => !S.upg[u.id] && u.unlock(S)).sort((a, b) => a.cost - b.cost).slice(0, 40);
    const ids = avail.map(u => u.id).join(',');
    if (box.dataset.ids !== ids) {
      box.dataset.ids = ids;
      box.textContent = '';
      shop.upgTiles.clear();
      for (const u of avail) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'upg';
        b.setAttribute('aria-label', `${u.name}: ${u.desc} ${money(u.cost)}`);
        b.appendChild(ART.makeIcon(upgIconKey(u), u.kind === 'prod' || u.kind === 'ritmo' ? u.tier : null, 'upg-icon'));
        b.addEventListener('click', () => buyUpgrade(u));
        b.addEventListener('mouseenter', () => showUpgDetail(u));
        b.addEventListener('focus', () => showUpgDetail(u));
        box.appendChild(b);
        shop.upgTiles.set(u.id, b);
      }
      $('upg-empty').hidden = avail.length > 0;
      if (shop.selectedUpg && !avail.includes(shop.selectedUpg)) shop.selectedUpg = null;
    }
    let can = 0;
    for (const u of avail) {
      const ok = S.money >= u.cost;
      if (ok) can++;
      const b = shop.upgTiles.get(u.id);
      if (b) b.classList.toggle('can', ok);
    }
    const badge = $('upg-badge');
    badge.hidden = can === 0;
    if (badge.textContent !== String(can)) badge.textContent = String(can);
    const sc = $('upg-shortcut');
    sc.hidden = can === 0;
    const scText = `${can} melhoria${can > 1 ? 's' : ''} pronta${can > 1 ? 's' : ''} para comprar → abrir Melhorias`;
    if (sc.textContent !== scText) sc.textContent = scText;
    if (!$('tab-melhorias').hidden) { showUpgDetail(shop.selectedUpg); renderOwnedUpgrades(); }
  }

  function renderOwnedUpgrades() {
    const box = $('upg-owned');
    const owned = TC.UPGRADES.filter(u => S.upg[u.id]);
    const sig = owned.map(u => u.id).join(',');
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.textContent = '';
    $('upg-owned-count').textContent = `(${owned.length})`;
    for (const u of owned) {
      const b = document.createElement('span');
      b.className = 'upg';
      b.title = `${u.name}: ${u.desc}`;
      b.setAttribute('role', 'img');
      b.setAttribute('aria-label', `${u.name}: ${u.desc}`);
      b.appendChild(ART.makeIcon(upgIconKey(u), u.kind === 'prod' || u.kind === 'ritmo' ? u.tier : null, 'upg-icon'));
      box.appendChild(b);
    }
  }
  $('upg-shortcut').addEventListener('click', () => showTab('melhorias'));

  function refreshShop() {
    const totalBps = TC.bps(S) || 1;
    let mysteryShown = false;
    for (const p of TC.PRODUCERS) {
      const r = shop.producers[p.id];
      const known = S.seen[p.id] || S.owned[p.id] > 0 || S.runMoney >= p.base * 0.4 || S.money >= p.base * 0.4;
      if (known) S.seen[p.id] = true;
      const { n, cost } = buyQty(k => TC.prodCost(S, p, k), Infinity);
      if (!known) {
        // só um "???" aparece por vez
        setRow(r, { icon: 'mystery', name: '???', desc: 'Junte mais dinheiro para descobrir.', cost: money(cost), owned: '', disabled: true, mystery: true, hidden: mysteryShown, aria: 'Item desconhecido' });
        mysteryShown = true;
        continue;
      }
      const each = TC.prodEach(S, p);
      const tot = TC.prodBps(S, p);
      const share = S.owned[p.id] ? ` · ${Math.round(tot / totalBps * 100)}% do total` : '';
      setRow(r, {
        icon: p.id, name: p.name + (n > 1 ? ` ×${n}` : ''),
        desc: `${fmt(each)} tijolos/s cada${share}`,
        cost: money(cost), costClass: S.money >= cost ? '' : 'short',
        owned: S.owned[p.id] || '', disabled: S.money < cost, aria: `${p.name}. ${p.desc} Custa ${money(cost)}.`,
      });
      r.btn.title = p.desc;
    }
    for (const f of TC.FINISHES) {
      const r = shop.finishes[f.id];
      const room = f.limit(S) - S.owned[f.id];
      const { n, cost } = buyQty(k => TC.finishCost(S, f, k), room);
      let costText = money(cost), cls = S.money >= cost ? '' : 'short';
      if (room <= 0) { costText = S.floors === 0 ? 'Termine o 1º pavimento' : f.id === 'floreira' ? 'Compre mais janelas' : 'Construa mais pavimentos'; cls = 'locked'; }
      setRow(r, { icon: f.id, name: f.name + (n > 1 ? ` ×${n}` : ''), desc: f.desc, cost: costText, costClass: cls, owned: S.owned[f.id] || '', disabled: room <= 0 || S.money < cost });
    }
    for (const s of TC.SAFETY) {
      const r = shop.safety[s.id];
      const has = S.owned[s.id] > 0;
      const known = has || S.floors >= 1;
      setRow(r, {
        icon: known ? s.id : 'mystery', name: known ? s.name : '???', desc: known ? s.desc : 'Conclua o 1º pavimento.',
        cost: has ? 'Comprado' : money(s.base), costClass: has ? 'locked' : S.money >= s.base ? '' : 'short',
        owned: has ? '✓' : '', disabled: has || !known || S.money < s.base, mystery: !known,
      });
    }
    refreshUpgrades();
  }

  document.querySelectorAll('.qty button').forEach(b => {
    b.addEventListener('click', () => {
      qty = +b.dataset.q;
      document.querySelectorAll('.qty button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      refreshShop();
    });
  });

  // ================================================================
  // Abas
  // ================================================================
  const tabs = ['loja', 'melhorias', 'conquistas', 'obra'];
  function showTab(id) {
    tabs.forEach(t => {
      $('tab-' + t).hidden = t !== id;
      const b = $('tabbtn-' + t);
      b.setAttribute('aria-selected', String(t === id));
      b.tabIndex = t === id ? 0 : -1;
    });
    if (id === 'conquistas') renderAchievements(true);
    if (id === 'melhorias') { showUpgDetail(shop.selectedUpg); renderOwnedUpgrades(); }
    if (id === 'obra') renderProjectTab();
  }
  tabs.forEach(t => $('tabbtn-' + t).addEventListener('click', () => showTab(t)));

  // ---------- Conquistas ----------
  function renderAchievements(force) {
    const box = $('ach-grid');
    const got = Object.keys(S.ach).length;
    $('ach-summary').textContent = `${got} de ${TC.ACHIEVEMENTS.length} conquistas · +${got}% em tudo`;
    const sig = Object.keys(S.ach).sort().join(',');
    if (!force && box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.textContent = '';
    for (const a of TC.ACHIEVEMENTS) {
      const has = !!S.ach[a.id];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ach' + (has ? ' got' : '');
      b.setAttribute('aria-label', has ? `${a.name}: ${a.desc}` : `Bloqueada: ${a.desc}`);
      b.appendChild(ART.makeIcon(has ? 'trofeu' : 'mystery', null, 'upg-icon'));
      const show = () => { $('ach-detail').textContent = has ? `${a.name}: ${a.desc}` : `Bloqueada. ${a.desc}`; };
      b.addEventListener('mouseenter', show); b.addEventListener('focus', show); b.addEventListener('click', show);
      box.appendChild(b);
    }
  }

  function checkAchievements() {
    for (const a of TC.ACHIEVEMENTS) {
      if (!S.ach[a.id] && a.test(S)) {
        S.ach[a.id] = true;
        TC.dirty();
        toast(`Conquista: ${a.name}!`, 'ach');
        sfx.ach();
      }
    }
  }

  // ---------- Obra e estatísticas ----------
  function renderProjectTab() {
    const list = $('proj-list');
    list.textContent = '';
    const last = TC.PROJECTS.length - 1;
    const cur = TC.project(S);
    TC.PROJECTS.forEach((p, i) => {
      const li = document.createElement('li');
      const d = S.delivered[p.id] || 0;
      const state = i < S.project ? 'done' : i === S.project ? 'now' : 'locked';
      li.className = 'proj ' + state;
      const name = document.createElement('strong');
      name.textContent = state === 'locked' ? '???' : p.name;
      const info = document.createElement('span');
      if (state === 'locked') info.textContent = 'Entregue a obra anterior para liberar.';
      else if (state === 'now') info.textContent = `${cur.floors} pavimentos · +${cur.stars} ★ · ${i === last && d ? `recordes batidos: ${d}` : 'em andamento'}`;
      else info.textContent = `${p.floors} pavimentos · +${p.stars} ★ · entregue`;
      li.append(name, info);
      list.appendChild(li);
    });
    const ach = Object.keys(S.ach).length;
    const st = [
      ['Reputação', `${S.stars} ★ (+${S.stars * 5}% em tudo)`],
      ['Conquistas', `${ach} (+${ach}% em tudo)`],
      ['Tijolos nesta obra', fmt(S.runBricks)],
      ['Tijolos no total', fmt(S.totalBricks)],
      ['Dinheiro ganho no total', money(S.totalMoney)],
      ['Cliques', fmt(S.clicks)],
      ['Tempo de jogo', time(S.playTime)],
      ['Entregas de material pegas', fmt(S.stats.cranes)],
      ['Rachaduras consertadas', fmt(S.stats.cracks)],
      ['Vistorias aprovadas / multas', `${S.stats.approved} / ${S.stats.fines}`],
      ['Propostas respondidas', fmt(S.stats.choices)],
      ['Tijolos de ouro pegos', fmt(S.stats.golden)],
      ['Maior combo', fmt(S.stats.bestCombo)],
      ['Benefícios escolhidos', fmt(S.stats.perks)],
    ];
    const dl = $('stats-list');
    dl.textContent = '';
    for (const [k, v] of st) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
  }

  function time(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    return h ? `${h}h ${m}min` : `${m} min`;
  }

  // ================================================================
  // Entrega da obra (prestígio)
  // ================================================================
  const deliverEl = $('deliver');
  function renderDeliver() {
    const P = TC.project(S);
    const done = S.floors >= P.floors;
    deliverEl.hidden = !done;
    if (!done) return;
    const lastIdx = TC.PROJECTS.length - 1;
    const next = S.project >= lastIdx ? `Torre recorde com ${P.floors + 5} andares` : TC.PROJECTS[S.project + 1].name;
    const crew = TC.PRODUCERS.filter(p => S.owned[p.id] > 0).map(p => p.name.toLowerCase());
    const crewTxt = crew.length ? ` Equipe fiel: 1 ${crew.join(', 1 ')} ${crew.length > 1 ? 'vão' : 'vai'} com você.` : '';
    const txt = `${P.name} pronta! Entregue para ganhar +${TC.deliveryStars(S)} ★ de Reputação e começar a próxima obra: ${next}. Dinheiro, melhorias e acabamentos recomeçam do zero, mas cada estrela dá +5% em tudo, para sempre.${crewTxt}`;
    if ($('deliver-text').textContent !== txt) $('deliver-text').textContent = txt;
  }

  function showDeliverIdle() {
    const w = $('deliver-actions');
    w.textContent = '';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cta'; b.textContent = 'Entregar obra';
    b.addEventListener('click', showDeliverConfirm);
    w.appendChild(b);
  }
  function showDeliverConfirm() {
    const w = $('deliver-actions');
    w.textContent = '';
    const q = document.createElement('span'); q.textContent = 'Entregar e recomeçar?';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'cta'; yes.textContent = 'Sim, entregar';
    const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Agora não';
    yes.addEventListener('click', deliver);
    no.addEventListener('click', showDeliverIdle);
    w.append(q, yes, no);
    no.focus();
  }

  function deliver() {
    const P = TC.project(S);
    if (S.floors < P.floors) return;
    const stars = TC.deliveryStars(S);
    S.delivered[P.id] = (S.delivered[P.id] || 0) + 1;
    S.stars += stars;
    S.project = Math.min(S.project + 1, TC.PROJECTS.length - 1);
    const kept = TC.newRun(S);
    resetEvents();
    world.reset();
    checkAchievements();
    const N = TC.project(S);
    sfx.deliver();
    toast(`Obra entregue! +${stars} ★. Nova obra: ${N.name}${N.record ? ` com ${N.floors} andares` : ''}.`, 'big');
    const nk = Object.keys(kept).length;
    if (nk) toast(`Sua equipe fiel chegou: ${nk} membro${nk > 1 ? 's' : ''} já começa${nk > 1 ? 'm' : ''} trabalhando.`);
    showDeliverIdle();
    save();
    refreshShop();
    renderProjectTab();
  }

  // ================================================================
  // Painel superior e efeitos ativos
  // ================================================================
  function setStat(id, text, ratio) {
    const el = $(id);
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('up', ratio > 1.001);
    el.classList.toggle('down', ratio < 0.999);
  }

  const effectsEl = $('effects');
  let effectsSig = '';
  function renderEffects() {
    const list = EV.effects.map(e => ({ kind: e.kind, text: `${e.label} · ${e.desc} · ${Math.ceil(e.t)}s` }));
    if (EV.crack) list.push({ kind: 'bad', text: 'Rachadura · aluguel −30% · clique nela' });
    if (EV.inspector) list.push({ kind: S.owned.epi ? 'good' : 'bad', text: 'Fiscal vistoriando a obra' });
    for (const id in S.perks) { const pk = TC.PERK_BY_ID[id]; if (pk && !pk.instant) list.push({ kind: 'perk', text: pk.name }); }
    const sig = list.map(c => c.kind + c.text).join('|');
    if (sig === effectsSig) return;
    effectsSig = sig;
    effectsEl.textContent = '';
    for (const c of list) { const el = document.createElement('span'); el.className = 'chip ' + c.kind; el.textContent = c.text; effectsEl.appendChild(el); }
    effectsEl.hidden = list.length === 0;
  }

  function updateHud() {
    const b = TC.bps(S), r = TC.rent(S);
    setStat('st-money', money(S.money), 1);
    setStat('st-rent', money(rentNow()) + '/s', r > 0 ? rentNow() / r : 1);
    setStat('st-bps', fmt(bpsNow()), b > 0 ? bpsNow() / b : 1);
    setStat('st-click', fmt(clickNow()), effMult('click'));
    setStat('st-stars', `${S.stars}`, 1);
    $('st-stars-bonus').textContent = `+${S.stars * 5}%`;
    const P = TC.project(S);
    const pj = P.name + (P.record ? ` · ${P.floors} andares` : '');
    if ($('pj-name').textContent !== pj) $('pj-name').textContent = pj;
    const done = S.floors >= P.floors;
    $('pv-name').textContent = done ? 'Obra concluída' : `${ordinal(S.floors + 1)} de ${P.floors} pavimentos`;
    const nd = TC.needFor(S, Math.min(S.floors, P.floors - 1));
    $('pv-count').textContent = done ? `${P.floors} / ${P.floors}` : `${fmt(Math.floor(S.bricks))} / ${fmt(nd)} tijolos`;
    $('pv-fill').style.width = (done ? 100 : Math.min(100, S.bricks / nd * 100)) + '%';
    renderEffects();
    renderDeliver();
  }

  // ================================================================
  // Rodapé
  // ================================================================
  const soundBtn = $('btn-sound');
  const updateSoundBtn = () => { soundBtn.textContent = S.muted ? 'Som: desligado' : 'Som: ligado'; };
  soundBtn.addEventListener('click', () => { S.muted = !S.muted; updateSoundBtn(); save(); });
  $('btn-save').addEventListener('click', () => { save(); toast('Jogo salvo!'); });

  const resetWrap = $('reset-wrap');
  function showResetIdle() {
    resetWrap.textContent = '';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Apagar progresso';
    b.addEventListener('click', showResetConfirm);
    resetWrap.appendChild(b);
  }
  function showResetConfirm() {
    resetWrap.textContent = '';
    const q = document.createElement('span'); q.textContent = 'Apagar tudo, inclusive Reputação e conquistas?';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'danger'; yes.textContent = 'Sim, apagar';
    const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Não';
    yes.addEventListener('click', () => {
      const muted = S.muted;
      G.S = S = TC.freshState(); S.muted = muted;
      TC.dirty(); endTutorial(false); $('perk-modal').hidden = true;
      resetEvents(); world.reset(); hintEl.hidden = false;
      save(); refreshShop(); showResetIdle(); showTab('loja');
      toast('Progresso apagado. Obra nova começando!');
    });
    no.addEventListener('click', showResetIdle);
    resetWrap.append(q, yes, no);
    no.focus();
  }
  showResetIdle();

  // ================================================================
  // Combo (mostrador)
  // ================================================================
  const comboEl = $('combo');
  function updateCombo() {
    const show = combo.n >= 3;
    comboEl.hidden = !show;
    if (!show) return;
    const n = Math.floor(combo.n);
    $('combo-n').textContent = `Combo ${n}`;
    $('combo-x').textContent = '×' + comboMult().toFixed(1).replace('.', ',');
    $('combo-fill').style.width = Math.min(100, n / 50 * 100) + '%';
    comboEl.classList.toggle('hot', n >= 50);
  }

  // ================================================================
  // Benefícios da obra (escolha 1 de 3)
  // ================================================================
  function maybeOfferPerk() {
    const P = TC.project(S);
    if (S.perkOffer || S.floors <= 0 || S.floors >= P.floors) return;
    if (S.floors % TC.perkEvery(P) !== 0 || S.perkAt === S.floors) return;
    const pool = TC.PERKS.filter(p => !S.perks[p.id]);
    if (pool.length < 3) return;
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    S.perkAt = S.floors;
    S.perkOffer = pool.slice(0, 3).map(p => p.id);
    openPerkModal();
  }

  function openPerkModal() {
    if (S.tut > 0 && S.tut < 99) return; // espera o tutorial terminar
    const box = $('perk-cards');
    box.textContent = '';
    for (const id of S.perkOffer) {
      const pk = TC.PERK_BY_ID[id];
      if (!pk) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'perk-card';
      b.appendChild(ART.makeIcon(pk.icon, null, 'perk-icon'));
      const n = document.createElement('strong'); n.textContent = pk.name;
      const d = document.createElement('span'); d.textContent = pk.desc;
      b.append(n, d);
      b.addEventListener('click', () => choosePerk(pk));
      box.appendChild(b);
    }
    $('perk-modal').hidden = false;
    sfx.crane();
    // evita escolher sem querer quando a janela abre embaixo do dedo durante os cliques
    const cards = [...box.querySelectorAll('button')];
    cards.forEach(c => { c.disabled = true; });
    setTimeout(() => { cards.forEach(c => { c.disabled = false; }); if (cards[0]) cards[0].focus(); }, 700);
  }

  function choosePerk(pk) {
    S.perks[pk.id] = 1;
    S.perkOffer = null;
    S.stats.perks++;
    TC.dirty();
    $('perk-modal').hidden = true;
    sfx.ach();
    if (pk.instant) {
      const m = TC.reward(Math.min(S.floors, TC.project(S).floors - 1)) * 5;
      TC.addMoney(S, m);
      toast(`${pk.name}: +${money(m)}!`);
    } else {
      toast(`Benefício da obra: ${pk.name}!`);
    }
    refreshShop();
    canvas.focus();
  }

  // ================================================================
  // Tutorial (aparece depois do 1º pavimento)
  // ================================================================
  const TUT = [
    { target: '#st-rent', text: 'Primeiro pavimento pronto! Cada pavimento paga na hora e passa a render aluguel por segundo, até com o jogo fechado.' },
    { target: '#producers .item', tab: 'loja', text: 'Contrate um Servente: ele assenta tijolos sozinho, mesmo quando você não clica. Compre 1 para continuar.', wait: () => S.owned.servente >= 1, waitLabel: 'Compre 1 Servente' },
    { target: '#finishes', tab: 'loja', text: 'Acabamentos aumentam o aluguel e aparecem desenhados no prédio. Janelas são um ótimo começo.' },
    { target: '#tabbtn-melhorias', text: 'As melhorias ficam nesta aba e dobram a produção. O número amarelo mostra quantas você já pode comprar.' },
    { target: '#screen', text: 'Clique rápido para fazer combo: o multiplicador sobe até ×2,5. Fique de olho no tijolo de ouro brilhando na parede e nos paletes que descem: clique neles para ganhar prêmios!' },
    { target: '#progress', text: 'Em alguns andares você escolhe um benefício para a obra. Ao terminar todos os andares, entregue a obra para ganhar Reputação: 1 de cada operário vai junto para a próxima.', last: true },
  ];
  let tutTarget = null;

  function startTutorial() { S.tut = 1; showTutorialStep(); }

  function showTutorialStep() {
    const st = TUT[S.tut - 1];
    if (!st) { endTutorial(true); return; }
    if (st.tab) showTab(st.tab);
    if (tutTarget) tutTarget.classList.remove('coach-target');
    tutTarget = document.querySelector(st.target);
    if (tutTarget) {
      tutTarget.classList.add('coach-target');
      tutTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    $('coach-step').textContent = `Tutorial ${S.tut} de ${TUT.length}`;
    $('coach-text').textContent = st.text;
    $('coach').hidden = false;
    updateTutorial();
  }

  function updateTutorial() {
    const st = TUT[S.tut - 1];
    if (!st) return;
    const next = $('coach-next');
    const waiting = st.wait && !st.wait();
    next.disabled = !!waiting;
    const label = waiting ? st.waitLabel : st.last ? 'Bora construir!' : 'Próximo';
    if (next.textContent !== label) next.textContent = label;
  }

  function endTutorial(done) {
    if (tutTarget) tutTarget.classList.remove('coach-target');
    tutTarget = null;
    $('coach').hidden = true;
    if (done) {
      S.tut = 99;
      if (S.perkOffer) openPerkModal(); else maybeOfferPerk();
    }
  }

  $('coach-next').addEventListener('click', () => {
    const st = TUT[S.tut - 1];
    if (st && st.wait && !st.wait()) return;
    S.tut++;
    if (S.tut > TUT.length) { endTutorial(true); toast('Boa obra!'); } else showTutorialStep();
  });
  $('coach-skip').addEventListener('click', () => endTutorial(true));
  $('btn-tutorial').addEventListener('click', () => { S.tut = 1; showTutorialStep(); });

  // ================================================================
  // Salvar / carregar
  // ================================================================
  function save() {
    S.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* armazenamento indisponível */ }
  }

  function load() {
    let raw = null, old = null;
    try { raw = localStorage.getItem(SAVE_KEY); old = localStorage.getItem(OLD_SAVE_KEY); } catch (e) { return null; }
    if (raw) {
      try {
        const d = JSON.parse(raw);
        const base = TC.freshState();
        G.S = S = Object.assign(base, d, {
          owned: Object.assign(base.owned, d.owned || {}),
          stats: Object.assign(base.stats, d.stats || {}),
          upg: d.upg || {}, ach: d.ach || {}, delivered: d.delivered || {}, seen: d.seen || {}, perks: d.perks || {},
        });
        // quem já jogava antes da v1.1 não precisa do tutorial
        if (d.tut == null) S.tut = (S.floors > 0 || S.stars > 0 || S.project > 0) ? 99 : 0;
      } catch (e) { G.S = S = TC.freshState(); }
      return null;
    }
    if (old) {
      // jogador da versão antiga: começa a v1.0 com um bônus de veterano
      try {
        const d = JSON.parse(old);
        const bonus = Math.max(1, Math.min(5, Math.floor((d.floors || 0) / 5) + 1));
        S.stars = bonus;
        S.tut = 99;
        S.muted = !!d.muted;
        return bonus;
      } catch (e) { return null; }
    }
    return null;
  }

  function simulate(sec) {
    const f0 = S.floors, m0 = S.money, b0 = S.totalBricks;
    let t = sec;
    const step = sec > 600 ? 5 : 1;
    while (t > 0) {
      const dt = Math.min(step, t);
      TC.addBricks(S, TC.bps(S) * dt);
      TC.addMoney(S, TC.rent(S) * dt);
      t -= dt;
    }
    return { floors: S.floors - f0, money: S.money - m0, bricks: S.totalBricks - b0 };
  }

  function showOffline(gain, secs) {
    let txt = `Você ficou fora por ${time(secs)}. Sua equipe assentou ${fmt(gain.bricks)} tijolos`;
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
  let hudT = 0, shopT = 0, saveT = 0, achT = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 2) { simulate(Math.min(dt, OFFLINE_MAX)); dt = 0; }
    dt = Math.min(dt, 0.1);
    if (dt > 0) {
      S.playTime += dt;
      const b = bpsNow();
      if (b > 0) giveBricks(b * dt, true);
      TC.addMoney(S, rentNow() * dt);
      updateEvents(dt);
    }
    combo.idle += dt;
    if (combo.idle > 0.9 && combo.n > 0) combo.n = Math.max(0, combo.n - dt * 30);
    world.render(dt);

    hudT += dt; shopT += dt; saveT += dt; achT += dt;
    if (hudT > 0.1) { hudT = 0; updateHud(); updateCombo(); if (S.tut > 0 && S.tut < 99) updateTutorial(); }
    if (shopT > 0.25) { shopT = 0; refreshShop(); }
    if (achT > 1) { achT = 0; checkAchievements(); if (!$('tab-conquistas').hidden) renderAchievements(); }
    if (saveT > 10) { saveT = 0; save(); }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  // ================================================================
  // Início
  // ================================================================
  function start() {
    ART.paintIcon($('logo-icon'), 'tijolo');
    ART.paintIcon($('star-icon'), 'estrela');
    const veteran = load();
    TC.dirty();
    buildShop();
    updateSoundBtn();
    showDeliverIdle();
    showTab('loja');
    if (S.clicks >= 12 || S.floors > 0 || S.stars > 0) hintEl.hidden = true;
    const away = Math.min((Date.now() - (S.lastSave || Date.now())) / 1000, OFFLINE_MAX);
    if (away > 30 && (TC.bps(S) > 0 || TC.rent(S) > 0)) showOffline(simulate(away), away);
    world.snapCamera();
    updateHud();
    refreshShop();
    if (veteran) toast(`Bem-vindo! Bônus de veterano: +${veteran} ★ de Reputação.`, 'big');
    if (S.perkOffer) openPerkModal(); else maybeOfferPerk();
    if (S.tut > 0 && S.tut < 99) showTutorialStep();
    save();
    requestAnimationFrame(t => { last = t; frame(t); });
  }

  start();
})();
