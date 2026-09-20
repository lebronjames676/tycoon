/* ============================================================
   ui.js - HUD, panels and notifications (plain DOM)
   ============================================================ */
(function (root) {
  'use strict';

  var UI = {};
  var dom = {};
  var openPanel = null;
  var refreshTimer = 0;

  UI.init = function () {
    dom.money = U.$('#statMoney');
    dom.bag = U.$('#statBag');
    dom.bagStat = U.$('#bagStat');
    dom.bagFill = U.$('#bagFill');
    dom.depth = U.$('#statDepth');
    dom.power = U.$('#statPower');
    dom.cores = U.$('#statCores');
    dom.level = U.$('#statLevel');
    dom.xpFill = U.$('#xpFill');
    dom.slots = U.$('#equipSlots');
    dom.hint = U.$('#contextHint');
    dom.overlay = U.$('#overlay');
    dom.panelTitle = U.$('#panelTitle');
    dom.panelBody = U.$('#panelBody');
    dom.toasts = U.$('#toasts');
    dom.menu = U.$('#menu');

    U.$('#panelClose').addEventListener('click', function () { UI.close(); });
    dom.overlay.addEventListener('mousedown', function (e) {
      if (e.target === dom.overlay) UI.close();
    });

    var buttons = dom.menu.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { UI.open(btn.dataset.panel); });
      })(buttons[i]);
    }

    buildSlots();
  };

  /* ---------------------------------------------------------
     Toasts
     --------------------------------------------------------- */
  UI.toast = function (msg, kind) {
    var t = U.el('div', 'toast ' + (kind || ''), U.esc(msg));
    dom.toasts.appendChild(t);
    setTimeout(function () { t.classList.add('fade'); }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
    while (dom.toasts.children.length > 6) dom.toasts.removeChild(dom.toasts.firstChild);
  };

  var lastHint = null;
  UI.setHint = function (html) {
    if (!dom.hint || html === lastHint) return;
    lastHint = html;
    dom.hint.innerHTML = html;
  };

  /* ---------------------------------------------------------
     Equipment slots in the action bar
     --------------------------------------------------------- */
  function buildSlots() {
    dom.slots.innerHTML = '';
    D.GEAR_SLOTS.forEach(function (slot) {
      var s = U.el('div', 'slot');
      s.dataset.slot = slot;
      s.innerHTML = '<span>' + D.GEAR[slot].icon + '</span><b class="tier"></b>';
      s.addEventListener('click', function () { UI.open('craft'); });
      dom.slots.appendChild(s);
    });
  }

  function updateSlots() {
    var g = S.get();
    var nodes = dom.slots.querySelectorAll('.slot');
    for (var i = 0; i < nodes.length; i++) {
      var slot = nodes[i].dataset.slot;
      var tier = S.gearTier(slot);
      nodes[i].querySelector('.tier').textContent = g.gear[slot] + 1;
      nodes[i].title = tier.name;
      var can = S.canCraft(slot);
      nodes[i].classList.toggle('up', !!can.ok);
    }
  }

  /* ---------------------------------------------------------
     HUD
     --------------------------------------------------------- */
  UI.updateHud = function () {
    var g = S.get(), d = S.derive();
    var carried = S.carried();

    dom.money.textContent = U.fmt(g.money);
    dom.bag.textContent = U.fmt(carried) + ' / ' + U.fmt(d.capacity);
    dom.bagFill.style.width = U.clamp(carried / d.capacity * 100, 0, 100) + '%';
    dom.bagStat.classList.toggle('full', carried >= d.capacity);
    dom.depth.textContent = D.LAYERS[g.layer].name;

    var pw = S.power();
    dom.power.textContent = pw.supply + ' / ' + pw.demand;
    dom.power.parentElement.style.color = (pw.demand > pw.supply) ? 'var(--rose)' : '';

    dom.cores.textContent = U.fmt(g.cores);
    dom.level.textContent = 'Lv ' + g.level;
    dom.xpFill.style.width = U.clamp(g.xp / D.xpForLevel(g.level) * 100, 0, 100) + '%';

    updateSlots();
    updateAlerts();
  };

  function updateAlerts() {
    var g = S.get();
    var flags = {
      craft: D.GEAR_SLOTS.some(function (s) { return S.canCraft(s).ok; }),
      island: W.canExpand(),
      depths: W.nextLayerCost() !== null && g.money >= W.nextLayerCost(),
      rebirth: S.pendingCores() > 0,
      contracts: S.ensureContracts().some(function (c) { return S.contractReady(c); }),
      storage: S.countBuilding('store') === 0 && g.money >= S.buildingCost('store'),
      build: g.money >= S.buildingCost('hut') && W.freeBuildTiles() > 0
    };
    var buttons = dom.menu.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var p = buttons[i].dataset.panel;
      buttons[i].classList.toggle('alert', !!flags[p]);
    }
  }

  /* ---------------------------------------------------------
     Panel plumbing
     --------------------------------------------------------- */
  var RENDER = {};

  UI.open = function (name) {
    if (!RENDER[name]) return;
    if (openPanel === name) { UI.close(); return; }
    openPanel = name;
    dom.overlay.classList.remove('hidden');
    UI.refresh();
  };

  UI.close = function () {
    openPanel = null;
    dom.overlay.classList.add('hidden');
  };

  UI.isOpen = function () { return openPanel !== null; };

  UI.refresh = function () {
    if (!openPanel) return;
    var scroll = dom.panelBody.scrollTop;
    var res = RENDER[openPanel]();
    dom.panelTitle.textContent = res.title;
    dom.panelBody.innerHTML = res.html;
    wire(dom.panelBody);
    dom.panelBody.scrollTop = scroll;
  };

  UI.tick = function (dt) {
    refreshTimer -= dt;
    if (refreshTimer <= 0) {
      refreshTimer = 0.4;
      if (openPanel) UI.refresh();
    }
  };

  /* every button with data-act gets routed through ACTIONS */
  function wire(container) {
    var btns = container.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var fn = ACTIONS[btn.dataset.act];
          if (fn) { fn(btn.dataset); UI.refresh(); UI.updateHud(); }
        });
      })(btns[i]);
    }
  }

  function card(opts) {
    return '<div class="card' + (opts.owned ? ' owned' : '') + (opts.wide ? ' wide' : '') + '">' +
      (opts.tag ? '<span class="tag' + (opts.tagLock ? ' lock' : '') + '">' + opts.tag + '</span>' : '') +
      '<h3>' + (opts.dot ? '<i class="dot" style="background:' + opts.dot + '"></i>' : '') +
      (opts.icon ? opts.icon + ' ' : '') + U.esc(opts.name) + '</h3>' +
      (opts.desc ? '<p>' + opts.desc + '</p>' : '') +
      (opts.req ? '<div class="req">' + opts.req + '</div>' : '') +
      (opts.price ? '<div class="price' + (opts.priceBad ? ' bad' : '') + (opts.cores ? ' cores' : '') + '">' + opts.price + '</div>' : '') +
      (opts.button ? '<button data-act="' + opts.button.act + '" ' +
        Object.keys(opts.button.data || {}).map(function (k) {
          return 'data-' + k + '="' + U.esc(opts.button.data[k]) + '"';
        }).join(' ') +
        (opts.button.disabled ? ' disabled' : '') + '>' + opts.button.label + '</button>' : '') +
      '</div>';
  }

  function oreCosts(ores) {
    var out = [];
    for (var id in ores) {
      var need = ores[id], have = S.oreHave(id);
      out.push(D.ORE_BY_ID[id].name + ' <b class="' + (have < need ? 'miss' : '') + '">' +
               U.fmt(have) + '/' + U.fmt(need) + '</b>');
    }
    return out.join(' &middot; ');
  }

  /* ---------------------------------------------------------
     INVENTORY
     --------------------------------------------------------- */
  RENDER.inventory = function () {
    var g = S.get(), d = S.derive(), rows = '', total = 0, carried = S.carried();
    var ids = Object.keys(g.inv).filter(function (id) { return g.inv[id] > 0; });
    ids.sort(function (a, b) { return D.ORE_BY_ID[b].value - D.ORE_BY_ID[a].value; });

    ids.forEach(function (id) {
      var ore = D.ORE_BY_ID[id], n = g.inv[id], v = S.oreValue(id, g.deepest) * n;
      total += v;
      var prot = S.isProtected(id);
      if (prot) total -= v;
      rows += '<div class="row"><i class="dot" style="background:' + ore.color + '"></i>' +
        '<span class="grow">' + ore.name +
        (prot ? ' <span class="sub" style="color:var(--teal)">&#9679; kept</span>' : '') + '</span>' +
        '<span class="sub">x' + U.fmt(n) + '</span>' +
        '<span class="num">' + (prot ? '&mdash;' : U.fmtMoney(v)) + '</span></div>';
    });

    var onPad = PL.standingOn() === 'market';
    var hasConveyor = S.countBuilding('convey') > 0;
    var ratio = onPad || hasConveyor ? 1 : 0.75;
    var note = onPad ? 'Standing on the market pad - full price.'
      : (hasConveyor ? 'Your conveyors carry ore to market at full price.'
        : 'Selling from the field costs a 25% courier fee. Stand on the market pad for full value.');

    var html = '<div class="note">' + note + '<br>Capacity <b>' + U.fmt(carried) + ' / ' +
      U.fmt(d.capacity) + '</b> &middot; Sale multiplier <b>x' + d.valueMult.toFixed(2) +
      '</b> &middot; Depth bonus <b>x' + D.LAYERS[g.deepest].valMult.toFixed(2) + '</b>' +
      (S.storageCap() > 0 ? '<br>Warehouse <b>' + U.fmt(S.stored()) + ' / ' +
        U.fmt(S.storageCap()) + '</b> - ore marked <b>kept</b> is never sold automatically.' : '') +
      '</div>';

    html += rows ? '<div class="rows">' + rows + '</div>' : '<div class="empty">Your bag is empty. Go break some rocks.</div>';

    if (total > 0) {
      html += '<div class="section" style="margin-top:12px"><div class="row">' +
        '<span class="grow">Sellable value' + (ratio < 1 ? ' (after fee)' : '') + '</span>' +
        '<span class="num">' + U.fmtMoney(total * ratio) + '</span></div></div>' +
        '<button class="btn" data-act="sellAll" style="width:100%;padding:11px">SELL EVERYTHING</button>';
    }
    return { title: 'Bag', html: html };
  };

  /* ---------------------------------------------------------
     CRAFTING
     --------------------------------------------------------- */
  var STAT_LABEL = {
    power: function (v) { return 'Mining power ' + U.fmt(v); },
    capacity: function (v) { return 'Carry ' + U.fmt(v) + ' ore'; },
    speed: function (v) { return 'Move speed ' + v.toFixed(1); },
    swing: function (v) { return 'Swing rate x' + v.toFixed(2); },
    value: function (v) { return 'Sell value x' + v.toFixed(2); },
    luck: function (v) { return 'Rare ore +' + Math.round(v * 100) + '% &middot; brighter light'; }
  };

  RENDER.craft = function () {
    var g = S.get();
    var html = '<div class="note">Crafting spends ore from your <b>bag</b> plus cash. ' +
      'Each tier is a big jump - the deeper layers expect it.</div><div class="grid">';

    D.GEAR_SLOTS.forEach(function (slot) {
      var chainDef = D.GEAR[slot];
      var cur = S.gearTier(slot);
      var c = S.canCraft(slot);
      var next = chainDef.tiers[g.gear[slot] + 1];

      if (!next) {
        html += card({
          icon: chainDef.icon, name: cur.name, owned: true, tag: 'MAX',
          desc: STAT_LABEL[chainDef.stat](cur.stat),
          button: { act: 'none', label: 'FULLY UPGRADED', disabled: true }
        });
        return;
      }

      var reason = c.ok ? '' :
        (c.reason === 'level' ? 'Requires mining level ' + next.lvl :
         c.reason === 'money' ? 'Need ' + U.fmtMoney(next.money) : 'Missing ore');

      html += card({
        icon: chainDef.icon,
        name: next.name,
        tag: 'T' + (next.tier + 1),
        tagLock: !c.ok,
        desc: '<b style="color:var(--text)">' + STAT_LABEL[chainDef.stat](next.stat) + '</b><br>' +
          '<span style="opacity:.7">now: ' + STAT_LABEL[chainDef.stat](cur.stat) + '</span>',
        req: (Object.keys(next.ores).length ? oreCosts(next.ores) + '<br>' : '') +
          (next.lvl ? 'Level <b class="' + (g.level < next.lvl ? 'miss' : '') + '">' + next.lvl + '</b>' : ''),
        price: U.fmtMoney(next.money),
        priceBad: g.money < next.money,
        button: {
          act: 'craft', data: { slot: slot },
          label: c.ok ? 'CRAFT' : (reason || 'LOCKED').toUpperCase(),
          disabled: !c.ok
        }
      });
    });
    return { title: 'Workbench', html: html + '</div>' };
  };

  /* ---------------------------------------------------------
     BUILD
     --------------------------------------------------------- */
  RENDER.build = function () {
    var g = S.get(), pw = S.power(), r = E.rates();
    var free = W.freeBuildTiles();

    var html = '<div class="note">Buildings work around the clock, even while the game is closed.<br>' +
      'Power <b>' + pw.supply + ' / ' + pw.demand + '</b> ' +
      (pw.demand > pw.supply ? '<b style="color:var(--rose)">(running at ' + U.pct(pw.efficiency) + ')</b>' : '(all good)') +
      ' &middot; Output <b>' + r.ore.toFixed(1) + ' ore/s</b>' +
      ' &middot; Shipping <b>' + r.sell.toFixed(1) + ' ore/s</b>' +
      ' &middot; Free tiles <b>' + free + '</b></div>';

    if (Game.buildMode()) {
      html += '<div class="note" style="border-left-color:var(--gold)">Build mode is <b>ON</b> - ' +
        'close this panel and tap a tile on the island to place <b>' +
        D.BUILD_BY_ID[Game.buildChoice()].name + '</b>. Right-click (or the Demolish button) removes a building.</div>';
    }

    html += '<div class="grid">';
    D.BUILDINGS.forEach(function (b) {
      var owned = S.countBuilding(b.id);
      var cost = S.buildingCost(b.id);
      var afford = g.money >= cost && free > 0;
      var effect = b.capacity ? '+' + U.fmt(b.capacity) + ' ore of storage'
        : b.rate ? (b.id === 'convey' ? b.rate + ' ore/s shipped' : b.rate + ' ore/s mined')
        : (b.power > 0 ? '+' + b.power + ' power' : '+' + Math.round(b.bonus * 100) + '% bonus');
      html += card({
        icon: b.icon, name: b.name,
        tag: owned ? 'x' + owned : null,
        desc: U.esc(b.desc),
        req: effect + (b.power < 0 ? ' &middot; uses <b>' + (-b.power) + '</b> power' : ''),
        price: U.fmtMoney(cost), priceBad: g.money < cost,
        button: {
          act: 'pickBuild', data: { id: b.id },
          label: afford ? 'PLACE' : (free <= 0 ? 'NO SPACE' : 'TOO EXPENSIVE'),
          disabled: !afford
        }
      });
    });
    html += '</div>';

    if (g.buildings.length) {
      html += '<div class="section" style="margin-top:14px"><h4>Demolish</h4>' +
        '<div class="note">Removing a building refunds half of what the next one would cost.</div>' +
        '<button class="btn" data-act="demoMode" style="width:100%;padding:10px">' +
        (Game.demoMode() ? 'DEMOLISH MODE: ON - TAP A BUILDING' : 'ENTER DEMOLISH MODE') + '</button></div>';
    }
    return { title: 'Construction', html: html };
  };

  /* ---------------------------------------------------------
     ISLAND
     --------------------------------------------------------- */
  RENDER.island = function () {
    var g = S.get(), b = W.bounds();
    var cost = W.expandCost();
    var maxed = g.size >= D.MAX_SIZE;

    var html = '<div class="note">A wider island means more ore veins at every depth and more room for machines.</div>';
    html += '<div class="rows">' +
      '<div class="row"><span class="grow">Island size</span><span class="num">' + g.size + ' x ' + g.size + '</span></div>' +
      '<div class="row"><span class="grow">Tiles</span><span class="num">' + (g.size * g.size) + '</span></div>' +
      '<div class="row"><span class="grow">Ore veins per layer</span><span class="num">' + W.targetNodes(g.layer) + '</span></div>' +
      '<div class="row"><span class="grow">Buildings placed</span><span class="num">' + g.buildings.length + '</span></div>' +
      '<div class="row"><span class="grow">Free build tiles</span><span class="num">' + W.freeBuildTiles() + '</span></div>' +
      '</div>';

    html += '<div class="grid" style="margin-top:12px">' + card({
      icon: '\u{1F3DD}', name: maxed ? 'Island fully grown' : 'Expand to ' + (g.size + 1) + ' x ' + (g.size + 1),
      desc: maxed ? 'There is no more sky to claim.' :
        'Push the rock outward. +' + ((g.size + 1) * (g.size + 1) - g.size * g.size) + ' tiles, more ore on every layer.',
      price: maxed ? null : U.fmtMoney(cost),
      priceBad: g.money < cost,
      wide: true,
      button: {
        act: 'expand',
        label: maxed ? 'MAXED' : (g.money >= cost ? 'EXPAND THE ISLAND' : 'NOT ENOUGH MONEY'),
        disabled: maxed || g.money < cost
      }
    }) + '</div>';
    return { title: 'Island', html: html };
  };

  /* ---------------------------------------------------------
     DEPTHS
     --------------------------------------------------------- */
  RENDER.depths = function () {
    var g = S.get();
    var html = '<div class="note">Ride the mineshaft with <span class="kbd">E</span> to go down and ' +
      '<span class="kbd">Q</span> to come back up. Deeper rock is tougher but pays far better, and your ' +
      'buildings always dig at your deepest unlocked layer.</div><div class="grid">';

    D.LAYERS.forEach(function (L, i) {
      var unlocked = i < g.layersUnlocked;
      var isNext = i === g.layersUnlocked;
      var here = i === g.layer;
      var ores = D.ORES.filter(function (o) { return (o.w[i] || 0) > 0; })
        .slice(-4).map(function (o) {
          return '<i class="dot" style="display:inline-block;background:' + o.color + '"></i> ' + o.name;
        }).join(' ');

      html += card({
        name: L.name,
        tag: here ? 'YOU ARE HERE' : (unlocked ? 'OPEN' : 'SEALED'),
        tagLock: !unlocked,
        owned: unlocked && !here,
        desc: 'Rock toughness <b style="color:var(--text)">x' + L.hpMult.toFixed(1) + '</b> &middot; ' +
          'Ore value <b style="color:var(--text)">x' + L.valMult.toFixed(2) + '</b>',
        req: ores,
        price: unlocked ? null : U.fmtMoney(L.cost),
        priceBad: g.money < L.cost,
        button: unlocked ? {
          act: 'goLayer', data: { layer: i },
          label: here ? 'CURRENT LAYER' : 'TRAVEL HERE', disabled: here
        } : {
          act: 'unlockLayer',
          label: isNext ? (g.money >= L.cost ? 'BLAST IT OPEN' : 'NOT ENOUGH MONEY') : 'UNLOCK THE LAYER ABOVE FIRST',
          disabled: !isNext || g.money < L.cost
        }
      });
    });
    return { title: 'The Depths', html: html + '</div>' };
  };

  /* ---------------------------------------------------------
     REBIRTH
     --------------------------------------------------------- */
  RENDER.rebirth = function () {
    var g = S.get();
    var pending = S.pendingCores();
    var progress = U.clamp(g.lifeEarned / D.REBIRTH_MIN, 0, 1);

    var html = '<div class="note">Rebirth melts the island back down: money, ore, gear, buildings and depth ' +
      'unlocks all reset. You keep <b>Prestige Cores</b>, every perk you bought with them and all achievements. ' +
      'Each core alone gives <b>+3% money</b> and <b>+1% mining power</b>, forever.</div>';

    html += '<div class="card wide center" style="padding:16px;margin-bottom:12px">' +
      '<div class="big">' + U.fmt(pending) + ' CORES</div>' +
      '<p>waiting for you this life &middot; earned so far ' + U.fmtMoney(g.lifeEarned) + '</p>' +
      (pending > 0 ? '' : '<p>Earn ' + U.fmtMoney(D.REBIRTH_MIN) + ' in one life to unlock rebirth (' +
        Math.floor(progress * 100) + '%)</p>') +
      '<button data-act="doRebirth"' + (pending > 0 ? '' : ' disabled') + '>' +
      (pending > 0 ? 'REBIRTH FOR ' + U.fmt(pending) + ' CORES' : 'NOT READY YET') + '</button></div>';

    html += '<div class="section"><h4>Prestige perks &middot; ' + U.fmt(g.cores) + ' cores available &middot; ' +
      g.rebirths + ' rebirths</h4><div class="grid">';

    D.PERKS.forEach(function (p) {
      var owned = g.perks[p.id] || 0;
      var maxed = owned >= p.max;
      var cost = D.perkCost(p, owned);
      html += card({
        icon: p.icon, name: p.name,
        tag: owned ? owned + '/' + p.max : null,
        owned: maxed,
        desc: U.esc(p.desc),
        req: owned ? 'Current bonus: <b>' + p.per.replace(/^\+/, '+') + ' x' + owned + '</b>' : '',
        price: maxed ? null : U.fmt(cost) + ' cores',
        cores: true,
        priceBad: g.cores < cost,
        button: {
          act: 'buyPerk', data: { id: p.id },
          label: maxed ? 'MAXED' : (g.cores >= cost ? 'BUY' : 'NEED ' + U.fmt(cost)),
          disabled: maxed || g.cores < cost
        }
      });
    });
    return { title: 'Rebirth', html: html + '</div></div>' };
  };

  /* ---------------------------------------------------------
     STORAGE
     --------------------------------------------------------- */
  RENDER.storage = function () {
    var g = S.get();
    var cap = S.storageCap(), used = S.stored();
    var sheds = S.countBuilding('store');

    if (!sheds) {
      return {
        title: 'Warehouse',
        html: '<div class="note">You have not built a warehouse yet.<br><br>' +
          'A warehouse holds <b>' + D.STORE_PER_BUILDING + ' ore</b> outside your bag. ' +
          'Ore you mark to <b>keep</b> is dropped off automatically whenever you walk past one, ' +
          'is never sold by the market pad or your conveyors, and still counts towards crafting ' +
          'recipes and guild contracts.</div>' +
          '<div class="grid">' + card({
            icon: D.BUILD_BY_ID.store.icon, name: 'Warehouse', wide: true,
            desc: U.esc(D.BUILD_BY_ID.store.desc),
            price: U.fmtMoney(S.buildingCost('store')),
            priceBad: g.money < S.buildingCost('store'),
            button: {
              act: 'pickBuild', data: { id: 'store' },
              label: g.money >= S.buildingCost('store') ? 'BUILD ONE' : 'NOT ENOUGH MONEY',
              disabled: g.money < S.buildingCost('store')
            }
          }) + '</div>'
      };
    }

    var pctFull = cap ? U.clamp(used / cap * 100, 0, 100) : 0;
    var html = '<div class="note">' + sheds + ' warehouse' + (sheds > 1 ? 's' : '') +
      ' holding <b>' + U.fmt(used) + ' / ' + U.fmt(cap) + '</b> ore. ' +
      'Walk within a couple of tiles of one to drop off everything you have marked to keep.' +
      (S.storageRoom() <= 0 ? '<br><b style="color:var(--rose)">Storage is full</b> - kept ore is ' +
        'being sold again until you build more space.' : '') +
      '<div class="bagfill" style="position:relative;margin-top:7px;height:5px">' +
      '<i style="width:' + pctFull + '%"></i></div></div>';

    var keptCount = D.ORES.filter(function (o) { return g.keep[o.id]; }).length;
    html += '<div class="section"><h4>What to keep</h4>' +
      '<div class="note"' + (keptCount ? '' : ' style="border-left-color:var(--gold)"') + '>' +
      (keptCount ? '' : '<b>Nothing is being kept yet.</b> Tick the ore you are saving for a recipe.<br>') +
      'Ore set to <b>KEEPING</b> goes into the warehouse instead of being sold automatically, and ' +
      'still counts towards recipes and contracts. Ore set to <b>SELLING</b> behaves as before: the ' +
      'market pad, your conveyors and machine overflow all cash it in.</div><div class="rows">';

    D.ORES.forEach(function (o) {
      var kept = !!g.keep[o.id];
      var inBag = g.inv[o.id] || 0, inShed = g.store[o.id] || 0;
      var worth = inShed * S.oreValue(o.id, g.deepest);
      html += '<div class="row">' +
        '<i class="dot" style="background:' + o.color + '"></i>' +
        '<span class="grow">' + o.name +
        '<br><span class="sub">bag ' + U.fmt(inBag) + ' &middot; stored ' + U.fmt(inShed) + '</span></span>' +
        (inShed > 0 ? '<button class="btn" data-act="sellStored" data-id="' + o.id + '" ' +
          'style="padding:5px 9px;font-size:10px">SELL ' + U.fmtMoney(worth) + '</button>' : '') +
        '<button class="btn" data-act="toggleKeep" data-id="' + o.id + '" style="padding:5px 9px;font-size:10px;' +
        (kept ? 'background:var(--teal-dk);border-color:var(--teal);color:#fff' :
                'background:#232e38;border-color:var(--line);color:var(--muted)') + '">' +
        (kept ? 'KEEPING' : 'SELLING') + '</button></div>';
    });
    html += '</div></div>';

    html += '<div class="grid">' +
      '<button class="btn" data-act="keepAll">KEEP EVERYTHING</button>' +
      '<button class="btn" data-act="keepNone">SELL EVERYTHING</button>' +
      (used > 0 ? '<button class="btn wide" data-act="sellAllStored" style="border-color:var(--gold);color:var(--gold)">' +
        'EMPTY THE WAREHOUSE FOR ' + U.fmtMoney(D.ORES.reduce(function (a, o) {
          return a + (g.store[o.id] || 0) * S.oreValue(o.id, g.deepest);
        }, 0)) + '</button>' : '') +
      '<button class="btn" data-act="pickBuild" data-id="store">BUILD ANOTHER (' +
        U.fmtMoney(S.buildingCost('store')) + ')</button>' +
      '</div>';

    return { title: 'Warehouse', html: html };
  };

  /* ---------------------------------------------------------
     CONTRACTS
     --------------------------------------------------------- */
  RENDER.contracts = function () {
    var g = S.get();
    var list = S.ensureContracts();
    var html = '<div class="note">The sky guild pays about <b>x' + D.CONTRACT_MULT +
      '</b> the market rate for a full delivery, plus a fat lump of experience. ' +
      'Ore comes straight out of your bag. Completed: <b>' + U.fmt(g.contractsDone || 0) + '</b></div><div class="grid">';

    list.forEach(function (c) {
      var ore = D.ORE_BY_ID[c.ore];
      var have = g.inv[c.ore] || 0;
      var ready = have >= c.need;
      var pay = S.contractPay(c);
      var reroll = S.rerollCost(c);
      html += '<div class="card' + (ready ? ' owned' : '') + '">' +
        '<h3><i class="dot" style="background:' + ore.color + '"></i>' + c.need + ' x ' + ore.name + '</h3>' +
        '<p>Deliver ' + U.fmt(c.need) + ' ' + ore.name + ' for ' + U.fmtMoney(pay) +
        ' and ' + U.fmt(D.contractReward(c).xp) + ' xp.</p>' +
        '<div class="req">In bag <b class="' + (ready ? '' : 'miss') + '">' +
        U.fmt(have) + ' / ' + U.fmt(c.need) + '</b></div>' +
        '<div class="price">' + U.fmtMoney(pay) + '</div>' +
        '<button data-act="claimContract" data-id="' + c.id + '"' + (ready ? '' : ' disabled') + '>' +
        (ready ? 'DELIVER' : 'NEED ' + U.fmt(c.need - have) + ' MORE') + '</button>' +
        '<button data-act="rerollContract" data-id="' + c.id + '" style="background:#232e38;border-color:var(--line);margin-top:4px"' +
        (g.money >= reroll ? '' : ' disabled') + '>NEW JOB (' + U.fmtMoney(reroll) + ')</button>' +
        '</div>';
    });
    return { title: 'Guild Jobs', html: html + '</div>' };
  };

  /* ---------------------------------------------------------
     STATS + ACHIEVEMENTS
     --------------------------------------------------------- */
  RENDER.stats = function () {
    var g = S.get(), d = S.derive(), r = E.rates();
    function row(label, value) {
      return '<div class="row"><span class="grow">' + label + '</span><span class="num">' + value + '</span></div>';
    }
    var html = '<div class="section"><h4>Miner</h4><div class="rows">' +
      row('Mining power', U.fmt(d.power)) +
      row('Swings per second', (d.swing / D.SWING).toFixed(2)) +
      row('Damage per second', U.fmt(d.power * d.swing / D.SWING)) +
      row('Move speed', d.speed.toFixed(2)) +
      row('Carry capacity', U.fmt(d.capacity)) +
      row('Sell multiplier', 'x' + d.valueMult.toFixed(2)) +
      row('Rare ore luck', '+' + Math.round(d.luck * 100) + '%') +
      row('Double drop chance', U.pct(d.doubleChance)) +
      row('Level', g.level + '  (' + U.fmt(g.xp) + ' / ' + U.fmt(D.xpForLevel(g.level)) + ' xp)') +
      '</div></div>';

    html += '<div class="section"><h4>Operation</h4><div class="rows">' +
      row('Building output', r.ore.toFixed(2) + ' ore/s') +
      row('Shipping rate', r.sell.toFixed(2) + ' ore/s') +
      row('Estimated income', U.fmtMoney(E.lastIncome) + ' /s') +
      row('Offline rate', U.pct(d.offlineRate) + ' (cap ' + D.OFFLINE_CAP_H + 'h)') +
      row('Buildings', g.buildings.length) +
      '</div></div>';

    html += '<div class="section"><h4>Lifetime</h4><div class="rows">' +
      row('Earned this life', U.fmtMoney(g.lifeEarned)) +
      row('Earned all time', U.fmtMoney(g.stats.totalEarned)) +
      row('Nodes broken', U.fmt(g.stats.nodes)) +
      row('Pickaxe swings', U.fmt(g.stats.swings)) +
      row('Ore sold', U.fmt(g.stats.sold)) +
      row('Rebirths', g.rebirths) +
      row('Cores earned', U.fmt(g.coresTotal)) +
      row('Time played', U.fmtTime(g.stats.playtime)) +
      '</div></div>';

    var mined = '';
    D.ORES.forEach(function (o) {
      var n = g.stats.mined[o.id] || 0;
      if (!n) return;
      mined += '<div class="row"><i class="dot" style="background:' + o.color + '"></i>' +
        '<span class="grow">' + o.name + '</span><span class="num">' + U.fmt(n) + '</span></div>';
    });
    if (mined) html += '<div class="section"><h4>Ore mined (all time)</h4><div class="rows">' + mined + '</div></div>';

    var done = 0;
    var ach = '';
    D.ACHIEVEMENTS.forEach(function (a) {
      var got = !!g.achievements[a.id];
      if (got) done++;
      ach += '<div class="row" style="opacity:' + (got ? 1 : 0.55) + '">' +
        '<span style="font-size:14px">' + (got ? '★' : '☆') + '</span>' +
        '<span class="grow">' + U.esc(a.name) + '<br><span class="sub">' + U.esc(a.desc) + '</span></span>' +
        '<span class="num">' + (a.cores ? a.cores + ' ✦' : '') +
        (a.money ? ' ' + U.fmtMoney(a.money) : '') + '</span></div>';
    });
    html += '<div class="section"><h4>Achievements ' + done + ' / ' + D.ACHIEVEMENTS.length +
      '</h4><div class="rows">' + ach + '</div></div>';

    return { title: 'Records', html: html };
  };

  /* ---------------------------------------------------------
     HELP
     --------------------------------------------------------- */
  RENDER.help = function () {
    var html = '<div class="section"><h4>Controls</h4><div class="rows">' +
      '<div class="row"><span class="grow">Move</span><span><span class="kbd">W</span> <span class="kbd">A</span> <span class="kbd">S</span> <span class="kbd">D</span> or arrows</span></div>' +
      '<div class="row"><span class="grow">Swing the pickaxe</span><span><span class="kbd">SPACE</span> (hold) or click a rock</span></div>' +
      '<div class="row"><span class="grow">Ride the shaft down / up</span><span><span class="kbd">E</span> / <span class="kbd">Q</span></span></div>' +
      '<div class="row"><span class="grow">Zoom</span><span><span class="kbd">-</span> <span class="kbd">+</span> or scroll wheel</span></div>' +
      '<div class="row"><span class="grow">Panels</span><span><span class="kbd">I</span> <span class="kbd">C</span> <span class="kbd">B</span> <span class="kbd">K</span> <span class="kbd">X</span> <span class="kbd">V</span> <span class="kbd">J</span> <span class="kbd">R</span> <span class="kbd">T</span></span></div>' +
      '<div class="row"><span class="grow">Close a panel</span><span><span class="kbd">ESC</span></span></div>' +
      '</div></div>';

    html += '<div class="section"><h4>How it all fits together</h4>' +
      '<div class="note"><b>1. Mine.</b> Stand next to a rock and swing. Ore goes into your bag.</div>' +
      '<div class="note"><b>2. Sell.</b> Walk onto the golden market pad to cash out at full price.</div>' +
      '<div class="note"><b>3. Craft.</b> Spend ore and money at the workbench for stronger gear. A bigger bag and faster gloves matter as much as raw power.</div>' +
      '<div class="note"><b>3b. Store.</b> A warehouse holds ore outside your bag. Tick the ore types you want to <b>keep</b> and they will be dropped off whenever you walk past a warehouse, never auto-sold, and still spendable on recipes and contracts.</div>' +
      '<div class="note"><b>4. Build.</b> Huts, drills and rigs mine for you day and night. Generators keep them powered, conveyors sell the ore, smelters and vaults raise the price.</div>' +
      '<div class="note"><b>5. Expand.</b> A wider island carries more ore veins and more machines.</div>' +
      '<div class="note"><b>6. Dig deeper.</b> Each layer multiplies both rock toughness and ore value. Your buildings always work the deepest layer you own.</div>' +
      '<div class="note"><b>7. Rebirth.</b> When a life has earned enough, trade it all for Prestige Cores and permanent perks. The next run is far faster.</div>' +
      '</div>';

    html += '<div class="section"><h4>Save file</h4>' +
      '<div class="note">The game saves to this browser every 15 seconds and whenever you close the tab.</div>' +
      '<div class="grid">' +
      '<button class="btn" data-act="saveNow">SAVE NOW</button>' +
      '<button class="btn" data-act="exportSave">COPY SAVE TO CLIPBOARD</button>' +
      '<button class="btn" data-act="importSave">PASTE A SAVE</button>' +
      '<button class="btn" data-act="wipe" style="border-color:var(--rose);color:var(--rose)">DELETE EVERYTHING</button>' +
      '</div></div>';
    return { title: 'Field Manual', html: html };
  };

  /* ---------------------------------------------------------
     Actions
     --------------------------------------------------------- */
  var ACTIONS = {
    none: function () {},

    sellAll: function () {
      var onPad = PL.standingOn() === 'market';
      var ratio = (onPad || S.countBuilding('convey') > 0) ? 1 : 0.75;
      var res = E.sellAll(ratio);
      if (res.units > 0) {
        UI.toast('Sold ' + U.fmt(res.units) + ' ore for ' + U.fmtMoney(res.money), 'gold');
        Game.sfx('sell');
      }
    },

    craft: function (data) {
      var made = S.craft(data.slot);
      if (made) {
        UI.toast('Crafted ' + made.name + '!', 'gold');
        Game.sfx('craft');
      }
    },

    pickBuild: function (data) {
      Game.setBuildChoice(data.id);
      UI.close();
      UI.toast('Tap a tile to place a ' + D.BUILD_BY_ID[data.id].name);
    },

    demoMode: function () { Game.toggleDemo(); },

    expand: function () {
      if (W.expand()) {
        R.invalidate();
        R.kick(4);
        UI.toast('The island grows to ' + S.get().size + ' x ' + S.get().size + '!', 'gold');
        Game.sfx('build');
      }
    },

    unlockLayer: function () {
      var name = D.LAYERS[S.get().layersUnlocked] && D.LAYERS[S.get().layersUnlocked].name;
      if (W.unlockLayer()) {
        UI.toast('Blasted through to the ' + name + '!', 'epic');
        Game.sfx('build');
      }
    },

    goLayer: function (data) {
      var target = parseInt(data.layer, 10);
      var g = S.get();
      if (!PL.nearShaft()) { UI.toast('Stand on the mineshaft to travel', 'bad'); return; }
      W.changeLayer(U.clamp(target, 0, g.layersUnlocked - 1) - g.layer);
      PL.init();
      UI.close();
      UI.toast('Now in the ' + D.LAYERS[g.layer].name);
      Game.sfx('travel');
    },

    buyPerk: function (data) {
      var p = D.PERK_BY_ID[data.id];
      if (S.buyPerk(data.id)) {
        UI.toast(p.name + ' -> level ' + S.get().perks[data.id], 'epic');
        Game.sfx('craft');
      }
    },

    doRebirth: function () {
      var pending = S.pendingCores();
      if (pending <= 0) return;
      if (!confirm('Rebirth now for ' + pending + ' Prestige Cores?\n\n' +
                   'Money, ore, gear, buildings, island size and depth unlocks all reset.\n' +
                   'Cores, perks and achievements are kept forever.')) return;
      Game.doRebirth();
    },

    claimContract: function (data) {
      var res = S.claimContract(data.id);
      if (res) {
        var ore = D.ORE_BY_ID[res.ore];
        UI.toast('Delivered ' + U.fmt(res.need) + ' ' + ore.name + ' for ' + U.fmtMoney(res.pay), 'gold');
        Game.sfx('sell');
      }
    },

    rerollContract: function (data) {
      if (S.rerollContract(data.id)) UI.toast('New job posted');
    },

    toggleKeep: function (data) {
      var on = S.toggleKeep(data.id);
      UI.toast(D.ORE_BY_ID[data.id].name + (on ? ' will be kept' : ' will be sold'));
    },

    keepAll: function () {
      D.ORES.forEach(function (o) { S.get().keep[o.id] = 1; });
      UI.toast('Keeping every ore type');
    },

    keepNone: function () {
      S.get().keep = {};
      UI.toast('Everything will be sold automatically');
    },

    sellStored: function (data) {
      var r = E.sellStored(data.id);
      if (r.units > 0) {
        UI.toast('Sold ' + U.fmt(r.units) + ' ' + D.ORE_BY_ID[data.id].name +
                 ' for ' + U.fmtMoney(r.money), 'gold');
        Game.sfx('sell');
      }
    },

    sellAllStored: function () {
      var r = E.sellAllStored();
      if (r.units > 0) {
        UI.toast('Emptied the warehouse: ' + U.fmtMoney(r.money), 'gold');
        Game.sfx('sell');
      }
    },

    saveNow: function () { S.save(); UI.toast('Saved'); },

    exportSave: function () {
      var raw = U.store.get(D.SAVE_KEY) || '';
      var b64 = btoa(unescape(encodeURIComponent(raw)));
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(b64).then(function () {
          UI.toast('Save copied to clipboard', 'gold');
        }, function () { window.prompt('Copy your save:', b64); });
      } else {
        window.prompt('Copy your save:', b64);
      }
    },

    importSave: function () {
      var b64 = window.prompt('Paste a save string:');
      if (!b64) return;
      try {
        var raw = decodeURIComponent(escape(atob(b64.trim())));
        JSON.parse(raw);
        U.store.set(D.SAVE_KEY, raw);
        UI.toast('Save loaded - reloading...', 'gold');
        setTimeout(function () { location.reload(); }, 600);
      } catch (e) {
        UI.toast('That save string is not valid', 'bad');
      }
    },

    wipe: function () {
      if (!confirm('Delete your save and start over? This cannot be undone.')) return;
      S.wipe();
      location.reload();
    }
  };

  UI.action = function (name, data) { if (ACTIONS[name]) ACTIONS[name](data || {}); };

  root.UI = UI;
})(window);

/* ------------------------------------------------------------
   UI.custom - open the overlay with arbitrary content
   (used for the "welcome back" report and rebirth summary)
   ------------------------------------------------------------ */
(function (root) {
  'use strict';
  var body = null, overlay = null, title = null;
  root.UI.custom = function (heading, html) {
    overlay = overlay || U.$('#overlay');
    body = body || U.$('#panelBody');
    title = title || U.$('#panelTitle');
    root.UI.close();
    title.textContent = heading;
    body.innerHTML = html;
    overlay.classList.remove('hidden');
    var btns = body.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          root.UI.action(btn.dataset.act, btn.dataset);
          overlay.classList.add('hidden');
        });
      })(btns[i]);
    }
  };
})(window);
