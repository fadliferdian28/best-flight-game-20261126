// HUD layer: builds the compass and tape ladders once, then writes live flight
// values into the DOM every frame. Kept free of simulation logic.

const TAPE_SPACING = 2.6;
const COMPASS_SPACING = 2.3;

function el(id) {
  return document.getElementById(id);
}

function buildCompassStrip() {
  const strip = el('compass-strip');
  strip.style.width = `${360 * COMPASS_SPACING}px`;
  const cardinals = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let deg = 0; deg < 360; deg += 5) {
    const tick = document.createElement('div');
    const major = deg % 30 === 0;
    tick.className = `compass-tick${major ? ' major' : ''}`;
    tick.style.left = `${deg * COMPASS_SPACING}px`;
    strip.appendChild(tick);
    if (major) {
      const label = document.createElement('div');
      const cardinal = cardinals[deg];
      label.className = `compass-label${cardinal ? ' cardinal' : ''}`;
      label.textContent = cardinal ?? String(deg).padStart(3, '0');
      label.style.left = `${deg * COMPASS_SPACING}px`;
      strip.appendChild(label);
    }
  }
}

function buildTape(stripId, min, max, step, majorEvery) {
  const strip = el(stripId);
  strip.style.height = `${(max - min) * TAPE_SPACING}px`;
  for (let v = min; v <= max; v += step) {
    const major = v % majorEvery === 0;
    const tick = document.createElement('div');
    tick.className = `tape-tick${major ? ' major' : ''}`;
    tick.style.top = `${(max - v) * TAPE_SPACING}px`;
    strip.appendChild(tick);
    if (major) {
      const num = document.createElement('div');
      num.className = 'tape-num';
      num.textContent = String(v);
      num.style.top = `${(max - v) * TAPE_SPACING}px`;
      strip.appendChild(num);
    }
  }
}

function setBar(fillId, pct, lowAt) {
  const fill = el(fillId);
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (lowAt !== undefined) fill.classList.toggle('low', pct <= lowAt);
}

export class Hud {
  constructor() {
    this.root = el('hud');
    buildCompassStrip();
    buildTape('speed-strip', 0, 160, 5, 20);
    buildTape('alt-strip', 0, 1200, 20, 100);
    this.cache = {};
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  setMission(mission) {
    el('mission-name').textContent = mission.def.name;
    el('mission-goal').textContent = mission.def.goal;
    this.mission = mission;
  }

  write(key, id, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    const node = el(id);
    if (node) node.textContent = value;
  }

  style(key, node, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (node) node.style[prop] = value;
  }

  update(flight, mission, dt) {
    const speed = Math.round(flight.speed * 1.94);
    const alt = Math.round(flight.position.y);
    const heading = flight.heading();

    this.write('speed', 'speed-box', String(speed));
    this.write('alt', 'alt-box', String(alt));
    this.write('heading', 'heading-readout', `${String(Math.round(heading) % 360).padStart(3, '0')}°`);
    this.write('vs', 'vs-value', (flight.verticalSpeed >= 0 ? '+' : '') + flight.verticalSpeed.toFixed(1));

    const speedStrip = el('speed-strip');
    this.style('speedPos', speedStrip, 'transform', `translateY(${((160 - flight.speed * 1.94) * TAPE_SPACING - 0) + 125}px)`);
    const altStrip = el('alt-strip');
    this.style('altPos', altStrip, 'transform', `translateY(${(1200 - Math.min(1190, Math.max(0, alt))) * TAPE_SPACING + 125}px)`);

    const compassStrip = el('compass-strip');
    const hx = heading * COMPASS_SPACING;
    this.style('compassPos', compassStrip, 'transform', `translateX(${-hx + 230 - 360 * COMPASS_SPACING}px)`);

    this.style('fpmX', el('fpm'), 'left', `${Math.max(-160, Math.min(160, (flight.roll / Math.PI) * 190))}px`);
    this.style('fpmY', el('fpm'), 'top', `${Math.max(-90, Math.min(90, -flight.verticalSpeed * 2.2))}px`);
    this.style('bankRot', el('bank-pointer'), 'transform', `rotate(${(flight.roll * 180) / Math.PI * 0.55}deg)`);

    setBar('throttle-fill', flight.throttle * 100);
    this.write('throttlePct', 'throttle-pct', `${Math.round(flight.throttle * 100)}%`);
    setBar('fuel-fill', flight.fuel * 100, 18);
    this.write('fuelPct', 'fuel-pct', `${Math.round(flight.fuel * 100)}%`);

    const ringsTotal = mission.rings.length;
    this.write('rings', 'ring-count', `${mission.passed} / ${ringsTotal}`);
    this.style('ringFill', el('ring-fill'), 'width', `${(mission.passed / ringsTotal) * 100}%`);
    this.write('score', 'score', String(mission.score));

    const t = Math.floor(mission.elapsed);
    this.write('clock', 'mission-clock', `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);

    const dist = mission.distanceToTarget(flight.position);
    this.write('ringDist', 'ring-distance', dist === null ? 'RUNWAY' : `${Math.round(dist)} m`);

    const low = el('low-warning');
    const stall = el('stall-warning');
    const clearance = flight.position.y - (mission.terrain ? 0 : 0);
    void clearance;
    low.classList.toggle('hidden', flight.warning !== 'PULL UP');
    stall.classList.toggle('hidden', flight.warning !== 'STALL' && flight.warning !== 'LOW FUEL');

    if (mission.id === 'landing' && mission.next >= mission.rings.length) {
      const rw = mission.def.landingTarget;
      if (rw) {
        const dx = flight.position.x - rw.x;
        const dz = flight.position.z - rw.z;
        this.write('ringDist', 'ring-distance', `${Math.round(Math.hypot(dx, dz))} m RWY`);
      }
    }
    void dt;
  }
}

export function showTitle() {
  el('title').classList.remove('hidden');
}

export function hideTitle() {
  el('title').classList.add('hidden');
}

export function showOverlay({ kicker, title, body, hint }) {
  el('overlay-kicker').textContent = kicker;
  el('overlay-title').textContent = title;
  el('overlay-body').innerHTML = body;
  el('overlay-hint').innerHTML = hint;
  el('overlay').classList.remove('hidden');
}

export function hideOverlay() {
  el('overlay').classList.add('hidden');
}

export function fade(on) {
  el('fade').classList.toggle('on', on);
}
