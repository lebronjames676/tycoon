/* ============================================================
   player.js - walking, swinging the pickaxe and selling
   ============================================================ */
(function (root) {
  'use strict';

  var PL = {};

  var me = {
    x: 0, y: 0, face: 1, walking: false,
    swing: 0, swingPhase: -1, target: null,
    sellTimer: 0, dropTimer: 0, bumpMsg: 0
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

  /* ---------------------------------------------------------
     Mining
     --------------------------------------------------------- */
  function findTarget(layer) {
    var map = W.nodes[layer] || {}, best = null, bestD = D.MINE_RANGE;
    for (var k in map) {
      var n = map[k];
      var d = U.dist(me.x, me.y, n.x + 0.5, n.y + 0.5);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function breakNode(layer, node) {
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
    if (!me.target) me.target = findTarget(layer);

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
  function sellTick(dt) {
    var g = S.get();
    if (g.layer !== 0) return;
    var onPad = Math.floor(me.x) === D.SELL.x && Math.floor(me.y) === D.SELL.y;
    if (!onPad) { me.sellTimer = 0; return; }

    me.sellTimer -= dt;
    if (me.sellTimer > 0) return;
    me.sellTimer = 0.12;

    /* sell the most valuable unprotected stack first, a chunk at a time */
    var bestId = null, bestVal = 0;
    for (var id in g.inv) {
      if (g.inv[id] <= 0 || S.isProtected(id)) continue;
      var v = S.oreValue(id, g.deepest);
      if (v > bestVal) { bestVal = v; bestId = id; }
    }
    if (!bestId) return;

    var have = g.inv[bestId];
    var chunk = Math.max(1, Math.ceil(have / 6));
    var take = Math.min(have, chunk);
    var gained = S.oreValue(bestId, g.deepest) * take;
    g.inv[bestId] -= take;
    if (g.inv[bestId] <= 0) delete g.inv[bestId];
    S.earn(gained);
    g.stats.sold += take;

    R.floatText(D.SELL.x + 0.5, D.SELL.y + 0.5, '+' + U.fmtMoney(gained), '#f5c04e', 1);
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

    /* safety: if a rock ever spawns on top of us, dig straight out */
    var stuck = W.nodeAt(g.layer, Math.floor(me.x), Math.floor(me.y));
    if (stuck) W.removeNode(g.layer, stuck);

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

    mineTick(dt, input.mine);
    sellTick(dt);
    dropTick(dt);

    if (me.bumpMsg > 0) me.bumpMsg -= dt;

    /* fade node hit flashes */
    var map = W.nodes[g.layer] || {};
    for (var k in map) {
      if (map[k].hit > 0) map[k].hit -= dt;
      if (map[k].pop > 0) map[k].pop = Math.max(0, map[k].pop - dt * 4);
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
    return null;
  };

  PL.nearShaft = function () {
    return U.dist(me.x, me.y, D.SHAFT.x + 0.5, D.SHAFT.y + 0.5) < 1.4;
  };

  root.PL = PL;
})(window);
