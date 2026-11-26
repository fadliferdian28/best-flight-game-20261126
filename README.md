# Ridgeline Run

A low-poly flight game for desktop Chrome: three sorties over one procedural
mountain valley, a river, and a gravel strip. Keyboard and mouse, no build step,
no network requests — everything it loads is a file under `game/`.

[![bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/fadliferdian28/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/fadliferdian28/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

Bounty: <https://make.fun/bounty/best-flight-game-20261126-0057> · ref `effxtzzc`

## Play it

```
node serve.ts            # static server for game/, http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html`. Nothing is
fetched at runtime; Three.js is vendored as `game/vendor/three.min.js`.

## Missions

- **Ring Run** — twelve glowing gates down the river valley. Centred passes and
  clean streaks score more; every gate tops up the tank.
- **Canyon Dash** — eight low gates with no room to climb. Gate speed pays a
  bonus on top of the line you fly.
- **Valley Landing** — follow three beacons, then set the aircraft down on the
  strip. Soft, centred touchdowns pay a landing bonus and refuel.

## Controls

| Input | Action |
| --- | --- |
| `W` `S` / `↑` `↓` | Pitch down / up |
| `A` `D` / `←` `→` | Roll left / right — bank turns the aircraft |
| `Shift` / `Ctrl` (or `Z`) | Throttle up / down |
| `Space` | Wheel brake on the ground |
| `P` / `Esc` | Pause |
| `R` | Restart the sortie |
| `1` `2` `3` | Pick a mission |
| `M` | Mute |

## Layout

```
game/index.html        page shell, HUD markup, title screen
game/src/main.js       boot, state machine, game loop
game/src/flight.js     flight model: thrust, drag, bank turn, stall, contact
game/src/terrain.js    procedural heightfield, river, runway, trees, boulders
game/src/rings.js      missions, gates, pass detection, scoring
game/src/hud.js        compass, tapes, warnings, overlays
game/src/camera.js     lagging, bank-following chase camera
game/src/aircraft.js   the aircraft mesh, propeller, cloud puffs
game/src/scenery.js    sky shader, sun, fog, drifting clouds
game/src/audio.js      procedural engine, wind, gate chime, crash
game/src/input.js      keyboard state and one-shot actions
game/src/shots.js      ?shot= staging for the screenshots
main.ts                publishes game/ + screenshots/ and writes dossier.json
```

Terrain is seeded (`game/src/rng.js`), so the same valley rebuilds every run.

## Screenshots

`screenshots/1-cover.jpg`, `screenshots/2-runway.jpg`, `screenshots/3-ring.jpg`
are real renders of the game, staged with `?shot=cover|runway|ring`.

## Hand in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with `vendor/makefun-game.ts`. Deterministic: two runs produce
identical bytes.

MIT licensed — see `LICENSE`.
