/* ============================================================
   data.js - every tunable number in the game lives here
   ============================================================ */
(function (root) {
  'use strict';

  var D = {};

  /* ---------------------------------------------------------
     World constants
     --------------------------------------------------------- */
  D.GRID = 22;                 /* absolute max island width in tiles      */
  D.START_SIZE = 6;            /* unlocked square starts 6x6              */
  D.MAX_SIZE = 20;
  D.CENTER = Math.floor(D.GRID / 2);
  D.SHAFT = { x: D.CENTER + 1, y: D.CENTER };       /* mineshaft / ladder  */
  D.SELL = { x: D.CENTER - 2, y: D.CENTER };        /* market drop-off pad */
  D.SPAWN = { x: D.CENTER, y: D.CENTER + 1 };
  D.NODE_DENSITY = 0.19;       /* nodes per unlocked tile                 */
  D.RESPAWN = 1.7;             /* seconds before a broken node comes back */
  D.SWING = 0.38;              /* seconds per pickaxe swing               */
  D.MINE_RANGE = 1.55;         /* tiles                                   */
  D.SAVE_KEY = 'skyshard.save.v1';
  D.TICK_MS = 1000 / 60;
  D.OFFLINE_CAP_H = 8;
  D.STORE_PER_BUILDING = 400;

  /* ---------------------------------------------------------
     Ores - w[] is the spawn weight per depth layer (0..5)
     --------------------------------------------------------- */
  D.ORES = [
    { id: 'stone',     name: 'Stone',      color: '#9aa3ab', gem: '#c3cbd2', value: 4,     hp: 8,   w: [46, 30, 14, 6, 2, 0] },
    { id: 'coal',      name: 'Coal',       color: '#3f454b', gem: '#5d666e', value: 9,     hp: 16,   w: [26, 26, 20, 10, 4, 0] },
    { id: 'copper',    name: 'Copper',     color: '#c87a3f', gem: '#ef9d5c', value: 18,    hp: 34,   w: [18, 22, 18, 10, 4, 2] },
    { id: 'iron',      name: 'Iron',       color: '#b6b0a6', gem: '#ded8cc', value: 42,    hp: 70,   w: [8, 16, 20, 16, 8, 4] },
    { id: 'silver',    name: 'Silver',     color: '#cfe0ea', gem: '#ffffff', value: 95,    hp: 130,  w: [2, 6, 16, 18, 12, 6] },
    { id: 'gold',      name: 'Gold',       color: '#f0bc3c', gem: '#ffe58a', value: 220,   hp: 240,  w: [0, 0, 10, 18, 16, 10] },
    { id: 'ruby',      name: 'Ruby',       color: '#d8384e', gem: '#ff7d8e', value: 520,   hp: 430,  w: [0, 0, 2, 12, 16, 12] },
    { id: 'emerald',   name: 'Emerald',    color: '#3fbd6d', gem: '#8dfab3', value: 1150,  hp: 760,  w: [0, 0, 0, 8, 16, 14] },
    { id: 'diamond',   name: 'Diamond',    color: '#79e6f0', gem: '#ddffff', value: 2600,  hp: 1300, w: [0, 0, 0, 2, 14, 16] },
    { id: 'obsidian',  name: 'Obsidian',   color: '#5a3a86', gem: '#9b6fd6', value: 6200,  hp: 2200, w: [0, 0, 0, 0, 6, 16] },
    { id: 'voidstone', name: 'Voidstone',  color: '#2b2140', gem: '#7b5fd6', value: 15000, hp: 3800, w: [0, 0, 0, 0, 2, 12] },
    { id: 'starcore',  name: 'Star Core',  color: '#ffd76a', gem: '#fffbe0', value: 42000, hp: 6500, w: [0, 0, 0, 0, 0, 4] }
  ];
  D.ORE_BY_ID = {};
  D.ORES.forEach(function (o, i) { o.index = i; D.ORE_BY_ID[o.id] = o; });

  /* ---------------------------------------------------------
     Depth layers
     --------------------------------------------------------- */
  D.LAYERS = [
    { name: 'Surface',       cost: 0,      hpMult: 1,   valMult: 1,    floor: '#57c3ad', floor2: '#4bb39e', wall: '#d79a6e', light: 1.00 },
    { name: 'Shallow Caves', cost: 2500,   hpMult: 1.3, valMult: 1.15, floor: '#8a6a4e', floor2: '#7a5c43', wall: '#5e4632', light: 0.78 },
    { name: 'Deep Caves',    cost: 45000,  hpMult: 1.8, valMult: 1.35, floor: '#6b7079', floor2: '#5d626a', wall: '#42464d', light: 0.62 },
    { name: 'Crystal Depths',cost: 750000, hpMult: 2.6, valMult: 1.65, floor: '#4a5a78', floor2: '#3f4d67', wall: '#2c3852', light: 0.52 },
    { name: 'Magma Core',    cost: 1.8e7,  hpMult: 4.0, valMult: 2.10, floor: '#6d3230', floor2: '#5c2a28', wall: '#3d1b1a', light: 0.58 },
    { name: 'The Void',      cost: 6.0e8,  hpMult: 6.5, valMult: 2.80, floor: '#241d3a', floor2: '#1d1730', wall: '#120e1f', light: 0.44 }
  ];

  /* ---------------------------------------------------------
     Equipment chains.  Index 0 of each chain is free & owned.
     row = [name, stat, money, oreCosts, reqLevel]
     --------------------------------------------------------- */
  function chain(slot, statKey, icon, rows) {
    return {
      slot: slot, stat: statKey, icon: icon,
      tiers: rows.map(function (r, i) {
        return { tier: i, name: r[0], stat: r[1], money: r[2], ores: r[3] || {}, lvl: r[4] || 0, slot: slot };
      })
    };
  }

  D.GEAR = {
    pick: chain('pick', 'power', '⛏', [
      ['Wooden Pickaxe',    2,     0,        null, 0],
      ['Stone Pickaxe',     5,     90,       { stone: 15 }, 0],
      ['Copper Pickaxe',    11,    800,      { copper: 35, stone: 25 }, 3],
      ['Iron Pickaxe',      16,    4200,     { iron: 55, coal: 35 }, 6],
      ['Silver Pickaxe',    34,    22000,    { silver: 70, iron: 45 }, 10],
      ['Gold Pickaxe',      70,    120000,   { gold: 90, silver: 55 }, 15],
      ['Ruby Pickaxe',      150,   700000,   { ruby: 110, gold: 65 }, 21],
      ['Emerald Pickaxe',   320,   4.2e6,    { emerald: 130, ruby: 80 }, 28],
      ['Diamond Pickaxe',   700,   2.6e7,    { diamond: 150, emerald: 95 }, 36],
      ['Obsidian Pickaxe',  1500,  1.7e8,    { obsidian: 180, diamond: 115 }, 45],
      ['Void Pickaxe',      3400,  1.3e9,    { voidstone: 200, obsidian: 140 }, 55],
      ['Starforged Pickaxe',8000,  9.5e9,    { starcore: 120, voidstone: 220 }, 66]
    ]),

    bag: chain('bag', 'capacity', '\u{1F392}', [
      ['Cloth Satchel',       45,    0,       null, 0],
      ['Leather Pack',        95,    400,     { stone: 20, coal: 15 }, 0],
      ['Reinforced Pack',     200,   3000,    { iron: 30, copper: 25 }, 4],
      ["Miner's Rucksack",    380,   26000,   { silver: 40, iron: 35 }, 9],
      ['Crystal Cache',       900,   240000,  { ruby: 60, gold: 45 }, 17],
      ['Void Satchel',        2200,  2.4e6,   { emerald: 80, diamond: 40 }, 26],
      ['Dimensional Pack',    5500,  4.5e7,   { obsidian: 110, diamond: 90 }, 40],
      ['Singularity Pack',    14000, 2.2e9,   { voidstone: 160, starcore: 40 }, 58]
    ]),

    boots: chain('boots', 'speed', '\u{1F97E}', [
      ['Worn Boots',      3.3,  0,       null, 0],
      ['Leather Boots',   3.9,  900,     { coal: 25 }, 2],
      ['Iron Greaves',    4.6,  9000,    { iron: 40, stone: 40 }, 7],
      ['Silver Striders', 5.4,  95000,   { silver: 60, gold: 20 }, 13],
      ['Ruby Runners',    6.3,  1.1e6,   { ruby: 70, silver: 60 }, 22],
      ['Diamond Treads',  7.4,  1.8e7,   { diamond: 90, emerald: 70 }, 33],
      ['Void Walkers',    8.6,  9.0e8,   { voidstone: 120, obsidian: 100 }, 50]
    ]),

    gloves: chain('gloves', 'swing', '\u{1F9E4}', [
      ['Bare Hands',        1.00, 0,       null, 0],
      ['Work Gloves',       1.30, 1200,    { coal: 30, stone: 30 }, 2],
      ['Copper Gauntlets',  1.65, 12000,   { copper: 60, iron: 25 }, 6],
      ['Iron Gauntlets',    2.05, 140000,  { iron: 90, silver: 30 }, 12],
      ['Gold Gauntlets',    2.50, 1.6e6,   { gold: 100, ruby: 35 }, 20],
      ['Diamond Gauntlets', 3.05, 2.4e7,   { diamond: 110, emerald: 80 }, 31],
      ['Obsidian Grips',    3.70, 4.0e8,   { obsidian: 140, diamond: 100 }, 44],
      ['Void Grips',        4.50, 6.5e9,   { voidstone: 180, starcore: 60 }, 60]
    ]),

    charm: chain('charm', 'value', '✦', [
      ['Lucky Pebble',   1.00, 0,       null, 0],
      ['Copper Charm',   1.15, 6000,    { copper: 50 }, 5],
      ['Silver Locket',  1.35, 70000,   { silver: 55, coal: 60 }, 11],
      ['Gold Idol',      1.60, 900000,  { gold: 80, iron: 90 }, 19],
      ['Ruby Heart',     1.95, 1.4e7,   { ruby: 100, emerald: 50 }, 29],
      ['Diamond Prism',  2.40, 3.0e8,   { diamond: 130, obsidian: 60 }, 42],
      ['Void Sigil',     3.00, 5.5e9,   { voidstone: 150, obsidian: 130 }, 56],
      ['Star Relic',     3.80, 9.0e10,  { starcore: 180, voidstone: 200 }, 70]
    ]),

    lamp: chain('lamp', 'luck', '\u{1F526}', [
      ['Candle Stub',     0.00, 0,       null, 0],
      ['Oil Lantern',     0.08, 2500,    { coal: 40 }, 3],
      ['Iron Lamp',       0.18, 30000,   { iron: 50, coal: 80 }, 8],
      ['Crystal Lantern', 0.30, 420000,  { gold: 60, silver: 80 }, 16],
      ['Emerald Beacon',  0.45, 6.0e6,   { emerald: 90, ruby: 60 }, 25],
      ['Void Lantern',    0.65, 1.2e8,   { obsidian: 120, diamond: 80 }, 38],
      ['Starlight Halo',  0.90, 1.4e10,  { starcore: 90, voidstone: 140 }, 64]
    ])
  };
  D.GEAR_SLOTS = ['pick', 'bag', 'boots', 'gloves', 'charm', 'lamp'];

  /* ---------------------------------------------------------
     Buildings - placed on surface tiles
     --------------------------------------------------------- */
  D.BUILDINGS = [
    { id: 'hut',    name: "Miner's Hut", icon: '\u{1F3E0}', cost: 600,    growth: 1.62, power: 0,
      desc: 'Hires a miner that digs 0.35 ore/sec from your deepest unlocked layer.', rate: 0.35 },
    { id: 'store',  name: 'Warehouse',   icon: '\u{1F4E6}',  cost: 350,    growth: 1.55, power: 0,
      desc: 'Holds 400 ore outside your bag. Walk near it to drop off anything you have marked to keep.', capacity: 400 },
    { id: 'gen',    name: 'Generator',   icon: '⚡',     cost: 4500,   growth: 1.70, power: 30,
      desc: 'Burns coal dust to supply 30 power for your drills.' },
    { id: 'drill',  name: 'Auto Drill',  icon: '\u{1F6E2}',  cost: 9000,   growth: 1.74, power: -8,
      desc: 'Chews through rock for 1.5 ore/sec. Needs 8 power to run at full speed.', rate: 1.5 },
    { id: 'convey', name: 'Conveyor',    icon: '\u{1F501}',  cost: 20000,  growth: 1.80, power: -3,
      desc: 'Hauls 2.5 ore/sec straight to the market - no walking required.', rate: 2.5 },
    { id: 'smelt',  name: 'Smelter',     icon: '\u{1F525}',  cost: 90000,  growth: 1.88, power: -5,
      desc: 'Refines ore before sale: +10% sell value each.', bonus: 0.10 },
    { id: 'vault',  name: 'Vault',       icon: '\u{1F3E6}',  cost: 750000, growth: 1.95, power: 0,
      desc: 'Clever accounting. +7% money from every source.', bonus: 0.07 },
    { id: 'rig',    name: 'Deep Rig',    icon: '\u{1F3D7}',  cost: 2.5e7,  growth: 2.00, power: -25,
      desc: 'Industrial bore: 12 ore/sec, always from your deepest layer.', rate: 12 },
    { id: 'altar',  name: 'Void Altar',  icon: '\u{1F52E}',  cost: 4.0e9,  growth: 2.20, power: -15,
      desc: 'Hums with strange math. +8% prestige cores on rebirth.', bonus: 0.08 },

    /* ---- heavy digging equipment ---- */
    { id: 'dozer',  name: 'Bulldozer',   icon: '\u{1F69C}',  cost: 3200,   growth: 1.66, power: -4,
      desc: 'Shoves the rubble aside so fresh veins surface faster. Ore nodes respawn 8% quicker each.',
      respawn: 0.08 },
    { id: 'jack',   name: 'Jackhammer Crew', icon: '\u{1F528}', cost: 24000, growth: 1.78, power: -6,
      desc: 'A crew softens the rock ahead of you. +6% to your own mining power each.', playerPower: 0.06 },
    { id: 'excav',  name: 'Excavator',   icon: '\u{1F6A7}',  cost: 180000, growth: 1.86, power: -18,
      desc: 'Tracked digger with a six tonne bucket: 5 ore/sec from your deepest layer.', rate: 5 },
    { id: 'scanner',name: 'Ore Scanner', icon: '\u{1F4E1}',  cost: 1.4e6,  growth: 1.92, power: -10,
      desc: 'Sweeps the rock for the good stuff. +4% chance of rarer ore spawning each.', luck: 0.04 },
    { id: 'reactor',name: 'Reactor',     icon: '\u2622',     cost: 6.0e6,  growth: 1.90, power: 400,
      desc: 'One reactor replaces a field of generators: 400 power.' },
    { id: 'blast',  name: 'Blast Shed',  icon: '\u{1F9E8}',  cost: 3.5e7,  growth: 2.00, power: -12,
      desc: 'Controlled charges shatter the seams. +3% chance any node drops double ore each.',
      doubleOre: 0.03 },
    { id: 'borer',  name: 'Tunnel Borer',icon: '\u2699',     cost: 6.0e8,  growth: 2.05, power: -60,
      desc: 'A rotating cutterhead the width of the island: 60 ore/sec.', rate: 60 },
    { id: 'maglev', name: 'Mag Conveyor',icon: '\u{1F684}',  cost: 2.0e9,  growth: 2.05, power: -30,
      desc: 'Frictionless ore freight: ships 40 ore/sec to market.', rate: 40, ships: true },
    { id: 'refine', name: 'Refinery',    icon: '\u{1F3ED}',  cost: 9.0e9,  growth: 2.10, power: -40,
      desc: 'Cracks ore down to pure metal before it is weighed. +25% sell value each.', bonus: 0.25 }
  ];
  D.BUILD_BY_ID = {};
  D.BUILDINGS.forEach(function (b) { D.BUILD_BY_ID[b.id] = b; });

  /* ---------------------------------------------------------
     Island expansion
     --------------------------------------------------------- */
  D.expandCost = function (size) {
    return Math.floor(1200 * Math.pow(2.35, size - D.START_SIZE));
  };

  /* ---------------------------------------------------------
     Prestige
     --------------------------------------------------------- */
  D.REBIRTH_MIN = 2.5e6;
  D.coresFor = function (earned) {
    if (earned < D.REBIRTH_MIN) return 0;
    return Math.floor(6 * Math.pow(earned / D.REBIRTH_MIN, 0.55));
  };

  D.PERKS = [
    { id: 'golden',  name: 'Golden Touch',  icon: '\u{1F4B0}', cost: 3,  growth: 1.55, max: 40,
      desc: '+25% money from every sale.', per: '+25% money' },
    { id: 'muscle',  name: 'Strong Arms',   icon: '\u{1F4AA}', cost: 3,  growth: 1.55, max: 40,
      desc: '+20% mining power.', per: '+20% power' },
    { id: 'pockets', name: 'Deep Pockets',  icon: '\u{1F45C}', cost: 2,  growth: 1.48, max: 30,
      desc: '+40% carry capacity and +40% warehouse space.', per: '+40% capacity' },
    { id: 'swift',   name: 'Swift Feet',    icon: '\u{1F4A8}', cost: 4,  growth: 1.60, max: 12,
      desc: '+8% movement speed.', per: '+8% speed' },
    { id: 'hands',   name: 'Fast Hands',    icon: '\u{1F44F}', cost: 4,  growth: 1.55, max: 25,
      desc: '+10% swing speed.', per: '+10% swings' },
    { id: 'lucky',   name: "Prospector's Eye", icon: '\u{1F340}', cost: 5, growth: 1.62, max: 20,
      desc: '+6% chance for rarer ore to spawn.', per: '+6% rarity' },
    { id: 'magnet',  name: 'Ore Magnet',    icon: '\u{1F9F2}', cost: 5,  growth: 1.60, max: 20,
      desc: '+8% chance a node drops double ore.', per: '+8% double' },
    { id: 'scan',    name: 'Deep Scan',     icon: '\u{1F4E1}', cost: 3,  growth: 1.50, max: 20,
      desc: 'Nodes respawn 12% faster.', per: '+12% respawn' },
    { id: 'foreman', name: 'Foreman',       icon: '\u{1F477}', cost: 6,  growth: 1.70, max: 25,
      desc: '+20% output from every building.', per: '+20% buildings' },
    { id: 'offline', name: 'Night Shift',   icon: '\u{1F319}', cost: 4,  growth: 1.50, max: 10,
      desc: '+8% of full production while offline.', per: '+8% offline' },
    { id: 'start',   name: 'Head Start',    icon: '\u{1F680}', cost: 8,  growth: 2.00, max: 8,
      desc: 'Begin each rebirth with better gear and seed money.', per: '+1 starting tier' },
    { id: 'focus',   name: 'Core Focus',    icon: '⚛',    cost: 10, growth: 1.85, max: 20,
      desc: '+10% prestige cores earned on rebirth.', per: '+10% cores' }
  ];
  D.PERK_BY_ID = {};
  D.PERKS.forEach(function (p) { D.PERK_BY_ID[p.id] = p; });
  D.perkCost = function (perk, owned) {
    return Math.ceil(perk.cost * Math.pow(perk.growth, owned));
  };

  /* ---------------------------------------------------------
     Levelling
     --------------------------------------------------------- */
  D.xpForLevel = function (lvl) { return Math.floor(90 * Math.pow(1.24, lvl - 1)); };
  D.xpFromOre = function (ore) { return 1 + Math.pow(ore.value, 0.52); };

  /* ---------------------------------------------------------
     Achievements
     --------------------------------------------------------- */
  D.ACHIEVEMENTS = [
    { id: 'first',    name: 'First Swing',      desc: 'Mine your very first node.',            cores: 0, money: 100,   test: function (s) { return s.stats.nodes >= 1; } },
    { id: 'hundred',  name: 'Rock Hound',       desc: 'Break 100 nodes.',                      cores: 1, money: 2000,  test: function (s) { return s.stats.nodes >= 100; } },
    { id: 'thousand', name: 'Earth Shaker',     desc: 'Break 1,000 nodes.',                    cores: 3, money: 60000, test: function (s) { return s.stats.nodes >= 1000; } },
    { id: 'rich1',    name: 'Pocket Change',    desc: 'Earn $10,000 in one life.',             cores: 0, money: 1500,  test: function (s) { return s.lifeEarned >= 1e4; } },
    { id: 'rich2',    name: 'Sky Baron',        desc: 'Earn $1,000,000 in one life.',          cores: 2, money: 50000, test: function (s) { return s.lifeEarned >= 1e6; } },
    { id: 'rich3',    name: 'Cloud Tycoon',     desc: 'Earn $1,000,000,000 in one life.',      cores: 8, money: 1e7,   test: function (s) { return s.lifeEarned >= 1e9; } },
    { id: 'expand',   name: 'Room to Grow',     desc: 'Expand the island once.',               cores: 0, money: 800,   test: function (s) { return s.size > 6; } },
    { id: 'big',      name: 'Continental',      desc: 'Grow the island to 14 tiles wide.',     cores: 4, money: 5e5,   test: function (s) { return s.size >= 14; } },
    { id: 'deep1',    name: 'Spelunker',        desc: 'Unlock the Shallow Caves.',             cores: 1, money: 3000,  test: function (s) { return s.layersUnlocked >= 2; } },
    { id: 'deep2',    name: 'Void Touched',     desc: 'Unlock The Void.',                      cores: 10, money: 1e8,  test: function (s) { return s.layersUnlocked >= 6; } },
    { id: 'builder',  name: 'Foreman',          desc: 'Own 10 buildings at once.',             cores: 2, money: 40000, test: function (s) { return s.buildings.length >= 10; } },
    { id: 'factory',  name: 'Industrialist',    desc: 'Own 30 buildings at once.',             cores: 6, money: 4e6,   test: function (s) { return s.buildings.length >= 30; } },
    { id: 'gear',     name: 'Well Equipped',    desc: 'Reach the Gold Pickaxe.',               cores: 2, money: 25000, test: function (s) { return s.gear.pick >= 5; } },
    { id: 'gear2',    name: 'Legend of the Rock', desc: 'Forge the Starforged Pickaxe.',       cores: 20, money: 1e10, test: function (s) { return s.gear.pick >= 11; } },
    { id: 'lvl20',    name: 'Seasoned Miner',   desc: 'Reach mining level 20.',                cores: 2, money: 30000, test: function (s) { return s.level >= 20; } },
    { id: 'lvl50',    name: 'Master Miner',     desc: 'Reach mining level 50.',                cores: 8, money: 5e7,   test: function (s) { return s.level >= 50; } },
    { id: 'reb1',     name: 'Born Again',       desc: 'Rebirth for the first time.',           cores: 1, money: 0,     test: function (s) { return s.rebirths >= 1; } },
    { id: 'reb10',    name: 'Eternal Return',   desc: 'Rebirth 10 times.',                     cores: 15, money: 0,    test: function (s) { return s.rebirths >= 10; } },
    { id: 'ware',     name: 'Logistics',        desc: 'Build your first warehouse.',           cores: 0, money: 1200,  test: function (s) { return (s.buildings || []).some(function (b) { return b.id === 'store'; }); } },
    { id: 'jobs',     name: 'Guild Favourite',  desc: 'Complete 25 guild contracts.',          cores: 3, money: 2e5,  test: function (s) { return (s.contractsDone || 0) >= 25; } },
    { id: 'dozer',    name: 'Ground Crew',      desc: 'Build a bulldozer.',                    cores: 0, money: 5000,  test: function (s) { return D.ownsOf(s, 'dozer') >= 1; } },
    { id: 'jack',     name: 'Softened Up',      desc: 'Hire a jackhammer crew.',               cores: 1, money: 20000, test: function (s) { return D.ownsOf(s, 'jack') >= 1; } },
    { id: 'excav',    name: 'Heavy Plant',      desc: 'Put an excavator to work.',             cores: 2, money: 2e5,   test: function (s) { return D.ownsOf(s, 'excav') >= 1; } },
    { id: 'fleet',    name: 'Whole Fleet',      desc: 'Own 5 excavators at once.',             cores: 4, money: 2e6,   test: function (s) { return D.ownsOf(s, 'excav') >= 5; } },
    { id: 'reactor',  name: 'Going Nuclear',    desc: 'Power the island with a reactor.',      cores: 3, money: 1e6,   test: function (s) { return D.ownsOf(s, 'reactor') >= 1; } },
    { id: 'borer',    name: 'Straight Through', desc: 'Build a tunnel borer.',                 cores: 8, money: 1e8,   test: function (s) { return D.ownsOf(s, 'borer') >= 1; } },
    { id: 'blast',    name: 'Fire in the Hole', desc: 'Build a blast shed.',                   cores: 4, money: 1e7,   test: function (s) { return D.ownsOf(s, 'blast') >= 1; } },
    { id: 'every',    name: 'One of Everything',desc: 'Own at least one of every building.',   cores: 12, money: 5e8,  test: function (s) { return D.BUILDINGS.every(function (b) { return D.ownsOf(s, b.id) >= 1; }); } },
    { id: 'quest10',  name: 'Errand Runner',    desc: 'Finish 10 quests.',                     cores: 3, money: 1e5,   test: function (s) { return (s.quest || 0) >= 10; } },
    { id: 'quest20',  name: 'Quest Hunter',     desc: 'Finish 20 quests.',                     cores: 10, money: 1e7,  test: function (s) { return (s.quest || 0) >= 20; } },
    { id: 'questAll', name: 'Nothing Left',     desc: 'Finish every quest in the log.',        cores: 50, money: 1e9,  test: function (s) { return (s.quest || 0) >= D.QUESTS.length; } },
    { id: 'mile1',    name: 'Marked Progress',  desc: 'Complete 10 milestone tiers.',          cores: 3, money: 2e5,   test: function (s) { return D.MILESTONES.reduce(function (a, t) { return a + D.milestoneTier(t, s); }, 0) >= 10; } },
    { id: 'mile2',    name: 'Record Holder',    desc: 'Complete 30 milestone tiers.',          cores: 12, money: 5e7,  test: function (s) { return D.MILESTONES.reduce(function (a, t) { return a + D.milestoneTier(t, s); }, 0) >= 30; } },
    { id: 'mileAll',  name: 'Off the Charts',   desc: 'Complete every milestone tier.',        cores: 80, money: 1e10, test: function (s) { return D.MILESTONES.every(function (t) { return D.milestoneTier(t, s) >= t.tiers.length; }); } },
    { id: 'reb25',    name: 'Core Resonance',   desc: 'Reach 25 rebirths.',                    cores: 40, money: 0,    test: function (s) { return s.rebirths >= 25; } },
    { id: 'reb100',   name: 'Eternal Engine',   desc: 'Reach 100 rebirths.',                   cores: 250, money: 0,   test: function (s) { return s.rebirths >= 100; } },
    { id: 'power',    name: 'Grid Operator',    desc: 'Supply 1,000 power.',                   cores: 5, money: 5e6,   test: function (s) { var p = 0; s.buildings.forEach(function (b) { var d = D.BUILD_BY_ID[b.id]; if (d && d.power > 0) p += d.power; }); return p >= 1000; } },
    { id: 'hoard',    name: 'Full Sheds',       desc: 'Fill 10,000 ore of warehouse space.',   cores: 6, money: 1e7,   test: function (s) { var n = 0; for (var k in (s.store || {})) n += s.store[k]; return n >= 10000; } },
    { id: 'star',     name: 'Stardust',         desc: 'Mine a Star Core.',                     cores: 5, money: 1e6,   test: function (s) { return (s.stats.mined.starcore || 0) >= 1; } }
  ];

  /* ---------------------------------------------------------
     Quests - one long guided chain, carried across rebirths.
     prog(s) returns current progress, goal is the target.
     --------------------------------------------------------- */
  function rareMined(s) {
    var n = 0;
    for (var i = 6; i < D.ORES.length; i++) n += s.stats.mined[D.ORES[i].id] || 0;
    return n;
  }
  D.rareMined = rareMined;

  function ownsProducer(s) {
    var n = 0;
    for (var i = 0; i < s.buildings.length; i++) {
      var d = D.BUILD_BY_ID[s.buildings[i].id];
      if (d && d.rate && !d.ships && d.id !== 'convey') n++;
    }
    return n;
  }
  function ownsOf(s, id) {
    var n = 0;
    for (var i = 0; i < s.buildings.length; i++) if (s.buildings[i].id === id) n++;
    return n;
  }
  D.ownsOf = ownsOf;

  D.QUESTS = [
    { name: 'Break the Ground',  desc: 'Swing at the rock and break 10 ore nodes.',
      goal: 10,    prog: function (s) { return s.stats.nodes; },         money: 250 },
    { name: 'First Payday',      desc: 'Carry ore to the market pad and earn $1,000.',
      goal: 1000,  prog: function (s) { return s.stats.totalEarned; },   money: 400, xp: 40 },
    { name: 'A Better Pick',     desc: 'Craft the Stone Pickaxe at the workbench.',
      goal: 1,     prog: function (s) { return s.gear.pick; },           money: 700 },
    { name: 'Hired Help',        desc: 'Build anything at all - a hut is the cheapest start.',
      goal: 1,     prog: function (s) { return s.buildings.length; },    money: 1200 },
    { name: 'Somewhere to Put It', desc: 'Build a warehouse so ore stops overflowing.',
      goal: 1,     prog: function (s) { return ownsOf(s, 'store'); },    money: 2000 },
    { name: 'Down the Shaft',    desc: 'Unlock the Shallow Caves.',
      goal: 2,     prog: function (s) { return s.layersUnlocked; },      money: 4000, xp: 200 },
    { name: 'Room to Grow',      desc: 'Expand the island once.',
      goal: 7,     prog: function (s) { return s.size; },                money: 7000 },
    { name: 'Guild Standing',    desc: 'Complete 3 guild contracts.',
      goal: 3,     prog: function (s) { return s.contractsDone || 0; },  money: 12000, cores: 1 },
    { name: 'Keep the Lights On', desc: 'Own 3 generators so nothing runs at half speed.',
      goal: 3,     prog: function (s) { return ownsOf(s, 'gen'); },      money: 25000 },
    { name: 'Clear the Rubble',  desc: 'Build a bulldozer to speed up ore respawns.',
      goal: 1,     prog: function (s) { return ownsOf(s, 'dozer'); },    money: 40000 },
    { name: 'The Night Shift',   desc: 'Own 5 machines that dig for you.',
      goal: 5,     prog: function (s) { return ownsProducer(s); },       money: 90000, xp: 1200 },
    { name: 'Deeper Still',      desc: 'Unlock the Deep Caves.',
      goal: 3,     prog: function (s) { return s.layersUnlocked; },      money: 220000 },
    { name: 'Seasoned Miner',    desc: 'Reach mining level 20.',
      goal: 20,    prog: function (s) { return s.level; },               money: 450000, cores: 2 },
    { name: 'Heavy Equipment',   desc: 'Put an excavator on the island.',
      goal: 1,     prog: function (s) { return ownsOf(s, 'excav'); },    money: 1.2e6 },
    { name: 'Crystal Charter',   desc: 'Unlock the Crystal Depths.',
      goal: 4,     prog: function (s) { return s.layersUnlocked; },      money: 4e6, xp: 2e4 },
    { name: 'Seven Figures',     desc: 'Earn $5,000,000 in a single life.',
      goal: 5e6,   prog: function (s) { return s.lifeEarned; },          money: 6e6, cores: 3 },
    { name: 'Start Again',       desc: 'Rebirth for the first time.',
      goal: 1,     prog: function (s) { return s.rebirths; },            cores: 6 },
    { name: 'Second Wind',       desc: 'Earn $20,000,000 in a life after your first rebirth.',
      goal: 2e7,   prog: function (s) { return s.rebirths >= 1 ? s.lifeEarned : 0; }, cores: 10 },
    { name: 'Into the Magma',    desc: 'Unlock the Magma Core.',
      goal: 5,     prog: function (s) { return s.layersUnlocked; },      cores: 14 },
    { name: 'Industrialist',     desc: 'Have 40 buildings standing at once.',
      goal: 40,    prog: function (s) { return s.buildings.length; },    cores: 20 },
    { name: 'Continental',       desc: 'Grow the island to 14 tiles across.',
      goal: 14,    prog: function (s) { return s.size; },                cores: 28 },
    { name: 'Boring Company',    desc: 'Build a tunnel borer.',
      goal: 1,     prog: function (s) { return ownsOf(s, 'borer'); },    cores: 40 },
    { name: 'The Void Opens',    desc: 'Unlock The Void, the deepest layer there is.',
      goal: 6,     prog: function (s) { return s.layersUnlocked; },      cores: 60 },
    { name: 'Star Forged',       desc: 'Craft the Starforged Pickaxe.',
      goal: 11,    prog: function (s) { return s.gear.pick; },           cores: 120 },
    { name: 'Eternal Return',    desc: 'Rebirth 10 times.',
      goal: 10,    prog: function (s) { return s.rebirths; },            cores: 200 },
    { name: 'Ascendant',         desc: 'Earn one trillion dollars across all lives.',
      goal: 1e12,  prog: function (s) { return s.stats.totalEarned; },   cores: 500 }
  ];
  D.QUESTS.forEach(function (q, i) { q.index = i; });

  /* ---------------------------------------------------------
     Milestones - tiered counters that pay permanent bonuses.
     They read all-time stats, so they survive every rebirth.
     --------------------------------------------------------- */
  D.MILESTONES = [
    { id: 'dig',    name: 'Excavation',   icon: '\u26CF', unit: 'nodes broken',
      bonus: 'power', per: 0.03, label: '+3% mining power',
      stat: function (s) { return s.stats.nodes; },
      tiers: [50, 250, 1000, 5000, 20000, 75000, 250000, 1e6] },
    { id: 'trade',  name: 'Commerce',     icon: '\u{1F4B0}', unit: 'ore sold',
      bonus: 'value', per: 0.03, label: '+3% sell value',
      stat: function (s) { return s.stats.sold; },
      tiers: [100, 500, 2500, 12000, 60000, 300000, 1.5e6, 8e6] },
    { id: 'wealth', name: 'Fortune',      icon: '\u{1F48E}', unit: 'earned all time', money: true,
      bonus: 'money', per: 0.02, label: '+2% money',
      stat: function (s) { return s.stats.totalEarned; },
      tiers: [1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15, 1e18] },
    { id: 'grind',  name: 'Endurance',    icon: '\u{1F4AA}', unit: 'pickaxe swings',
      bonus: 'swing', per: 0.03, label: '+3% swing speed',
      stat: function (s) { return s.stats.swings; },
      tiers: [200, 1000, 5000, 25000, 1e5, 5e5, 2e6, 1e7] },
    { id: 'build',  name: 'Construction', icon: '\u{1F3D7}', unit: 'machines built',
      bonus: 'buildMult', per: 0.04, label: '+4% building output',
      stat: function (s) { return s.stats.built || 0; },
      tiers: [5, 15, 40, 100, 250, 600, 1500, 4000] },
    { id: 'rare',   name: 'Prospecting',  icon: '\u{1F340}', unit: 'rare ore mined',
      bonus: 'luck', per: 0.04, label: '+4% rare ore chance',
      stat: rareMined,
      tiers: [10, 50, 250, 1200, 6000, 30000, 150000, 750000] },
    { id: 'jobs',   name: 'Diligence',    icon: '\u{1F4CB}', unit: 'contracts filled',
      bonus: 'contract', per: 0.05, label: '+5% contract pay',
      stat: function (s) { return s.contractsDone || 0; },
      tiers: [5, 20, 60, 150, 400, 1000, 2500, 6000] }
  ];

  /* how many tiers of a track are complete */
  D.milestoneTier = function (track, state) {
    var v = track.stat(state), n = 0;
    for (var i = 0; i < track.tiers.length; i++) if (v >= track.tiers[i]) n++;
    return n;
  };

  /* ---------------------------------------------------------
     Rebirth milestones - permanent unlocks keyed to rebirth count
     --------------------------------------------------------- */
  D.REBIRTH_MILESTONES = [
    { at: 1,   name: 'First Return',      desc: '+10% money from every source.',      money: 0.10 },
    { at: 2,   name: 'Muscle Memory',     desc: '+15% mining power.',                 power: 0.15 },
    { at: 3,   name: 'Seed Capital',      desc: 'Start every life with $25,000.',     startMoney: 25000 },
    { at: 5,   name: 'Known Tunnels',     desc: 'Start with the Shallow Caves open.', layers: 2 },
    { at: 8,   name: 'Standing Crew',     desc: '+30% output from every building.',   build: 0.30 },
    { at: 12,  name: 'Wider Foundations', desc: 'The island starts 2 tiles wider.',   size: 2 },
    { at: 18,  name: 'Deep Roots',        desc: 'Start with the Deep Caves open.',    layers: 3 },
    { at: 25,  name: 'Core Resonance',    desc: '+50% prestige cores on rebirth.',    cores: 0.50 },
    { at: 35,  name: 'Prefab Camp',       desc: 'Start with a warehouse, a hut and a generator already built.',
      startBuildings: ['store', 'hut', 'gen'] },
    { at: 50,  name: 'Crystal Charter',   desc: 'Start with the Crystal Depths open.', layers: 4 },
    { at: 75,  name: 'Titan',             desc: '+150% mining power.',                power: 1.50 },
    { at: 100, name: 'Eternal Engine',    desc: 'Double every prestige core you earn.', cores: 1.00 }
  ];

  /* ---------------------------------------------------------
     Contracts - repeatable delivery jobs from the sky guild
     --------------------------------------------------------- */
  D.CONTRACT_SLOTS = 3;
  D.CONTRACT_MULT = 3.2;          /* pays this much over the raw sale price */

  D.rollContract = function (state) {
    var layer = Math.floor(Math.random() * state.layersUnlocked);
    var ore = null, guard = 0;
    while (!ore && guard++ < 20) {
      ore = (function () {
        var total = 0, i;
        for (i = 0; i < D.ORES.length; i++) total += D.ORES[i].w[layer] || 0;
        if (total <= 0) return null;
        var r = Math.random() * total;
        for (i = 0; i < D.ORES.length; i++) {
          r -= D.ORES[i].w[layer] || 0;
          if (r <= 0) return D.ORES[i];
        }
        return D.ORES[0];
      })();
      if (!ore) layer = Math.max(0, layer - 1);
    }
    ore = ore || D.ORE_BY_ID.stone;
    var need = Math.round((18 + state.level * 2.2) / (1 + ore.index * 0.55));
    need = Math.max(5, Math.min(400, need));
    return { ore: ore.id, need: need, id: Math.random().toString(36).slice(2, 9) };
  };

  D.contractReward = function (c) {
    var ore = D.ORE_BY_ID[c.ore];
    return { xp: D.xpFromOre(ore) * c.need * 0.8 };
  };

  /* ---------------------------------------------------------
     Tips shown in the context hint bar
     --------------------------------------------------------- */
  D.TIPS = [
    'Stand on the glowing market pad to sell everything you are carrying.',
    'Buildings keep producing while the game is closed - come back to a full stash.',
    'Deeper layers have tougher rock but far richer ore.',
    'Buy Generators before Drills, or the drills run at half speed.',
    'Rebirth resets your island but Prestige Cores are forever.',
    'Craft a bigger bag before a deeper layer - you will fill it fast.',
    'The lantern raises the chance that rare ore spawns anywhere you dig.',
    'Press E on the mineshaft to ride down, Q to come back up.',
    'Guild contracts pay roughly triple the market rate - check the Jobs board.',
    'A warehouse keeps crafting ore safe from auto-selling. Walk past it to drop off.'
  ];

  root.D = D;
})(window);
