/**
 * vr.js  –  WebXR session management for Meta Quest 3S.
 *
 * API:
 *   initVR(renderer, scene, camera, btnVR) → Promise<VRManager>
 *
 * VRManager:
 *   .supported  – bool
 *   .active     – bool
 *   .controllers – array of XRController objects (after session start)
 */

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const CONTROLLER_FACTORY = new XRControllerModelFactory();

export async function initVR(renderer, scene, camera, btnVR) {
  // ── Support check ───────────────────────────────────────────
  const supported = navigator.xr
    ? await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)
    : false;

  const mgr = { supported, active: false, controllers: [] };

  if (!supported) {
    btnVR.textContent = 'VR not available';
    btnVR.title = 'WebXR immersive-vr is not supported in this browser or device.';
    btnVR.disabled = true;
    console.info('EXAM//SIM: WebXR immersive-vr not supported.');
    return mgr;
  }

  btnVR.textContent  = 'Enter VR';
  btnVR.disabled     = false;
  btnVR.classList.add('vr-ready');

  // ── Controller visuals ──────────────────────────────────────
  function buildController(index) {
    const ctrl = renderer.xr.getController(index);

    // Ray / laser pointer
    const geo  = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xc8a84b, transparent: true, opacity: 0.5,
    }));
    line.name  = 'controller-ray';
    line.scale.z = 5;
    ctrl.add(line);

    // Controller grip model
    const grip  = renderer.xr.getControllerGrip(index);
    const model = CONTROLLER_FACTORY.createControllerModel(grip);
    grip.add(model);

    scene.add(ctrl);
    scene.add(grip);

    // Events
    ctrl.addEventListener('selectstart', () => {
      line.material.opacity = 0.9;
    });
    ctrl.addEventListener('selectend', () => {
      line.material.opacity = 0.5;
    });

    return { ctrl, grip };
  }

  mgr.controllers.push(buildController(0));
  mgr.controllers.push(buildController(1));

  // ── XR session start/end ────────────────────────────────────
  async function startSession() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: [
          'local-floor',       // aligns y=0 with real floor
          'bounded-floor',
          'hand-tracking',
        ],
      });

      await renderer.xr.setSession(session);
      mgr.active = true;
      mgr.xrSession = session;
      btnVR.textContent = 'Exit VR';
      btnVR.classList.remove('vr-ready');
      btnVR.classList.add('vr-active');

      // Hide 2-D HUD in headset – it only clutters the view
      document.getElementById('hud-bar').style.display = 'none';

      session.addEventListener('end', () => {
        mgr.active = false;
        btnVR.textContent = 'Enter VR';
        btnVR.classList.remove('vr-active');
        btnVR.classList.add('vr-ready');
        document.getElementById('hud-bar').style.display = '';
        console.log('EXAM//SIM: XR session ended.');
      });

      console.log('EXAM//SIM: XR session started.', session);
    } catch (err) {
      console.error('EXAM//SIM: Failed to start XR session:', err);
      alert(`Could not start VR session: ${err.message}`);
    }
  }

  btnVR.addEventListener('click', async () => {
    if (mgr.active) {
      // End session
      const session = renderer.xr.getSession();
      if (session) session.end();
    } else {
      await startSession();
    }
  });

  return mgr;
}
