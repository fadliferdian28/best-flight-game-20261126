// Procedural sound: no audio files. A saw/square engine stack follows throttle
// and airspeed, a filtered noise bed is the wind, and short oscillators ring the
// gate chime, the stall horn and the crash thump.

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 620;
    engineFilter.Q.value = 4.5;
    this.engineGain.connect(engineFilter);
    engineFilter.connect(this.master);

    this.oscA = this.ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscA.frequency.value = 74;
    this.oscA.connect(this.engineGain);
    this.oscA.start();

    this.oscB = this.ctx.createOscillator();
    this.oscB.type = 'square';
    this.oscB.frequency.value = 111;
    const bGain = this.ctx.createGain();
    bGain.gain.value = 0.28;
    this.oscB.connect(bGain);
    bGain.connect(this.engineGain);
    this.oscB.start();

    this.oscC = this.ctx.createOscillator();
    this.oscC.type = 'triangle';
    this.oscC.frequency.value = 37;
    const cGain = this.ctx.createGain();
    cGain.gain.value = 0.5;
    this.oscC.connect(cGain);
    cGain.connect(this.master);
    this.oscC.start();

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 780;
    windFilter.Q.value = 0.7;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.loop = true;
    noise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();

    this.engineFilter = engineFilter;
    this.started = true;
    return this.ctx;
  }

  noiseBuffer() {
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  start() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, now, 0.6);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.15);
  }

  update(throttle, speed, alive) {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    const rpm = 0.32 + throttle * 0.68;
    const air = Math.min(1, speed / 95);
    this.oscA.frequency.setTargetAtTime(66 + rpm * 62, t, 0.08);
    this.oscB.frequency.setTargetAtTime(99 + rpm * 94, t, 0.08);
    this.oscC.frequency.setTargetAtTime(34 + rpm * 22, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(430 + rpm * 900 + air * 380, t, 0.1);
    this.engineGain.gain.setTargetAtTime(alive ? 0.16 + throttle * 0.2 : 0.0, t, 0.1);
    this.windGain.gain.setTargetAtTime(alive ? 0.012 + air * air * 0.11 : 0.0, t, 0.15);
  }

  chime(frequency = 880, duration = 0.24, gain = 0.22) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 1.1);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.25);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(1800, t);
    nf.frequency.exponentialRampToValueAtTime(120, t + 0.9);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(this.master);
    noise.start(t);
  }

  stallHorn(on) {
    if (!this.ctx) return;
    if (on && !this.hornOsc) {
      const t = this.ctx.currentTime;
      this.hornOsc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      this.hornOsc.type = 'square';
      this.hornOsc.frequency.value = 420;
      g.gain.value = 0.035;
      this.hornOsc.connect(g);
      g.connect(this.master);
      this.hornOsc.start(t);
      this.hornGain = g;
    } else if (!on && this.hornOsc) {
      this.hornOsc.stop();
      this.hornOsc = null;
    }
  }
}
