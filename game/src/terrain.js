// Procedural low-poly terrain: a meandering river valley walled in by ridges, a
// gravel runway on the east bank, plus the trees and boulders that sell the scale.
// Height is analytic so the flight model can sample it exactly for collisions.

import { makeRng, range } from './rng.js';

export const WORLD = {
  width: 2400,
  depth: 3600,
  centerZ: -600,
  runway: { x: 132, z: 320, halfWidth: 17, halfLength: 210, elevation: 8 },
  waterLevel: 4.4,
};

const SEED = 20261126;

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(SEED, 69069);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

function fbm(x, z, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function valleyCenter(z) {
  return 70 * Math.sin(z * 0.0022) + 26 * Math.sin(z * 0.0063 + 1.3);
}

export function terrainHeight(x, z) {
  const cx = valleyCenter(z);
  const d = Math.abs(x - cx);
  const halfWidth = 205 + 42 * Math.sin(z * 0.0041 + 0.6);
  const ridgeT = clamp((d - halfWidth) / 320, 0, 1);
  const ridge = Math.pow(ridgeT, 1.35);
  const ridgeTop = 330 + 165 * fbm(z * 0.0009 + 4.2, 11.3) + 90 * Math.sin(z * 0.0017 + 2.2);

  let h = 6 + ridge * ridgeTop;
  h += fbm(x * 0.0062, z * 0.0062) * (12 + 105 * ridge);
  h += fbm(x * 0.021, z * 0.021) * 3.2;
  h += 4 * Math.sin(z * 0.011) * ridge;

  const carve = 1 - smoothstep(38, 132, d);
  h = h * (1 - carve * 0.94) + 2.8 * (carve * 0.94);

  const rw = WORLD.runway;
  const inX = 1 - smoothstep(rw.halfWidth + 44, rw.halfWidth + 132, Math.abs(x - rw.x));
  const inZ = 1 - smoothstep(rw.halfLength, rw.halfLength + 120, Math.abs(z - rw.z));
  const plateau = inX * inZ;
  h = h * (1 - plateau) + rw.elevation * plateau;

  return h;
}

export function terrainNormal(x, z) {
  const e = 2.5;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  return { x: hL - hR, y: 2 * e, z: hD - hU };
}

const GRASS = 0x6d8c52;
const GRASS_DRY = 0x8d9057;
const ROCK = 0x7c756a;
const ROCK_DARK = 0x625d56;
const SNOW = 0xe7eef0;
const SAND = 0xb3a375;
const RUNWAY_DIRT = 0x77714f;

function faceColor(height, slope, x, z, target) {
  const jitter = 0.92 + 0.16 * hash2(Math.round(x * 0.4), Math.round(z * 0.4));
  target.setHex(GRASS);
  if (height < 10) target.setHex(SAND);
  else if (height < 26) target.lerp(new THREE.Color(GRASS_DRY), smoothstep(10, 26, height) * 0.65);
  if (slope > 0.34) target.setHex(ROCK);
  if (slope > 0.62) target.setHex(ROCK_DARK);
  if (height > 300 && slope < 0.62) {
    target.lerp(new THREE.Color(SNOW), smoothstep(300, 460, height) * 0.9);
  }
  if (height > 120 && height < 300) target.lerp(new THREE.Color(ROCK), smoothstep(120, 300, height) * 0.35);
  target.multiplyScalar(jitter);
  return target;
}

function buildHeightfield() {
  const segX = 168;
  const segZ = 252;
  const plane = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, segX, segZ);
  plane.rotateX(-Math.PI / 2);
  plane.translate(0, 0, WORLD.centerZ);
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  const geo = plane.toNonIndexed();
  geo.computeVertexNormals();

  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ad = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    d.fromBufferAttribute(p, i + 2);
    ab.subVectors(b, a);
    ad.subVectors(d, a);
    n.crossVectors(ab, ad).normalize();
    const slope = 1 - Math.abs(n.y);
    const height = (a.y + b.y + d.y) / 3;
    faceColor(height, slope, (a.x + b.x + d.x) / 3, (a.z + b.z + d.z) / 3, c);
    for (let k = 0; k < 3; k += 1) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain-heightfield';
  return mesh;
}

function buildRiver() {
  const points = [];
  for (let z = 1150; z >= -2360; z -= 26) points.push(z);
  const verts = [];
  const idx = [];
  const halfW = 30;
  points.forEach((z, i) => {
    const cx = valleyCenter(z);
    const wobble = 3.5 * Math.sin(z * 0.02);
    verts.push(cx - halfW + wobble, WORLD.waterLevel, z);
    verts.push(cx + halfW + wobble, WORLD.waterLevel, z);
    if (i > 0) {
      const o = (i - 1) * 2;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3b7f8e,
    roughness: 0.24,
    metalness: 0.35,
    flatShading: true,
    transparent: true,
    opacity: 0.94,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'river';
  return mesh;
}

function textPlate(text, width, height, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = fg;
  ctx.font = 'bold 150px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 138);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function buildRunway(group) {
  const rw = WORLD.runway;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x353b3d, roughness: 0.96, metalness: 0.02 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9efe6, roughness: 0.7, emissive: 0x1a1c18 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(rw.halfWidth * 2, 0.5, rw.halfLength * 2), asphalt);
  deck.position.set(rw.x, rw.elevation + 0.05, rw.z);
  deck.receiveShadow = true;
  deck.name = 'runway-deck';
  group.add(deck);

  const shoulderMat = new THREE.MeshStandardMaterial({ color: RUNWAY_DIRT, roughness: 1 });
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(rw.halfWidth * 2 + 9, 0.22, rw.halfLength * 2 + 10), shoulderMat);
  shoulder.position.set(rw.x, rw.elevation + 0.01, rw.z);
  group.add(shoulder);

  for (let z = rw.z - rw.halfLength + 24; z < rw.z + rw.halfLength - 10; z += 21) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 9), paint);
    dash.position.set(rw.x, rw.elevation + 0.33, z);
    group.add(dash);
  }

  for (const end of [-1, 1]) {
    const zEnd = rw.z + end * (rw.halfLength - 16);
    for (let i = -3; i <= 3; i += 1) {
      if (i === 0) continue;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 13), paint);
      bar.position.set(rw.x + i * 4.1, rw.elevation + 0.33, zEnd);
      group.add(bar);
    }
    const plate = textPlate(end > 0 ? '36' : '18', 13, 13, '#f2f5ee');
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(rw.x, rw.elevation + 0.34, zEnd - end * 26);
    group.add(plate);
  }

  const lightGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffe6a8,
    emissive: 0xffb84a,
    emissiveIntensity: 2.1,
    roughness: 0.4,
  });
  const edgeLights = new THREE.InstancedMesh(lightGeo, lightMat, 2 * 15);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 15; i += 1) {
    const z = rw.z - rw.halfLength + 14 + i * (rw.halfLength * 2 - 28) / 14;
    for (const side of [-1, 1]) {
      m.makeTranslation(rw.x + side * (rw.halfWidth + 1.8), rw.elevation + 0.5, z);
      edgeLights.setMatrixAt(n, m);
      n += 1;
    }
  }
  edgeLights.name = 'runway-edge-lights';
  group.add(edgeLights);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0xcfd3c6, flatShading: true, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2e5966,
    roughness: 0.2,
    metalness: 0.5,
    emissive: 0x0e2a30,
    flatShading: true,
  });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.8, 16, 6), towerMat);
  tower.position.set(rw.x + 54, rw.elevation + 8, rw.z + 118);
  group.add(tower);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.2, 4.4, 6), glassMat);
  cab.position.set(rw.x + 54, rw.elevation + 18.2, rw.z + 118);
  group.add(cab);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.2, 6), towerMat);
  roof.position.set(rw.x + 54, rw.elevation + 21.6, rw.z + 118);
  group.add(roof);

  const hangar = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 34, 8, 1, false, 0, Math.PI), towerMat);
  hangar.rotation.z = Math.PI / 2;
  hangar.rotation.y = Math.PI / 2;
  hangar.position.set(rw.x - 56, rw.elevation + 0.2, rw.z - 130);
  group.add(hangar);

  const windsockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 9, 5), towerMat);
  windsockPole.position.set(rw.x + 34, rw.elevation + 4.5, rw.z + 170);
  group.add(windsockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.7, 6, 6, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe0663a, roughness: 0.8, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.rotation.y = 0.4;
  sock.position.set(rw.x + 36.5, rw.elevation + 8.4, rw.z + 170);
  group.add(sock);
}

function buildTrees(group) {
  const rng = makeRng(0x5eed71);
  const treeGeo = new THREE.ConeGeometry(4.4, 15, 5);
  treeGeo.translate(0, 7.5, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x35593c, flatShading: true, roughness: 1 });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, 760);
  trees.name = 'conifer-stands';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const rw = WORLD.runway;
  let placed = 0;
  let guard = 0;
  while (placed < 760 && guard < 12000) {
    guard += 1;
    const x = range(rng, -1150, 1150);
    const z = range(rng, -2350, 1150);
    const h = terrainHeight(x, z);
    if (h < 12 || h > 330) continue;
    if (Math.abs(x - rw.x) < 110 && Math.abs(z - rw.z) < 300) continue;
    const n = terrainNormal(x, z);
    const slope = 1 - n.y / Math.hypot(n.x, n.y, n.z);
    if (slope > 0.32) continue;
    const cx = valleyCenter(z);
    if (Math.abs(x - cx) < 52) continue;
    const scale = range(rng, 0.6, 1.6);
    p.set(x, h - 0.6, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(rng, 0, Math.PI * 2));
    s.set(scale, scale * range(rng, 0.85, 1.35), scale);
    m.compose(p, q, s);
    trees.setMatrixAt(placed, m);
    col.setHSL(0.3 + rng() * 0.05, 0.32 + rng() * 0.14, 0.2 + rng() * 0.1);
    trees.setColorAt(placed, col);
    placed += 1;
  }
  trees.count = placed;
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  group.add(trees);
}

function buildBoulders(group) {
  const rng = makeRng(0xb0d1e5);
  const geo = new THREE.DodecahedronGeometry(3.4, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7d776c, flatShading: true, roughness: 1 });
  const rocks = new THREE.InstancedMesh(geo, mat, 180);
  rocks.name = 'boulder-field';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < 180 && guard < 6000) {
    guard += 1;
    const x = range(rng, -1150, 1150);
    const z = range(rng, -2350, 1150);
    const h = terrainHeight(x, z);
    if (h < 30 || h > 520) continue;
    const scale = range(rng, 0.5, 2.4);
    p.set(x, h + scale * 0.6, z);
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    s.set(scale, scale * range(rng, 0.6, 1.1), scale);
    m.compose(p, q, s);
    rocks.setMatrixAt(placed, m);
    placed += 1;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);
}

export function buildTerrain(scene) {
  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(buildHeightfield());
  group.add(buildRiver());
  buildRunway(group);
  buildTrees(group);
  buildBoulders(group);
  scene.add(group);

  return {
    group,
    heightAt: terrainHeight,
    normalAt: terrainNormal,
    runway: WORLD.runway,
    waterLevel: WORLD.waterLevel,
  };
}

export function onRunway(x, z, margin = 0) {
  const rw = WORLD.runway;
  return (
    Math.abs(x - rw.x) <= rw.halfWidth + margin &&
    Math.abs(z - rw.z) <= rw.halfLength + margin
  );
}
