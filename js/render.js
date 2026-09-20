/* ============================================================
   render.js - isometric pixel renderer
   Everything is painted into a small back-buffer which is then
   blown up with nearest-neighbour scaling, so the result is
   honest chunky pixel art rather than smooth vector shapes.
   ============================================================ */
(function (root) {
  'use strict';

  var R = {};

  var TW = 32, TH = 16;           /* tile width / height in buffer pixels */
  var BODY = 104;                 /* how thick the floating island looks  */
  var GRASS_BAND = 5, DIRT_BAND = 38;

  var canvas, ctx, zoom = 3;
  var bw = 0, bh = 0;             /* buffer size                          */
  var cam = { x: 0, y: 0, tx: 0, ty: 0 };
  var floats = [], particles = [], clouds = [];
  var sideCache = null;
  var hoverTile = null;

  R.TW = TW; R.TH = TH;

  /* ---------------------------------------------------------
     Setup
     --------------------------------------------------------- */
  R.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    R.resize();
    makeClouds();
    makeStars();
  };

  R.resize = function () {
    if (!canvas) return;
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    bw = Math.max(160, Math.ceil(w / zoom));
    bh = Math.max(120, Math.ceil(h / zoom));
    canvas.width = bw;
    canvas.height = bh;
    ctx.imageSmoothingEnabled = false;
  };

  R.setZoom = function (z) {
    zoom = U.clamp(z, 2, 5);
    R.resize();
    return zoom;
  };
  R.getZoom = function () { return zoom; };

  var stars = [];
  function makeStars() {
    stars = [];
    for (var i = 0; i < 150; i++) {
      stars.push({
        x: Math.random() * 3000 - 500,
        y: Math.random() * 1600 - 500,
        p: U.rand(0.04, 0.3),
        s: Math.random() < 0.15 ? 2 : 1,
        tw: Math.random() * 6.28
      });
    }
  }

  function makeClouds() {
    clouds = [];
    for (var i = 0; i < 26; i++) {
      clouds.push({
        x: Math.random() * 2400 - 600,
        y: Math.random() * 900 - 300,
        w: U.randInt(14, 40),
        h: U.randInt(7, 18),
        p: U.rand(0.12, 0.42),          /* parallax factor */
        s: U.rand(1.5, 6)               /* drift speed     */
      });
    }
  }

  /* ---------------------------------------------------------
     Projection
     --------------------------------------------------------- */
  function isoX(x, y) { return (x - y) * (TW / 2); }
  function isoY(x, y) { return (x + y) * (TH / 2); }
  R.iso = function (x, y) { return { x: isoX(x, y), y: isoY(x, y) }; };

  function offX() { return Math.round(bw / 2 - cam.x); }
  function offY() { return Math.round(bh / 2 - cam.y); }

  /* screen (css px) -> tile coords */
  R.screenToTile = function (cx, cy) {
    var rect = canvas.getBoundingClientRect();
    var bx = (cx - rect.left) * (bw / rect.width) - offX();
    var by = (cy - rect.top) * (bh / rect.height) - offY();
    return {
      x: Math.floor(bx / TW + by / TH),
      y: Math.floor(by / TH - bx / TW)
    };
  };

  R.setHover = function (tile) { hoverTile = tile; };

  var guideTile = null;
  R.setGuide = function (tile) { guideTile = tile; };

  /* a bouncing chevron over whatever the tutorial is pointing at */
  function drawGuide(ox, oy, t) {
    if (!guideTile) return;
    var gx = ox + isoX(guideTile.x + 0.5, guideTile.y + 0.5);
    var gy = oy + isoY(guideTile.x + 0.5, guideTile.y + 0.5);
    if (gx < -60 || gx > bw + 60 || gy < -60 || gy > bh + 60) return;

    var bob = Math.round(Math.sin(t * 4) * 3);
    var ringPulse = (t * 1.2) % 1;

    ctx.strokeStyle = 'rgba(88,200,182,' + (0.75 - ringPulse * 0.75).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(gx, gy + TH / 2, 10 + ringPulse * 18, 5 + ringPulse * 9, 0, 0, 6.2832);
    ctx.stroke();

    var ay = gy - 26 + bob;
    ctx.fillStyle = '#101418';
    ctx.fillRect(gx - 6, ay - 1, 12, 10);
    ctx.fillStyle = '#58c8b6';
    for (var i = 0; i < 5; i++) ctx.fillRect(gx - 5 + i, ay + i, 11 - i * 2, 1);
    ctx.fillRect(gx - 2, ay - 5, 4, 5);

    if (guideTile.label) {
      P.text(ctx, guideTile.label, gx, ay - 15,
             { align: 'center', scale: 1, color: '#8ee6c8', plate: true });
    }
  }

  /* debug helper: what is currently floating on screen */
  R.debugFloats = function () {
    return floats.map(function (f) {
      return { text: f.text, x: +f.x.toFixed(2), y: +f.y.toFixed(2),
               rise: Math.round(f.rise), life: +f.life.toFixed(2), scale: f.scale };
    });
  };

  /* ---------------------------------------------------------
     Effects
     --------------------------------------------------------- */
  R.floatText = function (wx, wy, text, color, scale) {
    /* if something is already popping up here, stack on top of it rather
       than printing one number over another */
    var lift = 0;
    for (var i = floats.length - 1; i >= 0 && i >= floats.length - 6; i--) {
      var f = floats[i];
      if (f.life > 0.30 && Math.abs(f.x - wx) < 0.9 && Math.abs(f.y - wy) < 0.9) {
        lift = Math.max(lift, f.rise + 9);
      }
    }
    lift = Math.min(lift, 36);          /* never build a tower of numbers */
    floats.push({
      x: wx, y: wy, text: String(text), color: color || '#ffffff',
      scale: scale || 1, life: 1.15, rise: lift
    });
    if (floats.length > 24) floats.shift();
  };

  R.burst = function (wx, wy, color, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: wx, y: wy, z: U.rand(4, 12),
        vx: U.rand(-24, 24), vy: U.rand(-24, 24), vz: U.rand(20, 60),
        color: color, life: U.rand(0.4, 0.85)
      });
    }
    if (particles.length > 260) particles.splice(0, particles.length - 260);
  };

  R.shake = 0;
  R.kick = function (amount) { R.shake = Math.min(4, R.shake + amount); };

  /* ---------------------------------------------------------
     Island silhouette cache (jagged underside + buried gems)
     --------------------------------------------------------- */
  function sideData() {
    var g = S.get(), b = W.bounds();
    if (sideCache && sideCache.size === b.size) return sideCache;
    var rng = U.mulberry(1337 + b.size * 71);
    var jagA = [], jagB = [], i;
    var STEPS = Math.max(6, b.size);
    for (i = 0; i <= STEPS; i++) jagA.push(Math.round(rng() * 26));
    for (i = 0; i <= STEPS; i++) jagB.push(Math.round(rng() * 26));
    jagA[STEPS] = jagB[0] = Math.round(18 + rng() * 22);   /* shared corner */
    /* buried gems on each visible face */
    var gems = [];
    var count = Math.round(b.size * 4.5);
    for (i = 0; i < count; i++) {
      gems.push({
        face: rng() < 0.5 ? 0 : 1,
        t: rng(),
        d: GRASS_BAND + DIRT_BAND + 6 + rng() * (BODY - GRASS_BAND - DIRT_BAND - 14),
        c: rng(),
        size: rng() < 0.45 ? 3 : 2
      });
    }
    sideCache = { size: b.size, jagA: jagA, jagB: jagB, steps: STEPS, gems: gems };
    return sideCache;
  }
  R.invalidate = function () { sideCache = null; };

  function poly(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  /* one extruded face: A -> B along the top, dropping `depth` with jag */
  function face(ax, ay, bx, by, depth, jag, colors) {
    var steps = jag.length - 1, i, pts = [];
    pts.push([ax, ay], [bx, by]);
    for (i = steps; i >= 0; i--) {
      var t = i / steps;
      pts.push([U.lerp(ax, bx, t), U.lerp(ay, by, t) + depth + jag[i]]);
    }
    poly(pts, colors.stone);

    /* strata bands sit above the jagged zone so a simple quad is enough */
    poly([[ax, ay], [bx, by], [bx, by + GRASS_BAND], [ax, ay + GRASS_BAND]], colors.grass);
    poly([[ax, ay + GRASS_BAND], [bx, by + GRASS_BAND],
          [bx, by + GRASS_BAND + DIRT_BAND], [ax, ay + GRASS_BAND + DIRT_BAND]], colors.dirt);
    poly([[ax, ay + GRASS_BAND + DIRT_BAND], [bx, by + GRASS_BAND + DIRT_BAND],
          [bx, by + GRASS_BAND + DIRT_BAND + 3], [ax, ay + GRASS_BAND + DIRT_BAND + 3]],
         U.shade(colors.dirt, -35));
  }

  function drawIslandBody(ox, oy) {
    var b = W.bounds(), sd = sideData();
    var top = { x: ox + isoX(b.x0, b.y0), y: oy + isoY(b.x0, b.y0) };
    var right = { x: ox + isoX(b.x1 + 1, b.y0), y: oy + isoY(b.x1 + 1, b.y0) };
    var bottom = { x: ox + isoX(b.x1 + 1, b.y1 + 1), y: oy + isoY(b.x1 + 1, b.y1 + 1) };
    var left = { x: ox + isoX(b.x0, b.y1 + 1), y: oy + isoY(b.x0, b.y1 + 1) };

    /* soft shadow cast into the sky below the rock */
    ctx.fillStyle = S.dim().space ? 'rgba(255,255,255,.05)' : 'rgba(120,180,195,.18)';
    ctx.fillRect(Math.round(left.x), Math.round(bottom.y + BODY + 26),
                 Math.round(right.x - left.x), 6);

    var body = S.dim().body;
    face(left.x, left.y, bottom.x, bottom.y, BODY, sd.jagA,
         { grass: body.grass, dirt: body.dirt, stone: body.stone });
    face(bottom.x, bottom.y, right.x, right.y, BODY, sd.jagB,
         { grass: U.shade(body.grass, -18), dirt: U.shade(body.dirt, -26), stone: U.shade(body.stone, -22) });

    /* buried ore glinting in the rock face, drawn from this dimension's seams */
    var seam = S.dimOres();
    var palette = [];
    for (var pi = 0; pi < seam.length; pi++) palette.push(seam[pi].gem);
    if (!palette.length) palette = ['#b3323f', '#e6edf2'];
    for (var i = 0; i < sd.gems.length; i++) {
      var gm = sd.gems[i];
      var A = gm.face === 0 ? left : bottom, B = gm.face === 0 ? bottom : right;
      var gx = Math.round(U.lerp(A.x, B.x, gm.t));
      var gy = Math.round(U.lerp(A.y, B.y, gm.t) + gm.d);
      var c = palette[Math.floor(gm.c * palette.length)];
      ctx.fillStyle = U.shade(c, -50);
      ctx.fillRect(gx, gy, gm.size + 1, gm.size + 1);
      ctx.fillStyle = c;
      ctx.fillRect(gx, gy, gm.size, gm.size);
    }
  }

  /* cave: floating slab plus the two far walls of the chamber */
  function drawCaveShell(ox, oy, layer) {
    var b = W.bounds(), L = S.layer(layer), sd = sideData();
    var top = { x: ox + isoX(b.x0, b.y0), y: oy + isoY(b.x0, b.y0) };
    var right = { x: ox + isoX(b.x1 + 1, b.y0), y: oy + isoY(b.x1 + 1, b.y0) };
    var bottom = { x: ox + isoX(b.x1 + 1, b.y1 + 1), y: oy + isoY(b.x1 + 1, b.y1 + 1) };
    var left = { x: ox + isoX(b.x0, b.y1 + 1), y: oy + isoY(b.x0, b.y1 + 1) };
    var H = 44;

    /* far walls rise behind the floor */
    poly([[top.x, top.y - H], [right.x, right.y - H], [right.x, right.y], [top.x, top.y]],
         U.shade(L.wall, 10));
    poly([[top.x, top.y - H], [left.x, left.y - H], [left.x, left.y], [top.x, top.y]],
         U.shade(L.wall, -14));
    /* ceiling shadow */
    poly([[top.x, top.y - H], [right.x, right.y - H], [right.x, right.y - H + 7], [top.x, top.y - H + 7]],
         'rgba(0,0,0,.35)');
    poly([[top.x, top.y - H], [left.x, left.y - H], [left.x, left.y - H + 7], [top.x, top.y - H + 7]],
         'rgba(0,0,0,.35)');

    /* the slab this chamber sits on */
    face(left.x, left.y, bottom.x, bottom.y, 34, sd.jagA,
         { grass: U.shade(L.floor, -18), dirt: U.shade(L.wall, 14), stone: U.shade(L.wall, -6) });
    face(bottom.x, bottom.y, right.x, right.y, 34, sd.jagB,
         { grass: U.shade(L.floor, -30), dirt: U.shade(L.wall, -4), stone: U.shade(L.wall, -22) });
  }

  /* ---------------------------------------------------------
     Tile floor
     --------------------------------------------------------- */
  function drawTiles(ox, oy, layer) {
    var b = W.bounds(), L = S.layer(layer);
    var hx = TW / 2, hy = TH / 2;
    for (var y = b.y0; y <= b.y1; y++) {
      for (var x = b.x0; x <= b.x1; x++) {
        var sx = ox + isoX(x, y), sy = oy + isoY(x, y);
        if (sx < -TW || sx > bw + TW || sy < -TH * 3 || sy > bh + TH * 6) continue;
        var alt = ((x + y) & 1) === 0;
        ctx.fillStyle = alt ? L.floor : L.floor2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + hx, sy + hy);
        ctx.lineTo(sx, sy + TH);
        ctx.lineTo(sx - hx, sy + hy);
        ctx.closePath();
        ctx.fill();

        /* scattered detail so the ground is not flat colour */
        if (((x * 31 + y * 17) % 7) === 0) {
          P.tuft(ctx, Math.round(sx), Math.round(sy + hy), x * 991 + y,
                 layer === 0 ? U.shade(L.floor, 26) : U.shade(L.floor, 18));
        }
      }
    }

    /* bright rim along the two near edges */
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (var i = b.x0; i <= b.x1 + 1; i++) {
      ctx.fillRect(Math.round(ox + isoX(i, b.y1 + 1)) - 1, Math.round(oy + isoY(i, b.y1 + 1)) - 1, 2, 1);
    }
  }

  /* market pad + mineshaft markers */
  function drawMarkers(ox, oy, layer, t) {
    var pulse = 0.5 + 0.5 * Math.sin(t * 3);

    if (layer === 0) {
      var m = D.SELL;
      var mx = ox + isoX(m.x, m.y), my = oy + isoY(m.x, m.y);
      poly([[mx, my], [mx + TW / 2, my + TH / 2], [mx, my + TH], [mx - TW / 2, my + TH / 2]],
           'rgba(245,192,78,' + (0.35 + pulse * 0.3) + ')');
      ctx.fillStyle = '#a97d1c';
      ctx.fillRect(Math.round(mx - 7), Math.round(my + TH / 2 - 1), 14, 2);
      P.text(ctx, '$', Math.round(mx), Math.round(my + TH / 2 - 10),
             { align: 'center', color: '#f5c04e', outline: '#3a2a06', scale: 1 });
      /* stall */
      ctx.fillStyle = '#7a5334'; ctx.fillRect(Math.round(mx - 8), Math.round(my - 4), 3, 9);
      ctx.fillRect(Math.round(mx + 5), Math.round(my - 4), 3, 9);
      ctx.fillStyle = '#e05b6a'; ctx.fillRect(Math.round(mx - 10), Math.round(my - 8), 20, 4);
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(Math.round(mx - 10), Math.round(my - 8), 20, 2);
    }

    /* warp gate, once another dimension is reachable */
    if (layer === 0 && S.dimsUnlocked() > 1) {
      var gt = D.GATE;
      var gx = ox + isoX(gt.x, gt.y), gy = oy + isoY(gt.x, gt.y);
      var dimc = S.dim().glow || '#a678e8';
      poly([[gx, gy], [gx + TW / 2, gy + TH / 2], [gx, gy + TH], [gx - TW / 2, gy + TH / 2]],
           'rgba(166,120,232,' + (0.3 + pulse * 0.35) + ')');
      ctx.fillStyle = '#3d2f5c';
      ctx.fillRect(Math.round(gx - 7), Math.round(gy - 2), 2, 10);
      ctx.fillRect(Math.round(gx + 5), Math.round(gy - 2), 2, 10);
      ctx.fillRect(Math.round(gx - 7), Math.round(gy - 4), 14, 2);
      ctx.fillStyle = dimc;
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      ctx.fillRect(Math.round(gx - 5), Math.round(gy - 2), 10, 10);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e0d0ff';
      ctx.fillRect(Math.round(gx - 1), Math.round(gy + 1 - Math.round(pulse * 4)), 2, 2);
    }

    var s = D.SHAFT;
    var sx = ox + isoX(s.x, s.y), sy = oy + isoY(s.x, s.y);
    poly([[sx, sy], [sx + TW / 2, sy + TH / 2], [sx, sy + TH], [sx - TW / 2, sy + TH / 2]], '#20262c');
    poly([[sx, sy + 3], [sx + TW / 2 - 6, sy + TH / 2], [sx, sy + TH - 3], [sx - TW / 2 + 6, sy + TH / 2]],
         '#0b0e12');
    ctx.fillStyle = '#8a5a32';
    for (var r = 0; r < 3; r++) ctx.fillRect(Math.round(sx - 4), Math.round(sy + 3 + r * 3), 8, 1);
    ctx.fillStyle = '#6b7680';
    ctx.fillRect(Math.round(sx - 5), Math.round(sy + 1), 1, 11);
    ctx.fillRect(Math.round(sx + 4), Math.round(sy + 1), 1, 11);
  }

  /* build-mode ghost */
  function drawHover(ox, oy, layer, mode) {
    if (!hoverTile || layer !== 0 || !mode) return;
    var x = hoverTile.x, y = hoverTile.y;
    if (!W.inBounds(x, y)) return;
    var ok = W.tileFreeForBuild(x, y);
    var sx = ox + isoX(x, y), sy = oy + isoY(x, y);
    poly([[sx, sy], [sx + TW / 2, sy + TH / 2], [sx, sy + TH], [sx - TW / 2, sy + TH / 2]],
         ok ? 'rgba(111,214,111,.45)' : 'rgba(224,91,106,.45)');
    ctx.fillStyle = ok ? '#6fd66f' : '#e05b6a';
    ctx.fillRect(Math.round(sx - 1), Math.round(sy + TH / 2 - 1), 2, 2);
  }

  /* ---------------------------------------------------------
     Entities, painted back to front
     --------------------------------------------------------- */
  function drawEntities(ox, oy, layer, t, player) {
    var list = [];
    var map = W.nodes[layer] || {};
    var k, n;
    for (k in map) {
      n = map[k];
      list.push({ sort: n.x + n.y, kind: 'node', n: n });
    }
    if (layer === 0) {
      var bs = S.get().buildings;
      for (var i = 0; i < bs.length; i++) {
        list.push({ sort: bs[i].x + bs[i].y + 0.1, kind: 'build', b: bs[i] });
      }
    }
    list.push({ sort: player.x + player.y, kind: 'player' });
    list.sort(function (a, b) { return a.sort - b.sort; });

    for (var e = 0; e < list.length; e++) {
      var it = list[e];
      if (it.kind === 'node') {
        n = it.n;
        var sx = ox + isoX(n.x + 0.5, n.y + 0.5);
        var sy = oy + isoY(n.x + 0.5, n.y + 0.5);
        if (sx < -40 || sx > bw + 40 || sy < -60 || sy > bh + 60) continue;
        var ore = D.ORE_BY_ID[n.ore];
        var shake = n.hit > 0 ? Math.round(Math.sin(n.hit * 60) * 2) : 0;
        var pop = n.pop > 0 ? Math.round(n.pop * 5) : 0;
        /* a graded seam gets a ring on the ground and, for the rarer two,
           its name overhead - the halo alone is lost against bright rock */
        var nmut = n.mut ? D.MUT_BY_ID[n.mut] : null;
        if (n.grade || nmut) {
          var gd = D.GRADES[n.grade || 0];
          var gp = 0.5 + 0.5 * Math.sin(t * 3 + n.seed);
          ctx.globalAlpha = 0.3 + gp * 0.45;
          ctx.strokeStyle = nmut ? nmut.color : gd.glow;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sx, sy + TH / 2, 10 + gp * 4, 5 + gp * 2, 0, 0, 6.2832);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (n.struct) {
          P.structure(ctx, n.struct, sx + shake, sy + 2 + pop, t, n.buried,
                      U.shade(S.layer(layer).wall, 18));
          if (!n.buried) {
            P.hpBar(ctx, sx, sy - 6, n);
            /* a marker so a find is obvious across a crowded island */
            var mk = Math.round(Math.sin(t * 3) * 2);
            P.text(ctx, '!', sx, sy - P.STRUCT_H - 14 + mk,
                   { align: 'center', scale: 1, color: '#f5c04e', plate: true });
          }
        } else {
          P.rock(ctx, sx, sy + 2 + pop, ore, n, shake, t);
          P.hpBar(ctx, sx, sy + 2, n);
          var showMut = nmut && (nmut.mult >= 2.5 || nmut.mult <= 0.3);
          if (n.grade >= 2 || showMut) {
            var gd2 = D.GRADES[n.grade || 0];
            var bob2 = Math.round(Math.sin(t * 3 + n.seed) * 2);
            var label = ((n.grade >= 2 ? gd2.name + ' ' : '') +
                         (nmut ? nmut.name.toUpperCase() : '')).trim();
            P.text(ctx, label, sx, sy - P.ROCK_H - 12 + bob2,
                   { align: 'center', scale: 1,
                     color: nmut ? nmut.color : gd2.color, plate: true });
          }
        }
      } else if (it.kind === 'build') {
        var b = it.b;
        P.building(ctx, b.id, ox + isoX(b.x + 0.5, b.y + 0.5),
                   oy + isoY(b.x + 0.5, b.y + 0.5) + 3, t);
      } else {
        P.miner(ctx, ox + isoX(player.x, player.y), oy + isoY(player.x, player.y) + 3, {
          face: player.face, walking: player.walking, t: t, swing: player.swingPhase
        });
      }
    }
  }

  /* ---------------------------------------------------------
     Particles + floating numbers
     --------------------------------------------------------- */
  function stepEffects(dt) {
    var i;
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt * 0.02;
      p.y += p.vy * dt * 0.02;
      p.z += p.vz * dt;
      p.vz -= 220 * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.6; p.vy *= 0.6; }
    }
    for (i = floats.length - 1; i >= 0; i--) {
      var f = floats[i];
      f.life -= dt;
      f.rise += dt * 22;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  function drawEffects(ox, oy) {
    var i;
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.fillStyle = p.color;
      ctx.globalAlpha = U.clamp(p.life * 1.6, 0, 1);
      ctx.fillRect(Math.round(ox + isoX(p.x, p.y)), Math.round(oy + isoY(p.x, p.y) - p.z), 2, 2);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < floats.length; i++) {
      var f = floats[i];
      ctx.globalAlpha = U.clamp(f.life * 1.5, 0, 1);
      P.text(ctx, f.text,
             Math.round(ox + isoX(f.x, f.y)),
             Math.round(oy + isoY(f.x, f.y) - 22 - f.rise),
             { align: 'center', scale: f.scale, color: f.color,
               outline: f.scale > 1 ? '#101418' : null, plate: f.scale === 1 });
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------
     Sky
     --------------------------------------------------------- */
  function drawSky(dt, t) {
    var dim = S.dim();
    var grad = ctx.createLinearGradient(0, 0, 0, bh);
    grad.addColorStop(0, dim.sky[0]);
    grad.addColorStop(0.55, dim.sky[1]);
    grad.addColorStop(1, dim.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, bw, bh);

    var i, px, py, span;

    /* starfield for anywhere off-world */
    if (dim.space) {
      for (i = 0; i < stars.length; i++) {
        var st = stars[i];
        px = st.x - cam.x * st.p;
        py = st.y - cam.y * st.p;
        span = bw + 600;
        px = ((px % span) + span) % span - 300;
        var vspan = bh + 600;
        py = ((py % vspan) + vspan) % vspan - 300;
        var tw = 0.55 + 0.45 * Math.sin(t * 1.5 + st.tw);
        ctx.fillStyle = 'rgba(255,255,255,' + tw.toFixed(2) + ')';
        ctx.fillRect(Math.round(px), Math.round(py), st.s, st.s);
      }
    }

    /* a body hanging in the distance */
    if (dim.planet) {
      var pl = dim.planet;
      var cxp = Math.round(bw * pl.x - cam.x * 0.06);
      var cyp = Math.round(bh * pl.y - cam.y * 0.06);
      if (pl.ring) {
        ctx.fillStyle = pl.accent;
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.arc(cxp, cyp, pl.r + 10, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = pl.color;
      ctx.beginPath(); ctx.arc(cxp, cyp, pl.r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = pl.accent;
      ctx.globalAlpha = pl.ring ? 0.9 : 0.55;
      /* a few chunky surface bands so it does not read as a flat disc */
      for (i = 0; i < 4; i++) {
        var by = cyp - pl.r + Math.round(pl.r * (0.45 + i * 0.32));
        var half = Math.round(Math.sqrt(Math.max(0, pl.r * pl.r - (by - cyp) * (by - cyp))));
        var wBand = Math.round(half * 2 * (i % 2 ? 0.55 : 0.85));
        ctx.fillRect(cxp - Math.round(wBand / 2), by, wBand, 3);
      }
      ctx.globalAlpha = 1;
      if (pl.ring) {
        ctx.fillStyle = pl.accent;
        ctx.fillRect(cxp - pl.r - 14, cyp - 1, (pl.r + 14) * 2, 2);
      }
    }

    if (dim.clouds) {
      for (i = 0; i < clouds.length; i++) {
        var c = clouds[i];
        c.x += c.s * dt;
        px = c.x - cam.x * c.p; py = c.y - cam.y * c.p;
        span = bw + 800;
        px = ((px % span) + span) % span - 400;
        if (py < -200 || py > bh + 200) continue;
        P.cloud(ctx, px, py, c.w, c.h, 0.55 + c.p);
      }
    }

    /* a coloured wash so the forge glows and the nebula shimmers */
    if (dim.glow) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = dim.glow;
      ctx.fillRect(0, 0, bw, bh);
      ctx.globalAlpha = 1;
    }
  }

  function drawCaveBg(layer) {
    var L = S.layer(layer);
    var grad = ctx.createLinearGradient(0, 0, 0, bh);
    grad.addColorStop(0, U.shade(L.wall, -30));
    grad.addColorStop(1, '#070a0e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, bw, bh);
    /* faint dripping specks for atmosphere */
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (var i = 0; i < 40; i++) {
      var sx = (i * 137 + Math.round(cam.x * 0.15)) % bw;
      var sy = (i * 71 + Math.round(cam.y * 0.15)) % bh;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  function drawDarkness(layer, player, ox, oy) {
    var L = S.layer(layer);
    var lamp = S.derive().light;
    var radius = 90 + lamp * 150;
    var dark = U.clamp(1 - L.light - lamp * 0.35, 0, 0.82);
    if (dark <= 0.02) return;
    var px = ox + isoX(player.x, player.y), py = oy + isoY(player.x, player.y) - 6;
    var g = ctx.createRadialGradient(px, py, radius * 0.25, px, py, radius);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,' + (dark * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + dark.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, bw, bh);
  }

  /* ---------------------------------------------------------
     Main draw
     --------------------------------------------------------- */
  R.draw = function (dt, t, player, buildMode) {
    if (!ctx) return;
    var g = S.get(), layer = g.layer;

    /* camera follows the miner with a little lag */
    cam.tx = isoX(player.x, player.y);
    cam.ty = isoY(player.x, player.y) + 10;
    cam.x = U.lerp(cam.x, cam.tx, Math.min(1, dt * 7));
    cam.y = U.lerp(cam.y, cam.ty, Math.min(1, dt * 7));

    if (R.shake > 0) R.shake = Math.max(0, R.shake - dt * 14);
    var shakeX = R.shake > 0 ? Math.round(U.rand(-R.shake, R.shake)) : 0;
    var shakeY = R.shake > 0 ? Math.round(U.rand(-R.shake, R.shake)) : 0;

    var ox = offX() + shakeX, oy = offY() + shakeY;

    if (layer === 0) { drawSky(dt, t); drawIslandBody(ox, oy); }
    else { drawCaveBg(layer); drawCaveShell(ox, oy, layer); }

    drawTiles(ox, oy, layer);
    drawMarkers(ox, oy, layer, t);
    drawHover(ox, oy, layer, buildMode);
    stepEffects(dt);
    drawEntities(ox, oy, layer, t, player);
    drawEffects(ox, oy);
    drawGuide(ox, oy, t);
    if (layer > 0) drawDarkness(layer, player, ox, oy);
  };

  root.R = R;
})(window);
