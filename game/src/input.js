// Keyboard and mouse input. Keys set held flags the flight model reads each
// frame; one-shot actions (pause, restart, mission pick) are queued as events so
// a fast tap is never lost between frames.

const KEYMAP = {
  ArrowUp: 'pitchUp',
  KeyW: 'pitchUp',
  ArrowDown: 'pitchDown',
  KeyS: 'pitchDown',
  ArrowLeft: 'rollLeft',
  KeyA: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyD: 'rollRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  KeyZ: 'throttleDown',
  Space: 'brake',
};

export class Input {
  constructor() {
    this.state = {
      pitchUp: false,
      pitchDown: false,
      rollLeft: false,
      rollRight: false,
      throttleUp: false,
      throttleDown: false,
      brake: false,
    };
    this.events = [];
    this.mouse = { x: 0, y: 0, down: false, active: false };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const action = KEYMAP[e.code];
      if (action) {
        this.state[action] = true;
        if (e.code === 'Space') e.preventDefault();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') this.events.push({ type: 'pause' });
      if (e.code === 'KeyR') this.events.push({ type: 'restart' });
      if (e.code === 'KeyM') this.events.push({ type: 'mute' });
      if (e.code === 'Enter') this.events.push({ type: 'confirm' });
      if (e.code === 'Digit1') this.events.push({ type: 'mission', id: 'ringrun' });
      if (e.code === 'Digit2') this.events.push({ type: 'mission', id: 'canyon' });
      if (e.code === 'Digit3') this.events.push({ type: 'mission', id: 'landing' });
      if (e.code === 'Tab') e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.code];
      if (action) this.state[action] = false;
    });

    window.addEventListener('blur', () => this.releaseAll());

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }

  releaseAll() {
    Object.keys(this.state).forEach((k) => {
      this.state[k] = false;
    });
  }

  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot() {
    return { ...this.state };
  }
}
