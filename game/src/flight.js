// Flight model. Arcade-realistic enough to reward throttle and bank discipline:
// thrust against quadratic drag, gravity traded for airspeed on the climb, a
// coordinated turn that follows the bank angle, stall below flying speed, and
// terrain contact that ends in either a landing or a crash.

import { onRunway } from './terrain.js';

export const LIMITS = {
  maxThrottleAccel: 13.5,
  idleDrag: 0.7,
  dragK: 0.00165,
  stallSpeed: 30,
  neverExceed: 118,
  gearHeight: 1.15,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.reset();
  }

  reset(spawn = {}) {
    this.position.set(spawn.x ?? 0, spawn.y ?? 140, spawn.z ?? 520);
    this.yaw = spawn.yaw ?? 0;
    this.pitch = spawn.pitch ?? 0;
    this.roll = spawn.roll ?? 0;
    this.speed = spawn.speed ?? 62;
    this.throttle = spawn.throttle ?? 0.72;
    this.fuel = spawn.fuel ?? 1;
    this.verticalSpeed = 0;
    this.angleOfAttack = 0;
    this.stalled = false;
    this.overspeed = false;
    this.crashed = false;
    this.crashReason = '';
    this.landed = false;
    this.rollingOut = false;
    this.stopped = false;
    this.groundContact = false;
    this.gForce = 1;
    this.warning = '';
    this.velocity.set(-Math.sin(this.yaw) * this.speed, 0, -Math.cos(this.yaw) * this.speed);
    this.syncOrientation();
  }

  syncOrientation() {
    this.euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quaternion.setFromEuler(this.euler);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion);
  }

  heading() {
    let deg = (-this.yaw * 180) / Math.PI;
    deg %= 360;
    if (deg < 0) deg += 360;
    return deg;
  }

  altitudeAbove(terrain) {
    return this.position.y - terrain.heightAt(this.position.x, this.position.z);
  }

  update(dt, input, terrain) {
    if (this.crashed || this.stopped) return;
    dt = Math.min(dt, 0.05);

    if (this.landed || this.rollingOut) {
      this.updateGroundRoll(dt, input, terrain);
      return;
    }

    const authority = clamp(this.speed / 46, 0.35, 1.25);

    const pitchInput = (input.pitchDown ? 1 : 0) - (input.pitchUp ? 1 : 0);
    const rollInput = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0);

    if (input.throttleUp) this.throttle = clamp(this.throttle + dt * 0.55, 0, 1);
    if (input.throttleDown) this.throttle = clamp(this.throttle - dt * 0.55, 0, 1);

    const fuelStarved = this.fuel <= 0.001;
    const thrust = fuelStarved ? 0 : this.throttle * LIMITS.maxThrottleAccel;

    const targetPitchRate = pitchInput * 1.05 * authority;
    this.pitchRate = lerp(this.pitchRate ?? 0, targetPitchRate, 1 - Math.exp(-dt * 7));
    this.pitch += this.pitchRate * dt;

    const targetRollRate = rollInput * 2.15 * authority;
    this.rollRate = lerp(this.rollRate ?? 0, targetRollRate, 1 - Math.exp(-dt * 8));
    this.roll += this.rollRate * dt;
    if (rollInput === 0) this.roll *= 1 - Math.min(1, dt * 0.55);

    this.pitch = clamp(this.pitch, -1.15, 1.2);
    this.roll = clamp(this.roll, -Math.PI * 0.92, Math.PI * 0.92);

    const bankTurn = (9.81 * Math.tan(clamp(this.roll, -1.35, 1.35))) / Math.max(this.speed, 22);
    const turnRate = clamp(bankTurn, -1.15, 1.15);
    this.yaw += turnRate * dt;

    this.stalled = this.speed < LIMITS.stallSpeed;
    if (this.stalled) {
      this.pitch -= dt * 0.55 * (1 - this.speed / LIMITS.stallSpeed);
      this.roll += Math.sin(performance.now() * 0.004) * dt * 0.25;
    }

    const fwd = this.forward(new THREE.Vector3());
    const climb = fwd.y;
    const drag = LIMITS.idleDrag + LIMITS.dragK * this.speed * this.speed;
    const accel = thrust - drag - 9.81 * climb * 0.92;
    this.speed = clamp(this.speed + accel * dt, 0, LIMITS.neverExceed + 8);
    this.overspeed = this.speed > LIMITS.neverExceed;
    if (this.overspeed) this.speed -= dt * 2.4;

    this.fuel = clamp(this.fuel - dt * (0.0016 + this.throttle * 0.0105), 0, 1);

    const desiredVel = fwd.multiplyScalar(this.speed);
    const grip = this.stalled ? 0.55 : 3.4;
    const blend = 1 - Math.exp(-dt * grip);
    this.velocity.lerp(desiredVel, blend);
    if (this.velocity.lengthSq() < 1e-4) this.velocity.copy(desiredVel);

    this.verticalSpeed = this.velocity.y;
    this.position.addScaledVector(this.velocity, dt);

    const bankLoad = Math.abs(Math.tan(clamp(this.roll, -1.35, 1.35)));
    this.gForce = lerp(this.gForce, 1 / Math.max(0.35, Math.cos(this.roll)) + Math.abs(this.pitchRate) * 0.9, 1 - Math.exp(-dt * 5));

    this.syncOrientation();

    const ground = terrain.heightAt(this.position.x, this.position.z);
    const clearance = this.position.y - ground;
    const water = ground < terrain.waterLevel;
    this.groundContact = clearance <= LIMITS.gearHeight;

    const surfaceY = Math.max(ground, water ? terrain.waterLevel : ground);
    if (this.position.y - LIMITS.gearHeight <= surfaceY) {
      this.handleContact(terrain, clearance, surfaceY);
      return;
    }

    this.warning = '';
    if (clearance < 45 && this.verticalSpeed < -3) this.warning = 'PULL UP';
    else if (this.stalled) this.warning = 'STALL';
    else if (this.fuel < 0.15) this.warning = 'LOW FUEL';
    else if (this.overspeed) this.warning = 'OVERSPEED';
    void bankLoad;
  }

  handleContact(terrain, clearance, surfaceY) {
    const rw = terrain.runway;
    const overRunway = onRunway(this.position.x, this.position.z, 6);
    const touchdownSoft = this.verticalSpeed > -6.2;
    const level = Math.abs(this.roll) < 0.38 && Math.abs(this.pitch) < 0.3;

    if (overRunway && touchdownSoft && level && this.speed > 18) {
      this.landed = true;
      this.rollingOut = true;
      this.position.y = rw.elevation + LIMITS.gearHeight;
      this.verticalSpeed = 0;
      this.pitch = 0;
      this.roll = 0;
      this.speed = Math.max(this.speed * 0.86, 24);
      this.syncOrientation();
      this.velocity.set(-Math.sin(this.yaw) * this.speed, 0, -Math.cos(this.yaw) * this.speed);
      this.landingQuality = Math.abs(this.verticalSpeed);
      return;
    }

    this.crash(overRunway ? 'hard-landing' : clearance < 2 ? 'terrain' : 'impact');
  }

  updateGroundRoll(dt, input, terrain) {
    const rw = terrain.runway;
    const decel = 5.4 + (input.brake ? 3 : 0);
    this.speed = Math.max(0, this.speed - decel * dt);
    this.position.y = rw.elevation + LIMITS.gearHeight;
    this.roll = 0;
    this.pitch = 0;
    this.yaw += (input.rollLeft ? 1 : input.rollRight ? -1 : 0) * dt * 0.25;
    this.syncOrientation();
    this.velocity.set(-Math.sin(this.yaw) * this.speed, 0, -Math.cos(this.yaw) * this.speed);
    this.position.addScaledVector(this.velocity, dt);
    this.verticalSpeed = 0;

    const stillOn = onRunway(this.position.x, this.position.z, 20);
    if (!stillOn) {
      this.crash('overrun');
      return;
    }
    if (this.speed < 4.5) {
      this.speed = 0;
      this.stopped = true;
      this.warning = '';
    }
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.roll += 0.5;
    this.pitch -= 0.35;
    this.syncOrientation();
  }

  applyRingRefuel(amount = 0.22) {
    this.fuel = clamp(this.fuel + amount, 0, 1);
  }
}
