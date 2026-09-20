/* ============================================================
   player.js - walking, swinging the pickaxe and selling
   ============================================================ */
(function (root) {
  'use strict';

  var PL = {};

  var me = {
    x: 0, y: 0, face: 1, walking: false,
    swing: 0, swingPhase: -1, target: null,
    sellTimer: 0, dropTimer: 0, bumpMsg: 0, sellPop: 0, sellPopTimer: 0
  };

  PL.get = function () { return me; };

  PL.init = function () {
    var g = S.get();
    me.x = g.playerX; me.y = g.playerY;
    me.face = 1; me.swing = 0; me.swingPhase = -1; me.target = null;
  };

  PL.sync = function () {
    var g = S.get();
    g.playerX = me.x; g.playerY = me.y;
  };

  PL.teleportToShaft = function () {
    me.x = D.SHAFT.x + 0.5;
    me.y = D.SHAFT.y + 1.5;
    PL.sync();
  };

  /* ---------------------------------------------------------
     Movement with per-axis collision
     --------------------------------------------------------- */
  var RADIUS = 0.3;

  function blocked(layer, x, y) {
    return W.solid(layer, Math.floor(x), Math.floor(y));
  }

  function tryMove(layer, nx, ny) {
    /* test the four corners of the player's footprint */
    var pts = [[nx - RADIUS, ny - RADIUS], [nx + RADIUS, ny - RADIUS],
               [nx - RADIUS, ny + RADIUS], [nx + RADIUS, ny + RADIUS]];
    for (var i = 0; i < pts.length; i++) {
      if (blocked(layer, pts[i][0], pts[i][1])) return false;
    }
    return true;
  }

  /* input.dx / input.dy are screen-space intentions; convert to iso axes */
  function moveVector(input) {
    var sx = input.dx, sy = input.dy;
    if (!sx && !sy) return { x: 0, y: 0 };
    /* screen right = +x-y, screen down = +x+y  ->  invert */
    var wx = sy + sx, wy = sy - sx;
    var len = Math.sqrt(wx * wx + wy * wy) || 1;
    return { x: wx / len, y: wy / len };
  }

  /* shove the miner onto the nearest tile that is not solid */
  function nudgeOff(layer, node) {
    var around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (var i = 0; i < around.length; i++) {
      var nx = node.x + around[i][0], ny = node.y + around[i][1];
      if (!W.inBounds(nx, ny) || W.solid(layer, nx, ny)) continue;
      me.x = nx + 0.5;
      me.y = ny + 0.5;
      return true;
    }
    /* boxed in on every side: falling back to digging it out beats a
       softlock, and the reward still gets paid */
    W.removeNode(layer, node);
    return false;
  }

  /* ---------------------------------------------------------
     Mining
     --------------------------------------------------------- */
  function findTarget(layer) {
    var map = W.nodes[layer] || {};
    var best = null, bestD = D.MINE_RANGE;
    var find = null, findD = D.MINE_RANGE;
    for (var k in map) {
      var n = map[k];
      var d = U.dist(me.x, me.y, n.x + 0.5, n.y + 0.5);
      if (d >= D.MINE_RANGE) continue;
      /* an uncovered find outranks ordinary rock: you walked over here to
         dig it out, not to chip the stone sitting next to it */
      if (n.struct && !n.buried) {
        if (d < findD) { findD = d; find = n; }
      } else if (d < bestD) { bestD = d; best = n; }
    }
    return find || best;
  }

  function breakStructure(layer, node) {
    var g = S.get();
    var def = D.STRUCT_BY_ID[node.struct];
    var reward = W.structureReward(def, layer);
    var cx = node.x + 0.5, cy = node.y + 0.5;

    S.earn(reward.money);
    S.addXp(reward.xp);
    g.stats.found[def.id] = (g.stats.found[def.id] || 0) + 1;

    /* the ore inside is pulled from the rarest seams at this depth */
    var list = S.dimOres().filter(function (o) { return (o.w[layer] || 0) > 0; });
    var pick = list[list.length - 1] || D.ORE_BY_ID[node.ore];
    S.addOre(pick.id, reward.ore);

    if (reward.cores) { g.cores += reward.cores; g.coresTotal += reward.cores; }

    R.burst(cx, cy, '#fff6c8', 22);
    R.burst(cx, cy, pick.gem, 14);
    R.kick(4);
    R.floatText(cx, cy, '+' + U.fmtMoney(reward.money), '#f5c04e', 2);

    W.removeNode(layer, node);
    me.target = null;
    Game.onStructureBroken(def, reward, pick);
  }

  function breakNode(layer, node) {
    if (node.struct) { breakStructure(layer, node); return; }
    var g = S.get(), d = S.derive();
    var ore = D.ORE_BY_ID[node.ore];
    var amount = 1 + (Math.random() < d.doubleChance ? 1 : 0);

    var got = S.addOre(ore.id, amount);
    g.stats.nodes++;
    S.addXp(D.xpFromOre(ore) * (1 + layer * 0.15));

    var cx = node.x + 0.5, cy = node.y + 0.5;
    R.burst(cx, cy, ore.gem, 10);
    R.burst(cx, cy, U.shade(ore.color, -30), 6);
    R.kick(2.2);

    if (got > 0) {
      R.floatText(cx, cy, '+' + got, ore.gem, 2);
    } else {
      R.floatText(cx, cy, 'FULL', '#e05b6a', 1);
      if (me.bumpMsg <= 0) { UI.toast('Bag full - visit the market pad', 'bad'); me.bumpMsg = 6; }
    }

    W.removeNode(layer, node);
    me.target = null;
    Game.onNodeBroken(ore, layer);
  }

  function mineTick(dt, wantMine) {
    var g = S.get(), layer = g.layer, d = S.derive();

    if (me.target && (!W.nodeAt(layer, me.target.x, me.target.y) ||
        U.dist(me.x, me.y, me.target.x + 0.5, me.target.y + 0.5) > D.MINE_RANGE + 0.35)) {
      me.target = null;
    }
    /* Once a find is being dug out it keeps the swings until it breaks.
       Otherwise re-pick every tick, so walking up to a structure switches
       to it instead of staying locked on the boulder we started on. */
    if (!me.target || !me.target.struct) {
      var pick = findTarget(layer);
      if (pick) me.target = pick;
    }

    var active = me.target && (wantMine || g.autoMine);
    if (!active) { me.swingPhase = -1; me.swing = Math.max(0, me.swing - dt * 2); return; }

    /* face the rock */
    var tx = me.target.x + 0.5, ty = me.target.y + 0.5;
    me.face = (tx - ty) >= (me.x - me.y) ? 1 : -1;

    var rate = d.swing / D.SWING;
    me.swing += dt * rate;
    me.swingPhase = U.clamp(me.swing % 1, 0, 1);

    while (me.swing >= 1) {
      me.swing -= 1;
      g.stats.swings++;
      var dmg = d.power;
      me.target.hp -= dmg;
      me.target.hit = 0.14;
      var ore = D.ORE_BY_ID[me.target.ore];
      R.burst(me.target.x + 0.5, me.target.y + 0.5, ore.color, 3);
      if (me.target.hp <= 0) { breakNode(layer, me.target); break; }
    }
  }

  /* ---------------------------------------------------------
     Selling at the market pad
     --------------------------------------------------------- */
  /* the pad settles a chunk every tick, but the numbers are pooled into one
     popup so a big bag does not print a tower of them */
  function flushSellPop() {
    if (me.sellPop <= 0) return;
    R.floatText(D.SELL.x + 0.5, D.SELL.y + 0.5, '+' + U.fmtMoney(me.sellPop), '#f5c04e', 1);
    me.sellPop = 0;
  }

  function sellTick(dt) {
    var g = S.get();
    if (g.layer !== 0) return;
    var onPad = Math.floor(me.x) === D.SELL.x && Math.floor(me.y) === D.SELL.y;
    if (!onPad) {
      me.sellTimer = 0;
      me.sellPopTimer = 0;
      flushSellPop();
      return;
    }

    me.sellPopTimer -= dt;
    if (me.sellPopTimer <= 0) { me.sellPopTimer = 0.45; flushSellPop(); }

    me.sellTimer -= dt;
    if (me.sellTimer > 0) return;
    me.sellTimer = 0.06;

    /* sell the most valuable unprotected stack first, a chunk at a time */
    var bestId = null, bestVal = 0;
    for (var id in g.inv) {
      if (g.inv[id] <= 0 || S.isProtected(id)) continue;
      var v = S.oreValue(id, g.deepest);
      if (v > bestVal) { bestVal = v; bestId = id; }
    }
    if (!bestId) return;

    var have = g.inv[bestId];
    /* clear a third of the stack per tick so a 14,000 ore bag still empties
       in a couple of seconds rather than a minute */
    var chunk = Math.max(1, Math.ceil(have / 3));
    var take = Math.min(have, chunk);
    var gained = S.oreValue(bestId, g.deepest) * take;
    g.inv[bestId] -= take;
    if (g.inv[bestId] <= 0) delete g.inv[bestId];
    S.earn(gained);
    g.stats.sold += take;

    me.sellPop += gained;
    Game.sfx('sell');
  }

  /* ---------------------------------------------------------
     Dropping ore off at a warehouse
     --------------------------------------------------------- */
  function dropTick(dt) {
    var g = S.get();
    if (g.layer !== 0) { me.dropTimer = 0; return; }
    var wh = W.nearestWarehouse(me.x, me.y, 2.2);
    if (!wh) { me.dropTimer = 0; return; }

    me.dropTimer -= dt;
    if (me.dropTimer > 0) return;
    me.dropTimer = 0.1;

    if (S.storageRoom() <= 0) return;

    /* deposit whichever kept ore we are carrying most of */
    var bestId = null, bestN = 0;
    for (var id in g.inv) {
      if (!g.keep[id] || g.inv[id] <= 0) continue;
      if (g.inv[id] > bestN) { bestN = g.inv[id]; bestId = id; }
    }
    if (!bestId) return;

    var chunk = Math.max(1, Math.ceil(bestN / 5));
    var moved = S.depositOre(bestId, Math.min(bestN, chunk));
    if (moved <= 0) return;
    g.inv[bestId] -= moved;
    if (g.inv[bestId] <= 0) delete g.inv[bestId];

    R.floatText(wh.x + 0.5, wh.y + 0.5, '+' + U.fmt(moved), D.ORE_BY_ID[bestId].gem, 1);
  }

  /* ---------------------------------------------------------
     Main update
     --------------------------------------------------------- */
  PL.update = function (dt, input) {
    var g = S.get(), d = S.derive();


    var v = moveVector(input);
    me.walking = !!(v.x || v.y);
    if (me.walking) {
      var sp = d.speed * dt;
      var nx = me.x + v.x * sp, ny = me.y + v.y * sp;
      if (tryMove(g.layer, nx, me.y)) me.x = nx;
      if (tryMove(g.layer, me.x, ny)) me.y = ny;
      /* facing follows screen-space direction */
      if (input.dx) me.face = input.dx > 0 ? 1 : -1;
    }

    /* keep inside the island even if it somehow shrinks */
    var b = W.bounds();
    me.x = U.clamp(me.x, b.x0 + RADIUS, b.x1 + 1 - RADIUS);
    me.y = U.clamp(me.y, b.y0 + RADIUS, b.y1 + 1 - RADIUS);

    /* If a rock ends up underneath us - the clamp above can do it on the
       edge row - dig straight out.  A structure is never destroyed this
       way: it is a rare find, so we step aside instead. */
    var stuck = W.nodeAt(g.layer, Math.floor(me.x), Math.floor(me.y));
    if (stuck) {
      if (stuck.struct) nudgeOff(g.layer, stuck);
      else W.removeNode(g.layer, stuck);
    }

    mineTick(dt, input.mine);
    sellTick(dt);
    dropTick(dt);

    if (me.bumpMsg > 0) me.bumpMsg -= dt;

    /* fade node hit flashes, and uncover any find we have wandered up to */
    var map = W.nodes[g.layer] || {};
    for (var k in map) {
      var n = map[k];
      if (n.hit > 0) n.hit -= dt;
      if (n.pop > 0) n.pop = Math.max(0, n.pop - dt * 4);
      if (n.struct && n.buried &&
          U.dist(me.x, me.y, n.x + 0.5, n.y + 0.5) < D.UNCOVER_RANGE) {
        n.buried = false;
        n.pop = 1;
        Game.onStructureFound(D.STRUCT_BY_ID[n.struct], n);
      }
    }

    PL.sync();
  };

  /* ---------------------------------------------------------
     Context action (E) - ladder, market, building info
     --------------------------------------------------------- */
  PL.standingOn = function () {
    var g = S.get();
    var tx = Math.floor(me.x), ty = Math.floor(me.y);
    if (tx === D.SHAFT.x && ty === D.SHAFT.y) return 'shaft';
    if (g.layer === 0 && tx === D.SELL.x && ty === D.SELL.y) return 'market';
    if (g.layer === 0 && tx === D.GATE.x && ty === D.GATE.y && S.dimsUnlocked() > 1) return 'gate';
    return null;
  };

  PL.nearShaft = function () {
    return U.dist(me.x, me.y, D.SHAFT.x + 0.5, D.SHAFT.y + 0.5) < 1.4;
  };

  root.PL = PL;
})(window);
