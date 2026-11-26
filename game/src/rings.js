// Missions and their gates. Three sorties share one valley: Ring Run threads
// twelve glowing hoops, Canyon Dash drops them low for a speed bonus, and Valley
// Landing guides the pilot onto the gravel strip with three beacons.
// This file also owns scoring, fuel top-ups and pass detection.

import { valleyCenter, terrainHeight, WORLD } from './terrain.js';

const CYAN = 0x67e8d5;
const AMBER = 0xffc14d;
const VIOLET = 0xb98bff;

function ringYaw(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function makeRingMesh(radius, color) {
  const group = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 1.05, 6, 30),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.5,
      roughness: 0.35,
      metalness: 0.3,
      flatShading: true,
    }),
  );
  group.add(torus);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 3.1, 4, 30),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(halo);

  const film = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 1.2, 26),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  group.add(film);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lampGeo = new THREE.SphereGeometry(0.85, 5, 4);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    group.add(lamp);
  }

  group.userData.torus = torus;
  group.userData.halo = halo;
  group.userData.film = film;
  group.userData.radius = radius;
  group.userData.baseColor = new THREE.Color(color);
  return group;
}

function groundClearance(x, z, clearance) {
  return terrainHeight(x, z) + clearance;
}

const RINGRUN_OFFSETS = [12, -26, 34, -14, 40, -36, 8, 30, -22, 18, -30, 4];
const RINGRUN_CLEARANCE = [86, 74, 96, 66, 82, 58, 92, 70, 84, 54, 76, 62];
const CANYON_OFFSETS = [8, -22, 26, -30, 14, -18, 24, -10];
const CANYON_CLEARANCE = [30, 26, 34, 24, 28, 22, 32, 26];

export const MISSION_DEFS = {
  ringrun: {
    id: 'ringrun',
    name: 'RING RUN',
    goal: 'Thread all twelve glowing gates down the valley. Centred passes score more.',
    ringCount: 12,
    start: { x: 74, z: 880, y: 178, speed: 68, fuel: 1 },
    spawnRadius: 15,
    color: CYAN,
  },
  canyon: {
    id: 'canyon',
    name: 'CANYON DASH',
    goal: 'Eight low gates, no room to climb. Speed at the gate is worth points.',
    ringCount: 8,
    start: { x: 62, z: 880, y: 132, speed: 82, fuel: 0.85 },
    spawnRadius: 13,
    color: AMBER,
  },
  landing: {
    id: 'landing',
    name: 'VALLEY LANDING',
    goal: 'Fly the three beacons, then set it down on the strip. Soft and straight pays.',
    ringCount: 3,
    start: { x: 132, z: 1080, y: 196, speed: 64, fuel: 0.55 },
    spawnRadius: 17,
    color: VIOLET,
  },
};

function buildRingRun(scene) {
  const rings = [];
  const z0 = 700;
  for (let i = 0; i < 12; i += 1) {
    const z = z0 - i * 205;
    const cx = valleyCenter(z);
    const x = cx + RINGRUN_OFFSETS[i];
    const y = groundClearance(x, z, RINGRUN_CLEARANCE[i]);
    rings.push({ x, y, z });
  }
  return rings;
}

function buildCanyon(scene) {
  const rings = [];
  const z0 = 690;
  for (let i = 0; i < 8; i += 1) {
    const z = z0 - i * 250;
    const cx = valleyCenter(z);
    const x = cx + CANYON_OFFSETS[i];
    const y = groundClearance(x, z, CANYON_CLEARANCE[i]);
    rings.push({ x, y, z });
  }
  return rings;
}

function buildLandingBeacons() {
  const rw = WORLD.runway;
  const zs = [980, 780, 620];
  const heights = [120, 74, 40];
  return zs.map((z, i) => ({
    x: rw.x + (i === 0 ? 46 : i === 1 ? 22 : 4),
    y: groundClearance(rw.x, z, heights[i]),
    z,
  }));
}

export class Mission {
  constructor(id, scene) {
    this.def = MISSION_DEFS[id];
    this.id = id;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = `mission-${id}`;
    scene.add(this.group);

    const anchors = id === 'ringrun' ? buildRingRun(scene) : id === 'canyon' ? buildCanyon(scene) : buildLandingBeacons();
    this.rings = anchors.map((a, i) => this.createRing(a, i, anchors));
    this.next = 0;
    this.passed = 0;
    this.score = 0;
    this.combo = 0;
    this.missed = 0;
    this.bestSpeed = 0;
    this.lastPassInfo = null;
    this.elapsed = 0;
    this.finished = false;
    this.landingDone = false;
    this.landingBonus = 0;
  }

  createRing(anchor, index, anchors) {
    const prev = anchors[Math.max(0, index - 1)];
    const next = anchors[Math.min(anchors.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const yaw = ringYaw(dx, dz);
    const radius = this.def.spawnRadius;
    const mesh = makeRingMesh(radius, this.def.color);
    mesh.position.set(anchor.x, anchor.y, anchor.z);
    mesh.rotation.y = yaw;
    this.group.add(mesh);

    const normal = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    return {
      index,
      position: new THREE.Vector3(anchor.x, anchor.y, anchor.z),
      normal,
      radius,
      mesh,
      state: 'pending',
      pulse: Math.random() * Math.PI * 2,
      prevSide: null,
      glow: 0,
    };
  }

  get target() {
    if (this.id === 'landing' && this.next >= this.rings.length) return null;
    return this.rings[this.next] ?? null;
  }

  distanceToTarget(from) {
    const t = this.target;
    if (!t) return null;
    return from.distanceTo(t.position);
  }

  setVisualTarget() {
    this.rings.forEach((r) => {
      const isNext = r.index === this.next;
      const mat = r.mesh.userData.torus.material;
      const halo = r.mesh.userData.halo.material;
      const film = r.mesh.userData.film.material;
      if (r.state === 'passed') {
        mat.emissiveIntensity = 0.35;
        mat.opacity = 1;
        halo.opacity = 0.05;
        film.opacity = 0.015;
        r.mesh.scale.setScalar(1);
      } else if (isNext) {
        mat.emissiveIntensity = 2.4;
        halo.opacity = 0.34;
        film.opacity = 0.1;
      } else {
        mat.emissiveIntensity = 0.75;
        halo.opacity = 0.1;
        film.opacity = 0.03;
      }
    });
  }

  // Checks the flight path segment against the next gate: a sign flip of the
  // plane distance with a small radial offset counts as a pass.
  checkPass(prev, now, speed) {
    const t = this.target;
    if (!t) return null;
    const side = t.normal.dot(new THREE.Vector3().subVectors(now, t.position));
    if (t.prevSide === null) t.prevSide = side;
    const crossed = (t.prevSide > 0 && side <= 0) || (t.prevSide < 0 && side >= 0);
    t.prevSide = side;
    if (!crossed) return null;

    const toPrev = new THREE.Vector3().subVectors(prev, t.position);
    const radial = toPrev.sub(t.normal.clone().multiplyScalar(t.normal.dot(toPrev))).length();
    const hit = radial <= t.radius * 0.94;
    const precision = hit ? Math.max(0, 1 - radial / (t.radius * 0.94)) : 0;
    return { hit, radial, precision, ring: t, speed };
  }

  registerPass(info) {
    const t = info.ring;
    t.state = 'passed';
    t.mesh.userData.torus.material.emissiveIntensity = 0.3;
    this.passed += 1;
    this.next += 1;

    let points = 100 + Math.round(info.precision * 120);
    if (this.id === 'canyon') {
      const speedBonus = Math.max(0, Math.round((info.speed - 58) * 5));
      points += speedBonus;
      info.speedBonus = speedBonus;
    }
    this.combo = Math.min(this.combo + 1, 6);
    points += (this.combo - 1) * 20;
    this.score += points;
    info.points = points;
    this.bestSpeed = Math.max(this.bestSpeed, info.speed);
    this.lastPassInfo = info;

    if (this.next >= this.rings.length) {
      if (this.id === 'landing') {
        // beacons done; the strip is the final goal
      } else {
        this.finished = true;
      }
    }
    this.setVisualTarget();
    return points;
  }

  registerMiss() {
    this.missed += 1;
    this.combo = 0;
    this.score = Math.max(0, this.score - 40);
  }

  // Landing mission resolution: reward a soft, centred touchdown.
  completeLanding(verticalSpeed, centreOffset) {
    if (this.landingDone) return 0;
    this.landingDone = true;
    this.finished = true;
    const softness = Math.max(0, 1 - Math.abs(verticalSpeed) / 6.2);
    const centring = Math.max(0, 1 - centreOffset / 30);
    const bonus = Math.round(320 + softness * 260 + centring * 180);
    this.landingBonus = bonus;
    this.score += bonus;
    return bonus;
  }

  update(dt, time) {
    this.elapsed += dt;
    this.rings.forEach((r) => {
      r.pulse += dt * (r.index === this.next ? 3.1 : 1.3);
      const isNext = r.index === this.next;
      const breathe = isNext ? 1 + Math.sin(r.pulse) * 0.045 : 1 + Math.sin(r.pulse) * 0.012;
      r.mesh.scale.setScalar(breathe);
      r.mesh.rotation.z = Math.sin(r.pulse * 0.35) * 0.06;
      const halo = r.mesh.userData.halo;
      halo.scale.setScalar(isNext ? 1 + Math.sin(r.pulse * 0.9) * 0.05 : 1);
    });
    if (this.id === 'landing' && this.next >= this.rings.length) {
      this.rings.forEach((r) => {
        r.mesh.userData.halo.material.opacity = 0.06;
      });
    }
    void time;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}

export function missionGoalText(mission) {
  if (mission.id === 'landing') {
    if (mission.next < mission.rings.length) return 'Follow the beacons to the strip';
    return 'On final — land on the runway';
  }
  if (mission.id === 'canyon') return 'Eight low gates · speed pays';
  return 'Thread twelve gates · centred passes score';
}
