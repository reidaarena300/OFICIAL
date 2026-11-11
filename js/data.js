/* Tijolo Clicker — dados e fórmulas da economia (sem DOM; também roda no Node para simulações). */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // Equipe e máquinas (produzem tijolos por segundo)
  // ---------------------------------------------------------------
  const PRODUCERS = [
    { id: 'servente',   name: 'Servente',                  desc: 'Carrega tijolo e massa o dia inteiro.',          base: 15,     bps: 0.2 },
    { id: 'pedreiro',   name: 'Pedreiro',                  desc: 'Assenta tijolo no prumo e no nível.',            base: 110,    bps: 1 },
    { id: 'betoneira',  name: 'Betoneira',                 desc: 'Argamassa fresquinha sem parar.',                base: 1200,   bps: 8 },
    { id: 'mestre',     name: 'Mestre de obras',           desc: 'Organiza a equipe e cobra ritmo.',               base: 13000,  bps: 50 },
    { id: 'caminhao',   name: 'Caminhão de tijolos',       desc: 'Entrega milheiros de tijolo na porta da obra.',  base: 145000, bps: 270 },
    { id: 'guindaste',  name: 'Guindaste de torre',        desc: 'Ergue paletes inteiros até o último andar.',     base: 1.6e6,  bps: 1500 },
    { id: 'engenheira', name: 'Engenheira civil',          desc: 'Planeja cada etapa e corta o desperdício.',      base: 2.1e7,  bps: 8000 },
    { id: 'bomba',      name: 'Bomba de concreto',         desc: 'Concreta uma laje inteira em minutos.',          base: 3.4e8,  bps: 45000 },
    { id: 'impressora', name: 'Impressora 3D de concreto', desc: 'Imprime paredes camada por camada.',             base: 5.3e9,  bps: 270000 },
    { id: 'robo',       name: 'Robô pedreiro',             desc: 'Não para nem para o cafezinho.',                 base: 8e10,   bps: 1.7e6 },
    { id: 'fabrica',    name: 'Fábrica de pré-moldados',   desc: 'Paredes prontas saindo da esteira.',             base: 1.1e12, bps: 1.05e7 },
    { id: 'consorcio',  name: 'Consórcio de construtoras', desc: 'Metade das gruas da cidade trabalham para você.', base: 1.5e13, bps: 7e7 },
  ];
  const PROD_GROWTH = 1.15;

  // Melhorias de cada membro da equipe: dobram a produção daquele tipo
  const TIER_AT = [1, 5, 25, 50, 100, 150];
  const TIER_COST = [10, 50, 500, 5e4, 5e6, 5e8];
  const TIER_NAMES = {
    servente:   ['Luvas de raspa', 'Carrinho de mão', 'Botina com bico de aço', 'Marmita reforçada', 'Curso de capacitação', 'Servente sênior'],
    pedreiro:   ['Colher de aço inox', 'Prumo e nível de bolha', 'Argamassa pronta', 'Linha de pedreiro', 'Desempenadeira de ouro', 'Pedreiro lendário'],
    betoneira:  ['Motor reforçado', 'Tambor de 400 litros', 'Traço perfeito', 'Betoneira dupla', 'Aditivo acelerador', 'Usina de argamassa'],
    mestre:     ['Prancheta organizada', 'Cronograma semanal', 'Rádio comunicador', 'Reunião das 7h', 'Planilha de metas', 'Mestre dos mestres'],
    caminhao:   ['Pneus novos', 'Carroceria estendida', 'Rota otimizada', 'Munck acoplado', 'Frota de caminhões', 'Entrega na hora certa'],
    guindaste:  ['Cabo de aço extra', 'Lança de 60 metros', 'Operador certificado', 'Contrapeso calibrado', 'Guindaste duplo', 'Grua autoescalável'],
    engenheira: ['Projeto estrutural', 'Software de cálculo', 'Modelo BIM em 3D', 'Engenharia de valor', 'Mestrado em estruturas', 'Prêmio de engenharia'],
    bomba:      ['Mangote longo', 'Lança articulada', 'Concreto usinado', 'Bombeamento noturno', 'Concreto autoadensável', 'Bomba estacionária'],
    impressora: ['Bico de precisão', 'Mistura imprimível', 'Camadas mais altas', 'Impressão contínua', 'Braço robótico', 'Impressora do tamanho de um prédio'],
    robo:       ['Bateria de longa duração', 'Sensor de nível a laser', 'Visão computacional', 'Enxame de robôs', 'Aprendizado de máquina', 'Robô mestre de obras'],
    fabrica:    ['Esteira automatizada', 'Fôrma metálica', 'Cura a vapor', 'Terceiro turno', 'Fábrica 4.0', 'Rede de fábricas'],
    consorcio:  ['Parceria estratégica', 'Licitação vencida', 'Ações na bolsa', 'Sede própria', 'Contratos internacionais', 'Gigante da construção'],
  };

  const UPGRADES = [];
  PRODUCERS.forEach(p => {
    TIER_AT.forEach((at, t) => {
      UPGRADES.push({
        id: `${p.id}-${t}`, kind: 'prod', prod: p.id, tier: t,
        name: TIER_NAMES[p.id][t], desc: `${p.name}: produção ×2.`,
        cost: Math.round(p.base * TIER_COST[t]),
        unlock: S => S.owned[p.id] >= at,
        hint: `Tenha ${at} ${p.name.toLowerCase()}`,
      });
    });
  });

  // Cliques
  [
    ['luva', 'Luva de couro', 'Cliques valem o dobro.', 100, 40],
    ['colher', 'Colher de pedreiro', 'Cliques valem o dobro.', 700, 400],
    ['antebraco', 'Braço de pedreiro', 'Cliques valem o dobro.', 15000, 6000],
  ].forEach(([id, name, desc, cost, need], t) => {
    UPGRADES.push({ id: 'click-' + id, kind: 'click', tier: t, name, desc, cost, unlock: S => S.runBricks >= need, hint: `Assente ${need} tijolos` });
  });
  ['I', 'II', 'III', 'IV', 'V', 'VI'].forEach((n, t) => {
    const cost = 6e4 * Math.pow(100, t);
    UPGRADES.push({
      id: 'ritmo-' + t, kind: 'ritmo', tier: t, name: 'Ritmo de obra ' + n,
      desc: 'Cada clique também ganha 1% dos tijolos/s.', cost,
      unlock: S => S.runBricks >= cost / 4, hint: 'Assente mais tijolos',
    });
  });

  // Aluguel
  [
    ['sindico', 'Síndico profissional', 3],
    ['portaria', 'Portaria 24 horas', 7],
    ['elevador', 'Elevador panorâmico', 12],
    ['academia', 'Academia no térreo', 18],
    ['piscina', 'Piscina na cobertura', 26],
    ['heliponto', 'Heliponto', 36],
    ['selo', 'Selo de construção sustentável', 50],
  ].forEach(([id, name, floors], t) => {
    UPGRADES.push({
      id: 'rent-' + id, kind: 'rent', tier: t, name, desc: 'Aluguel +50%.',
      cost: Math.round(400 * Math.pow(60, t)),
      unlock: S => S.floors >= floors, hint: `Construa ${floors} pavimentos`,
    });
  });

  // ---------------------------------------------------------------
  // Acabamentos (repetíveis, aparecem no prédio, aumentam o aluguel)
  // ---------------------------------------------------------------
  const FINISHES = [
    { id: 'janela',   name: 'Janela',          desc: '+10% no aluguel. Até 2 por pavimento.', base: 50,  growth: 1.14, bonus: 0.10, limit: S => S.floors * 2 },
    { id: 'porta',    name: 'Sacada',          desc: '+15% no aluguel. 1 por pavimento.',     base: 150, growth: 1.18, bonus: 0.15, limit: S => S.floors },
    { id: 'floreira', name: 'Floreira',        desc: '+5% no aluguel. 1 por janela.',          base: 80,  growth: 1.14, bonus: 0.05, limit: S => S.owned.janela },
    { id: 'ar',       name: 'Ar-condicionado', desc: '+10% no aluguel. 1 por pavimento.',     base: 400, growth: 1.16, bonus: 0.10, limit: S => S.floors },
  ];

  // Segurança (compra única por obra)
  const SAFETY = [
    { id: 'lona',  name: 'Lona de proteção',    desc: 'A chuva não para a equipe.',    base: 250 },
    { id: 'epi',   name: 'Kit de EPI',          desc: 'O fiscal sempre aprova a obra.', base: 600 },
    { id: 'laudo', name: 'Laudo do engenheiro', desc: 'Evita rachaduras na obra.',      base: 1500 },
  ];

  // ---------------------------------------------------------------
  // Benefícios da obra: em alguns andares você escolhe 1 entre 3 (valem só nesta obra)
  // ---------------------------------------------------------------
  const PERKS = [
    { id: 'mao',       name: 'Mão firme',              desc: 'Cliques ×3.',                                         icon: 'click-0',   click: 3 },
    { id: 'turno',     name: 'Turno da noite',         desc: 'Equipe e máquinas +50%.',                             icon: 'mestre',    bps: 1.5 },
    { id: 'vip',       name: 'Inquilinos VIP',         desc: 'Aluguel ×2.',                                         icon: 'rent-0',    rent: 2 },
    { id: 'parceiro',  name: 'Fornecedor parceiro',    desc: 'Equipe e máquinas 25% mais baratas.',                 icon: 'caminhao',  prodDisc: 0.75 },
    { id: 'promo',     name: 'Promoção de acabamento', desc: 'Acabamentos pela metade do preço.',                   icon: 'janela',    finDisc: 0.5 },
    { id: 'laje',      name: 'Laje rápida',            desc: 'Pavimentos precisam de 20% menos tijolos.',           icon: 'tijolo',    need: 0.8 },
    { id: 'entregas',  name: 'Entregas frequentes',    desc: 'Entregas de material 2× mais frequentes e com prêmio dobrado.', icon: 'guindaste', crane: 2 },
    { id: 'blindada',  name: 'Obra blindada',          desc: 'Sem chuva, rachaduras ou multas.',                    icon: 'laudo',     immune: 1 },
    { id: 'frenesi',   name: 'Ritmo frenético',        desc: 'O combo de cliques vai até ×4.',                      icon: 'ritmo',     comboMax: 4 },
    { id: 'base',      name: 'Equipe de base',         desc: 'Serventes e pedreiros produzem ×5.',                  icon: 'servente',  base: 5 },
    { id: 'ouro',      name: 'Olho de ouro',           desc: 'Tijolos de ouro aparecem 2× mais e valem o dobro.',   icon: 'estrela',   gold: 2 },
    { id: 'adiantado', name: 'Pagamento adiantado',    desc: 'Receba agora 5× o pagamento do próximo pavimento.',   icon: 'rent-1',    instant: 1 },
  ];
  // valor combinado de um efeito dos benefícios escolhidos (multiplica)
  const perkVal = (S, key, def = 1) => {
    let v = def;
    for (const id in S.perks) { const pk = PERK_BY_ID[id]; if (pk && pk[key] != null) v = key === 'comboMax' ? Math.max(v, pk[key]) : v * pk[key]; }
    return v;
  };
  const PERK_BY_ID = {};
  PERKS.forEach(p => { PERK_BY_ID[p.id] = p; });
  // de quantos em quantos andares aparece uma escolha
  const perkEvery = P => Math.max(2, Math.ceil(P.floors / 5));

  // ---------------------------------------------------------------
  // Obras (projetos). Ao concluir, entregue para ganhar Reputação.
  // ---------------------------------------------------------------
  const PROJECTS = [
    { id: 'casa',        name: 'Casa',                 floors: 3,  stars: 1,  cols: 14, style: 'casa' },
    { id: 'sobrado',     name: 'Sobrado',              floors: 6,  stars: 1,  cols: 16, style: 'sobrado' },
    { id: 'residencial', name: 'Edifício residencial', floors: 12, stars: 2,  cols: 18, style: 'residencial' },
    { id: 'comercial',   name: 'Edifício comercial',   floors: 20, stars: 3,  cols: 20, style: 'comercial' },
    { id: 'hotel',       name: 'Hotel',                floors: 30, stars: 5,  cols: 20, style: 'hotel' },
    { id: 'arranha',     name: 'Arranha-céu',          floors: 45, stars: 8,  cols: 18, style: 'vidro' },
    { id: 'torre',       name: 'Torre recorde',        floors: 60, stars: 12, cols: 16, style: 'torre' },
  ];

  // ---------------------------------------------------------------
  // Fórmulas
  // ---------------------------------------------------------------
  const NEED_BASE = 50, NEED_GROWTH = 1.55, RENT_RATE = 0.002;
  const need = i => Math.ceil(NEED_BASE * Math.pow(NEED_GROWTH, i));       // tijolos do pavimento i
  const reward = i => Math.ceil(need(i) * 0.6);                            // pagamento ao concluir
  const floorRent = i => 0.2 + need(i) * RENT_RATE;                            // aluguel do pavimento i (R$/s)
  const baseRent = n => {                                                  // soma do aluguel de n pavimentos
    if (n <= 0) return 0;
    const g = NEED_GROWTH;
    return 0.2 * n + RENT_RATE * NEED_BASE * (Math.pow(g, n) - 1) / (g - 1);
  };

  const LAST = PROJECTS.length - 1;
  // A Torre recorde fica 5 andares mais alta a cada entrega
  const project = S => {
    const p = PROJECTS[Math.min(S.project, LAST)];
    if (p.id !== 'torre') return p;
    const rep = S.delivered.torre || 0;
    return Object.assign({}, p, { floors: p.floors + 5 * rep, stars: p.stars + 3 * rep, record: rep > 0 });
  };

  // Os cálculos ficam guardados e só são refeitos quando algo muda (chame dirty() após compras).
  let VER = 0;
  const dirty = () => { VER++; };
  let memo = null;
  function calc(S) {
    if (memo && memo.v === VER && memo.S === S && memo.floors === S.floors && memo.stars === S.stars) return memo;
    const m = { v: VER, S, floors: S.floors, stars: S.stars, cnt: { click: 0, ritmo: 0, rent: 0 }, prodCnt: {} };
    for (const u of UPGRADES) {
      if (!S.upg[u.id]) continue;
      if (u.kind === 'prod') m.prodCnt[u.prod] = (m.prodCnt[u.prod] || 0) + 1;
      else m.cnt[u.kind]++;
    }
    m.global = (1 + 0.05 * S.stars) * (1 + 0.01 * Object.keys(S.ach).length);
    m.prodBps = {};
    m.bps = 0;
    const baseBoost = perkVal(S, 'base');
    const bpsBoost = perkVal(S, 'bps');
    for (const p of PRODUCERS) {
      const each = p.bps * Math.pow(2, m.prodCnt[p.id] || 0) * m.global * bpsBoost * ((p.id === 'servente' || p.id === 'pedreiro') ? baseBoost : 1);
      m.prodBps[p.id] = { each, total: each * S.owned[p.id] };
      m.bps += each * S.owned[p.id];
    }
    m.clickBase = Math.pow(2, m.cnt.click) * m.global * perkVal(S, 'click');
    m.clickShare = 0.01 * m.cnt.ritmo;
    m.finishMult = 1 + FINISHES.reduce((a, f) => a + f.bonus * S.owned[f.id], 0);
    m.rentUpg = Math.pow(1.5, m.cnt.rent);
    m.rent = baseRent(S.floors) * m.finishMult * m.rentUpg * m.global * perkVal(S, 'rent');
    memo = m;
    return m;
  }

  const upgCount = (S, kind, prod) => kind === 'prod' ? (calc(S).prodCnt[prod] || 0) : calc(S).cnt[kind];
  const starMult = S => 1 + 0.05 * S.stars;
  const achMult = S => 1 + 0.01 * Object.keys(S.ach).length;
  const globalMult = S => calc(S).global;

  const prodMult = (S, id) => Math.pow(2, upgCount(S, 'prod', id));
  const prodEach = (S, p) => calc(S).prodBps[p.id].each;
  const prodBps = (S, p) => calc(S).prodBps[p.id].total;
  const bps = S => calc(S).bps;

  const clickBase = S => calc(S).clickBase;
  const clickBpsShare = S => calc(S).clickShare;
  const clickPower = (S, bpsNow) => clickBase(S) + bpsNow * clickBpsShare(S);

  const finishMult = S => calc(S).finishMult;
  const rentUpgMult = S => calc(S).rentUpg;
  const rent = S => calc(S).rent;

  const prodCost = (S, p, n = 1) => {
    const a = p.base * Math.pow(PROD_GROWTH, S.owned[p.id]) * perkVal(S, 'prodDisc');
    return Math.ceil(a * (Math.pow(PROD_GROWTH, n) - 1) / (PROD_GROWTH - 1));
  };
  const finishCost = (S, f, n = 1) => {
    const a = f.base * Math.pow(f.growth, S.owned[f.id]) * perkVal(S, 'finDisc');
    return Math.ceil(a * (Math.pow(f.growth, n) - 1) / (f.growth - 1));
  };
  // tijolos que o pavimento i precisa nesta obra (com benefícios)
  const needFor = (S, i) => Math.ceil(need(i) * perkVal(S, 'need'));

  // Estrelas ganhas ao entregar a obra atual
  const deliveryStars = S => project(S).stars;

  // ---------------------------------------------------------------
  // Conquistas (cada uma dá +1% em tudo)
  // ---------------------------------------------------------------
  const ACHIEVEMENTS = [];
  const ach = (id, name, desc, test) => ACHIEVEMENTS.push({ id, name, desc, test });
  [[1, 'Primeira laje'], [5, 'Já dá para morar'], [10, 'Dez andares'], [20, 'Vista privilegiada'], [30, 'Acima das nuvens'], [45, 'Arranhando o céu'], [60, 'Recorde mundial'], [80, 'Além do recorde']]
    .forEach(([n, name]) => ach('floors-' + n, name, `Conclua ${n} pavimento${n > 1 ? 's' : ''} em uma obra.`, S => S.floors >= n));
  [[1e3, 'Mil tijolos'], [1e5, 'Cem mil tijolos'], [1e7, 'Dez milhões de tijolos'], [1e9, 'Um bilhão de tijolos'], [1e11, 'Montanha de tijolos'], [1e13, 'Planeta tijolo']]
    .forEach(([n, name]) => ach('bricks-' + n, name, `Assente ${fmt(n)} tijolos no total.`, S => S.totalBricks >= n));
  [[100, 'Dedo calejado'], [1000, 'Mão de obra'], [10000, 'Clique de concreto']]
    .forEach(([n, name]) => ach('clicks-' + n, name, `Clique ${fmt(n)} vezes.`, S => S.clicks >= n));
  PRODUCERS.forEach(p => ach('hire-' + p.id, p.name, `Tenha 1 ${p.name.toLowerCase()}.`, S => S.owned[p.id] >= 1));
  ach('team-50', 'Canteiro cheio', 'Tenha 50 membros na equipe ao mesmo tempo.', S => PRODUCERS.reduce((a, p) => a + S.owned[p.id], 0) >= 50);
  ach('team-200', 'Cidade de operários', 'Tenha 200 membros na equipe ao mesmo tempo.', S => PRODUCERS.reduce((a, p) => a + S.owned[p.id], 0) >= 200);
  ach('upg-10', 'Ferramenta certa', 'Compre 10 melhorias.', S => Object.keys(S.upg).length >= 10);
  ach('upg-40', 'Obra de primeira', 'Compre 40 melhorias.', S => Object.keys(S.upg).length >= 40);
  ach('janelas-20', 'Muita luz', 'Tenha 20 janelas em uma obra.', S => S.owned.janela >= 20);
  ach('cranes-1', 'Pegou no ar', 'Pegue uma entrega de material.', S => S.stats.cranes >= 1);
  ach('cranes-25', 'Rei das entregas', 'Pegue 25 entregas de material.', S => S.stats.cranes >= 25);
  ach('cracks-5', 'Reboco em dia', 'Conserte 5 rachaduras.', S => S.stats.cracks >= 5);
  ach('approved-3', 'Obra exemplar', 'Seja aprovado pelo fiscal 3 vezes.', S => S.stats.approved >= 3);
  ach('choices-10', 'Decisão de gestor', 'Responda 10 propostas.', S => S.stats.choices >= 10);
  ach('combo-30', 'Martelada sem parar', 'Chegue a um combo de 30 cliques.', S => S.stats.bestCombo >= 30);
  ach('golden-1', 'Tijolo de ouro', 'Pegue um tijolo de ouro.', S => S.stats.golden >= 1);
  ach('golden-20', 'Garimpeiro de obra', 'Pegue 20 tijolos de ouro.', S => S.stats.golden >= 20);
  ach('perks-10', 'Planejador', 'Escolha 10 benefícios de obra.', S => S.stats.perks >= 10);
  ach('money-1e6', 'Milionário', 'Tenha R$ 1 milhão de uma vez.', S => S.money >= 1e6);
  ach('money-1e12', 'Trilionário', 'Tenha R$ 1 trilhão de uma vez.', S => S.money >= 1e12);
  PROJECTS.forEach(p => ach('deliver-' + p.id, 'Entregou: ' + p.name, `Entregue a obra "${p.name}".`, S => (S.delivered[p.id] || 0) >= 1));

  // ---------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------
  function freshOwned() {
    const o = {};
    for (const p of PRODUCERS) o[p.id] = 0;
    for (const f of FINISHES) o[f.id] = 0;
    for (const s of SAFETY) o[s.id] = 0;
    return o;
  }

  function freshState() {
    return {
      v: 2, project: 0, stars: 0, delivered: {},
      bricks: 0, floors: 0, money: 0, runBricks: 0, runMoney: 0,
      totalBricks: 0, totalMoney: 0, clicks: 0, playTime: 0,
      owned: freshOwned(), upg: {}, ach: {},
      stats: { cranes: 0, cracks: 0, inspections: 0, approved: 0, fines: 0, choices: 0, golden: 0, bestCombo: 0, perks: 0 },
      perks: {}, perkAt: 0, perkOffer: null, tut: 0,
      seen: {}, muted: false, lastSave: Date.now(), started: Date.now(),
    };
  }

  // Recomeça a obra mantendo o que é permanente
  function newRun(S) {
    // equipe fiel: 1 de cada tipo de operário/máquina que você tinha vai para a próxima obra
    const kept = {};
    for (const p of PRODUCERS) if (S.owned[p.id] > 0) kept[p.id] = 1;
    S.bricks = 0; S.floors = 0; S.money = 0; S.runBricks = 0; S.runMoney = 0;
    S.owned = Object.assign(freshOwned(), kept); S.upg = {}; S.seen = {};
    for (const id in kept) S.seen[id] = true;
    S.perks = {}; S.perkAt = 0; S.perkOffer = null;
    dirty();
    return kept;
  }

  function addBricks(S, n) {
    const target = project(S).floors;
    let done = 0, earned = 0;
    S.totalBricks += n;
    S.runBricks += n;
    if (S.floors >= target) {
      // obra pronta: tijolos excedentes são vendidos
      const m = n * 0.6;
      S.money += m; S.runMoney += m; S.totalMoney += m;
      return { done: 0, earned: 0, sold: m };
    }
    S.bricks += n;
    while (S.floors < target && S.bricks >= needFor(S, S.floors)) {
      S.bricks -= needFor(S, S.floors);
      const r = reward(S.floors);
      S.money += r; S.runMoney += r; S.totalMoney += r; earned += r;
      S.floors++; done++;
    }
    if (done) dirty();
    if (S.floors >= target && S.bricks > 0) {
      const m = S.bricks * 0.6;
      S.money += m; S.runMoney += m; S.totalMoney += m;
      S.bricks = 0;
    }
    return { done, earned, sold: 0 };
  }

  function addMoney(S, n) { S.money += n; S.runMoney += n; S.totalMoney += n; }

  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '−' + fmt(-n);
    if (n < 1000) {
      if (n < 10 && n % 1 > 0.05) return n.toFixed(1).replace('.', ',');
      return String(Math.floor(n));
    }
    const units = [[1e24, 'sept'], [1e21, 'sext'], [1e18, 'quint'], [1e15, 'quatri'], [1e12, 'tri'], [1e9, 'bi'], [1e6, 'mi'], [1e3, 'mil']];
    for (const [v, s] of units) {
      if (n >= v) {
        const x = n / v;
        return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0).replace('.', ',') + ' ' + s;
      }
    }
    return String(Math.floor(n));
  }

  const TC = {
    PRODUCERS, PROD_GROWTH, UPGRADES, FINISHES, SAFETY, PROJECTS, ACHIEVEMENTS, PERKS, PERK_BY_ID,
    perkVal, perkEvery, needFor, prodEach, dirty,
    need, reward, floorRent, baseRent, project, upgCount, starMult, achMult, globalMult,
    prodMult, prodBps, bps, clickBase, clickBpsShare, clickPower, finishMult, rentUpgMult, rent,
    prodCost, finishCost, deliveryStars, freshState, freshOwned, newRun, addBricks, addMoney, fmt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = TC;
  else root.TC = TC;
})(typeof window !== 'undefined' ? window : globalThis);
