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
  var saveWarned = false;

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
     Sell the lot - the market pad in one press
     --------------------------------------------------------- */
  Game.sellEverything = function () {
    var g = S.get();
    var onPad = PL.standingOn() === 'market';
    var ratio = (onPad || S.countBuilding('convey') > 0 || S.countBuilding('maglev') > 0) ? 1 : 0.75;

    var bag = E.sellAll(ratio);
    /* standing on the pad also clears anything sitting in the warehouses
       that is no longer marked to keep */
    var shed = { money: 0, units: 0 };
    if (onPad) {
      for (var id in g.store) {
        if (g.keep[D.keyOre(id)]) continue;
        var r = E.sellStored(id, g.store[id]);
        shed.money += r.money; shed.units += r.units;
      }
    }

    var money = bag.money + shed.money, units = bag.units + shed.units;
    if (units <= 0) {
      UI.toast(S.carried() > 0 ? 'Everything you are carrying is marked to keep' : 'Nothing to sell');
      return;
    }
    S.get(); /* value already banked by the sell helpers */
    TUT.note('flag', 'soldAll');
    UI.toast('Sold ' + U.fmt(units) + ' ore for ' + U.fmtMoney(money) +
             (ratio < 1 ? ' (25% courier fee)' : ''), 'gold');
    R.floatText(PL.get().x, PL.get().y, '+' + U.fmtMoney(money), '#f5c04e', 2);
    Game.sfx('sell');
  };

  /* ---------------------------------------------------------
     Events fired from other modules
     --------------------------------------------------------- */
  Game.onNodeBroken = function (ore, layer, grade, mut) {
    Game.sfx(grade >= 2 || (mut && !mut.bad) || ore.rank >= 6 ? 'rare' : 'breakN');
    if (mut && (mut.mult >= 6 || mut.mult <= 0.3)) {
      UI.toast(mut.name + ' ' + ore.name + '! Worth ' + D.multText(mut.mult) + ' - ' + mut.desc,
               mut.bad ? 'bad' : (mut.mult >= 15 ? 'epic' : 'gold'));
      return;
    }
    if (grade >= 2) {
      var g2 = D.GRADES[grade];
      UI.toast(g2.name + ' ' + ore.name + '! ' + g2.yield + 'x the ore.',
               grade >= 3 ? 'epic' : 'gold');
      return;
    }
    if (ore.rank >= 8) {
      UI.toast('Struck ' + ore.name + '!', ore.rank >= 10 ? 'epic' : 'gold');
    }
  };

  Game.onTravel = function (dim) {
    W.reset();
    W.populate(true);
    PL.init();
    R.invalidate();
    R.kick(4);
    Game.sfx('travel');
    UI.close();
    UI.toast('The shard drifts to ' + dim.name, 'epic');
    UI.custom(dim.name, '<div class="card wide center" style="padding:18px">' +
      '<div class="big">' + U.esc(dim.name).toUpperCase() + '</div>' +
      '<p>' + U.esc(dim.tagline) + '</p>' +
      '<p style="color:var(--teal)"><b>' + U.esc(dim.twist) + '</b></p>' +
      '<p style="opacity:.75">Average ore here is worth <b>' + U.fmtMoney(S.dimAvgValue(dim.index)) +
      '</b> against <b>' + U.fmtMoney(S.dimAvgValue(0)) + '</b> back home.</p>' +
      '<button data-act="none">START DIGGING</button></div>');
  };

  Game.onStructureFound = function (def, node) {
    if (!def) return;
    Game.sfx('rare');
    /* the toast carries the name - a floating label as long as
       "ABANDONED MINESHAFT" just covers the island */
    R.burst(node.x + 0.5, node.y + 0.5, '#fff6c8', 8);
    UI.toast('You uncover a ' + def.name + '! ' + def.desc, 'gold');
  };

  Game.onStructureBroken = function (def, reward, ore) {
    Game.sfx('level');
    var bits = [U.fmtMoney(reward.money)];
    if (reward.ore) bits.push(U.fmt(reward.ore) + ' ' + ore.name);
    if (reward.cores) bits.push(reward.cores + ' prestige core');
    UI.toast(def.name + ' cracked open: ' + bits.join(', '), reward.cores ? 'epic' : 'gold');
    if (reward.cores) {
      R.floatText(PL.get().x, PL.get().y, '+' + reward.cores + ' CORE', '#a678e8', 2);
    }
  };

  Game.doRebirth = function () {
    var before = S.get().rebirths;
    var gained = S.rebirth();
    if (!gained) return;
    var hit = null;
    for (var i = 0; i < D.REBIRTH_MILESTONES.length; i++) {
      var m = D.REBIRTH_MILESTONES[i];
      if (m.at > before && m.at <= S.get().rebirths) hit = m;
    }
    W.reset();
    W.populate(true);
    S.ensureContracts();
    TUT.init();
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
      (hit ? '<p style="color:var(--violet)"><b>Rebirth milestone: ' + U.esc(hit.name) + '</b><br>' +
             U.esc(hit.desc) + '</p>' : '') +
      '<button data-act="none">GET BACK TO WORK</button></div>');
    if (hit) UI.toast('Rebirth milestone: ' + hit.name, 'epic');
  };

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */
  var PANEL_KEYS = {
    KeyI: 'inventory', KeyC: 'craft', KeyB: 'build', KeyX: 'island',
    KeyV: 'depths', KeyR: 'rebirth', KeyT: 'stats', KeyJ: 'contracts', KeyK: 'storage', KeyY: 'quests', Slash: 'help'
  };

  function onKeyDown(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    keys[e.code] = true;

    if (e.code === 'Escape') {
      if (UI.modalOpen()) { UI.closeModal(); return; }
      UI.close();
      Game.clearBuildMode();
      return;
    }
    if (PANEL_KEYS[e.code]) { UI.open(PANEL_KEYS[e.code]); e.preventDefault(); return; }

    if (e.code === 'KeyE') { contextDown(); e.preventDefault(); }
    if (e.code === 'KeyQ') { contextUp(); e.preventDefault(); }
    if (e.code === 'KeyM') { muted = !muted; UI.toast(muted ? 'Sound off' : 'Sound on'); }
    if (e.code === 'KeyF') { Game.sellEverything(); e.preventDefault(); }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') UI.toast('Zoom x' + R.setZoom(R.getZoom() + 1));
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') UI.toast('Zoom x' + R.setZoom(R.getZoom() - 1));
    if (e.code === 'Space') e.preventDefault();
  }

  function onKeyUp(e) { keys[e.code] = false; }

  function contextDown() {
    var g = S.get();
    if (PL.standingOn() === 'gate') { UI.open('depths'); return; }
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
    UI.toast('Descending to the ' + S.layer(S.get().layer).name);
  }

  function contextUp() {
    var g = S.get();
    if (!PL.nearShaft()) { UI.toast('Stand on the mineshaft first', 'bad'); return; }
    if (g.layer === 0) { UI.toast('You are already on the surface'); return; }
    W.changeLayer(-1);
    PL.init();
    Game.sfx('travel');
    UI.toast('Back to the ' + S.layer(S.get().layer).name);
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

    U.$('#btnSellAll').addEventListener('click', function () { Game.sellEverything(); });
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
      if (S.save()) UI.toast('Saved');
      else UI.toast('This browser is blocking saves - export your save instead', 'bad');
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

      var quests = S.checkQuests();
      for (var qi = 0; qi < quests.length; qi++) {
        var q = quests[qi];
        var reward = [];
        if (q.money) reward.push(U.fmtMoney(q.money));
        if (q.cores) reward.push(q.cores + ' cores');
        UI.toast('Quest complete: ' + q.name + (reward.length ? ' (+' + reward.join(', ') + ')' : ''), 'gold');
        R.floatText(PL.get().x, PL.get().y, 'QUEST', '#f5c04e', 2);
        Game.sfx('level');
      }

      var got = S.checkAchievements();
      for (var i = 0; i < got.length; i++) {
        UI.toast('Achievement: ' + got[i].name +
          (got[i].cores ? ' (+' + got[i].cores + ' cores)' : ''), 'epic');
        Game.sfx('level');
      }
    }

    saveTimer -= dt;
    if (saveTimer <= 0) {
      saveTimer = 15;
      if (!S.save() && !saveWarned) {
        saveWarned = true;
        UI.toast('This browser is blocking saves - your progress will not persist', 'bad');
      }
    }

    tipTimer -= dt;
    if (tipTimer <= 0) {
      tipTimer = 12;
      g.tip = (g.tip + 1) % D.TIPS.length;
    }

    TUT.update(dt);
    updateHint();
    updateSellButton();
    R.setGuide(TUT.guide());
    R.draw(dt, ts / 1000, PL.get(), Game.buildMode() || demolish);
    UI.updateHud();
    UI.tick(dt);
  }

  var sellBtn = null;
  function updateSellButton() {
    if (!sellBtn) sellBtn = U.$('#btnSellAll');
    if (!sellBtn) return;
    var g = S.get(), value = 0;
    for (var id in g.inv) {
      if (S.isProtected(id)) continue;
      value += S.oreValue(id, g.deepest) * g.inv[id];
    }
    var onPad = PL.standingOn() === 'market';
    if (onPad) {
      for (var sid in g.store) {
        if (g.keep[D.keyOre(sid)]) continue;
        value += S.oreValue(sid, g.deepest) * g.store[sid];
      }
    } else if (!(S.countBuilding('convey') || S.countBuilding('maglev'))) {
      value *= 0.75;
    }
    sellBtn.disabled = value <= 0;
    sellBtn.classList.toggle('ready', onPad && value > 0);
    sellBtn.textContent = value > 0 ? 'SELL ALL ' + U.fmtMoney(value) : 'SELL ALL';
  }

  function updateHint() {
    var g = S.get();
    var where = PL.standingOn();
    if (demolish) { UI.setHint('<b style="color:var(--rose)">Demolish mode</b> - tap a building to sell it back.'); return; }
    if (buildChoice) { UI.setHint('<b style="color:var(--ok)">Placing ' + D.BUILD_BY_ID[buildChoice].name + '</b> - tap a free tile. ESC to cancel.'); return; }
    if (where === 'market') {
      UI.setHint('<b style="color:var(--gold)">Market pad</b> - ore is selling automatically. ' +
        'Press <span class="kbd">F</span> to dump the whole bag and your warehouses at once.');
      return;
    }
    if (where === 'shaft') { UI.setHint('<b>Mineshaft</b> - <span class="kbd">E</span> down, <span class="kbd">Q</span> up.'); return; }
    if (where === 'gate') {
      UI.setHint('<b style="color:var(--violet)">Warp gate</b> - press <span class="kbd">E</span> to pick a dimension. ' +
        S.dimsUnlocked() + ' of ' + D.DIMENSIONS.length + ' unlocked.');
      return;
    }
    if (g.layer === 0 && W.nearestWarehouse(PL.get().x, PL.get().y, 2.2)) {
      UI.setHint('<b style="color:var(--teal)">Warehouse</b> - dropping off everything marked to keep. ' +
        'Stored <b>' + U.fmt(S.stored()) + ' / ' + U.fmt(S.storageCap()) + '</b>');
      return;
    }
    /* alternate between the current quest and a rotating tip */
    var quest = S.activeQuest();
    if (quest && (g.tip % 3) !== 2) {
      var pr = S.questProgress(quest);
      UI.setHint('<b style="color:var(--gold)">Quest:</b> ' + U.esc(quest.name) + ' &mdash; ' +
        U.esc(quest.desc) + ' <b>(' + U.fmt(pr.now) + '/' + U.fmt(pr.goal) + ')</b>');
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
    TUT.init();

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
      UI.confirm('Start over',
        'Your current island, cores and perks are all deleted, and a fresh game begins.' +
        '<br><br>This cannot be undone.',
        'START A NEW GAME',
        function () { S.wipe(); location.reload(); },
        true);
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
