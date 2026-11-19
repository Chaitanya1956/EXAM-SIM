/**
 * clock.js  –  Drives the analogue clock hands exported from Blender.
 *
 * The Blender script exports three child objects of EXAM_CLOCK:
 *   EXAM_CLOCK_HOUR_HAND   – local Y rotation = clock-wise angle in radians
 *   EXAM_CLOCK_MINUTE_HAND
 *   EXAM_CLOCK_SECOND_HAND
 *
 * In the GLB each hand pivots about its parent (EXAM_CLOCK) which is
 * positioned at the clock centre on the wall.  The hands rotate about
 * their local Y axis (pointing away from the wall) in Blender's
 * coordinate frame.  After the Y-up glTF conversion this becomes
 * rotation about the Z-axis in Three.js space, but the GLTFLoader
 * re-maps it back to the original local axes, so we just set
 * object.rotation.y (which the exporter stores as the axis pointing out
 * of the wall face).
 *
 * API:
 *   const ck = new ClockAnimator(namedObjects);
 *   ck.update();   // call every frame  (or on requestAnimationFrame)
 */

const TAU = Math.PI * 2;

export class ClockAnimator {
  constructor(named) {
    this._h = named['EXAM_CLOCK_HOUR_HAND']   || null;
    this._m = named['EXAM_CLOCK_MINUTE_HAND'] || null;
    this._s = named['EXAM_CLOCK_SECOND_HAND'] || null;

    if (!this._h && !this._m) {
      console.warn('ClockAnimator: clock hand objects not found in scene. Clock will be static.');
    }
  }

  update() {
    const now = new Date();
    const sec  = now.getSeconds() + now.getMilliseconds() / 1000;
    const min  = now.getMinutes() + sec  / 60;
    const hour = (now.getHours() % 12) + min / 60;

    // Blender's hand geometry points straight up at 0 rotation.
    // Positive clock-wise angle = negative rotation in a right-hand Y-up system.
    if (this._h) this._h.rotation.y = -(hour / 12) * TAU;
    if (this._m) this._m.rotation.y = -(min  / 60) * TAU;
    if (this._s) this._s.rotation.y = -(sec  / 60) * TAU;
  }
}
