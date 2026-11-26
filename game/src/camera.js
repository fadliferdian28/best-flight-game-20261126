// Chase camera. It trails the aircraft on a spring, rolls a fraction of the bank
// so turns feel banked without fighting the pilot, widens with speed and pulls
// back for a wing view on the landing run.

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.roll = 0;
    this.fov = 62;
    this.shake = 0;
    this.initialised = false;
  }

  reset(flight) {
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(flight.quaternion).multiplyScalar(16);
    this.position.copy(flight.position).add(back).add(new THREE.Vector3(0, 3.4, 0));
    this.lookAt.copy(flight.position);
    this.roll = flight.roll * 0.4;
    this.initialised = true;
  }

  update(dt, flight, opts) {
    opts = opts || {};
    if (!this.initialised) this.reset(flight);
    const speedT = Math.min(1, Math.max(0, (flight.speed - 25) / 80));
    const back = 13.5 + speedT * 6.5;
    const lift = 3.1 + speedT * 0.9;

    const offset = new THREE.Vector3(0, lift, back).applyQuaternion(flight.quaternion);
    const target = flight.position.clone().add(offset);

    const lag = 1 - Math.exp(-dt * (3.1 - speedT * 0.6));
    this.position.lerp(target, lag);

    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(flight.quaternion);
    const desiredLook = flight.position
      .clone()
      .addScaledVector(ahead, 11 + speedT * 12)
      .add(new THREE.Vector3(0, 1.4, 0));
    const lookLag = 1 - Math.exp(-dt * 5.2);
    this.lookAt.lerp(desiredLook, lookLag);

    const bankFollow = opts.bankFollow === undefined ? 0.36 : opts.bankFollow;
    const desiredRoll = flight.roll * bankFollow;
    this.roll += (desiredRoll - this.roll) * (1 - Math.exp(-dt * 2.6));

    this.camera.position.copy(this.position);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 4.2);
    }
    this.camera.up.set(0, 1, 0).applyAxisAngle(ahead, -this.roll);
    this.camera.lookAt(this.lookAt);

    const baseFov = opts.fov === undefined ? 60 : opts.fov;
    const desiredFov = baseFov + speedT * 12 + (flight.overspeed ? 5 : 0);
    this.fov += (desiredFov - this.fov) * (1 - Math.exp(-dt * 2.2));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount);
  }
}
