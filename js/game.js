/* ============================================================
   game.js - boot, input, the main loop and the glue between
   every other module
   ============================================================ */
(function (root) {
  'use strict';

  var Game = {};

  var canvas, running = false, lastT = 0, acc = 0;
  var saveTimer = 0, achTimer = 0, tipTimer = 0, worldTimer = 0;
  var lastLevel = 1;

  var keys = {};
  var touchDir = { up: 0, down: 0, left: 0, right: 0 };
  var touchMine = false;
  var clickTarget = null;
  var buildChoice = null;
  var demolish = false;

  /* ---------------------------------------------------------
     Audio - tiny synthesised blips, no assets required
     --------------------------------------------------------- */
  var actx = null, muted = false;
  function audio() {
    if (actx === null) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = false; }
    }
    return actx;
  }

  var SFX = {
    hit:    { f: 180, to: 90,  d: 0.06, type: 'square',   g: 0.05 },
    breakN: { f: 320, to: 70,  d: 0.20, type: 'sawtooth', g: 0.09 },
    sell:   { f: 660, to: 990, d: 0.10, type: 'triangle', g: 0.07 },
    craft:  { f: 440, to: 880, d: 0.22, type: 'square',   g: 0.07 },
    build:  { f: 220, to: 440, d: 0.18, type: 'triangle', g: 0.08 },
    travel: { f: 300, to: 120, d: 0.28, type: 'sine',     g: 0.08 },
    level:  { f: 520, to: 1040, d: 0.35, type: 'triangle', g: 0.09 },
    rare:   { f: 880, to: 1320, d: 0.30, type: 'sine',    g: 0.09 }
  };

  Game.sfx = function (name) {
    if (muted) return;
    var cfg = SFX[name]; if (!cfg) return;
    var a = audio(); if (!a) return;
    try {
      var o = a.createOscillator(), gn = a.createGain();
      o.type = cfg.type;
      o.frequency.setValueAtTime(cfg.f, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, cfg.to), a.currentTime + cfg.d);
      gn.gain.setValueAtTime(cfg.g, a.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + cfg.d);
      o.connect(gn); gn.connect(a.destination);
      o.start(); o.stop(a.currentTime + cfg.d + 0.02);
    } catch (e) { /* audio is a nicety, never a blocker */ }
  };

  /* ---------------------------------------------------------
     Build mode accessors used by the UI
     --------------------------------------------------------- */
  Game.buildMode = function () { return buildChoice !== null; };
  Game.buildChoice = function () { return buildChoice; };
  Game.demoMode = function () { return demolish; };
  Game.setBuildChoice = function (id) {
    buildChoice = id; demolish = false;
    U.$('#btnBuildMode').classList.add('on');
    if (S.get().layer !== 0) UI.toast('Buildings only go on the surface - ride the shaft up', 'bad');
  };
  Game.toggleDemo = function () {
    demolish = !demolish;
    if (demolish) buildChoice = null;
    U.$('#btnBuildMode').classList.toggle('on', demolish || buildChoice !== null);
  };
  Game.clearBuildMode = function () {
    buildChoice = null; demolish = false;
    U.$('#btnBuildMode').classList.remove('on');
  };

  /* ---------------------------------------------------------
     Events fired from other modules
     --------------------------------------------------------- */
  Game.onNodeBroken = function (ore, layer) {
    Game.sfx(ore.index >= 6 ? 'rare' : 'breakN');
    if (ore.index >= 8) {
      UI.toast('Struck ' + ore.name + '!', ore.index >= 10 ? 'epic' : 'gold');
    }
  };

  Game.doRebirth = function () {
    var gained = S.rebirth();
    if (!gained) return;
    W.reset();
    W.populate(true);
    S.ensureContracts();
    PL.init();
    PL.teleportToShaft();
    R.invalidate();
    E.reset();
    lastLevel = S.get().level;
    Game.clearBuildMode();
    S.save();
    Game.sfx('level');
    UI.custom('Rebirth', '<div class="card wide center" style="padding:20px">' +
      '<div class="big">+' + U.fmt(gained) + ' PRESTIGE CORES</div>' +
      '<p>The island crumbles and reforms. You now hold <b>' + U.fmt(S.get().cores) +
      '</b> cores across <b>' + S.get().rebirths + '</b> rebirths.</p>' +
      '<p>Every core is +3% money and +1% mining power. Spend them on perks in the Rebirth panel.</p>' +
      '<button data-act="none">GET BACK TO WORK</button></div>');
  };

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */
  var PANEL_KEYS = {
    KeyI: 'inventory', KeyC: 'craft', KeyB: 'build', KeyX: 'island',
    KeyV: 'depths', KeyR: 'rebirth', KeyT: 'stats', KeyJ: 'contracts', KeyK: 'storage', Slash: 'help'
  };

  function onKeyDown(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    keys[e.code] = true;

    if (e.code === 'Escape') { UI.close(); Game.clearBuildMode(); return; }
    if (PANEL_KEYS[e.code]) { UI.open(PANEL_KEYS[e.code]); e.preventDefault(); return; }

    if (e.code === 'KeyE') { contextDown(); e.preventDefault(); }
    if (e.code === 'KeyQ') { contextUp(); e.preventDefault(); }
    if (e.code === 'KeyM') { muted = !muted; UI.toast(muted ? 'Sound off' : 'Sound on'); }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') UI.toast('Zoom x' + R.setZoom(R.getZoom() + 1));
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') UI.toast('Zoom x' + R.setZoom(R.getZoom() - 1));
    if (e.code === 'Space') e.preventDefault();
  }

  function onKeyUp(e) { keys[e.code] = false; }

  function contextDown() {
    var g = S.get();
    if (!PL.nearShaft()) {
      UI.toast('Stand on the mineshaft first', 'bad');
      return;
    }
    if (!W.canDescend()) {
      var cost = W.nextLayerCost();
      UI.toast(cost === null ? 'You have reached the bottom of the world'
        : 'The way down is sealed - unlock it for ' + U.fmtMoney(cost), 'bad');
      UI.open('depths');
      return;
    }
    W.changeLayer(1);
    PL.init();
    Game.sfx('travel');
    UI.toast('Descending to the ' + D.LAYERS[S.get().layer].name);
  }

  function contextUp() {
    var g = S.get();
    if (!PL.nearShaft()) { UI.toast('Stand on the mineshaft first', 'bad'); return; }
    if (g.layer === 0) { UI.toast('You are already on the surface'); return; }
    W.changeLayer(-1);
    PL.init();
    Game.sfx('travel');
    UI.toast('Back to the ' + D.LAYERS[S.get().layer].name);
  }

  function worldClick(e, isRight) {
    var g = S.get();
    var tile = R.screenToTile(e.clientX, e.clientY);

    if (isRight || demolish) {
      if (g.layer !== 0) return;
      var res = W.demolish(tile.x, tile.y);
      if (res.ok) {
        UI.toast('Demolished - refunded ' + U.fmtMoney(res.refund), 'gold');
        Game.sfx('build');
        R.invalidate();
      }
      return;
    }

    if (buildChoice) {
      if (g.layer !== 0) { UI.toast('Ride the shaft up to build', 'bad'); return; }
      var b = W.build(buildChoice, tile.x, tile.y);
      if (b.ok) {
        UI.toast(D.BUILD_BY_ID[buildChoice].name + ' built for ' + U.fmtMoney(b.cost), 'gold');
        Game.sfx('build');
        R.kick(2);
        if (S.get().money < S.buildingCost(buildChoice)) Game.clearBuildMode();
        /* first warehouse: the player has to choose what it keeps, so show them */
        if (b.first) {
          Game.clearBuildMode();
          UI.open('storage');
          UI.toast('Pick which ore the warehouse should keep', 'epic');
        }
      } else {
        UI.toast(b.msg, 'bad');
      }
      return;
    }

    /* plain click = walk there (and start swinging when you arrive) */
    if (W.inBounds(tile.x, tile.y)) clickTarget = { x: tile.x + 0.5, y: tile.y + 0.5 };
  }

  function bindInput() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { keys = {}; });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 2) return;
      worldClick(e, false);
    });
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      worldClick(e, true);
    });
    canvas.addEventListener('mousemove', function (e) {
      R.setHover(R.screenToTile(e.clientX, e.clientY));
    });
    canvas.addEventListener('mouseleave', function () { R.setHover(null); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      R.setZoom(R.getZoom() + (e.deltaY > 0 ? -1 : 1));
    }, { passive: false });

    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length) {
        var t = e.touches[0];
        R.setHover(R.screenToTile(t.clientX, t.clientY));
        worldClick({ clientX: t.clientX, clientY: t.clientY }, false);
      }
    }, { passive: true });

    window.addEventListener('resize', function () { R.resize(); });

    U.$('#btnAutoMine').addEventListener('click', function () {
      var g = S.get();
      g.autoMine = !g.autoMine;
      this.classList.toggle('on', g.autoMine);
      UI.toast('Auto mine ' + (g.autoMine ? 'on' : 'off'));
    });
    U.$('#btnBuildMode').addEventListener('click', function () {
      if (buildChoice || demolish) Game.clearBuildMode();
      else UI.open('build');
    });
    U.$('#btnSave').addEventListener('click', function () {
      S.save(); UI.toast('Saved');
    });

    /* touch pad */
    var pad = U.$('#touchpad');
    if ('ontouchstart' in window) pad.classList.remove('hidden');
    var dirBtns = pad.querySelectorAll('[data-dir]');
    for (var i = 0; i < dirBtns.length; i++) {
      (function (btn) {
        var d = btn.dataset.dir;
        var on = function (e) { e.preventDefault(); touchDir[d] = 1; clickTarget = null; };
        var off = function (e) { e.preventDefault(); touchDir[d] = 0; };
        btn.addEventListener('touchstart', on, { passive: false });
        btn.addEventListener('touchend', off, { passive: false });
        btn.addEventListener('touchcancel', off, { passive: false });
        btn.addEventListener('mousedown', on);
        btn.addEventListener('mouseup', off);
      })(dirBtns[i]);
    }
    var mineBtn = pad.querySelector('.mineBtn');
    mineBtn.addEventListener('touchstart', function (e) { e.preventDefault(); touchMine = true; }, { passive: false });
    mineBtn.addEventListener('touchend', function (e) { e.preventDefault(); touchMine = false; }, { passive: false });
    pad.querySelector('.useBtn').addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (S.get().layer === 0 || W.canDescend()) contextDown(); else contextUp();
    }, { passive: false });
  }

  /* ---------------------------------------------------------
     Gather this frame's intentions
     --------------------------------------------------------- */
  function readInput() {
    var dx = 0, dy = 0;
    if (keys.KeyA || keys.ArrowLeft || touchDir.left) dx -= 1;
    if (keys.KeyD || keys.ArrowRight || touchDir.right) dx += 1;
    if (keys.KeyW || keys.ArrowUp || touchDir.up) dy -= 1;
    if (keys.KeyS || keys.ArrowDown || touchDir.down) dy += 1;

    if (dx || dy) clickTarget = null;

    if (!dx && !dy && clickTarget) {
      var me = PL.get();
      var wx = clickTarget.x - me.x, wy = clickTarget.y - me.y;
      if (Math.abs(wx) + Math.abs(wy) < 0.3) {
        clickTarget = null;
      } else {
        /* world delta -> screen-space intention */
        dx = (wx - wy); dy = (wx + wy);
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= len; dy /= len;
      }
    }
    return { dx: dx, dy: dy, mine: !!(keys.Space || touchMine) };
  }

  /* ---------------------------------------------------------
     The loop
     --------------------------------------------------------- */
  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);

    var dt = (ts - lastT) / 1000;
    lastT = ts;
    if (!isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);

    var g = S.get();
    g.stats.playtime += dt;

    var input = UI.isOpen() ? { dx: 0, dy: 0, mine: false } : readInput();
    PL.update(dt, input);
    E.tick(dt);

    worldTimer -= dt;
    if (worldTimer <= 0) { worldTimer = 0.25; W.update(); }

    if (g.level !== lastLevel) {
      var gained = g.level - lastLevel;
      lastLevel = g.level;
      if (gained > 0) {
        Game.sfx('level');
        UI.toast('Mining level ' + g.level + '!', 'epic');
        R.floatText(PL.get().x, PL.get().y, 'LEVEL UP', '#8ee6c8', 2);
      }
    }

    achTimer -= dt;
    if (achTimer <= 0) {
      achTimer = 1;
      var got = S.checkAchievements();
      for (var i = 0; i < got.length; i++) {
        UI.toast('Achievement: ' + got[i].name +
          (got[i].cores ? ' (+' + got[i].cores + ' cores)' : ''), 'epic');
        Game.sfx('level');
      }
    }

    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 15; S.save(); }

    tipTimer -= dt;
    if (tipTimer <= 0) {
      tipTimer = 12;
      g.tip = (g.tip + 1) % D.TIPS.length;
    }

    updateHint();
    R.draw(dt, ts / 1000, PL.get(), Game.buildMode() || demolish);
    UI.updateHud();
    UI.tick(dt);
  }

  function updateHint() {
    var g = S.get();
    var where = PL.standingOn();
    if (demolish) { UI.setHint('<b style="color:var(--rose)">Demolish mode</b> - tap a building to sell it back.'); return; }
    if (buildChoice) { UI.setHint('<b style="color:var(--ok)">Placing ' + D.BUILD_BY_ID[buildChoice].name + '</b> - tap a free tile. ESC to cancel.'); return; }
    if (where === 'market') { UI.setHint('<b style="color:var(--gold)">Market pad</b> - your ore is selling automatically.'); return; }
    if (where === 'shaft') { UI.setHint('<b>Mineshaft</b> - <span class="kbd">E</span> down, <span class="kbd">Q</span> up.'); return; }
    if (g.layer === 0 && W.nearestWarehouse(PL.get().x, PL.get().y, 2.2)) {
      UI.setHint('<b style="color:var(--teal)">Warehouse</b> - dropping off everything marked to keep. ' +
        'Stored <b>' + U.fmt(S.stored()) + ' / ' + U.fmt(S.storageCap()) + '</b>');
      return;
    }
    UI.setHint('<b>Tip:</b> ' + D.TIPS[g.tip]);
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function startWorld(state, offlineReport) {
    S.set(state);
    W.reset();
    W.populate(true);
    S.ensureContracts();
    PL.init();
    R.invalidate();
    E.reset();
    lastLevel = state.level;
    UI.updateHud();
    updateHint();

    U.$('#btnAutoMine').classList.toggle('on', state.autoMine);

    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);

    if (offlineReport) showWelcome(offlineReport);
  }

  function showWelcome(rep) {
    var kept = '';
    for (var id in rep.kept) {
      var o = D.ORE_BY_ID[id];
      kept += '<div class="row"><i class="dot" style="background:' + o.color + '"></i>' +
        '<span class="grow">' + o.name + '</span><span class="num">+' + U.fmt(rep.kept[id]) + '</span></div>';
    }
    UI.custom('Welcome back', '<div class="card wide center" style="padding:18px">' +
      '<div class="big" style="color:var(--gold)">' + U.fmtMoney(rep.money) + '</div>' +
      '<p>Your crew kept digging for <b>' + U.fmtTime(rep.seconds) + '</b> and pulled up <b>' +
      U.fmt(rep.ore) + '</b> ore at ' + U.pct(rep.rate) + ' of full speed.</p>' +
      (kept ? '<div class="rows" style="margin-top:8px">' + kept + '</div>' : '') +
      '<p style="margin-top:10px;opacity:.75">Buy <b>Night Shift</b> perks to raise the offline rate.</p>' +
      '<button data-act="none">NICE</button></div>');
  }

  function boot() {
    canvas = U.$('#world');
    R.init(canvas);
    UI.init();
    bindInput();

    var saved = S.load();
    var splash = U.$('#splash');
    var play = U.$('#btnPlay');
    var wipeBtn = U.$('#btnWipe');

    play.textContent = saved ? 'CONTINUE' : 'PLAY';
    if (!saved) wipeBtn.classList.add('hidden');

    play.addEventListener('click', function () {
      splash.classList.add('hidden');
      audio();                                   /* unlock audio on the gesture */
      var report = null;
      if (saved) {
        S.set(saved);
        W.reset();
        report = E.offline(U.now() - (saved.lastSeen || U.now()));
      }
      startWorld(saved || S.create(), report);
    });

    wipeBtn.addEventListener('click', function () {
      if (!confirm('Start a brand new game? Your current save is deleted.')) return;
      S.wipe();
      location.reload();
    });

    window.addEventListener('beforeunload', function () { if (running) S.save(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && running) S.save();
    });
  }

  root.Game = Game;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
