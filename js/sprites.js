/* ============================================================
   sprites.js - hand-rolled pixel art: bitmap font, rocks,
   machines, the miner and the clouds.  Everything is drawn
   with integer fillRect calls into the low-res buffer so the
   result stays crisp when the buffer is scaled up.
   ============================================================ */
(function (root) {
  'use strict';

  var P = {};

  /* ---------------------------------------------------------
     5x7 bitmap font
     --------------------------------------------------------- */
  var F = {
    '0': '01110/10001/10011/10101/11001/10001/01110',
    '1': '00100/01100/00100/00100/00100/00100/01110',
    '2': '01110/10001/00001/00010/00100/01000/11111',
    '3': '11111/00010/00100/00010/00001/10001/01110',
    '4': '00010/00110/01010/10010/11111/00010/00010',
    '5': '11111/10000/11110/00001/00001/10001/01110',
    '6': '00110/01000/10000/11110/10001/10001/01110',
    '7': '11111/00001/00010/00100/01000/01000/01000',
    '8': '01110/10001/10001/01110/10001/10001/01110',
    '9': '01110/10001/10001/01111/00001/00010/01100',
    'A': '01110/10001/10001/11111/10001/10001/10001',
    'B': '11110/10001/10001/11110/10001/10001/11110',
    'C': '01110/10001/10000/10000/10000/10001/01110',
    'D': '11100/10010/10001/10001/10001/10010/11100',
    'E': '11111/10000/10000/11110/10000/10000/11111',
    'F': '11111/10000/10000/11110/10000/10000/10000',
    'G': '01110/10001/10000/10111/10001/10001/01111',
    'H': '10001/10001/10001/11111/10001/10001/10001',
    'I': '01110/00100/00100/00100/00100/00100/01110',
    'J': '00111/00010/00010/00010/00010/10010/01100',
    'K': '10001/10010/10100/11000/10100/10010/10001',
    'L': '10000/10000/10000/10000/10000/10000/11111',
    'M': '10001/11011/10101/10101/10001/10001/10001',
    'N': '10001/11001/10101/10011/10001/10001/10001',
    'O': '01110/10001/10001/10001/10001/10001/01110',
    'P': '11110/10001/10001/11110/10000/10000/10000',
    'Q': '01110/10001/10001/10001/10101/10010/01101',
    'R': '11110/10001/10001/11110/10100/10010/10001',
    'S': '01111/10000/10000/01110/00001/00001/11110',
    'T': '11111/00100/00100/00100/00100/00100/00100',
    'U': '10001/10001/10001/10001/10001/10001/01110',
    'V': '10001/10001/10001/10001/10001/01010/00100',
    'W': '10001/10001/10001/10101/10101/11011/10001',
    'X': '10001/10001/01010/00100/01010/10001/10001',
    'Y': '10001/10001/01010/00100/00100/00100/00100',
    'Z': '11111/00001/00010/00100/01000/10000/11111',
    '+': '00000/00100/00100/11111/00100/00100/00000',
    '-': '00000/00000/00000/11111/00000/00000/00000',
    '.': '00000/00000/00000/00000/00000/01100/01100',
    ',': '00000/00000/00000/00000/01100/01100/11000',
    ':': '00000/01100/01100/00000/01100/01100/00000',
    '!': '00100/00100/00100/00100/00100/00000/00100',
    '$': '00100/01111/10100/01110/00101/11110/00100',
    '%': '11001/11010/00010/00100/01000/01011/10011',
    '/': '00001/00010/00010/00100/01000/01000/10000',
    '(': '00010/00100/01000/01000/01000/00100/00010',
    ')': '01000/00100/00010/00010/00010/00100/01000',
    '?': '01110/10001/00001/00010/00100/00000/00100',
    ' ': '00000/00000/00000/00000/00000/00000/00000'
  };

  var GLYPH = {};
  (function bake() {
    for (var ch in F) {
      var rows = F[ch].split('/');
      var pts = [];
      for (var y = 0; y < rows.length; y++) {
        for (var x = 0; x < rows[y].length; x++) {
          if (rows[y][x] === '1') pts.push([x, y]);
        }
      }
      GLYPH[ch] = pts;
    }
  })();

  P.textWidth = function (str, scale) {
    scale = scale || 1;
    return str.length * 6 * scale - scale;
  };

  /* draw bitmap text; opts {scale, color, outline, align:'left'|'center'} */
  P.text = function (ctx, str, x, y, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var color = opts.color || '#ffffff';
    var outline = opts.outline;
    str = String(str).toUpperCase();
    if (opts.align === 'center') x -= Math.floor(P.textWidth(str, scale) / 2);
    var cx = Math.round(x), cy = Math.round(y), i, j, g;

    /* a plate keeps small text readable over pale rock, bright suns and
       whatever palette the current dimension happens to use */
    if (opts.plate) {
      var pw = P.textWidth(str, scale);
      ctx.fillStyle = 'rgba(10,14,19,.72)';
      ctx.fillRect(cx - 2, cy - 2, pw + 4, 7 * scale + 3);
      ctx.fillStyle = 'rgba(10,14,19,.4)';
      ctx.fillRect(cx - 3, cy - 1, 1, 7 * scale + 1);
      ctx.fillRect(cx + pw + 2, cy - 1, 1, 7 * scale + 1);
    }

    if (outline) {
      ctx.fillStyle = outline;
      /* At scale 1 a full ring would be as thick as the strokes themselves and
         would close the holes in 8, 5 and $, so small text gets a drop shadow
         instead.  Larger text gets a crisp one-pixel ring. */
      var ring = scale === 1 ? [[1, 1]]
        : [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]];
      for (i = 0; i < str.length; i++) {
        g = GLYPH[str[i]] || GLYPH[' '];
        var gx = cx + i * 6 * scale;
        for (j = 0; j < g.length; j++) {
          var px = gx + g[j][0] * scale, py = cy + g[j][1] * scale;
          for (var o = 0; o < ring.length; o++) {
            ctx.fillRect(px + ring[o][0], py + ring[o][1], scale, scale);
          }
        }
      }
    }
    ctx.fillStyle = color;
    for (i = 0; i < str.length; i++) {
      g = GLYPH[str[i]] || GLYPH[' '];
      var bx = cx + i * 6 * scale;
      for (j = 0; j < g.length; j++) {
        ctx.fillRect(bx + g[j][0] * scale, cy + g[j][1] * scale, scale, scale);
      }
    }
  };

  /* ---------------------------------------------------------
     Helper: draw a run-length shape.  rows = [[offsetX, width], ...]
     --------------------------------------------------------- */
  function runs(ctx, x, y, rows, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] <= 0) continue;
      ctx.fillRect(x + rows[i][0], y + i, rows[i][1], 1);
    }
  }
  P.runs = runs;

  /* ---------------------------------------------------------
     Ore node - 16x11 chunky boulder, anchored bottom-centre
     --------------------------------------------------------- */
  var ROCK = [[5, 6], [3, 10], [2, 12], [1, 14], [0, 16], [0, 16], [0, 16], [1, 14], [2, 12], [4, 8]];
  var ROCK_W = 16, ROCK_H = ROCK.length;

  P.rock = function (ctx, cx, by, ore, node, shake) {
    var x = Math.round(cx - ROCK_W / 2 + (shake || 0));
    var y = Math.round(by - ROCK_H);
    var base = ore.color;

    /* drop shadow */
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(x + 1, by - 1, ROCK_W - 2, 2);

    /* outline: the same silhouette nudged in four directions */
    var line = U.shade(base, -78);
    runs(ctx, x - 1, y, ROCK, line);
    runs(ctx, x + 1, y, ROCK, line);
    runs(ctx, x, y - 1, ROCK, line);
    runs(ctx, x, y + 1, ROCK, line);

    runs(ctx, x, y, ROCK, U.shade(base, -34));                 /* body     */
    runs(ctx, x, y, ROCK.slice(0, 4), U.shade(base, 12));      /* lit top  */
    /* left-hand highlight column */
    ctx.fillStyle = U.shade(base, 26);
    for (var r = 0; r < 4; r++) ctx.fillRect(x + ROCK[r][0] + 1, y + r, 2, 1);
    /* dark underside */
    runs(ctx, x, y + ROCK_H - 2, [ROCK[ROCK_H - 2], ROCK[ROCK_H - 1]], U.shade(base, -60));

    /* gem speckles - deterministic per node */
    var rng = U.mulberry(node.seed);
    ctx.fillStyle = ore.gem;
    var gems = 3 + Math.floor(rng() * 3);
    for (var i = 0; i < gems; i++) {
      var gy = 2 + Math.floor(rng() * (ROCK_H - 5));
      var row = ROCK[gy];
      var gx = row[0] + 1 + Math.floor(rng() * Math.max(1, row[1] - 3));
      ctx.fillRect(x + gx, y + gy, 2, 2);
    }

    /* cracks appear as the node is worn down */
    var dmg = 1 - node.hp / node.maxHp;
    if (dmg > 0.15) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      var crackRng = U.mulberry(node.seed + 7);
      var n = Math.floor(dmg * 7);
      for (var c = 0; c < n; c++) {
        var ccx = x + 3 + Math.floor(crackRng() * (ROCK_W - 6));
        var ccy = y + 2 + Math.floor(crackRng() * (ROCK_H - 4));
        ctx.fillRect(ccx, ccy, 1, 2);
        ctx.fillRect(ccx + 1, ccy + 2, 1, 1);
      }
    }
  };

  P.ROCK_H = ROCK_H;

  /* small health bar above a damaged node */
  P.hpBar = function (ctx, cx, by, node) {
    if (node.hp >= node.maxHp) return;
    var w = 16, x = Math.round(cx - w / 2), y = Math.round(by - ROCK_H - 5);
    ctx.fillStyle = '#10161d'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#3a4650'; ctx.fillRect(x, y, w, 2);
    var f = U.clamp(node.hp / node.maxHp, 0, 1);
    ctx.fillStyle = f > 0.5 ? '#6fd66f' : (f > 0.22 ? '#f5c04e' : '#e05b6a');
    ctx.fillRect(x, y, Math.max(1, Math.round(w * f)), 2);
  };

  /* ---------------------------------------------------------
     The miner
     --------------------------------------------------------- */
  P.miner = function (ctx, cx, by, opts) {
    opts = opts || {};
    var face = opts.face || 1;          /* 1 = facing screen-right */
    var bob = opts.walking ? Math.round(Math.sin(opts.t * 12) * 1) : 0;
    var x = Math.round(cx - 4), y = Math.round(by - 15) + bob;

    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(x - 1, by - 1, 10, 2);

    /* legs */
    ctx.fillStyle = '#2f3b52';
    var stride = opts.walking ? Math.round(Math.sin(opts.t * 12) * 1.5) : 0;
    ctx.fillRect(x + 1, y + 11, 3, 4 - Math.abs(stride));
    ctx.fillRect(x + 5, y + 11, 3, 4 - Math.abs(stride ? 1 : 0));
    ctx.fillStyle = '#1b2431';
    ctx.fillRect(x + 1, y + 14, 3, 1);
    ctx.fillRect(x + 5, y + 14, 3, 1);

    /* body */
    ctx.fillStyle = '#e05b6a';
    ctx.fillRect(x + 1, y + 6, 7, 6);
    ctx.fillStyle = '#f0808c';
    ctx.fillRect(x + 1, y + 6, 7, 1);
    /* arm */
    ctx.fillStyle = '#d9a06e';
    ctx.fillRect(face > 0 ? x + 7 : x, y + 8, 2, 3);

    /* head */
    ctx.fillStyle = '#f0c49a';
    ctx.fillRect(x + 1, y + 1, 7, 5);
    ctx.fillStyle = '#c98f5f';
    ctx.fillRect(x + 1, y + 5, 7, 1);
    /* eyes */
    ctx.fillStyle = '#20262c';
    if (face > 0) { ctx.fillRect(x + 5, y + 3, 1, 1); ctx.fillRect(x + 7, y + 3, 1, 1); }
    else { ctx.fillRect(x + 1, y + 3, 1, 1); ctx.fillRect(x + 3, y + 3, 1, 1); }
    /* helmet */
    ctx.fillStyle = '#f5c04e';
    ctx.fillRect(x, y, 9, 2);
    ctx.fillRect(x + 1, y - 1, 7, 1);
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(face > 0 ? x + 8 : x - 1, y, 1, 2);

    /* pickaxe mid-swing */
    if (opts.swing !== undefined && opts.swing >= 0) {
      var a = opts.swing;                       /* 0..1 through the swing */
      var ang = -1.1 + a * 2.0;
      var hx = x + (face > 0 ? 8 : 1), hy = y + 8;
      var len = 8;
      var ex = Math.round(hx + Math.cos(ang) * len * face);
      var ey = Math.round(hy + Math.sin(ang) * len);
      ctx.fillStyle = '#8a5a32';
      var steps = 6;
      for (var i = 0; i <= steps; i++) {
        ctx.fillRect(Math.round(U.lerp(hx, ex, i / steps)), Math.round(U.lerp(hy, ey, i / steps)), 1, 1);
      }
      ctx.fillStyle = '#cfe0ea';
      ctx.fillRect(ex - 1, ey - 1, 3, 2);
    }
  };

  /* ---------------------------------------------------------
     Buildings - each anchored bottom-centre, roughly 16x18
     --------------------------------------------------------- */
  var BUILD = {};

  BUILD.hut = function (ctx, x, y, t) {
    ctx.fillStyle = '#7a5334'; ctx.fillRect(x + 2, y + 8, 12, 9);   /* walls */
    ctx.fillStyle = '#8f6440'; ctx.fillRect(x + 2, y + 8, 12, 2);
    ctx.fillStyle = '#b8402f';                                       /* roof  */
    for (var i = 0; i < 6; i++) ctx.fillRect(x + 2 - 1 + i, y + 2 + i, 16 - i * 2 + 2, 1);
    ctx.fillStyle = '#d4573f'; ctx.fillRect(x + 6, y + 2, 4, 1);
    ctx.fillStyle = '#2b1d12'; ctx.fillRect(x + 6, y + 11, 4, 6);    /* door  */
    ctx.fillStyle = '#f5c04e'; ctx.fillRect(x + 11, y + 11, 2, 2);   /* window*/
  };

  BUILD.store = function (ctx, x, y, t) {
    /* a stack of crates under a low shelter */
    function crate(cx, cy, w, h, tone) {
      ctx.fillStyle = U.shade('#a9763f', tone - 26); ctx.fillRect(cx, cy, w, h);
      ctx.fillStyle = U.shade('#a9763f', tone);      ctx.fillRect(cx, cy, w, h - 1);
      ctx.fillStyle = U.shade('#a9763f', tone + 22); ctx.fillRect(cx, cy, w, 1);
      ctx.fillStyle = U.shade('#a9763f', tone - 44);
      ctx.fillRect(cx, cy + Math.floor(h / 2), w, 1);
      ctx.fillRect(cx + Math.floor(w / 2), cy, 1, h);
    }
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 1, y + 15, 14, 2);   /* pallet  */
    crate(x + 1, y + 9, 7, 6, 0);
    crate(x + 8, y + 9, 7, 6, -12);
    crate(x + 4, y + 3, 7, 6, 10);
    ctx.fillStyle = '#6b7680';                                       /* canopy  */
    ctx.fillRect(x, y + 1, 16, 2);
    ctx.fillStyle = '#8894a0'; ctx.fillRect(x, y + 1, 16, 1);
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x, y + 3, 1, 13); ctx.fillRect(x + 15, y + 3, 1, 13);
  };

  BUILD.gen = function (ctx, x, y, t) {
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 2, y + 6, 12, 11);
    ctx.fillStyle = '#5e6a76'; ctx.fillRect(x + 2, y + 6, 12, 2);
    ctx.fillStyle = '#2c343c'; ctx.fillRect(x + 3, y + 9, 10, 5);
    var lit = (Math.sin(t * 6) > 0);
    ctx.fillStyle = lit ? '#f5e04e' : '#8a7c22';
    ctx.fillRect(x + 7, y + 9, 1, 2); ctx.fillRect(x + 6, y + 11, 3, 1); ctx.fillRect(x + 7, y + 12, 1, 2);
    ctx.fillStyle = '#39424c'; ctx.fillRect(x + 4, y + 2, 3, 4); ctx.fillRect(x + 10, y + 3, 3, 3);
    ctx.fillStyle = 'rgba(200,220,230,.35)';
    ctx.fillRect(x + 4, y - 1 - Math.round((t * 6) % 3), 3, 2);
  };

  BUILD.drill = function (ctx, x, y, t) {
    ctx.fillStyle = '#3f464d'; ctx.fillRect(x + 1, y + 13, 14, 4);   /* base */
    ctx.fillStyle = '#c87a3f'; ctx.fillRect(x + 3, y + 4, 10, 9);    /* body */
    ctx.fillStyle = '#ef9d5c'; ctx.fillRect(x + 3, y + 4, 10, 2);
    ctx.fillStyle = '#2c343c';
    for (var i = 0; i < 3; i++) ctx.fillRect(x + 3, y + 7 + i * 2, 10, 1);
    var spin = Math.round(Math.abs(Math.sin(t * 9)) * 2);
    ctx.fillStyle = '#cfe0ea';                                       /* bit  */
    ctx.fillRect(x + 6, y + 13 + spin, 4, 3);
    ctx.fillRect(x + 7, y + 16 + spin, 2, 2);
    ctx.fillStyle = '#7f8a94'; ctx.fillRect(x + 2, y + 2, 12, 2);
  };

  BUILD.convey = function (ctx, x, y, t) {
    ctx.fillStyle = '#39424c'; ctx.fillRect(x, y + 10, 16, 6);
    ctx.fillStyle = '#20262c'; ctx.fillRect(x, y + 11, 16, 4);
    var off = Math.floor((t * 14) % 4);
    ctx.fillStyle = '#6b7680';
    for (var i = -1; i < 5; i++) ctx.fillRect(x + i * 4 + off, y + 12, 2, 2);
    ctx.fillStyle = '#c87a3f'; ctx.fillRect(x + 3 + off, y + 8, 3, 3);
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x - 1, y + 9, 2, 8); ctx.fillRect(x + 15, y + 9, 2, 8);
  };

  BUILD.smelt = function (ctx, x, y, t) {
    ctx.fillStyle = '#5b5148'; ctx.fillRect(x + 2, y + 5, 12, 12);
    ctx.fillStyle = '#6f635a'; ctx.fillRect(x + 2, y + 5, 12, 2);
    ctx.fillStyle = '#20262c'; ctx.fillRect(x + 5, y + 10, 6, 7);
    var f = Math.sin(t * 10) * 0.5 + 0.5;
    ctx.fillStyle = '#e05b1a'; ctx.fillRect(x + 5, y + 12 + Math.round(f), 6, 5);
    ctx.fillStyle = '#f5c04e'; ctx.fillRect(x + 6, y + 14 + Math.round(f), 4, 3);
    ctx.fillStyle = '#4a4239'; ctx.fillRect(x + 4, y + 1, 3, 4); ctx.fillRect(x + 9, y + 1, 3, 4);
    ctx.fillStyle = 'rgba(80,80,80,.35)';
    ctx.fillRect(x + 4, y - 2 - Math.round((t * 5) % 3), 3, 2);
  };

  BUILD.vault = function (ctx, x, y, t) {
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 1, y + 5, 14, 12);
    ctx.fillStyle = '#5e6a76'; ctx.fillRect(x + 1, y + 5, 14, 2);
    ctx.fillStyle = '#39424c'; ctx.fillRect(x + 3, y + 8, 10, 7);
    ctx.fillStyle = '#f5c04e';
    ctx.fillRect(x + 7, y + 10, 3, 3);
    ctx.fillRect(x + 8, y + 9, 1, 1); ctx.fillRect(x + 8, y + 13, 1, 1);
    ctx.fillStyle = '#a97d1c'; ctx.fillRect(x + 1, y + 3, 14, 2);
  };

  BUILD.rig = function (ctx, x, y, t) {
    ctx.fillStyle = '#39424c';
    ctx.fillRect(x + 1, y + 14, 14, 3);
    ctx.fillStyle = '#6b7680';
    for (var i = 0; i < 5; i++) {
      var w = 12 - i * 2;
      ctx.fillRect(x + 2 + i, y + 12 - i * 3, w, 1);
      ctx.fillRect(x + 2 + i, y + 12 - i * 3, 1, 3);
      ctx.fillRect(x + 1 + w + i, y + 12 - i * 3, 1, 3);
    }
    ctx.fillStyle = '#e05b6a'; ctx.fillRect(x + 6, y - 3, 4, 2);
    var spin = Math.round(Math.abs(Math.sin(t * 7)) * 2);
    ctx.fillStyle = '#cfe0ea'; ctx.fillRect(x + 7, y + 14 + spin, 2, 3);
  };

  BUILD.altar = function (ctx, x, y, t) {
    ctx.fillStyle = '#2b2140'; ctx.fillRect(x + 2, y + 13, 12, 4);
    ctx.fillStyle = '#3d2f5c'; ctx.fillRect(x + 4, y + 10, 8, 3);
    var fl = Math.round(Math.sin(t * 2.5) * 2);
    ctx.fillStyle = '#a678e8';
    ctx.fillRect(x + 7, y + 2 + fl, 2, 7);
    ctx.fillRect(x + 6, y + 4 + fl, 4, 3);
    ctx.fillStyle = '#e0d0ff';
    ctx.fillRect(x + 7, y + 4 + fl, 1, 2);
    ctx.fillStyle = 'rgba(166,120,232,.25)';
    ctx.fillRect(x + 4, y + 3 + fl, 8, 8);
  };

  /* ---- heavy digging equipment ---- */

  BUILD.dozer = function (ctx, x, y, t) {
    var roll = Math.round(Math.sin(t * 3) * 1);
    ctx.fillStyle = '#3a3f45';                                       /* tracks  */
    ctx.fillRect(x + 2, y + 11, 12, 5);
    ctx.fillStyle = '#20262c';
    for (var i = 0; i < 5; i++) ctx.fillRect(x + 3 + ((i * 3 + Math.floor(t * 8)) % 11), y + 13, 2, 2);
    ctx.fillStyle = '#f0b429'; ctx.fillRect(x + 4, y + 5, 9, 7);     /* body    */
    ctx.fillStyle = '#ffd35e'; ctx.fillRect(x + 4, y + 5, 9, 2);
    ctx.fillStyle = '#2c343c'; ctx.fillRect(x + 6, y + 2, 6, 4);     /* cab     */
    ctx.fillStyle = '#8fd8ff'; ctx.fillRect(x + 7, y + 3, 4, 2);
    ctx.fillStyle = '#c8c8c8';                                       /* blade   */
    ctx.fillRect(x - 1, y + 7 + roll, 4, 9);
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(x - 1, y + 7 + roll, 4, 2);
    ctx.fillStyle = '#6b7680'; ctx.fillRect(x + 3, y + 10 + roll, 2, 2);
  };

  BUILD.jack = function (ctx, x, y, t) {
    var buzz = Math.round(Math.sin(t * 30)) ;
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 1, y + 14, 14, 3);   /* platform */
    /* the worker */
    ctx.fillStyle = '#f0c49a'; ctx.fillRect(x + 4, y + 5, 5, 4);
    ctx.fillStyle = '#f5c04e'; ctx.fillRect(x + 3, y + 4, 7, 2);
    ctx.fillStyle = '#3f7fd8'; ctx.fillRect(x + 4, y + 9, 5, 5);
    /* hammer */
    ctx.fillStyle = '#8a929a'; ctx.fillRect(x + 9, y + 7 + buzz, 3, 6);
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(x + 10, y + 12 + buzz, 1, 3);
    ctx.fillStyle = '#e05b6a'; ctx.fillRect(x + 9, y + 6 + buzz, 3, 2);
    /* dust */
    ctx.fillStyle = 'rgba(220,220,220,.4)';
    ctx.fillRect(x + 8, y + 15, 5, 1 + Math.abs(buzz));
  };

  BUILD.excav = function (ctx, x, y, t) {
    var swing = Math.sin(t * 2.2);
    ctx.fillStyle = '#3a3f45'; ctx.fillRect(x + 1, y + 12, 12, 5);   /* tracks */
    ctx.fillStyle = '#20262c';
    for (var i = 0; i < 4; i++) ctx.fillRect(x + 2 + ((i * 3 + Math.floor(t * 7)) % 10), y + 14, 2, 2);
    ctx.fillStyle = '#f0b429'; ctx.fillRect(x + 2, y + 7, 9, 5);     /* house  */
    ctx.fillStyle = '#ffd35e'; ctx.fillRect(x + 2, y + 7, 9, 1);
    ctx.fillStyle = '#2c343c'; ctx.fillRect(x + 3, y + 8, 4, 3);
    /* boom + bucket */
    ctx.fillStyle = '#d99a1c';
    var bx = x + 10, byy = y + 8;
    var ex = Math.round(bx + 5 + swing * 2), ey = Math.round(byy - 4 + swing * 2);
    for (var k = 0; k <= 5; k++) {
      ctx.fillRect(Math.round(U.lerp(bx, ex, k / 5)), Math.round(U.lerp(byy, ey, k / 5)), 2, 2);
    }
    ctx.fillStyle = '#8a929a';
    ctx.fillRect(ex - 1, ey + 2, 4, 3);
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(ex - 1, ey + 2, 4, 1);
  };

  BUILD.scanner = function (ctx, x, y, t) {
    var sweep = Math.round(Math.sin(t * 1.6) * 2);
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 5, y + 10, 6, 7);    /* mast */
    ctx.fillStyle = '#39424c'; ctx.fillRect(x + 3, y + 15, 10, 2);
    ctx.fillStyle = '#cfd8e0';                                       /* dish */
    ctx.fillRect(x + 3 + sweep, y + 3, 9, 2);
    ctx.fillRect(x + 2 + sweep, y + 5, 11, 2);
    ctx.fillRect(x + 3 + sweep, y + 7, 9, 2);
    ctx.fillStyle = '#8894a0'; ctx.fillRect(x + 3 + sweep, y + 7, 9, 1);
    ctx.fillStyle = '#58c8b6'; ctx.fillRect(x + 7 + sweep, y + 5, 2, 2);
    if (Math.sin(t * 6) > 0.4) {
      ctx.fillStyle = 'rgba(88,200,182,.5)';
      ctx.fillRect(x + 6 + sweep, y - 1, 4, 2);
    }
  };

  BUILD.reactor = function (ctx, x, y, t) {
    var glow = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = '#39424c'; ctx.fillRect(x + 1, y + 13, 14, 4);
    ctx.fillStyle = '#5e6a76';                                       /* dome */
    ctx.fillRect(x + 3, y + 6, 10, 7);
    ctx.fillRect(x + 4, y + 4, 8, 2);
    ctx.fillRect(x + 6, y + 3, 4, 1);
    ctx.fillStyle = '#6fd66f';
    ctx.globalAlpha = 0.35 + glow * 0.5;
    ctx.fillRect(x + 5, y + 8, 6, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow > 0.5 ? '#b6ffb6' : '#6fd66f';
    ctx.fillRect(x + 7, y + 9, 2, 2);
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 1, y + 9, 2, 4); ctx.fillRect(x + 13, y + 9, 2, 4);
  };

  BUILD.blast = function (ctx, x, y, t) {
    ctx.fillStyle = '#7a3a2f'; ctx.fillRect(x + 2, y + 8, 12, 9);    /* shed */
    ctx.fillStyle = '#95493a'; ctx.fillRect(x + 2, y + 8, 12, 2);
    ctx.fillStyle = '#4a545e';
    for (var i = 0; i < 5; i++) ctx.fillRect(x + 1 + i * 3, y + 6, 14 - i * 3, 1);
    ctx.fillStyle = '#20262c'; ctx.fillRect(x + 6, y + 12, 4, 5);
    ctx.fillStyle = '#e05b6a'; ctx.fillRect(x + 3, y + 11, 2, 4);    /* sticks */
    ctx.fillRect(x + 11, y + 11, 2, 4);
    ctx.fillStyle = '#f5c04e';
    var spark = Math.sin(t * 9) > 0.3;
    if (spark) { ctx.fillRect(x + 3, y + 9, 2, 2); ctx.fillRect(x + 11, y + 9, 2, 2); }
  };

  BUILD.borer = function (ctx, x, y, t) {
    var spin = Math.floor(t * 12) % 4;
    ctx.fillStyle = '#39424c'; ctx.fillRect(x, y + 12, 16, 5);       /* rails */
    ctx.fillStyle = '#20262c'; ctx.fillRect(x, y + 14, 16, 1);
    ctx.fillStyle = '#5e6a76'; ctx.fillRect(x + 1, y + 5, 9, 8);     /* body  */
    ctx.fillStyle = '#7f8a94'; ctx.fillRect(x + 1, y + 5, 9, 2);
    ctx.fillStyle = '#2c343c';
    for (var i = 0; i < 3; i++) ctx.fillRect(x + 2, y + 8 + i * 2, 7, 1);
    /* cutterhead */
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(x + 10, y + 4, 4, 10);
    ctx.fillStyle = '#8a929a';
    for (var k = 0; k < 4; k++) ctx.fillRect(x + 10, y + 5 + ((k * 3 + spin) % 9), 4, 1);
    ctx.fillStyle = '#f5c04e'; ctx.fillRect(x + 14, y + 7, 2, 4);
    ctx.fillStyle = 'rgba(200,190,170,.35)';
    ctx.fillRect(x + 13, y + 3 - spin, 3, 2);
  };

  BUILD.maglev = function (ctx, x, y, t) {
    ctx.fillStyle = '#2c343c'; ctx.fillRect(x, y + 12, 16, 4);       /* guideway */
    ctx.fillStyle = '#3f7fd8';
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8);
    ctx.fillRect(x, y + 11, 16, 1);
    ctx.globalAlpha = 1;
    var pod = Math.floor((t * 26) % 20) - 4;
    ctx.fillStyle = '#cfe0ea'; ctx.fillRect(x + pod, y + 7, 7, 4);   /* pod */
    ctx.fillStyle = '#8fd8ff'; ctx.fillRect(x + pod + 1, y + 8, 5, 1);
    ctx.fillStyle = '#c87a3f'; ctx.fillRect(x + pod + 2, y + 5, 3, 2);
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x - 1, y + 10, 2, 7); ctx.fillRect(x + 15, y + 10, 2, 7);
  };

  BUILD.refine = function (ctx, x, y, t) {
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x + 1, y + 13, 14, 4);
    ctx.fillStyle = '#6b7680';                                        /* towers */
    ctx.fillRect(x + 2, y + 4, 4, 9);
    ctx.fillRect(x + 7, y + 1, 4, 12);
    ctx.fillRect(x + 12, y + 6, 3, 7);
    ctx.fillStyle = '#8894a0';
    ctx.fillRect(x + 2, y + 4, 4, 1); ctx.fillRect(x + 7, y + 1, 4, 1); ctx.fillRect(x + 12, y + 6, 3, 1);
    ctx.fillStyle = '#39424c';
    ctx.fillRect(x + 2, y + 8, 13, 1);
    ctx.fillStyle = '#f5c04e';
    if (Math.sin(t * 5) > 0) { ctx.fillRect(x + 8, y + 2, 2, 1); }
    ctx.fillStyle = '#e05b1a'; ctx.fillRect(x + 3, y + 10, 2, 2);
    ctx.fillStyle = 'rgba(200,210,215,.3)';
    ctx.fillRect(x + 8, y - 2 - Math.round((t * 4) % 3), 2, 2);
  };

  P.building = function (ctx, id, cx, by, t) {
    var fn = BUILD[id];
    if (!fn) return;
    var x = Math.round(cx - 8), y = Math.round(by - 17);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.fillRect(x + 1, by - 1, 14, 2);
    fn(ctx, x, y, t);
  };

  /* ---------------------------------------------------------
     Scenery
     --------------------------------------------------------- */
  P.cloud = function (ctx, x, y, w, h, alpha) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = 'rgba(255,255,255,' + (alpha === undefined ? 0.9 : alpha) + ')';
    ctx.fillRect(x, y + Math.round(h * 0.3), w, Math.round(h * 0.7));
    ctx.fillRect(x + Math.round(w * 0.2), y, Math.round(w * 0.6), h);
    ctx.fillStyle = 'rgba(214,240,246,' + (alpha === undefined ? 0.9 : alpha) + ')';
    ctx.fillRect(x, y + h - 2, w, 2);
  };

  /* grass tuft / pebble decoration on a tile */
  P.tuft = function (ctx, x, y, seed, color) {
    var rng = U.mulberry(seed);
    ctx.fillStyle = color;
    var n = 3 + Math.floor(rng() * 2);
    for (var i = 0; i < n; i++) {
      var dx = Math.round((rng() - 0.5) * 10), dy = Math.round((rng() - 0.5) * 5);
      ctx.fillRect(x + dx, y + dy, 1, 2);
    }
  };

  /* ---------------------------------------------------------
     Icons - the very same sprites the world uses, baked into
     data URLs so the HTML panels can show them
     --------------------------------------------------------- */
  var iconCache = {};

  function offscreen(size) {
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    return { cv: cv, ctx: c };
  }

  /* a machine, drawn exactly as it appears on the island */
  /* t is frozen a little way into the animation so moving parts - the
     excavator boom, the maglev pod, the generator lamp - sit somewhere
     recognisable rather than at their zero position */
  P.ICON_T = 0.35;
  P.ICON_SIZE = 22;

  P.buildingIcon = function (id, size) {
    size = size || P.ICON_SIZE;
    var key = 'b:' + id + ':' + size;
    if (iconCache[key]) return iconCache[key];
    var o = offscreen(size);
    try {
      P.building(o.ctx, id, Math.floor(size / 2), size - 2, P.ICON_T);
      iconCache[key] = o.cv.toDataURL();
    } catch (e) {
      iconCache[key] = '';
    }
    return iconCache[key];
  };

  /* a lump of ore, drawn as a fresh undamaged node */
  P.oreIcon = function (oreId, size) {
    size = size || 22;
    var key = 'o:' + oreId + ':' + size;
    if (iconCache[key]) return iconCache[key];
    var ore = D.ORE_BY_ID[oreId];
    if (!ore) return '';
    var o = offscreen(size);
    try {
      P.rock(o.ctx, Math.floor(size / 2), size - 4, ore,
             { seed: 1234 + ore.index * 7, hp: 1, maxHp: 1 }, 0);
      iconCache[key] = o.cv.toDataURL();
    } catch (e) {
      iconCache[key] = '';
    }
    return iconCache[key];
  };

  /* the miner, for the tutorial card */
  P.minerIcon = function (size) {
    size = size || 24;
    var key = 'm:' + size;
    if (iconCache[key]) return iconCache[key];
    var o = offscreen(size);
    try {
      P.miner(o.ctx, Math.floor(size / 2), size - 3, { face: 1, walking: false, t: 0, swing: -1 });
      iconCache[key] = o.cv.toDataURL();
    } catch (e) { iconCache[key] = ''; }
    return iconCache[key];
  };

  root.P = P;
})(window);
