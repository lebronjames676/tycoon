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
    return { nodes: 0, mined: {}, sold: 0, swings: 0, playtime: 0, bestMoney: 0, totalEarned: 0 };
  }

  S.create = function (carry) {
    carry = carry || {};
    var st = {
      version: 1,
      money: 0,
      lifeEarned: 0,
      size: D.START_SIZE,
      layer: 0,
      layersUnlocked: 1,
      deepest: 0,
      inv: {},                 /* oreId -> count carried */
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
      contracts: [],
      contractsDone: carry.contractsDone || 0,
      autoMine: true,
      lastSeen: U.now(),
      playerX: D.SPAWN.x + 0.5,
      playerY: D.SPAWN.y + 0.5,
      tip: 0
    };

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

  S.derive = function () {
    var g = game;
    var pickPow = S.gearTier('pick').stat;
    var levelBonus = 1 + (g.level - 1) * 0.02;
    var perkPow = 1 + perk('muscle') * 0.20;
    var corePow = 1 + g.cores * 0.01;

    var d = {
      power: pickPow * levelBonus * perkPow * corePow,
      capacity: Math.floor(S.gearTier('bag').stat * (1 + perk('pockets') * 0.40)),
      speed: S.gearTier('boots').stat * (1 + perk('swift') * 0.08) * (1 + (g.level - 1) * 0.004),
      swing: S.gearTier('gloves').stat * (1 + perk('hands') * 0.10),
      luck: S.gearTier('lamp').stat + perk('lucky') * 0.06,
      doubleChance: perk('magnet') * 0.08,
      respawn: D.RESPAWN / (1 + perk('scan') * 0.12),
      buildMult: 1 + perk('foreman') * 0.20,
      offlineRate: U.clamp(0.25 + perk('offline') * 0.08, 0, 1),
      light: S.gearTier('lamp').stat
    };

    /* money multiplier: charm x perks x cores x vault buildings */
    var vaults = S.countBuilding('vault');
    var smelters = S.countBuilding('smelt');
    d.valueMult = S.gearTier('charm').stat
      * (1 + perk('golden') * 0.25)
      * (1 + g.cores * 0.03)
      * (1 + vaults * D.BUILD_BY_ID.vault.bonus)
      * (1 + smelters * D.BUILD_BY_ID.smelt.bonus)
      * (1 + g.rebirths * 0.05);

    return d;
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
    var lm = D.LAYERS[U.clamp(layer === undefined ? game.deepest : layer, 0, 5)].valMult;
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
      if ((game.inv[id] || 0) < next.ores[id]) return { ok: false, reason: 'ore', next: next };
    }
    return { ok: true, next: next };
  };

  S.craft = function (slot) {
    var c = S.canCraft(slot);
    if (!c.ok) return null;
    game.money -= c.next.money;
    for (var id in c.next.ores) game.inv[id] -= c.next.ores[id];
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
    return c.need * S.oreValue(c.ore, game.deepest) * D.CONTRACT_MULT;
  };

  S.contractReady = function (c) {
    return (game.inv[c.ore] || 0) >= c.need;
  };

  S.claimContract = function (id) {
    var list = S.ensureContracts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      var c = list[i];
      if (!S.contractReady(c)) return null;
      game.inv[c.ore] -= c.need;
      if (game.inv[c.ore] <= 0) delete game.inv[c.ore];
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
    return Math.floor(base * (1 + perk('focus') * 0.10 + altar));
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
      contractsDone: game.contractsDone
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
