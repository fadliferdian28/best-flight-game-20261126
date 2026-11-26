// Boot and game loop for Ridgeline Run. Builds the renderer and world, owns the
// state machine (title, flying, paused, crashed, landed, complete), wires the
// flight model to the mission, camera, HUD and audio, and stages screenshot
// states when the page is opened with ?shot=.

import { buildTerrain, WORLD } from './terrain.js';
import { buildAircraft, buildShadow } from './aircraft.js';
import { buildSky, buildClouds } from './scenery.js';
import { FlightModel } from './flight.js';
import { Mission, MISSION_DEFS } from './rings.js';
import { Hud, showTitle, hideTitle, showOverlay, hideOverlay } from './hud.js';
import { EngineAudio } from './audio.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { stageShot, shotRequest } from './shots.js';
import { valleyCenter, terrainHeight } from './terrain.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.6, 6000);

const terrain = buildTerrain(scene);
const sky = buildSky(scene);
const clouds = buildClouds(scene);
const aircraft = buildAircraft();
scene.add(aircraft.root);
const shadow = buildShadow();
scene.add(shadow);

const flight = new FlightModel();
const chase = new ChaseCamera(camera);
const input = new Input();
const hud = new Hud();
const audio = new EngineAudio();

const state = {
  mode: 'title',
  missionId: 'ringrun',
  mission: null,
  time: 0,
  cinematicT: 0,
  toast: 0,
  shotMode: shotRequest(),
  prevPos: new THREE.Vector3(),
  lastTouchdown: 0,
  clock: 0,
};

function createMission(id) {
  if (state.mission) state.mission.dispose();
  state.mission = new Mission(id, scene);
  state.mission.terrain = terrain;
  state.mission.def.landingTarget = WORLD.runway;
  state.missionId = id;
  hud.setMission(state.mission);
  return state.mission;
}

function resetFlight(spawn) {
  flight.reset(spawn);
  flight.pitchRate = 0;
  flight.rollRate = 0;
  flight.touchAndGo = false;
  flight.landingMode = 'rollout';
  flight.prevPos = flight.position.clone();
}

function startMission(id) {
  state.missionId = id;
  const mission = createMission(id);
  const def = mission.def;
  resetFlight({
    x: def.start.x,
    y: def.start.y,
    z: def.start.z,
    yaw: 0,
    speed: def.start.speed,
    fuel: def.start.fuel,
    throttle: 0.78,
  });
  mission.setVisualTarget();
  chase.reset(flight);
  hud.show();
  hideTitle();
  hideOverlay();
  state.mode = 'flying';
  state.clock = 0;
  audio.start();
  audio.chime(660, 0.18, 0.12);
}

function restart() {
  startMission(state.missionId);
}

function togglePause() {
  if (state.mode === 'flying') {
    state.mode = 'paused';
    showOverlay({
      kicker: 'PAUSED',
      title: 'HOLDING',
      body: `<div>${state.mission.def.name}</div><div>Score <span class="stat">${state.mission.score}</span> &middot; Gates <span class="stat">${state.mission.passed}</span></div>`,
      hint: 'Press <b>P</b> to resume &middot; <b>R</b> to restart',
    });
  } else if (state.mode === 'paused') {
    state.mode = 'flying';
    hideOverlay();
  }
}

const CRASH_TEXT = {
  terrain: ['CRASH', 'TERRAIN IMPACT', 'You flew into the ridge. The valley does not forgive a low wingtip.'],
  impact: ['CRASH', 'IMPACT', 'The aircraft hit the ground at flying speed.'],
  'hard-landing': ['CRASH', 'HARD LANDING', 'You reached the strip, but the sink rate broke the gear.'],
  overrun: ['CRASH', 'RUNWAY OVERRUN', 'You ran off the end of the strip.'],
  fuel: ['CRASH', 'FLAMEOUT', 'The tank ran dry and the prop stopped turning.'],
};

function crash(reason) {
  if (state.mode !== 'flying') return;
  state.mode = 'crashed';
  audio.crash();
  chase.kick(1.4);
  const [kicker, title, body] = CRASH_TEXT[reason] ?? CRASH_TEXT.impact;
  showOverlay({
    kicker,
    title,
    body: `<div>${body}</div><div style="margin-top:10px">Gates <span class="stat">${state.mission.passed}</span> &middot; Score <span class="stat">${state.mission.score}</span></div>`,
    hint: 'Press <b>R</b> to fly again',
  });
}

function completeMission(kind) {
  if (state.mode !== 'flying') return;
  state.mode = kind === 'landed' ? 'landed' : 'complete';
  audio.chime(880, 0.5, 0.2);
  const m = state.mission;
  if (kind === 'landed') {
    const bonus = m.completeLanding(state.lastTouchdown, Math.abs(flight.position.x - WORLD.runway.x));
    showOverlay({
      kicker: 'WHEELS DOWN',
      title: 'ON THE STRIP',
      body: `<div>Landing bonus <span class="stat">+${bonus}</span> &middot; Fuel topped up</div><div style="margin-top:8px">Final score <span class="stat">${m.score}</span></div>`,
      hint: 'Press <b>R</b> to fly the sortie again',
    });
  } else {
    const speedLine = m.id === 'canyon' ? `<div>Best gate speed <span class="stat">${Math.round(m.bestSpeed * 1.94)} KIAS</span></div>` : '';
    showOverlay({
      kicker: 'SORTIE COMPLETE',
      title: 'ALL GATES CLEAR',
      body: `<div>Score <span class="stat">${m.score}</span> &middot; Gates <span class="stat">${m.passed}</span> &middot; Missed <span class="stat">${m.missed}</span></div>${speedLine}<div style="margin-top:8px">Time <span class="stat">${formatTime(m.elapsed)}</span></div>`,
      hint: 'Press <b>R</b> to fly again &middot; <b>1&ndash;3</b> for another sortie',
    });
  }
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function handleEvents() {
  const events = input.drain();
  for (const ev of events) {
    if (ev.type === 'mute') {
      audio.setMuted(!audio.muted);
      continue;
    }
    if (ev.type === 'mission') {
      if (state.mode === 'title' || state.mode === 'complete' || state.mode === 'crashed' || state.mode === 'landed') {
        selectMission(ev.id);
        startMission(ev.id);
      }
      continue;
    }
    if (ev.type === 'confirm') {
      if (state.mode === 'title') startMission(state.missionId);
      else if (state.mode === 'crashed' || state.mode === 'complete' || state.mode === 'landed') restart();
      continue;
    }
    if (ev.type === 'pause') {
      togglePause();
      continue;
    }
    if (ev.type === 'restart') {
      if (state.mode === 'title') startMission(state.missionId);
      else restart();
    }
  }
}

function selectMission(id) {
  state.missionId = id;
  document.querySelectorAll('.mission-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.mission === id);
  });
}

function stepFlight(dt) {
  const m = state.mission;
  state.prevPos.copy(flight.position);

  const wasStopped = flight.stopped;
  flight.update(dt, input.snapshot(), terrain);

  if (flight.touchAndGo) {
    flight.touchAndGo = false;
    m.score += 150;
    flight.fuel = Math.min(1, flight.fuel + 0.5);
    audio.chime(720, 0.28, 0.18);
    chase.kick(0.5);
  }

  if (flight.crashed) {
    crash(flight.crashReason);
    return;
  }

  const pass = m.checkPass(state.prevPos, flight.position, flight.speed);
  if (pass) {
    if (pass.hit) {
      const points = m.registerPass(pass);
      flight.applyRingRefuel(0.2);
      audio.chime(760 + m.combo * 60, 0.22, 0.2);
      chase.kick(0.25);
      state.toast = 1.1;
      void points;
      if (m.finished) {
        completeMission('complete');
        return;
      }
    } else {
      m.registerMiss();
      audio.chime(240, 0.2, 0.1);
    }
    m.setVisualTarget();
  }

  if (m.id === 'landing' && m.next >= m.rings.length && !m.finished) {
    if (flight.landed) {
      state.lastTouchdown = flight.landingQuality;
      flight.landingMode = 'rollout';
    }
    if (flight.stopped) {
      completeMission('landed');
      return;
    }
  }

  if (flight.fuel <= 0 && !flight.crashed && flight.speed < 26) {
    crash('fuel');
    return;
  }

  m.update(dt, state.clock);
  state.clock += dt;

  chase.update(dt, flight, { bankFollow: 0.36, fov: m.id === 'canyon' ? 64 : 60 });
  aircraft.root.position.copy(flight.position);
  aircraft.root.quaternion.copy(flight.quaternion);
  aircraft.prop.rotation.z += dt * (4 + flight.throttle * 46);

  const groundY = terrain.heightAt(flight.position.x, flight.position.z);
  shadow.position.set(flight.position.x, groundY + 0.35, flight.position.z);
  const agl = Math.max(1, flight.position.y - groundY);
  shadow.material.opacity = Math.max(0, 0.34 - agl / 420);
  shadow.scale.setScalar(Math.max(0.45, 1 + agl / 90));
  shadow.visible = agl < 220;

  hud.update(flight, m, dt);
  audio.update(flight.throttle, flight.speed, !flight.crashed);
  audio.stallHorn(flight.stalled && !flight.crashed);
  void wasStopped;
}

function stepTitle(dt) {
  state.cinematicT += dt;
  const t = state.cinematicT;
  const z = 840 - (t * 26) % 2200;
  const x = valleyCenter(z) + 46 * Math.sin(z * 0.0031) + 12 * Math.sin(t * 0.3);
  const y = terrainHeight(x, z) + 128 + 14 * Math.sin(t * 0.22);
  const aheadZ = z - 90;
  const aheadX = valleyCenter(aheadZ) + 46 * Math.sin(aheadZ * 0.0031) + 12 * Math.sin(t * 0.3 + 0.06);
  const aheadY = terrainHeight(aheadX, aheadZ) + 128 + 14 * Math.sin(t * 0.22 + 0.05);
  flight.position.set(x, y, z);
  const yaw = Math.atan2(-(aheadX - x), -(aheadZ - z));
  flight.yaw = yaw;
  flight.pitch = Math.atan2(aheadY - y, Math.hypot(aheadX - x, aheadZ - z)) * 0.8;
  flight.roll = Math.sin(t * 0.37) * 0.22;
  flight.speed = 62;
  flight.velocity.set(-Math.sin(yaw) * 62, 0, -Math.cos(yaw) * 62);
  flight.syncOrientation();

  aircraft.root.position.copy(flight.position);
  aircraft.root.quaternion.copy(flight.quaternion);
  aircraft.prop.rotation.z += dt * 42;

  chase.update(dt, flight, { bankFollow: 0.3, fov: 58 });
  shadow.visible = false;
  hud.update(flight, state.mission, dt);
  audio.update(0.62, 62, true);
}

function stepShot() {
  stageShot(state.shotMode, {
    scene,
    camera,
    chase,
    flight,
    mission: state.mission,
    hud,
    aircraft,
    shadow,
    terrain,
    state,
  });
  state.mode = 'shot';
}

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (state.mode === 'shot') {
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  handleEvents();
  if (state.mode === 'title') stepTitle(dt);
  else if (state.mode === 'flying') stepFlight(dt);
  else if (state.mode === 'paused') {
    hud.update(flight, state.mission, dt);
  }

  clouds.update(state.mode === 'paused' ? 0 : dt);
  sky.sun.position.set(flight.position.x - 620, 720, flight.position.z - 900);
  sky.sun.target.position.copy(flight.position);
  sky.dome.position.copy(camera.position);

  if (state.mode === 'crashed') {
    aircraft.root.position.copy(flight.position);
    aircraft.root.quaternion.copy(flight.quaternion);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---- boot ----
const shot = state.shotMode;
createMission(shot === 'runway' ? 'landing' : 'ringrun');
state.mission.setVisualTarget();

if (shot) {
  hud.show();
  hideTitle();
  stepShot();
  hud.update(flight, state.mission, 0);
  renderer.render(scene, camera);
} else {
  resetFlight({ x: 0, y: 200, z: 760, speed: 62, fuel: 1 });
  chase.reset(flight);
  hud.hide();
  showTitle();
  const startBtn = document.getElementById('start-button');
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startMission(state.missionId);
  });
  document.getElementById('title').addEventListener('click', (e) => {
    if (e.target.closest('.mission-card')) return;
    startMission(state.missionId);
  });
  document.querySelectorAll('.mission-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMission(card.dataset.mission);
      audio.start();
      audio.chime(600, 0.12, 0.1);
    });
  });
}

requestAnimationFrame(frame);

// Expose a tiny debug surface for automated screenshot checks.
window.__ridgeline = {
  state,
  flight,
  mission: () => state.mission,
  MISSION_DEFS,
  terrainHeight,
  renderer,
  scene,
  camera,
};
