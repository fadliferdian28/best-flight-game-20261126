// The aircraft itself: a small low-wing prop plane assembled from flat-shaded
// primitives, plus its spinning propeller and control surfaces.

import { makeRng } from './rng.js';

const CREAM = 0xe8ddc0;
const RED = 0xc4492f;
const DARK = 0x2c3438;
const GLASS = 0x9fd8e0;
const METAL = 0x8d9297;

function box(w, h, d, color, flat = true) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    flatShading: flat,
    roughness: 0.72,
    metalness: 0.08,
  });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

export function buildAircraft() {
  const root = new THREE.Group();
  root.name = 'aircraft';

  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.3, 5.6, 6),
    new THREE.MeshStandardMaterial({ color: CREAM, flatShading: true, roughness: 0.6, metalness: 0.12 }),
  );
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  root.add(fuselage);

  const nose = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.52, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: RED, flatShading: true, roughness: 0.55 }),
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -2.9;
  root.add(nose);

  const cowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: DARK, flatShading: true, roughness: 0.5 }),
  );
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = -3.38;
  root.add(cowl);

  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: RED, flatShading: true, roughness: 0.4, metalness: 0.3 }),
  );
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -3.7;
  root.add(spinner);

  const wing = box(9.4, 0.16, 1.7, CREAM);
  wing.position.set(0, -0.18, -0.35);
  root.add(wing);
  const wingStripe = box(9.45, 0.1, 0.42, RED);
  wingStripe.position.set(0, -0.12, -0.9);
  root.add(wingStripe);
  const wingtipL = box(0.5, 0.2, 1.5, RED);
  wingtipL.position.set(-4.55, -0.18, -0.35);
  root.add(wingtipL);
  const wingtipR = wingtipL.clone();
  wingtipR.position.x = 4.55;
  root.add(wingtipR);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({
      color: GLASS,
      flatShading: true,
      roughness: 0.15,
      metalness: 0.45,
      transparent: true,
      opacity: 0.82,
      emissive: 0x14343a,
    }),
  );
  canopy.position.set(0, 0.32, -0.55);
  canopy.scale.set(0.95, 0.9, 1.55);
  root.add(canopy);

  const tailFin = box(0.14, 1.15, 1.0, RED);
  tailFin.position.set(0, 0.62, 2.35);
  tailFin.rotation.x = 0.16;
  root.add(tailFin);
  const tailPlane = box(3.2, 0.12, 0.82, CREAM);
  tailPlane.position.set(0, 0.1, 2.5);
  root.add(tailPlane);

  const gearMat = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 4), gearMat);
    strut.position.set(side * 1.5, -0.62, -0.55);
    strut.rotation.z = side * 0.22;
    root.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 8), gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.65, -1.02, -0.55);
    root.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 6), gearMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.62, 2.4);
  root.add(tailWheel);

  const prop = new THREE.Group();
  prop.position.z = -3.55;
  const bladeMat = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.5 });
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.07), bladeMat);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    blade.position.y = 0;
    prop.add(blade);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.72, 24),
    new THREE.MeshBasicMaterial({ color: 0xdfe6e2, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  root.add(prop);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0xff4a3a, emissive: 0xff2a1a, emissiveIntensity: 2.4 }),
  );
  beacon.position.set(0, 1.2, 2.3);
  root.add(beacon);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, prop, beacon, wingspan: 9.4 };
}

export function buildShadow() {
  const geo = new THREE.CircleGeometry(4.6, 18);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x0a1410,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(geo, mat);
  shadow.name = 'aircraft-shadow';
  return shadow;
}

export function buildCloudPuff(seed) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf2f6f4,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const count = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i += 1) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(9 + rng() * 11, 0), mat);
    puff.position.set((rng() - 0.5) * 34, (rng() - 0.5) * 10, (rng() - 0.5) * 26);
    puff.scale.set(1, 0.55 + rng() * 0.35, 0.9);
    puff.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    group.add(puff);
  }
  return group;
}
