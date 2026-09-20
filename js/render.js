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

  /* ---------------------------------------------------------
     Effects
     --------------------------------------------------------- */
  R.floatText = function (wx, wy, text, color, scale) {
    floats.push({
      x: wx, y: wy, text: String(text), color: color || '#ffffff',
      scale: scale || 1, life: 1.15, rise: 0
    });
    if (floats.length > 40) floats.shift();
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
    ctx.fillStyle = 'rgba(120,180,195,.18)';
    ctx.fillRect(Math.round(left.x), Math.round(bottom.y + BODY + 26),
                 Math.round(right.x - left.x), 6);

    face(left.x, left.y, bottom.x, bottom.y, BODY, sd.jagA,
         { grass: '#3f9c8a', dirt: '#d79a6e', stone: '#9299a1' });
    face(bottom.x, bottom.y, right.x, right.y, BODY, sd.jagB,
         { grass: '#348275', dirt: '#b98059', stone: '#787f87' });

    /* buried ore glinting in the rock face */
    var palette = ['#b3323f', '#e6edf2', '#b3323f', '#8f979e', '#e6edf2'];
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
    var b = W.bounds(), L = D.LAYERS[layer], sd = sideData();
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
    var b = W.bounds(), L = D.LAYERS[layer];
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
        P.rock(ctx, sx, sy + 2 + pop, ore, n, shake);
        P.hpBar(ctx, sx, sy + 2, n);
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
             { align: 'center', scale: f.scale, color: f.color, outline: '#101418' });
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------
     Sky
     --------------------------------------------------------- */
  function drawSky(dt) {
    var grad = ctx.createLinearGradient(0, 0, 0, bh);
    grad.addColorStop(0, '#a9e6f2');
    grad.addColorStop(0.55, '#c4eef4');
    grad.addColorStop(1, '#dff6f7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, bw, bh);

    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += c.s * dt;
      var px = c.x - cam.x * c.p, py = c.y - cam.y * c.p;
      var span = bw + 800;
      px = ((px % span) + span) % span - 400;
      if (py < -200 || py > bh + 200) continue;
      P.cloud(ctx, px, py, c.w, c.h, 0.55 + c.p);
    }
  }

  function drawCaveBg(layer) {
    var L = D.LAYERS[layer];
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
    var L = D.LAYERS[layer];
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

    if (layer === 0) { drawSky(dt); drawIslandBody(ox, oy); }
    else { drawCaveBg(layer); drawCaveShell(ox, oy, layer); }

    drawTiles(ox, oy, layer);
    drawMarkers(ox, oy, layer, t);
    drawHover(ox, oy, layer, buildMode);
    stepEffects(dt);
    drawEntities(ox, oy, layer, t, player);
    drawEffects(ox, oy);
    if (layer > 0) drawDarkness(layer, player, ox, oy);
  };

  root.R = R;
})(window);
