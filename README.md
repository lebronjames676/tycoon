# Sky Shard Tycoon

A floating-island mining tycoon that runs entirely in the browser. No build step,
no dependencies, no assets — the whole world is drawn with `fillRect` into a
low-resolution buffer that is scaled up with nearest-neighbour filtering, so it
comes out as honest chunky pixel art.

You start alone on a six-by-six shard of rock hanging in a pale blue sky. You
swing a wooden pickaxe at boulders, carry the ore to a market stall, and slowly
turn that into machines, a bigger island, caves beneath it, and eventually a
reason to blow the whole thing up and start again richer.

![the island](docs/screenshot.png)

## Play

Open `index.html` in any modern browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Progress saves to `localStorage` every 15 seconds and whenever the tab closes.
The Field Manual panel can export the save as a string and paste one back in.

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` or the arrow keys |
| Swing the pickaxe | hold `SPACE` (auto-swing is on by default) |
| Walk somewhere | click a tile |
| Ride the mineshaft down / up | `E` / `Q` |
| Place or demolish a building | click / right-click in build mode |
| Zoom | `+` `-` or the scroll wheel |
| Panels | `I` bag, `C` craft, `B` build, `X` island, `V` depths, `J` jobs, `R` rebirth, `T` records, `?` help |
| Mute | `M` |
| Close a panel | `ESC` |

On phones and tablets a D-pad, a MINE button and a USE button appear
automatically.

## The loop

1. **Mine.** Stand next to a boulder and swing. Ore goes into your bag, which has
   a hard capacity.
2. **Sell.** Walk onto the golden market pad to cash out at full price. Selling
   from the field costs a 25% courier fee until you own a conveyor.
3. **Craft.** Six independent upgrade chains — pickaxe, bag, boots, gloves, charm
   and lantern — each cost ore from your bag plus cash, and each gates behind a
   mining level.
4. **Build.** Eight machines work around the clock, including while the game is
   closed. Miner's huts and drills dig, generators power the drills, conveyors
   ship ore to market, smelters and vaults raise the price, and the void altar
   bends prestige maths in your favour.
5. **Expand.** A wider island carries more ore veins on every layer and more room
   for machines, up to 20×20.
6. **Dig deeper.** Six layers, from the Surface down to The Void. Each multiplies
   both rock toughness and ore value, and your buildings always work the deepest
   layer you have unlocked.
7. **Take contracts.** The sky guild posts three delivery jobs at a time that pay
   roughly triple the market rate plus a lump of experience.
8. **Rebirth.** Once a life has earned enough, trade the island, the money, the
   gear and the machines for Prestige Cores. Cores are permanent (+3% money and
   +1% mining power each) and buy twelve stacking perks.

## Mechanics in the box

- Twelve ores from Stone to Star Core, each with its own spawn weights per depth
- Node health, cracking, damage numbers and respawn timers
- Mining levels and experience, feeding power and movement speed
- Carry capacity with overflow auto-selling so idle progress never fully stalls
- A power grid: drills run at reduced efficiency when generators cannot keep up
- Offline production with a configurable rate and an eight-hour cap
- Twenty achievements paying out cash and cores
- Repeatable guild contracts with a reroll cost
- Twelve prestige perks including Head Start, which seeds the next run with gear
- Save export/import, zoom, mute, mobile controls

## Layout

```
index.html        markup, HUD and panel shell
css/style.css     the whole skin
js/util.js        formatting, seeded RNG, storage, colour helpers
js/data.js        every tunable number: ores, layers, gear, buildings, perks
js/state.js       the save object, derived stats, crafting, prestige
js/world.js       island geometry, ore nodes, building placement
js/sprites.js     bitmap font and hand-rolled pixel sprites
js/render.js      isometric renderer, island strata, caves, effects
js/player.js      walking, swinging, selling
js/economy.js     building production, auto-selling, offline catch-up
js/ui.js          HUD, panels, toasts
js/game.js        boot, input, main loop, audio
```

Balance lives almost entirely in `js/data.js` — ore values, layer multipliers,
recipe costs, building rates and perk scaling are all plain data.
