/* ============================================================
   world.js - island geometry, ore nodes and building placement
   ============================================================ */
(function (root) {
  'use strict';

  var W = {};

  /* nodes[layer] = { "x,y": node }  -- rebuilt at boot, never saved */
  W.nodes = [];
  W.respawnQueue = [];        /* {layer, at} */
  W.structQueue = [];         /* {layer, at} */

  W.reset = function () {
    W.nodes = [];
    W.respawnQueue = [];
    W.structQueue = [];
    for (var i = 0; i < D.LAYERS.length; i++) W.nodes.push({});
  };

  /* ---------------------------------------------------------
     Geometry
     --------------------------------------------------------- */
  W.bounds = function (size) {
    var s = size || S.get().size;
    var o = Math.floor((D.GRID - s) / 2);
    return { x0: o, y0: o, x1: o + s - 1, y1: o + s - 1, size: s };
  };

  W.inBounds = function (x, y) {
    var b = W.bounds();
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  };

  /* tiles that always stay walkable / unbuildable */
  W.reserved = function (x, y) {
    if (x === D.SHAFT.x && y === D.SHAFT.y) return 'shaft';
    if (x === D.SELL.x && y === D.SELL.y) return 'market';
    if (x === D.GATE.x && y === D.GATE.y) return 'gate';
    return null;
  };

  W.buildingAt = function (x, y) {
    var list = S.get().buildings;
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  };

  W.nodeAt = function (layer, x, y) {
    return W.nodes[layer] ? W.nodes[layer][U.key(x, y)] : null;
  };

  /* solid = blocks the player walking onto the tile */
  W.solid = function (layer, x, y) {
    if (!W.inBounds(x, y)) return true;
    if (W.nodeAt(layer, x, y)) return true;
    if (layer === 0 && W.buildingAt(x, y)) return true;
    return false;
  };

  W.tileFreeForNode = function (layer, x, y) {
    if (!W.inBounds(x, y)) return false;
    if (W.reserved(x, y)) return false;
    if (W.nodeAt(layer, x, y)) return false;
    if (layer === 0 && W.buildingAt(x, y)) return false;
    var g = S.get();
    /* never bury the player */
    if (g.layer === layer && Math.floor(g.playerX) === x && Math.floor(g.playerY) === y) return false;
    return true;
  };

  W.tileFreeForBuild = function (x, y) {
    if (!W.inBounds(x, y)) return false;
    if (W.reserved(x, y)) return false;
    if (W.buildingAt(x, y)) return false;
    if (W.nodeAt(0, x, y)) return false;
    return true;
  };

  /* ---------------------------------------------------------
     Ore selection
     --------------------------------------------------------- */
  W.rollOre = function (layer) {
    var luck = S.derive().luck;
    var list = S.dimOres();
    var ore = U.weighted(list, function (o) {
      var w = o.w[layer] || 0;
      if (w <= 0) return 0;
      return w * (1 + luck * o.rank * 0.5);
    });
    return ore || list[0];
  };

  W.targetNodes = function (layer) {
    var b = W.bounds();
    var area = b.size * b.size;
    var usable = area - 2 - (layer === 0 ? S.get().buildings.length : 0);
    var target = Math.round(area * D.NODE_DENSITY * (1 + layer * 0.06));
    return U.clamp(target, 3, Math.max(3, Math.floor(usable * 0.55)));
  };

  W.spawnNode = function (layer, silent) {
    var b = W.bounds();
    for (var attempt = 0; attempt < 90; attempt++) {
      var x = U.randInt(b.x0, b.x1), y = U.randInt(b.y0, b.y1);
      if (!W.tileFreeForNode(layer, x, y)) continue;
      var ore = W.rollOre(layer);
      var maxHp = Math.ceil(ore.hp * S.layer(layer).hpMult);
      var d = S.derive();
      var node = {
        x: x, y: y, ore: ore.id, hp: maxHp, maxHp: maxHp,
        grade: D.rollGrade(d.luck, d.gradeBonus),
        seed: U.randInt(1, 99999), born: U.now(), pop: silent ? 0 : 1
      };
      W.nodes[layer][U.key(x, y)] = node;
      return node;
    }
    return null;
  };

  W.removeNode = function (layer, node) {
    delete W.nodes[layer][U.key(node.x, node.y)];
    if (node.struct) {
      /* a find takes far longer to come back than a seam of ore */
      var sd = S.derive();
      W.structQueue.push({
        layer: layer,
        at: U.now() + D.STRUCT_RESPAWN * 1000 * U.rand(0.8, 1.6) *
            (sd.respawn / D.RESPAWN) / sd.structSpeed
      });
    } else {
      W.respawnQueue.push({ layer: layer, at: U.now() + S.derive().respawn * 1000 });
    }
  };

  /* ---------------------------------------------------------
     Structures - buried finds, stored alongside ore nodes so
     they inherit targeting, collision and mining for free
     --------------------------------------------------------- */
  W.countStructures = function (layer) {
    var n = 0, m = W.nodes[layer] || {};
    for (var k in m) if (m[k].struct) n++;
    return n;
  };

  W.targetStructures = function (layer) {
    var b = W.bounds();
    var defs = D.structuresFor(layer, S.get().dim);
    if (!defs.length) return 0;
    var extra = S.derive().structSlots;
    return U.clamp(Math.round(b.size * b.size * D.STRUCT_DENSITY) + extra, 1, 14);
  };

  /* the typical toughness of rock at this depth, weighted by what spawns */
  W.avgOreHp = function (layer) {
    var list = S.dimOres(), total = 0, weight = 0;
    for (var i = 0; i < list.length; i++) {
      var w = list[i].w[layer] || 0;
      if (w <= 0) continue;
      weight += w;
      total += w * list[i].hp;
    }
    return weight ? total / weight : 10;
  };

  W.spawnStructure = function (layer, silent) {
    var g = S.get();
    var defs = D.structuresFor(layer, g.dim);
    if (!defs.length) return null;
    var def = U.weighted(defs, function (d) { return d.weight; });
    if (!def) return null;

    var b = W.bounds();
    for (var attempt = 0; attempt < 90; attempt++) {
      var x = U.randInt(b.x0, b.x1), y = U.randInt(b.y0, b.y1);
      if (!W.tileFreeForNode(layer, x, y)) continue;
      /* toughness is measured against the AVERAGE rock at this depth, not a
         single roll - otherwise a fossil that happened to roll stone would be
         softer than the iron node sitting next to it */
      var ore = W.rollOre(layer);
      var maxHp = Math.ceil(W.avgOreHp(layer) * S.layer(layer).hpMult * def.hp);
      var node = {
        x: x, y: y, ore: ore.id, struct: def.id, buried: true,
        hp: maxHp, maxHp: maxHp, seed: U.randInt(1, 99999),
        born: U.now(), pop: silent ? 0 : 1
      };
      W.nodes[layer][U.key(x, y)] = node;
      return node;
    }
    return null;
  };

  /* the pay-out for cracking one open, scaled to where it was found */
  W.structureReward = function (def, layer) {
    var g = S.get();
    var list = S.dimOres(), total = 0, weight = 0;
    for (var i = 0; i < list.length; i++) {
      var w = list[i].w[layer] || 0;
      if (w <= 0) continue;
      weight += w;
      total += w * list[i].value;
    }
    var avg = weight ? total / weight : 1;
    var unit = avg * S.layer(layer).valMult * S.derive().valueMult;
    return {
      money: unit * def.money,
      ore: Math.max(1, Math.round(def.ore)),
      xp: def.xp * (1 + layer * 0.35) * (1 + g.dim * 1.5),
      cores: def.coreChance && Math.random() < def.coreChance ? 1 : 0
    };
  };

  W.count = function (layer) {
    var n = 0, m = W.nodes[layer];
    for (var k in m) if (!m[k].struct) n++;
    return n;
  };

  /* fill every unlocked layer up to its target (used at boot & on expand) */
  W.populate = function (silent) {
    var g = S.get();
    for (var l = 0; l < g.layersUnlocked; l++) {
      var target = W.targetNodes(l);
      var guard = 0;
      while (W.count(l) < target && guard++ < 400) {
        if (!W.spawnNode(l, silent)) break;
      }
      var sTarget = W.targetStructures(l), sGuard = 0;
      while (W.countStructures(l) < sTarget && sGuard++ < 20) {
        if (!W.spawnStructure(l, silent)) break;
      }
    }
  };

  /* respawn timers + top-up */
  W.update = function () {
    var now = U.now(), g = S.get();
    for (var i = W.respawnQueue.length - 1; i >= 0; i--) {
      if (W.respawnQueue[i].at <= now) {
        var layer = W.respawnQueue[i].layer;
        W.respawnQueue.splice(i, 1);
        if (layer < g.layersUnlocked && W.count(layer) < W.targetNodes(layer)) W.spawnNode(layer);
      }
    }
    for (var i = W.structQueue.length - 1; i >= 0; i--) {
      if (W.structQueue[i].at <= now) {
        var sl = W.structQueue[i].layer;
        W.structQueue.splice(i, 1);
        if (sl < g.layersUnlocked && W.countStructures(sl) < W.targetStructures(sl)) W.spawnStructure(sl);
      }
    }
    /* safety net: an expansion or a demolished building frees new space */
    for (var l = 0; l < g.layersUnlocked; l++) {
      if (W.count(l) < W.targetNodes(l) - 1 && Math.random() < 0.02) W.spawnNode(l);
      if (W.countStructures(l) < W.targetStructures(l) && Math.random() < 0.004) W.spawnStructure(l);
    }
  };

  /* ---------------------------------------------------------
     Island expansion
     --------------------------------------------------------- */
  /* damage every ore node on a layer; returns the ones that broke.
     Structures are left alone - a find is dug out by hand. */
  W.quake = function (layer, damage) {
    var map = W.nodes[layer] || {}, broken = [];
    for (var k in map) {
      var n = map[k];
      if (n.struct) continue;
      n.hp -= damage;
      n.hit = 0.12;
      if (n.hp <= 0) broken.push(n);
    }
    for (var i = 0; i < broken.length; i++) W.removeNode(layer, broken[i]);
    return broken;
  };

  W.expandCost = function () { return D.expandCost(S.get().size); };

  W.canExpand = function () {
    var g = S.get();
    return g.size < D.MAX_SIZE && g.money >= W.expandCost();
  };

  W.expand = function () {
    var g = S.get();
    if (!W.canExpand()) return false;
    S.spend(W.expandCost());
    g.size++;
    W.populate(true);
    return true;
  };

  /* ---------------------------------------------------------
     Depth unlocking
     --------------------------------------------------------- */
  W.nextLayerCost = function () {
    var g = S.get();
    if (g.layersUnlocked >= D.LAYERS.length) return null;
    return S.layer(g.layersUnlocked).cost;
  };

  W.unlockLayer = function () {
    var g = S.get(), cost = W.nextLayerCost();
    if (cost === null || !S.spend(cost)) return false;
    g.layersUnlocked++;
    g.deepest = g.layersUnlocked - 1;
    W.populate(true);
    return true;
  };

  W.canDescend = function () {
    var g = S.get();
    return g.layer + 1 < g.layersUnlocked;
  };

  W.changeLayer = function (delta) {
    var g = S.get(), next = g.layer + delta;
    if (next < 0 || next >= g.layersUnlocked) return false;
    g.layer = next;
    /* land next to the ladder, never inside a rock */
    g.playerX = D.SHAFT.x + 0.5;
    g.playerY = D.SHAFT.y + 1.5;
    var n = W.nodeAt(next, Math.floor(g.playerX), Math.floor(g.playerY));
    if (n) W.removeNode(next, n);
    return true;
  };

  /* ---------------------------------------------------------
     Buildings
     --------------------------------------------------------- */
  W.build = function (id, x, y) {
    var g = S.get();
    if (!D.BUILD_BY_ID[id]) return { ok: false, msg: 'Unknown building' };
    if (!W.tileFreeForBuild(x, y)) return { ok: false, msg: 'That tile is occupied' };
    var cost = S.buildingCost(id);
    if (g.money < cost) return { ok: false, msg: 'Not enough money' };
    var first = id === 'store' && S.countBuilding('store') === 0;
    S.spend(cost);
    g.buildings.push({ id: id, x: x, y: y, t: U.now() });
    g.buildCount[id] = (g.buildCount[id] || 0) + 1;
    g.stats.built = (g.stats.built || 0) + 1;
    /* nothing is kept until the player says so - a warehouse must never
       silently switch off the income they already rely on */
    return { ok: true, cost: cost, first: first };
  };

  W.demolish = function (x, y) {
    var g = S.get();
    for (var i = 0; i < g.buildings.length; i++) {
      if (g.buildings[i].x === x && g.buildings[i].y === y) {
        var b = g.buildings[i];
        var refund = Math.floor(S.buildingCost(b.id) / D.BUILD_BY_ID[b.id].growth * 0.5);
        g.buildings.splice(i, 1);
        g.buildCount[b.id] = Math.max(0, (g.buildCount[b.id] || 1) - 1);
        S.earn(refund);
        return { ok: true, refund: refund, id: b.id };
      }
    }
    return { ok: false };
  };

  W.nearestWarehouse = function (x, y, range) {
    var g = S.get();
    if (g.layer !== 0) return null;
    var best = null, bestD = range;
    for (var i = 0; i < g.buildings.length; i++) {
      var b = g.buildings[i];
      if (b.id !== 'store') continue;
      var d = U.dist(x, y, b.x + 0.5, b.y + 0.5);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  };

  W.freeBuildTiles = function () {
    var b = W.bounds(), n = 0;
    for (var x = b.x0; x <= b.x1; x++) {
      for (var y = b.y0; y <= b.y1; y++) if (W.tileFreeForBuild(x, y)) n++;
    }
    return n;
  };

  root.W = W;
})(window);
