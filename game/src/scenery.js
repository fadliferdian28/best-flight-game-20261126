// Sky, sun, haze and drifting clouds: the single light source and colour story
// the terrain, aircraft and rings all sit inside.

import { makeRng, range } from './rng.js';
import { buildCloudPuff } from './aircraft.js';

export const PALETTE = {
  horizon: 0xf2c9a0,
  zenith: 0x4c86b8,
  sun: 0xfff0c8,
  fog: 0xd8d2bd,
};

const SKY_VERT = [
  'varying vec3 vDir;',
  'void main() {',
  '  vDir = normalize(position);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

const SKY_FRAG = [
  'uniform vec3 top;',
  'uniform vec3 bottom;',
  'uniform vec3 sunDir;',
  'uniform vec3 sunColor;',
  'varying vec3 vDir;',
  'void main() {',
  '  float h = clamp(vDir.y * 1.15 + 0.12, 0.0, 1.0);',
  '  vec3 sky = mix(bottom, top, pow(h, 0.62));',
  '  vec3 dir = normalize(vDir);',
  '  vec3 sun = normalize(sunDir);',
  '  float disc = smoothstep(0.9982, 0.9994, dot(dir, sun));',
  '  float glow = pow(max(dot(dir, sun), 0.0), 26.0);',
  '  sky += sunColor * (disc * 1.15 + glow * 0.28);',
  '  float band = smoothstep(0.22, 0.0, abs(vDir.y - 0.02));',
  '  sky = mix(sky, vec3(0.98, 0.86, 0.72), band * 0.18);',
  '  gl_FragColor = vec4(sky, 1.0);',
  '}',
].join('\n');

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(4200, 32, 18);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.zenith) },
      bottom: { value: new THREE.Color(PALETTE.horizon) },
      sunDir: { value: new THREE.Vector3(-0.42, 0.42, -0.8).normalize() },
      sunColor: { value: new THREE.Color(PALETTE.sun) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'sky-dome';
  dome.frustumCulled = false;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.5);
  sun.position.set(-620, 720, -900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 2600;
  sun.shadow.camera.left = -420;
  sun.shadow.camera.right = 420;
  sun.shadow.camera.top = 420;
  sun.shadow.camera.bottom = -420;
  sun.shadow.bias = -0.0012;
  sun.name = 'sun';
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd6e8, 0x6b6a4d, 1.05);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.00052);
  scene.background = new THREE.Color(PALETTE.fog);

  return { dome, sun, hemi };
}

export function buildClouds(scene) {
  const rng = makeRng(0xc10d5);
  const group = new THREE.Group();
  group.name = 'cloud-bank';
  const banks = [];
  for (let i = 0; i < 16; i += 1) {
    const puff = buildCloudPuff(900 + i * 37);
    puff.position.set(range(rng, -1500, 1500), range(rng, 300, 620), range(rng, -2400, 1300));
    const s = range(rng, 0.7, 1.9);
    puff.scale.setScalar(s);
    puff.userData.drift = range(rng, 1.4, 4.2);
    group.add(puff);
    banks.push(puff);
  }
  scene.add(group);

  return {
    group,
    update(dt) {
      banks.forEach((b) => {
        b.position.x += b.userData.drift * dt;
        if (b.position.x > 1700) b.position.x = -1700;
      });
    },
  };
}
