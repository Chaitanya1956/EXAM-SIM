/**
 * timer.js – ExamTimer
 * Part of EXAM//SIM
 *
 * Uses Date.now() timestamps exclusively – never counts ticks.
 * Drives onTick via requestAnimationFrame with a setInterval fallback
 * for background-tab / Quest browser throttling scenarios.
 */

export class ExamTimer {
  /**
   * @param {object}   opts
   * @param {number}   opts.durationMs   – total exam duration in ms
   * @param {function} opts.onTick       – (remainingMs, elapsedMs) called ~1/s
   * @param {function} opts.onWarning    – (type: "half"|"five_min"|"one_min")
   * @param {function} opts.onComplete   – called once when remaining hits 0
   */
  constructor({ durationMs, onTick, onWarning, onComplete }) {
    if (!durationMs || durationMs <= 0) {
      throw new Error('ExamTimer: durationMs must be a positive number');
    }

    this._durationMs  = durationMs;
    this._onTick      = typeof onTick     === 'function' ? onTick     : () => {};
    this._onWarning   = typeof onWarning  === 'function' ? onWarning  : () => {};
    this._onComplete  = typeof onComplete === 'function' ? onComplete : () => {};

    // Runtime state
    this._startTs       = null;   // epoch ms when exam started
    this._running       = false;
    this._completed     = false;

    // Warning tracking – each fires at most once
    this._warnedHalf    = false;
    this._warnedFiveMin = false;
    this._warnedOneMin  = false;

    // rAF + fallback setInterval handles
    this._rafId         = null;
    this._intervalId    = null;

    // Track the last second boundary to gate onTick calls
    this._lastTickSec   = -1;
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  /**
   * Start (or resume after page reload) the countdown.
   * @param {number} startTs – epoch ms timestamp when the exam session began.
   *   If in the past, the timer fast-forwards to the correct position.
   *   Defaults to Date.now() when omitted.
   */
  start(startTs) {
    if (this._running) return;
    if (this._completed) return;

    this._startTs  = typeof startTs === 'number' ? startTs : Date.now();
    this._running  = true;

    // Reset per-second gate based on already-elapsed time
    this._lastTickSec = Math.floor(this.elapsed / 1000);

    // If the session already expired before start() was called (extreme reload case)
    if (this.remaining <= 0) {
      this._finish();
      return;
    }

    this._startRaf();
    this._startFallback();
  }

  /** Halt the timer (called on early exit or after completion). */
  stop() {
    this._running = false;
    this._stopRaf();
    this._stopFallback();
  }

  /** Remaining milliseconds (clamped to 0). */
  get remaining() {
    if (this._startTs === null) return this._durationMs;
    const rem = this._durationMs - (Date.now() - this._startTs);
    return rem > 0 ? rem : 0;
  }

  /** Elapsed milliseconds (clamped to durationMs). */
  get elapsed() {
    if (this._startTs === null) return 0;
    const el = Date.now() - this._startTs;
    return el < this._durationMs ? el : this._durationMs;
  }

  // ─────────────────────────────────────────────
  // Internal – tick logic
  // ─────────────────────────────────────────────

  /**
   * Core tick, called from both rAF loop and setInterval fallback.
   * Fires onTick at each new whole-second boundary; fires warnings; detects completion.
   */
  _tick() {
    if (!this._running || this._completed) return;

    const remaining = this.remaining;
    const elapsed   = this.elapsed;

    // ── Completion ───────────────────────────────
    if (remaining <= 0) {
      this._finish();
      return;
    }

    // ── Warnings (each fires once) ────────────────
    this._checkWarnings(remaining);

    // ── onTick gated to second boundaries ─────────
    const currentSec = Math.floor(elapsed / 1000);
    if (currentSec !== this._lastTickSec) {
      this._lastTickSec = currentSec;
      try { this._onTick(remaining, elapsed); } catch (e) { /* caller fault */ }
    }
  }

  /**
   * Fire warnings when thresholds are crossed (checked every tick).
   * @param {number} remaining – ms remaining
   */
  _checkWarnings(remaining) {
    const ONE_MIN  =  60_000;
    const FIVE_MIN = 300_000;

    // "one_min" – ≤ 1 minute left
    if (!this._warnedOneMin && remaining <= ONE_MIN) {
      this._warnedOneMin = true;
      try { this._onWarning('one_min'); } catch (e) {}
      return; // only one warning per tick cycle
    }

    // "five_min" – ≤ 5 minutes left (only meaningful if duration ≥ 10 min)
    if (!this._warnedFiveMin && this._durationMs >= 600_000 && remaining <= FIVE_MIN) {
      this._warnedFiveMin = true;
      try { this._onWarning('five_min'); } catch (e) {}
      return;
    }

    // "half" – ≤ 50 % remaining
    if (!this._warnedHalf && remaining <= this._durationMs / 2) {
      this._warnedHalf = true;
      try { this._onWarning('half'); } catch (e) {}
    }
  }

  /** Call onComplete exactly once and stop all loops. */
  _finish() {
    if (this._completed) return;
    this._completed = true;
    this.stop();
    // Fire one final onTick at 0 so the HUD shows 00:00
    try { this._onTick(0, this._durationMs); } catch (e) {}
    try { this._onComplete(); } catch (e) {}
  }

  // ─────────────────────────────────────────────
  // Internal – rAF loop
  // ─────────────────────────────────────────────

  _startRaf() {
    if (this._rafId !== null) return;
    const loop = () => {
      if (!this._running) return;
      this._tick();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRaf() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ─────────────────────────────────────────────
  // Internal – setInterval fallback
  // (fires at 500 ms so we don't miss second boundaries
  //  when rAF is throttled to 1 fps in background tabs)
  // ─────────────────────────────────────────────

  _startFallback() {
    if (this._intervalId !== null) return;
    this._intervalId = setInterval(() => {
      if (!this._running) {
        this._stopFallback();
        return;
      }
      this._tick();
    }, 500);
  }

  _stopFallback() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
