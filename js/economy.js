/* ============================================================
   economy.js - building production, auto-selling, offline gains
   ============================================================ */
(function (root) {
  'use strict';

  var E = {};

  var oreAccum = 0, sellAccum = 0;
  var popAccum = 0, popTimer = 0;
  E.lastProduced = 0;       /* ore/sec, for the stats panel */
  E.lastIncome = 0;         /* $/sec rolling estimate       */
  var incomeWindow = 0, incomeAccum = 0;

  E.reset = function () { oreAccum = 0; sellAccum = 0; incomeAccum = 0; incomeWindow = 0; popAccum = 0; popTimer = 0; };

  /* ---------------------------------------------------------
     Production rates
     --------------------------------------------------------- */
  E.rates = function () {
    var g = S.get(), d = S.derive(), pw = S.power();
    var ore = 0, sell = 0;
    for (var i = 0; i < g.buildings.length; i++) {
      var def = D.BUILD_BY_ID[g.buildings[i].id];
      if (!def) continue;
      var eff = def.power < 0 ? pw.efficiency : 1;
      if (!def.rate) continue;
      if (def.ships || def.id === 'convey') sell += def.rate * eff;
      else ore += def.rate * eff;
    }
    return {
      ore: ore * d.buildMult,
      sell: sell * d.buildMult,
      power: pw
    };
  };

  /* average $ per ore unit produced at the deepest layer */
  E.avgOreValue = function () {
    var g = S.get(), layer = g.deepest, total = 0, weight = 0;
    for (var i = 0; i < D.ORES.length; i++) {
      var o = D.ORES[i], w = o.w[layer] || 0;
      if (w <= 0) continue;
      weight += w;
      total += w * o.value;
    }
    if (!weight) return 0;
    return (total / weight) * D.LAYERS[layer].valMult * S.derive().valueMult;
  };

  E.incomePerSec = function () {
    var r = E.rates();
    return r.ore * E.avgOreValue();
  };

  /* ---------------------------------------------------------
     Selling helpers
     --------------------------------------------------------- */
  /* sell up to `units` from the bag, most valuable first.  ratio<1 = discount.
     Ore marked to keep is skipped unless `force` is set. */
  E.sellUnits = function (units, ratio, force) {
    var g = S.get(), earned = 0, sold = 0;
    ratio = ratio === undefined ? 1 : ratio;
    var guard = 0;
    while (units > 0 && guard++ < 40) {
      var bestId = null, bestVal = -1;
      for (var id in g.inv) {
        if (g.inv[id] <= 0) continue;
        if (!force && S.isProtected(id)) continue;
        var v = S.oreValue(id, g.deepest);
        if (v > bestVal) { bestVal = v; bestId = id; }
      }
      if (!bestId) break;
      var take = Math.min(units, g.inv[bestId]);
      g.inv[bestId] -= take;
      if (g.inv[bestId] <= 0) delete g.inv[bestId];
      earned += bestVal * take * ratio;
      sold += take;
      units -= take;
    }
    if (earned > 0) { S.earn(earned); g.stats.sold += sold; }
    return { money: earned, units: sold };
  };

  E.sellAll = function (ratio, force) {
    return E.sellUnits(S.carried(), ratio, force);
  };

  /* sell straight out of the warehouse - you own the logistics, so full price */
  E.sellStored = function (oreId, amount) {
    var g = S.get();
    var have = g.store[oreId] || 0;
    var take = Math.min(have, amount === undefined ? have : amount);
    if (take <= 0) return { money: 0, units: 0 };
    g.store[oreId] -= take;
    if (g.store[oreId] <= 0) delete g.store[oreId];
    var money = S.oreValue(oreId, g.deepest) * take;
    S.earn(money);
    g.stats.sold += take;
    return { money: money, units: take };
  };

  E.sellAllStored = function () {
    var g = S.get(), money = 0, units = 0;
    for (var id in g.store) {
      var r = E.sellStored(id, g.store[id]);
      money += r.money; units += r.units;
    }
    return { money: money, units: units };
  };

  /* ---------------------------------------------------------
     Per-frame tick
     --------------------------------------------------------- */
  E.tick = function (dt) {
    var g = S.get(), d = S.derive();
    var r = E.rates();
    E.lastProduced = r.ore;

    var moneyBefore = g.stats.totalEarned;

    /* --- buildings dig up ore --- */
    if (r.ore > 0) {
      oreAccum += r.ore * dt;
      if (oreAccum >= 1) {
        var n = Math.floor(oreAccum);
        oreAccum -= n;
        /* split the batch over a couple of ore types so it feels varied */
        var batches = Math.min(3, n);
        var per = Math.floor(n / batches) || n;
        for (var i = 0; i < batches; i++) {
          var amount = (i === batches - 1) ? n - per * (batches - 1) : per;
          if (amount <= 0) continue;
          var ore = W.rollOre(g.deepest);
          var stored = S.addOre(ore.id, amount);
          var overflow = amount - stored;
          /* bag full: kept ore goes to the warehouse before anything is dumped */
          if (overflow > 0 && g.keep[ore.id]) {
            overflow -= S.depositOre(ore.id, overflow);
          }
          if (overflow > 0) {
            /* nowhere left to put it: the crew sells it on the cheap so
               progress never stalls */
            var v = S.oreValue(ore.id, g.deepest) * overflow * 0.65;
            S.earn(v);
            g.stats.sold += overflow;
          }
        }
      }
    }

    /* --- conveyors ship ore to market at full price --- */
    if (r.sell > 0) {
      sellAccum += r.sell * dt;
      if (sellAccum >= 1) {
        var units = Math.floor(sellAccum);
        sellAccum -= units;
        var res = E.sellUnits(units, 1);
        popAccum += res.money;
      }
    }

    /* one aggregated popup instead of a pile of them: a busy conveyor line
       can settle dozens of sales a second */
    popTimer -= dt;
    if (popTimer <= 0) {
      popTimer = 1.6;
      if (popAccum > 0) {
        var pl = PL.get();
        R.floatText(pl.x, pl.y - 0.6, '+' + U.fmtMoney(popAccum), '#8ee6c8', 1);
        popAccum = 0;
      }
    }

    /* rolling income estimate for the stats panel */
    incomeAccum += g.stats.totalEarned - moneyBefore;
    incomeWindow += dt;
    if (incomeWindow >= 1) {
      E.lastIncome = incomeAccum / incomeWindow;
      incomeAccum = 0; incomeWindow = 0;
    }
  };

  /* ---------------------------------------------------------
     Offline catch-up
     --------------------------------------------------------- */
  E.offline = function (elapsedMs) {
    var g = S.get(), d = S.derive();
    var sec = U.clamp(elapsedMs / 1000, 0, D.OFFLINE_CAP_H * 3600);
    if (sec < 30) return null;

    var r = E.rates();
    if (r.ore <= 0) return null;

    var produced = r.ore * sec * d.offlineRate;
    var avg = E.avgOreValue();

    /* whatever the conveyors could move sells at full price */
    var shipped = Math.min(produced, r.sell * sec * d.offlineRate);
    var leftover = produced - shipped;

    /* part of the leftover fits in the bag, the rest is sold cheap */
    var room = Math.max(0, d.capacity - S.carried());
    var kept = Math.min(leftover, room);
    var dumped = leftover - kept;

    var money = shipped * avg + dumped * avg * 0.65;
    S.earn(money);
    g.stats.sold += Math.floor(shipped + dumped);

    var keptBreakdown = {};
    var remaining = Math.floor(kept);
    var guard = 0;
    while (remaining > 0 && guard++ < 24) {
      var ore = W.rollOre(g.deepest);
      var take = Math.max(1, Math.floor(remaining / 3));
      take = Math.min(take, remaining);
      var got = S.addOre(ore.id, take);
      if (got > 0) keptBreakdown[ore.id] = (keptBreakdown[ore.id] || 0) + got;
      remaining -= take;
    }

    return {
      seconds: sec,
      money: money,
      ore: Math.floor(produced),
      kept: keptBreakdown,
      rate: d.offlineRate
    };
  };

  root.E = E;
})(window);
