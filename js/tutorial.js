/* ============================================================
   tutorial.js - a short guided opening for a brand new save.
   Each step watches the real game state, so there is nothing
   scripted or faked: the player genuinely does the thing.
   ============================================================ */
(function (root) {
  'use strict';

  var TUT = {};

  var dom = {};
  var walked = 0;          /* tiles travelled, for the very first step */
  var lastPos = null;
  var lastStep = -1;
  var celebrate = 0;

  /* ---------------------------------------------------------
     The script
     focus  - menu panel to highlight
     world  - tile marker to point at: 'market' | 'shaft' | 'gate'
     goal   - reads live state, returns true when the step is done
     meter  - optional "3 / 10" progress readout
     --------------------------------------------------------- */
  var STEPS = [
    {
      id: 'move',
      title: 'Welcome to your shard',
      text: 'This rock is yours. Walk around with <span class="kbd">W</span> <span class="kbd">A</span> ' +
            '<span class="kbd">S</span> <span class="kbd">D</span> - or click a tile to walk there.',
      objective: 'Take a walk',
      goal: function () { return walked >= 4; },
      meter: function () { return Math.min(walked, 4).toFixed(0) + ' / 4 tiles'; }
    },
    {
      id: 'mine',
      title: 'Break some rock',
      text: 'Stand next to a boulder and hold <span class="kbd">SPACE</span>. Auto-mine is already on, ' +
            'so just being next to a rock is usually enough.',
      objective: 'Break 3 ore nodes',
      goal: function (g) { return g.stats.nodes >= 3; },
      meter: function (g) { return Math.min(g.stats.nodes, 3) + ' / 3 nodes'; }
    },
    {
      id: 'sell',
      title: 'Ore is worth nothing in your bag',
      text: 'Walk onto the golden <b>market pad</b> by the stall. Standing on it sells everything ' +
            'you are carrying, a chunk at a time.',
      objective: 'Sell 5 ore at the market pad',
      world: 'market',
      /* counts ore actually sold - achievement and quest payouts must not
         quietly tick this step off for you */
      goal: function (g) { return g.stats.sold >= 5; },
      meter: function (g) { return Math.min(g.stats.sold, 5) + ' / 5 ore sold'; }
    },
    {
      id: 'craft',
      title: 'A better pickaxe',
      text: 'Open the <b>workbench</b> and craft the Stone Pickaxe. Gear is the difference between ' +
            'four swings per rock and forty.',
      objective: 'Craft the Stone Pickaxe',
      focus: 'craft',
      goal: function (g) { return g.gear.pick >= 1; }
    },
    {
      id: 'store',
      title: 'Somewhere to put it all',
      text: 'A <b>warehouse</b> holds ore outside your bag. Open <b>Build</b>, pick the warehouse, ' +
            'then tap a free tile on the island to place it.',
      objective: 'Build a warehouse',
      focus: 'build',
      goal: function (g) { return D.ownsOf(g, 'store') >= 1; }
    },
    {
      id: 'keep',
      title: 'Decide what to keep',
      text: 'Open the <b>warehouse</b> panel and set an ore to <b>KEEPING</b>. Kept ore is never sold ' +
            'automatically, and it still counts towards recipes and contracts.',
      objective: 'Mark an ore to keep',
      focus: 'storage',
      goal: function (g) { return Object.keys(g.keep || {}).length > 0; }
    },
    {
      id: 'hut',
      title: 'Let someone else swing',
      text: "A <b>Miner's Hut</b> digs for you around the clock - even while the game is closed. " +
            'This is where the tycoon part starts.',
      objective: "Build a Miner's Hut",
      focus: 'build',
      goal: function (g) { return D.ownsOf(g, 'hut') >= 1; }
    },
    {
      id: 'sellall',
      title: 'Cash out in one press',
      text: 'Once machines are digging, your bag fills fast. Press <span class="kbd">F</span> ' +
            '(or the SELL ALL button) to sell the lot at once.',
      objective: 'Use Sell All',
      goal: function (g) { return !!(g.tut.flags && g.tut.flags.soldAll); }
    },
    {
      id: 'quests',
      title: 'Never wonder what to do',
      text: 'The <b>Quest Log</b> always names your next goal, and the bar along the bottom tracks it ' +
            'while you play. Thirty-one of them run from here to the end of the game.',
      objective: 'Open the Quest Log',
      focus: 'quests',
      goal: function (g) { return !!(g.tut.seen && g.tut.seen.quests); }
    },
    {
      id: 'depths',
      title: 'Down, and then outward',
      text: 'The <b>mineshaft</b> leads to six layers of richer rock - and once you start rebirthing, ' +
            'the whole shard can fly to the Moon and beyond. Take a look at where you can go.',
      objective: 'Open the Travel panel',
      focus: 'depths',
      world: 'shaft',
      goal: function (g) { return !!(g.tut.seen && g.tut.seen.depths); }
    },
    {
      id: 'done',
      title: "That's the whole loop",
      text: '<b>Mine</b> &rarr; <b>sell</b> &rarr; <b>upgrade</b> &rarr; <b>automate</b> &rarr; ' +
            '<b>go deeper</b> &rarr; <b>rebirth</b>. Everything else unlocks from there. ' +
            'The <span class="kbd">?</span> panel has the full field manual whenever you want it.',
      objective: 'Good luck out there',
      final: true,
      goal: function () { return false; }
    }
  ];

  TUT.STEPS = STEPS;
  TUT.count = STEPS.length;

  /* ---------------------------------------------------------
     Setup
     --------------------------------------------------------- */
  function blank() {
    return { step: 0, done: false, flags: {}, seen: {} };
  }
  TUT.blank = blank;

  TUT.init = function () {
    dom.box = U.$('#tutorial');
    dom.title = U.$('#tutTitle');
    dom.text = U.$('#tutText');
    dom.step = U.$('#tutStep');
    dom.obj = U.$('#tutObjective');
    dom.meter = U.$('#tutMeter');
    dom.skip = U.$('#tutSkip');
    dom.next = U.$('#tutNext');

    if (dom.skip) {
      dom.skip.addEventListener('click', function () { TUT.skip(); });
    }
    if (dom.next) {
      dom.next.addEventListener('click', function () { TUT.finish(); });
    }

    var g = S.get();
    if (!g.tut) g.tut = blank();
    lastPos = null;
    walked = 0;
    lastStep = -1;
    render();
  };

  TUT.restart = function () {
    var g = S.get();
    g.tut = blank();
    walked = 0;
    lastPos = null;
    lastStep = -1;
    render();
    UI.toast('Tutorial restarted');
  };

  TUT.skip = function () {
    var g = S.get();
    g.tut.done = true;
    g.tut.skipped = true;
    render();
    UI.toast('Tutorial skipped - reopen it from the Field Manual');
  };

  TUT.finish = function () {
    var g = S.get();
    g.tut.done = true;
    render();
    Game.sfx('level');
    UI.toast('Tutorial complete. The island is yours.', 'epic');
  };

  TUT.active = function () {
    var g = S.get();
    return !!(g && g.tut && !g.tut.done);
  };

  TUT.current = function () {
    var g = S.get();
    if (!TUT.active()) return null;
    return STEPS[U.clamp(g.tut.step, 0, STEPS.length - 1)];
  };

  /* hooks the rest of the game calls */
  TUT.note = function (kind, name) {
    var g = S.get();
    if (!g || !g.tut) return;
    if (kind === 'panel') { g.tut.seen = g.tut.seen || {}; g.tut.seen[name] = 1; }
    else { g.tut.flags = g.tut.flags || {}; g.tut.flags[name] = 1; }
  };

  /* the tile this step is pointing at, for the world marker */
  TUT.guide = function () {
    var step = TUT.current();
    if (!step || !step.world) return null;
    var g = S.get();
    if (g.layer !== 0) return null;
    if (step.world === 'market') return { x: D.SELL.x, y: D.SELL.y, label: 'SELL' };
    if (step.world === 'shaft') return { x: D.SHAFT.x, y: D.SHAFT.y, label: 'DOWN' };
    if (step.world === 'gate') return { x: D.GATE.x, y: D.GATE.y, label: 'WARP' };
    return null;
  };

  /* ---------------------------------------------------------
     Per-frame
     --------------------------------------------------------- */
  TUT.update = function (dt) {
    var g = S.get();
    if (!g.tut) g.tut = blank();

    /* track distance walked for the opening step */
    var me = PL.get();
    if (lastPos) walked += U.dist(me.x, me.y, lastPos.x, lastPos.y);
    lastPos = { x: me.x, y: me.y };

    if (celebrate > 0) celebrate -= dt;

    if (!TUT.active()) {
      if (lastStep !== -2) { lastStep = -2; render(); }
      return;
    }

    var step = STEPS[U.clamp(g.tut.step, 0, STEPS.length - 1)];
    var done = false;
    try { done = step.goal(g); } catch (e) { done = false; }

    if (done && !step.final) {
      g.tut.step++;
      celebrate = 0.9;
      Game.sfx('craft');
      R.floatText(me.x, me.y, 'DONE', '#8ee6c8', 2);
      render();
      return;
    }

    if (g.tut.step !== lastStep) render();
    else updateMeter(step, g);
  };

  /* ---------------------------------------------------------
     Drawing the box
     --------------------------------------------------------- */
  function updateMeter(step, g) {
    if (!dom.meter) return;
    var txt = '';
    if (step.meter) {
      try { txt = step.meter(g); } catch (e) { txt = ''; }
    }
    dom.meter.textContent = txt;
    dom.meter.style.display = txt ? '' : 'none';
  }

  function render() {
    if (!dom.box) return;
    var g = S.get();

    /* clear any previous highlight */
    var lit = document.querySelectorAll('#menu button.tutfocus');
    for (var i = 0; i < lit.length; i++) lit[i].classList.remove('tutfocus');
    var sellBtn = U.$('#btnSellAll');
    if (sellBtn) sellBtn.classList.remove('tutfocus');

    if (!TUT.active()) {
      dom.box.classList.add('hidden');
      lastStep = -2;
      return;
    }

    var idx = U.clamp(g.tut.step, 0, STEPS.length - 1);
    var step = STEPS[idx];
    lastStep = g.tut.step;

    dom.box.classList.remove('hidden');
    dom.box.classList.toggle('final', !!step.final);
    dom.step.textContent = (idx + 1) + ' / ' + STEPS.length;
    dom.title.textContent = step.title;
    dom.text.innerHTML = step.text;
    dom.obj.innerHTML = step.final ? step.objective : '&#9654; ' + step.objective;
    updateMeter(step, g);
    dom.next.classList.toggle('hidden', !step.final);
    dom.skip.textContent = step.final ? 'CLOSE' : 'SKIP TUTORIAL';

    if (step.focus) {
      var btn = document.querySelector('#menu button[data-panel="' + step.focus + '"]');
      if (btn) btn.classList.add('tutfocus');
    }
    if (step.id === 'sellall' && sellBtn) sellBtn.classList.add('tutfocus');
  }

  TUT.render = render;

  root.TUT = TUT;
})(window);
