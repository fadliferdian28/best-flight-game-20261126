// Screenshot staging. Each ?shot= value drops the game straight into a posed
// state so the captures are real renders of the running game, not composites:
//   ?shot=cover  - mid-flight chase view with the next ring dead ahead
//   ?shot=runway - short final over the strip, gear down, lights lit
//   ?shot=ring   - threading a gate, ring filling the frame
//   ?shot=title  - the title screen over the live valley

const PARAMS = new URLSearchParams(window.location.search);

export function shotRequest() {
  const name = PARAMS.get('shot');
  return name || null;
}

function placeFlight(flight, pose) {
  flight.position.set(pose.x, pose.y, pose.z);
  flight.yaw = pose.yaw;
  flight.pitch = pose.pitch === undefined ? 0 : pose.pitch;
  flight.roll = pose.roll === undefined ? 0 : pose.roll;
  flight.speed = pose.speed === undefined ? 64 : pose.speed;
  flight.throttle = pose.throttle === undefined ? 0.78 : pose.throttle;
  flight.fuel = pose.fuel === undefined ? 0.86 : pose.fuel;
  flight.velocity.set(-Math.sin(pose.yaw) * flight.speed, 0, -Math.cos(pose.yaw) * flight.speed);
  flight.syncOrientation();
  flight.pitchRate = 0;
  flight.rollRate = 0;
}

function lookAtPoint(chase, flight, point, back, up) {
  chase.reset(flight);
  chase.position.copy(flight.position).add(
    new THREE.Vector3(0, up === undefined ? 3.2 : up, back === undefined ? 15 : back).applyQuaternion(flight.quaternion),
  );
  chase.lookAt.copy(point);
  chase.roll = flight.roll * 0.35;
  chase.fov = 56;
}

export function stageShot(name, ctx) {
  const { flight, mission, chase, hud, aircraft, camera, state, terrain } = ctx;
  const rw = terrain.runway;

  const setPose = (pose) => {
    placeFlight(flight, pose);
    aircraft.root.position.copy(flight.position);
    aircraft.root.quaternion.copy(flight.quaternion);
    aircraft.prop.rotation.z = 0.6;
    mission.setVisualTarget();
    hud.update(flight, mission, 0);
  };

  if (name === 'cover') {
    setPose({
      x: rw.x - 54,
      y: 128,
      z: 560,
      yaw: 0.03,
      pitch: -0.04,
      roll: 0.18,
      speed: 78,
      fuel: 0.82,
    });
    mission.passed = 3;
    mission.next = 3;
    mission.score = 1180;
    mission.elapsed = 71;
    mission.setVisualTarget();
    const tgt = mission.rings[3];
    lookAtPoint(chase, flight, tgt.position.clone().add(new THREE.Vector3(0, 3, 0)), 17, 4.2);
    hud.update(flight, mission, 0);
  } else if (name === 'runway') {
    setPose({
      x: rw.x - 8,
      y: rw.elevation + 52,
      z: rw.z + 330,
      yaw: 0.02,
      pitch: -0.09,
      roll: -0.12,
      speed: 58,
      fuel: 0.62,
    });
    mission.passed = 3;
    mission.next = 3;
    mission.score = 940;
    mission.elapsed = 96;
    mission.setVisualTarget();
    lookAtPoint(chase, flight, new THREE.Vector3(rw.x, rw.elevation + 6, rw.z + 90), 16, 3.6);
    hud.update(flight, mission, 0);
  } else if (name === 'ring') {
    const r = mission.rings[1];
    setPose({
      x: r.position.x - 2,
      y: r.position.y - 1,
      z: r.position.z + 20,
      yaw: 0.01,
      pitch: -0.01,
      roll: -0.3,
      speed: 84,
      fuel: 0.7,
    });
    mission.passed = 1;
    mission.next = 1;
    mission.score = 410;
    mission.elapsed = 33;
    mission.setVisualTarget();
    lookAtPoint(chase, flight, r.position.clone().add(new THREE.Vector3(0, 0, -60)), 13, 2.4);
    hud.update(flight, mission, 0);
  } else if (name === 'title') {
    state.mode = 'title';
    document.getElementById('title').classList.remove('hidden');
    hud.hide();
  }

  if (name === 'cover' || name === 'runway' || name === 'ring') {
    camera.position.copy(chase.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(chase.lookAt);
    camera.fov = chase.fov;
  }
  camera.updateProjectionMatrix();
}
