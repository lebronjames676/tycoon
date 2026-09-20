/* ============================================================
   state.js - the save file, derived stats and progression math
   ============================================================ */
(function (root) {
  'use strict';

  var S = {};
  var game = null;          /* the live state object */

  /* ---------------------------------------------------------
     Fresh state
     --------------------------------------------------------- */
  function blankStats() {
    return { nodes: 0, mined: {}, sold: 0, swings: 0, playtime: 0, bestMoney: 0, totalEarned: 0, built: 0, visited: { sky: 1 } };
  }

  S.create = function (carry) {
    carry = carry || {};
    var st = {
      version: 1,
      money: 0,
      lifeEarned: 0,
      size: D.START_SIZE,
      layer: 0,
      dim: 0,
      layersUnlocked: 1,
      deepest: 0,
      inv: {},                 /* oreId -> count carried in the bag  */
      store: {},               /* oreId -> count in the warehouses    */
      keep: {},                /* oreId -> 1 = protect + warehouse it */
      gear: { pick: 0, bag: 0, boots: 0, gloves: 0, charm: 0, lamp: 0 },
      buildings: [],           /* {id, x, y}                                   */
      buildCount: {},          /* buildingId -> how many bought (price ladder) */
      level: 1,
      xp: 0,
      cores: carry.cores || 0,
      coresTotal: carry.coresTotal || 0,
      perks: carry.perks || {},
      rebirths: carry.rebirths || 0,
      achievements: carry.achievements || {},
      stats: carry.stats || blankStats(),
      quest: carry.quest || 0,
      questLog: carry.questLog || [],
      contracts: [],
      contractsDone: carry.contractsDone || 0,
      tut: carry.tut || null,
      autoMine: true,
      lastSeen: U.now(),
      playerX: D.SPAWN.x + 0.5,
      playerY: D.SPAWN.y + 0.5,
      tip: 0
    };

    /* rebirth milestones seed the new life before anything else */
    var rb = S.rebirthBonuses(st.rebirths);
    st.money += rb.startMoney;
    st.size = U.clamp(D.START_SIZE + rb.size, D.START_SIZE, D.MAX_SIZE);
    st.layersUnlocked = U.clamp(rb.layers, 1, D.LAYERS.length);
    st.deepest = st.layersUnlocked - 1;
    if (rb.startBuildings.length) {
      var spot = 0;
      for (var bi = 0; bi < rb.startBuildings.length; bi++) {
        var bx = D.CENTER - 2 + (spot % 3), by = D.CENTER - 2;
        st.buildings.push({ id: rb.startBuildings[bi], x: bx, y: by, t: U.now() });
        st.buildCount[rb.startBuildings[bi]] = (st.buildCount[rb.startBuildings[bi]] || 0) + 1;
        spot++;
      }
    }

    /* Head Start perk: begin with gear + seed money */
    var head = st.perks.start || 0;
    if (head > 0) {
      st.gear.pick = Math.min(head, D.GEAR.pick.tiers.length - 1);
      st.gear.bag = Math.min(head, D.GEAR.bag.tiers.length - 1);
      st.gear.gloves = Math.min(head, D.GEAR.gloves.tiers.length - 1);
      st.money = 2000 * Math.pow(6, head);
      st.level = 1 + head * 3;
    }
    return st;
  };

  /* ---------------------------------------------------------
     Rebirth milestones - everything unlocked by rebirth count
     --------------------------------------------------------- */
  S.rebirthBonuses = function (rebirths) {
    var out = { money: 0, power: 0, build: 0, cores: 0, startMoney: 0, layers: 1, size: 0,
                startBuildings: [], dims: 1 };
    for (var i = 0; i < D.REBIRTH_MILESTONES.length; i++) {
      var m = D.REBIRTH_MILESTONES[i];
      if (rebirths < m.at) continue;
      if (m.money) out.money += m.money;
      if (m.power) out.power += m.power;
      if (m.build) out.build += m.build;
      if (m.cores) out.cores += m.cores;
      if (m.startMoney) out.startMoney = Math.max(out.startMoney, m.startMoney);
      if (m.layers) out.layers = Math.max(out.layers, m.layers);
      if (m.size) out.size = Math.max(out.size, m.size);
      if (m.startBuildings) out.startBuildings = m.startBuildings;
      if (m.dim) out.dims = Math.max(out.dims, m.dim + 1);
    }
    return out;
  };

  S.nextRebirthMilestone = function (rebirths) {
    for (var i = 0; i < D.REBIRTH_MILESTONES.length; i++) {
      if (rebirths < D.REBIRTH_MILESTONES[i].at) return D.REBIRTH_MILESTONES[i];
    }
    return null;
  };

  /* ---------------------------------------------------------
     Dimensions
     --------------------------------------------------------- */
  S.dim = function () {
    return D.DIMENSIONS[U.clamp(game.dim | 0, 0, D.DIMENSIONS.length - 1)];
  };

  S.dimUnlocked = function (index) {
    var d = D.DIMENSIONS[index];
    return !!d && game.rebirths >= d.rebirths;
  };

  S.dimsUnlocked = function () {
    var n = 0;
    for (var i = 0; i < D.DIMENSIONS.length; i++) if (S.dimUnlocked(i)) n++;
    return n;
  };

  /* the global layer table merged with this dimension's look and naming */
  S.layer = function (index) {
    var i = U.clamp(index | 0, 0, D.LAYERS.length - 1);
    var base = D.LAYERS[i], dim = S.dim();
    var f = dim.floors[i] || base.floors;
    return {
      index: i,
      name: dim.layerNames[i] || base.name,
      cost: base.cost,
      hpMult: base.hpMult,
      valMult: base.valMult,
      floor: f[0], floor2: f[1], wall: f[2], light: f[3]
    };
  };

  /* the ore table for wherever we are standing */
  S.dimOres = function () {
    return D.ORES_BY_DIM[S.dim().index] || D.ORES_BY_DIM[0];
  };

  S.travel = function (index) {
    if (!S.dimUnlocked(index)) return false;
    if (game.layer !== 0) return false;
    game.dim = index;
    game.layer = 0;
    if (!game.stats.visited) game.stats.visited = { sky: 1 };
    game.stats.visited[D.DIMENSIONS[index].id] = 1;
    return true;
  };

  /* what a dimension is worth relative to home, for the travel screen */
  S.dimAvgValue = function (index) {
    var list = D.ORES_BY_DIM[index] || [];
    if (!list.length) return 0;
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].value;
    return total / list.length;
  };

  S.dimAvgHp = function (index) {
    var list = D.ORES_BY_DIM[index] || [];
    if (!list.length) return 0;
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].hp;
    return total / list.length;
  };

  S.get = function () { return game; };
  S.set = function (st) { game = st; };

  /* ---------------------------------------------------------
     Derived stats - recomputed cheaply whenever asked
     --------------------------------------------------------- */
  function perk(id) { return game.perks[id] || 0; }
  S.perk = perk;

  S.gearTier = function (slot) {
    var chainTiers = D.GEAR[slot].tiers;
    return chainTiers[U.clamp(game.gear[slot], 0, chainTiers.length - 1)];
  };

  /* total bonus from every completed milestone tier, by bonus key */
  S.milestoneBonuses = function () {
    var out = {};
    for (var i = 0; i < D.MILESTONES.length; i++) {
      var t = D.MILESTONES[i];
      out[t.bonus] = (out[t.bonus] || 0) + D.milestoneTier(t, game) * t.per;
    }
    return out;
  };

  /* how much of a given effect every placed building adds up to */
  function buildingSum(key) {
    var total = 0;
    for (var i = 0; i < game.buildings.length; i++) {
      var def = D.BUILD_BY_ID[game.buildings[i].id];
      if (def && def[key]) total += def[key];
    }
    return total;
  }
  S.buildingSum = buildingSum;

  S.derive = function () {
    var g = game;
    var ms = S.milestoneBonuses();
    var rb = S.rebirthBonuses(g.rebirths);

    var dim = S.dim();
    var pickPow = S.gearTier('pick').stat;
    var levelBonus = 1 + (g.level - 1) * 0.02;
    var perkPow = 1 + perk('muscle') * 0.20;
    var corePow = 1 + g.cores * 0.01;
    var crewPow = 1 + buildingSum('playerPower');          /* jackhammer crews */

    var d = {
      power: pickPow * levelBonus * perkPow * corePow * crewPow
        * (1 + (ms.power || 0)) * (1 + rb.power),
      capacity: Math.floor(S.gearTier('bag').stat * (1 + perk('pockets') * 0.40)),
      speed: S.gearTier('boots').stat * (1 + perk('swift') * 0.08) * (1 + (g.level - 1) * 0.004) * dim.speed,
      swing: S.gearTier('gloves').stat * (1 + perk('hands') * 0.10) * (1 + (ms.swing || 0)) * dim.swing,
      luck: S.gearTier('lamp').stat + perk('lucky') * 0.06
        + buildingSum('luck') + (ms.luck || 0) + dim.luck,
      doubleChance: U.clamp(perk('magnet') * 0.08 + buildingSum('doubleOre') + dim.double, 0, 0.95),
      respawn: Math.max(0.25, D.RESPAWN * dim.respawn / (1 + perk('scan') * 0.12 + buildingSum('respawn'))),
      buildMult: (1 + perk('foreman') * 0.20 + (ms.buildMult || 0)) * (1 + rb.build) * dim.build,
      offlineRate: U.clamp(0.25 + perk('offline') * 0.08, 0, 1),
      light: S.gearTier('lamp').stat,
      contractBonus: 1 + (ms.contract || 0)
    };

    /* money multiplier: charm x perks x cores x refining buildings x meta */
    d.valueMult = S.gearTier('charm').stat
      * (1 + perk('golden') * 0.25)
      * (1 + g.cores * 0.03)
      * (1 + S.countBuilding('vault') * D.BUILD_BY_ID.vault.bonus
           + S.countBuilding('smelt') * D.BUILD_BY_ID.smelt.bonus
           + S.countBuilding('refine') * D.BUILD_BY_ID.refine.bonus)
      * (1 + g.rebirths * 0.05)
      * (1 + (ms.value || 0))
      * (1 + (ms.money || 0))
      * (1 + rb.money);

    return d;
  };

  /* ---------------------------------------------------------
     Warehouse storage
     --------------------------------------------------------- */
  S.storageCap = function () {
    var n = S.countBuilding('store');
    if (!n) return 0;
    return Math.floor(n * D.STORE_PER_BUILDING * (1 + perk('pockets') * 0.40));
  };

  S.stored = function () {
    var n = 0;
    for (var k in game.store) n += game.store[k];
    return n;
  };

  S.storageRoom = function () { return Math.max(0, S.storageCap() - S.stored()); };

  /* an ore is protected from every automatic sale while it has somewhere to go */
  S.isProtected = function (oreId) {
    return !!game.keep[oreId] && S.storageCap() > 0 && S.storageRoom() > 0;
  };

  S.toggleKeep = function (oreId) {
    if (game.keep[oreId]) delete game.keep[oreId];
    else game.keep[oreId] = 1;
    return !!game.keep[oreId];
  };

  /* move ore into the warehouse, returns how much actually fit */
  S.depositOre = function (oreId, amount) {
    var room = S.storageRoom();
    var give = Math.min(amount, Math.max(0, room));
    if (give <= 0) return 0;
    game.store[oreId] = (game.store[oreId] || 0) + give;
    return give;
  };

  /* total of one ore across the bag and the warehouses */
  S.oreHave = function (oreId) {
    return (game.inv[oreId] || 0) + (game.store[oreId] || 0);
  };

  /* spend ore, bag first then warehouse */
  S.takeOre = function (oreId, amount) {
    if (S.oreHave(oreId) < amount) return false;
    var fromBag = Math.min(amount, game.inv[oreId] || 0);
    if (fromBag > 0) {
      game.inv[oreId] -= fromBag;
      if (game.inv[oreId] <= 0) delete game.inv[oreId];
    }
    var rest = amount - fromBag;
    if (rest > 0) {
      game.store[oreId] -= rest;
      if (game.store[oreId] <= 0) delete game.store[oreId];
    }
    return true;
  };

  S.countBuilding = function (id) {
    var n = 0;
    for (var i = 0; i < game.buildings.length; i++) if (game.buildings[i].id === id) n++;
    return n;
  };

  /* power supply / demand across all buildings */
  S.power = function () {
    var supply = 0, demand = 0;
    for (var i = 0; i < game.buildings.length; i++) {
      var b = D.BUILD_BY_ID[game.buildings[i].id];
      if (!b) continue;
      if (b.power > 0) supply += b.power; else demand += -b.power;
    }
    return {
      supply: supply, demand: demand,
      efficiency: demand === 0 ? 1 : U.clamp(supply / demand, 0.35, 1)
    };
  };

  /* ---------------------------------------------------------
     Inventory helpers
     --------------------------------------------------------- */
  S.carried = function () {
    var n = 0;
    for (var k in game.inv) n += game.inv[k];
    return n;
  };

  S.addOre = function (oreId, amount) {
    var cap = S.derive().capacity;
    var free = cap - S.carried();
    var give = Math.min(amount, Math.max(0, free));
    if (give <= 0) return 0;
    game.inv[oreId] = (game.inv[oreId] || 0) + give;
    game.stats.mined[oreId] = (game.stats.mined[oreId] || 0) + give;
    return give;
  };

  S.oreValue = function (oreId, layer) {
    var ore = D.ORE_BY_ID[oreId];
    if (!ore) return 0;
    var lm = S.layer(layer === undefined ? game.deepest : layer).valMult;
    return ore.value * lm * S.derive().valueMult;
  };

  S.earn = function (amount) {
    if (!(amount > 0)) return 0;
    game.money += amount;
    game.lifeEarned += amount;
    game.stats.totalEarned += amount;
    if (game.money > game.stats.bestMoney) game.stats.bestMoney = game.money;
    return amount;
  };

  S.spend = function (amount) {
    if (game.money < amount) return false;
    game.money -= amount;
    return true;
  };

  /* ---------------------------------------------------------
     XP / levelling
     --------------------------------------------------------- */
  S.addXp = function (amount) {
    game.xp += amount;
    var gained = 0;
    while (game.xp >= D.xpForLevel(game.level)) {
      game.xp -= D.xpForLevel(game.level);
      game.level++;
      gained++;
    }
    return gained;
  };

  /* ---------------------------------------------------------
     Crafting
     --------------------------------------------------------- */
  S.canCraft = function (slot) {
    var chainDef = D.GEAR[slot];
    var next = chainDef.tiers[game.gear[slot] + 1];
    if (!next) return { ok: false, reason: 'max' };
    if (game.level < next.lvl) return { ok: false, reason: 'level', next: next };
    if (game.money < next.money) return { ok: false, reason: 'money', next: next };
    for (var id in next.ores) {
      if (S.oreHave(id) < next.ores[id]) return { ok: false, reason: 'ore', next: next };
    }
    return { ok: true, next: next };
  };

  S.craft = function (slot) {
    var c = S.canCraft(slot);
    if (!c.ok) return null;
    game.money -= c.next.money;
    for (var id in c.next.ores) S.takeOre(id, c.next.ores[id]);
    game.gear[slot]++;
    return c.next;
  };

  /* ---------------------------------------------------------
     Buildings
     --------------------------------------------------------- */
  S.buildingCost = function (id) {
    var def = D.BUILD_BY_ID[id];
    var owned = game.buildCount[id] || 0;
    return Math.floor(def.cost * Math.pow(def.growth, owned));
  };

  /* ---------------------------------------------------------
     Contracts
     --------------------------------------------------------- */
  S.ensureContracts = function () {
    if (!game.contracts) game.contracts = [];
    var guard = 0;
    while (game.contracts.length < D.CONTRACT_SLOTS && guard++ < 10) {
      game.contracts.push(D.rollContract(game));
    }
    return game.contracts;
  };

  S.contractPay = function (c) {
    return c.need * S.oreValue(c.ore, game.deepest) * D.CONTRACT_MULT * S.derive().contractBonus;
  };

  S.contractReady = function (c) {
    return S.oreHave(c.ore) >= c.need;
  };

  S.claimContract = function (id) {
    var list = S.ensureContracts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      var c = list[i];
      if (!S.contractReady(c)) return null;
      S.takeOre(c.ore, c.need);
      var pay = S.contractPay(c);
      S.earn(pay);
      var xp = D.contractReward(c).xp;
      S.addXp(xp);
      game.contractsDone++;
      game.stats.sold += c.need;
      list[i] = D.rollContract(game);
      return { pay: pay, xp: xp, ore: c.ore, need: c.need };
    }
    return null;
  };

  S.rerollCost = function (c) { return Math.ceil(S.contractPay(c) * 0.12); };

  S.rerollContract = function (id) {
    var list = S.ensureContracts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      var cost = S.rerollCost(list[i]);
      if (!S.spend(cost)) return false;
      list[i] = D.rollContract(game);
      return true;
    }
    return false;
  };

  /* ---------------------------------------------------------
     Quests - a single chain, advanced automatically
     --------------------------------------------------------- */
  S.activeQuest = function () {
    return D.QUESTS[game.quest] || null;
  };

  S.questProgress = function (q) {
    if (!q) return { now: 0, goal: 1, pct: 1 };
    var now = 0;
    try { now = q.prog(game) || 0; } catch (e) { now = 0; }
    return { now: now, goal: q.goal, pct: U.clamp(now / q.goal, 0, 1) };
  };

  /* completes as many quests as the current state satisfies */
  S.checkQuests = function () {
    var done = [], guard = 0;
    while (guard++ < 8) {
      var q = S.activeQuest();
      if (!q) break;
      if (S.questProgress(q).now < q.goal) break;
      if (q.money) S.earn(q.money);
      if (q.cores) { game.cores += q.cores; game.coresTotal += q.cores; }
      if (q.xp) S.addXp(q.xp);
      game.questLog.push(q.index);
      game.quest++;
      done.push(q);
    }
    return done;
  };

  /* ---------------------------------------------------------
     Achievements - returns list of newly unlocked entries
     --------------------------------------------------------- */
  S.checkAchievements = function () {
    var unlocked = [];
    for (var i = 0; i < D.ACHIEVEMENTS.length; i++) {
      var a = D.ACHIEVEMENTS[i];
      if (game.achievements[a.id]) continue;
      var ok = false;
      try { ok = a.test(game); } catch (e) { ok = false; }
      if (ok) {
        game.achievements[a.id] = 1;
        if (a.money) S.earn(a.money);
        if (a.cores) { game.cores += a.cores; game.coresTotal += a.cores; }
        unlocked.push(a);
      }
    }
    return unlocked;
  };

  /* ---------------------------------------------------------
     Rebirth
     --------------------------------------------------------- */
  S.pendingCores = function () {
    var base = D.coresFor(game.lifeEarned);
    var altar = S.countBuilding('altar') * D.BUILD_BY_ID.altar.bonus;
    var rb = S.rebirthBonuses(game.rebirths);
    return Math.floor(base * (1 + perk('focus') * 0.10 + altar + rb.cores));
  };

  S.rebirth = function () {
    var gain = S.pendingCores();
    if (gain <= 0) return 0;
    var carry = {
      cores: game.cores + gain,
      coresTotal: game.coresTotal + gain,
      perks: game.perks,
      rebirths: game.rebirths + 1,
      achievements: game.achievements,
      stats: game.stats,
      contractsDone: game.contractsDone,
      tut: { step: 0, done: true, flags: {}, seen: {} },
      quest: game.quest,
      questLog: game.questLog
    };
    var fresh = S.create(carry);
    fresh.autoMine = game.autoMine;
    game = fresh;
    return gain;
  };

  S.buyPerk = function (id) {
    var p = D.PERK_BY_ID[id];
    if (!p) return false;
    var owned = game.perks[id] || 0;
    if (owned >= p.max) return false;
    var cost = D.perkCost(p, owned);
    if (game.cores < cost) return false;
    game.cores -= cost;
    game.perks[id] = owned + 1;
    return true;
  };

  /* ---------------------------------------------------------
     Save / load
     --------------------------------------------------------- */
  S.save = function () {
    if (!game) return false;
    game.lastSeen = U.now();
    try {
      U.store.set(D.SAVE_KEY, JSON.stringify(game));
      return true;
    } catch (e) { return false; }
  };

  S.load = function () {
    var raw = U.store.get(D.SAVE_KEY);
    if (!raw) return null;
    try {
      var st = JSON.parse(raw);
      if (!st || typeof st !== 'object') return null;
      /* patch in any fields added by a newer build */
      var base = S.create();
      for (var k in base) if (!(k in st)) st[k] = base[k];
      for (var slot in base.gear) if (!(slot in st.gear)) st.gear[slot] = 0;
      if (!st.stats) st.stats = blankStats();
      if (!st.stats.mined) st.stats.mined = {};
      /* saves made before the Construction milestone existed: credit the
         machines already standing rather than starting them at zero */
      if (typeof st.stats.built !== 'number') st.stats.built = (st.buildings || []).length;
      if (!st.store) st.store = {};
      if (!st.keep) st.keep = {};
      if (typeof st.quest !== 'number') st.quest = 0;
      if (!st.stats.visited) st.stats.visited = { sky: 1 };
      if (typeof st.dim !== 'number') st.dim = 0;
      st.dim = U.clamp(st.dim, 0, D.DIMENSIONS.length - 1);
      /* never strand a save in a dimension its rebirth count no longer allows */
      if (st.rebirths < D.DIMENSIONS[st.dim].rebirths) st.dim = 0;
      if (!Array.isArray(st.questLog)) st.questLog = [];
      /* a save made before the tutorial existed belongs to someone who
         already knows the game - do not make them sit through it */
      if (!st.tut) {
        st.tut = { step: 0, done: (st.quest > 0 || st.stats.nodes > 20), flags: {}, seen: {} };
      }
      st.size = U.clamp(st.size | 0, D.START_SIZE, D.MAX_SIZE);
      st.layersUnlocked = U.clamp(st.layersUnlocked | 0, 1, D.LAYERS.length);
      st.layer = U.clamp(st.layer | 0, 0, st.layersUnlocked - 1);
      st.deepest = st.layersUnlocked - 1;
      return st;
    } catch (e) { return null; }
  };

  S.wipe = function () { U.store.del(D.SAVE_KEY); };

  root.S = S;
})(window);
