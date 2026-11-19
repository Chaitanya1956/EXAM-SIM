/**
 * controls.js  –  First-person WASD + mouse-look for desktop.
 *
 * Uses PointerLockControls pattern without depending on Three.js's
 * PointerLockControls addon, so there are no extra import chains.
 *
 * In exam mode (setLocked(true)):
 *   - WASD locomotion is disabled.
 *   - Mouse cursor is NOT captured on plain canvas click so user can click UI buttons.
 *   - User can drag-to-look (left or right click hold) to look around naturally.
 *
 * API:
 *   const ctrl = new FPControls(camera, domElement);
 *   ctrl.connect()          – attach events
 *   ctrl.disconnect()       – detach events
 *   ctrl.update(dt)         – call every frame
 *   ctrl.reset()            – snap back to start position
 *   ctrl.isLocked           – getter (pointer-lock state)
 *   ctrl.setLocked(bool)    – when true, update(dt) skips movement
 */

import * as THREE from 'three';

const EYE_HEIGHT = 1.15;    // metres above floor
const MOVE_SPEED = 3.5;     // m/s
const SPRINT_MULT = 2.2;    // held Shift
const LOOK_SENS   = 0.0018; // radians per pixel

// Room half-extents (match Blender build, in Three.js coords)
// X: ±4.0,  Z: ±5.6  (small inset from walls)
const ROOM_MIN = new THREE.Vector3(-4.0, 0, -5.6);
const ROOM_MAX = new THREE.Vector3( 4.0, 0,  5.8);

const DEFAULT_POS = new THREE.Vector3(0, EYE_HEIGHT, 1.20);
const DEFAULT_YAW = Math.PI;      // faces –Z (toward blackboard)
const DEFAULT_PIT = -0.06;

export class FPControls {
  constructor(camera, domElement) {
    this._cam    = camera;
    this._dom    = domElement;
    this._yaw    = DEFAULT_YAW;
    this._pitch  = DEFAULT_PIT;
    this._locked = false;

    // Movement & pointer lock mode: when true, WASD is disabled and
    // clicks do not capture pointer lock so the user can click HTML UI buttons freely.
    this._moveLocked = false;
    this._isDragging = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    this._keys = {};
    this._vel  = new THREE.Vector3();
    this._dir  = new THREE.Vector3();

    this._crosshair = null;

    this._onKeyDown     = this._onKeyDown.bind(this);
    this._onKeyUp       = this._onKeyUp.bind(this);
    this._onMouseMove   = this._onMouseMove.bind(this);
    this._onMouseDown   = this._onMouseDown.bind(this);
    this._onMouseUp     = this._onMouseUp.bind(this);
    this._onPLChange    = this._onPLChange.bind(this);
    this._onClick       = this._onClick.bind(this);
  }

  get isLocked() { return this._locked; }

  /**
   * setLocked(bool)
   *
   * Pass true to prevent WASD movement and prevent pointer capture during an exam.
   * Users can still look around via drag-to-look without trapping the pointer.
   * Pass false to restore normal free movement and pointer lock.
   */
  setLocked(locked) {
    this._moveLocked = !!locked;
    if (this._moveLocked) {
      this._unlock();
    }
  }

  connect() {
    document.addEventListener('keydown',  this._onKeyDown);
    document.addEventListener('keyup',    this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup',   this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onPLChange);
    this._dom.addEventListener('click', this._onClick);
    this.reset();
  }

  disconnect() {
    document.removeEventListener('keydown',  this._onKeyDown);
    document.removeEventListener('keyup',    this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup',   this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPLChange);
    this._dom.removeEventListener('click', this._onClick);
    this._unlock();
  }

  reset() {
    this._cam.position.copy(DEFAULT_POS);
    this._yaw   = DEFAULT_YAW;
    this._pitch = DEFAULT_PIT;
    this._applyRotation();
  }

  update(dt) {
    // Movement disabled during exam session
    if (this._moveLocked) return;
    if (!this._locked) return;

    const sprint = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const speed  = MOVE_SPEED * (sprint ? SPRINT_MULT : 1.0) * dt;

    this._dir.set(0, 0, 0);
    if (this._keys['KeyW'] || this._keys['ArrowUp'])    this._dir.z -= 1;
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  this._dir.z += 1;
    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  this._dir.x -= 1;
    if (this._keys['KeyD'] || this._keys['ArrowRight']) this._dir.x += 1;

    if (this._dir.lengthSq() === 0) return;
    this._dir.normalize();

    // Transform direction by yaw only
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), this._yaw
    );
    this._dir.applyQuaternion(yawQ);

    this._cam.position.addScaledVector(this._dir, speed);

    // AABB room-boundary collision
    this._cam.position.x = THREE.MathUtils.clamp(this._cam.position.x, ROOM_MIN.x, ROOM_MAX.x);
    this._cam.position.z = THREE.MathUtils.clamp(this._cam.position.z, ROOM_MIN.z, ROOM_MAX.z);
    this._cam.position.y = EYE_HEIGHT;
  }

  // ── private ──────────────────────────────────────────────────

  _onClick() {
    // Only capture pointer lock if NOT in locked exam mode
    if (this._moveLocked) return;

    if (!this._locked && document.pointerLockElement !== this._dom) {
      this._dom.requestPointerLock();
    }
  }

  _onMouseDown(e) {
    if (this._moveLocked && (e.button === 0 || e.button === 2)) {
      // Allow drag to look around during exam without pointer-locking cursor
      this._isDragging = true;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    }
  }

  _onMouseUp() {
    this._isDragging = false;
  }

  _onPLChange() {
    this._locked = document.pointerLockElement === this._dom;
    const pointerHint = document.getElementById('pointer-hint');
    if (pointerHint && !this._moveLocked) {
      pointerHint.hidden = this._locked;
    }

    if (this._locked && !this._moveLocked) {
      if (!this._crosshair) {
        this._crosshair = document.createElement('div');
        this._crosshair.className = 'crosshair';
        document.body.appendChild(this._crosshair);
      }
      this._crosshair.style.display = 'block';
    } else {
      if (this._crosshair) this._crosshair.style.display = 'none';
    }
  }

  _unlock() {
    if (document.pointerLockElement === this._dom) document.exitPointerLock();
  }

  _onMouseMove(e) {
    if (this._locked && !this._moveLocked) {
      // Standard pointer lock mouse look
      this._yaw   -= e.movementX * LOOK_SENS;
      this._pitch -= e.movementY * LOOK_SENS;
      this._pitch  = THREE.MathUtils.clamp(this._pitch, -Math.PI * 0.42, Math.PI * 0.42);
      this._applyRotation();
    } else if (this._moveLocked && this._isDragging) {
      // Drag-to-look when seated at desk during exam mode
      const dx = e.clientX - this._lastMouseX;
      const dy = e.clientY - this._lastMouseY;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;

      this._yaw   -= dx * LOOK_SENS * 1.5;
      this._pitch -= dy * LOOK_SENS * 1.5;
      this._pitch  = THREE.MathUtils.clamp(this._pitch, -Math.PI * 0.42, Math.PI * 0.42);
      this._applyRotation();
    }
  }

  _applyRotation() {
    const euler = new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ');
    this._cam.quaternion.setFromEuler(euler);
  }

  _onKeyDown(e) {
    this._keys[e.code] = true;
  }

  _onKeyUp(e) {
    this._keys[e.code] = false;
  }
}
