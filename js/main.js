/**
 * main.js  –  EXAM//SIM entry point.
 * Ties together scene.js, controls.js, vr.js, clock.js, vr-hud.js.
 * Supports ?session=<id> locked exam mode with both desktop and VR 3D HUD.
 */

import { scene, renderer, camera, clock, loadHall, getNamedObjects } from './scene.js';
import { FPControls }                                                 from './controls.js';
import { initVR }                                                     from './vr.js';
import { ClockAnimator }                                              from './clock.js';
import { ExamTimer }                                                  from './timer.js';
import { activateSession, completeSession }                           from './session-manager.js';
import { VRExamHUD }                                                  from './vr-hud.js';

// ── DOM references ───────────────────────────────────────────────
const loadingScreen    = document.getElementById('loading-screen');
const errorScreen      = document.getElementById('error-screen');
const errorDetail      = document.getElementById('error-detail');
const loadBar          = document.getElementById('load-bar');
const loadStatus       = document.getElementById('load-status');
const hud              = document.getElementById('hud');
const pointerHint      = document.getElementById('pointer-hint');
const btnEnter         = document.getElementById('btn-enter');
const btnVR            = document.getElementById('btn-vr');
const btnReset         = document.getElementById('btn-reset');
const btnRetry         = document.getElementById('btn-retry');
const btnStartExamNav  = document.getElementById('btn-start-exam-nav');

// ── Global state ─────────────────────────────────────────────────
let controls    = null;
let clockAnim   = null;
let vrManager   = null;
let vrExamHud   = null;
let hall        = null;
let examLocked  = false;   // when true renderLoop skips locomotion
let examTimer   = null;    // ExamTimer instance (exam mode only)

// ── Detect exam session in URL ───────────────────────────────────
const _params    = new URLSearchParams(location.search);
const sessionId  = _params.get('session');
const EXAM_MODE  = Boolean(sessionId);

// ── Loading helpers ──────────────────────────────────────────────
function setProgress(pct, label) {
  loadBar.style.width    = `${Math.round(pct)}%`;
  loadStatus.textContent = label || '';
}

function showError(msg) {
  loadingScreen.hidden    = true;
  errorScreen.hidden      = false;
  errorDetail.textContent = msg;
}

function hideLoading() {
  loadingScreen.classList.add('fade-out');
  loadingScreen.addEventListener('transitionend', () => {
    loadingScreen.hidden = true;
  }, { once: true });
  hud.hidden         = false;
  if (!EXAM_MODE) {
    pointerHint.hidden = false;
  }
}

// ── Time formatting ───────────────────────────────────────────────
/**
 * formatTime(ms) → "MM:SS" for < 1 hr, "H:MM:SS" for >= 1 hr.
 */
function formatTime(ms) {
  var totalSecs = Math.max(0, Math.floor(ms / 1000));
  var h  = Math.floor(totalSecs / 3600);
  var m  = Math.floor((totalSecs % 3600) / 60);
  var s  = totalSecs % 60;

  var mm = m < 10 ? '0' + m : '' + m;
  var ss = s < 10 ? '0' + s : '' + s;

  if (h > 0) {
    return h + ':' + mm + ':' + ss;
  }
  return mm + ':' + ss;
}

// ── Exam HUD injection ───────────────────────────────────────────
function injectExamHUD() {
  // ── Desktop Exam HUD panel (top-right) ───────────────────────
  var examHud = document.createElement('div');
  examHud.id = 'exam-hud';
  examHud.style.cssText = [
    'position:fixed',
    'top:20px',
    'right:20px',
    'z-index:50',
    'background:rgba(13,17,23,0.92)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:8px',
    'padding:14px 20px',
    'font-family:IBM Plex Mono,monospace',
    'display:flex',
    'flex-direction:column',
    'align-items:flex-end',
    'gap:8px',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)'
  ].join(';');

  var statusEl = document.createElement('div');
  statusEl.id = 'exam-status';
  statusEl.textContent = 'IN PROGRESS';
  statusEl.style.cssText = [
    'font-size:0.65rem',
    'color:#58a6ff',
    'letter-spacing:0.14em',
    'text-transform:uppercase'
  ].join(';');

  var timerEl = document.createElement('div');
  timerEl.id = 'exam-timer';
  timerEl.textContent = '--:--';
  timerEl.style.cssText = [
    'font-size:2rem',
    'font-weight:600',
    'color:#e6edf3',
    'letter-spacing:0.04em'
  ].join(';');

  var btnExit = document.createElement('button');
  btnExit.id = 'btn-exit-exam';
  btnExit.textContent = 'EXIT EXAM';
  btnExit.style.cssText = [
    'font-size:0.75rem',
    'font-weight:600',
    'padding:8px 16px',
    'background:#f85149',
    'color:#fff',
    'border:none',
    'border-radius:4px',
    'cursor:pointer',
    'font-family:inherit',
    'letter-spacing:0.06em',
    'transition:opacity 0.2s'
  ].join(';');
  btnExit.onmouseover = () => { btnExit.style.opacity = '0.85'; };
  btnExit.onmouseout  = () => { btnExit.style.opacity = '1'; };

  examHud.appendChild(statusEl);
  examHud.appendChild(timerEl);
  examHud.appendChild(btnExit);

  var hudContainer = hud || document.body;
  hudContainer.appendChild(examHud);

  // ── Notification banner (centered, top) ───────────────────────
  var notification = document.createElement('div');
  notification.id = 'exam-notification';
  notification.style.cssText = [
    'position:fixed',
    'top:80px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:60',
    'background:rgba(13,17,23,0.95)',
    'border:1px solid #c8a84b',
    'border-radius:20px',
    'padding:8px 22px',
    'font-family:IBM Plex Mono,monospace',
    'font-size:0.80rem',
    'color:#c8a84b',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 0.4s'
  ].join(';');
  document.body.appendChild(notification);

  return { btnExit: btnExit };
}

// ── Notification helper ──────────────────────────────────────────
var _notifTimeout = null;
function showNotification(msg) {
  var el = document.getElementById('exam-notification');
  if (el) {
    el.textContent = msg;
    el.style.opacity = '1';
    if (_notifTimeout) clearTimeout(_notifTimeout);
    _notifTimeout = setTimeout(function() {
      el.style.opacity = '0';
    }, 4500);
  }

  // Also broadcast to 3D VR HUD
  if (vrExamHud) {
    vrExamHud.showNotification(msg);
  }
}

// ── Warning message map ──────────────────────────────────────────
function warningMsg(type) {
  if (type === 'half')     return '⚑ Half time has elapsed.';
  if (type === 'five_min') return '⚠ 5 minutes remaining!';
  if (type === 'one_min')  return '🔴 1 minute remaining!';
  return '⚑ ' + type;
}

// ── Lock player at desk ──────────────────────────────────────────
function lockPlayerAtDesk(fpControls) {
  camera.position.set(0, 1.15, 1.20);
  camera.lookAt(0, 1.00, -1.60);

  if (fpControls && typeof fpControls.setLocked === 'function') {
    fpControls.setLocked(true);
  }

  examLocked = true;

  if (document.exitPointerLock) {
    document.exitPointerLock();
  }
}

// ── End exam ────────────────────────────────────────────────────
function endExam(session, completed) {
  // 1 – Stop timer
  if (examTimer) examTimer.stop();

  // 2 – Persist result
  var now     = Date.now();
  var elapsed = now - session.startTs;
  completeSession(session.id, { completed: completed, exitedEarly: !completed });

  // 3 – Update 3D VR HUD status
  if (vrExamHud) {
    vrExamHud.setStatus(completed ? 'COMPLETED' : 'ENDED');
  }

  // 4 – End any active WebXR session
  if (vrManager && vrManager.active && vrManager.xrSession) {
    vrManager.xrSession.end().catch(function() {});
  }

  // 5 – Update Desktop HUD status
  var statusEl = document.getElementById('exam-status');
  if (statusEl) {
    statusEl.textContent = completed ? 'COMPLETED' : 'ENDED';
    statusEl.style.color = completed ? '#3fb950' : '#f85149';
  }

  // 6 – Build completion overlay
  var overlay = document.createElement('div');
  overlay.id  = 'exam-complete';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:200',
    'background:rgba(13,17,23,0.97)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-family:IBM Plex Mono,monospace'
  ].join(';');

  var title      = completed ? 'EXAM COMPLETED' : 'SESSION ENDED';
  var badgeColor = completed ? '#3fb950' : '#f85149';
  var badgeText  = completed ? 'COMPLETED' : 'EXITED EARLY';

  var plannedMin = Math.round(session.durationMs / 60000);
  var elapsedMin = Math.floor(elapsed / 60000);
  var elapsedSec = Math.floor((elapsed % 60000) / 1000);
  var elapsedStr = elapsedMin + 'm ' + (elapsedSec < 10 ? '0' : '') + elapsedSec + 's';

  overlay.innerHTML = [
    '<div style="',
      'max-width:420px;width:90%;',
      'background:#161b22;',
      'border:1px solid rgba(255,255,255,0.10);',
      'border-radius:12px;',
      'padding:40px 36px;',
      'display:flex;flex-direction:column;align-items:center;gap:20px;',
      'text-align:center;',
    '">',
      '<div style="font-size:0.65rem;color:#58a6ff;letter-spacing:0.18em;text-transform:uppercase;">EXAM//SIM</div>',
      '<h1 style="margin:0;font-size:1.5rem;font-weight:700;color:#e6edf3;letter-spacing:0.06em;">' + title + '</h1>',
      '<span style="',
        'display:inline-block;',
        'font-size:0.65rem;letter-spacing:0.12em;',
        'color:' + badgeColor + ';',
        'border:1px solid ' + badgeColor + ';',
        'border-radius:20px;padding:4px 14px;',
      '">' + badgeText + '</span>',
      '<div style="',
        'width:100%;background:rgba(255,255,255,0.04);',
        'border-radius:8px;padding:16px 20px;',
        'display:flex;flex-direction:column;gap:10px;text-align:left;',
        'font-size:0.80rem;color:#8b949e;',
      '">',
        '<div style="display:flex;justify-content:space-between;">',
          '<span>Planned Duration</span>',
          '<span style="color:#e6edf3;">' + plannedMin + ' min</span>',
        '</div>',
        '<div style="display:flex;justify-content:space-between;">',
          '<span>Actual Elapsed</span>',
          '<span style="color:#e6edf3;">' + elapsedStr + '</span>',
        '</div>',
        '<div style="display:flex;justify-content:space-between;">',
          '<span>Session ID</span>',
          '<span style="color:#e6edf3;font-size:0.70rem;">' + session.id + '</span>',
        '</div>',
      '</div>',
      '<button id="btn-view-results" style="',
        'margin-top:8px;',
        'width:100%;padding:12px;',
        'background:#58a6ff;color:#0d1117;',
        'border:none;border-radius:6px;',
        'font-size:0.80rem;font-weight:700;',
        'letter-spacing:0.08em;cursor:pointer;',
        'font-family:inherit;',
      '">VIEW RESULTS →</button>',
    '</div>'
  ].join('');

  document.body.appendChild(overlay);

  document.getElementById('btn-view-results').addEventListener('click', function() {
    location.href = 'dashboard.html';
  });
}

// ── Boot sequence ────────────────────────────────────────────────
async function boot() {
  setProgress(5, 'Initialising Three.js…');

  // ── Resolve pending exam session early ───────────────────────
  var session = null;
  if (EXAM_MODE) {
    var raw = null;
    try { raw = localStorage.getItem('examSim_pending'); } catch(e) {}
    var pending = null;
    if (raw) {
      try { pending = JSON.parse(raw); } catch(e) {}
    }

    if (!pending || pending.id !== sessionId) {
      showError('No matching pending exam session found for id: ' + sessionId +
                '. Please return to the exam setup page.');
      return;
    }

    session = activateSession(pending);
  }

  // 1 – Load the GLB
  setProgress(10, 'Requesting examination hall…');
  try {
    hall = await loadHall(({ loaded, total, label }) => {
      const pct = 10 + Math.round((loaded / total) * 75);
      setProgress(pct, label);
    });
  } catch (err) {
    showError(err.message);
    return;
  }

  setProgress(90, 'Preparing controls…');

  // 2 – Desktop controls
  controls = new FPControls(camera, renderer.domElement);
  controls.connect();

  // 3 – Named-object clock
  setProgress(93, 'Syncing clock…');
  clockAnim = new ClockAnimator(getNamedObjects());

  // 4 – WebXR
  setProgress(96, 'Checking WebXR support…');
  vrManager = await initVR(renderer, scene, camera, btnVR);

  setProgress(100, 'Ready.');

  // 5 – Show UI
  setTimeout(hideLoading, 400);

  // ── Button handlers (free-roam) ────────────────────────────
  if (btnEnter) {
    btnEnter.addEventListener('click', () => {
      if (!EXAM_MODE && !controls.isLocked) renderer.domElement.requestPointerLock();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (!EXAM_MODE) {
        controls.reset();
        console.log('EXAM//SIM: position reset.');
      }
    });
  }

  btnRetry.addEventListener('click', () => {
    errorScreen.hidden   = true;
    loadingScreen.hidden = false;
    loadingScreen.classList.remove('fade-out');
    setProgress(0, 'Retrying…');
    boot();
  });

  // ── Exam mode setup ────────────────────────────────────────
  if (EXAM_MODE && session) {
    // Hide free-roam elements
    if (btnEnter)        { btnEnter.hidden = true; btnEnter.disabled = true; }
    if (btnReset)        { btnReset.hidden = true; btnReset.disabled = true; }
    if (btnStartExamNav) { btnStartExamNav.hidden = true; }

    var hintEl = document.getElementById('controls-hint');
    if (hintEl) {
      hintEl.innerHTML = '<span class="key">Mouse Drag</span> Look Around &nbsp; <span class="key">Desk</span> Locked';
    }
    if (pointerHint) pointerHint.hidden = true;

    // Lock camera at exam desk
    lockPlayerAtDesk(controls);

    // Inject Desktop 2D HUD
    var hudRefs = injectExamHUD();
    hudRefs.btnExit.addEventListener('click', function() {
      endExam(session, false);
    });

    // Create In-World 3D VR HUD (visible in WebXR headset and desktop)
    vrExamHud = new VRExamHUD({
      scene: scene,
      renderer: renderer,
      onExitClick: function() {
        endExam(session, false);
      }
    });
    vrExamHud.show();

    // Attach controller trigger listener for VR HUD raycast interaction
    if (vrManager && vrManager.controllers) {
      vrManager.controllers.forEach(({ ctrl }) => {
        ctrl.addEventListener('selectstart', () => {
          if (vrExamHud) {
            vrExamHud.triggerSelect(ctrl);
          }
        });
      });
    }

    // Start timer
    examTimer = new ExamTimer({
      durationMs: session.durationMs,
      onTick: function(remaining) {
        var formatted = formatTime(remaining);
        var el = document.getElementById('exam-timer');
        if (el) el.textContent = formatted;
        if (vrExamHud) vrExamHud.updateTime(formatted);
      },
      onWarning: function(type) {
        showNotification(warningMsg(type));
      },
      onComplete: function() {
        endExam(session, true);
      }
    });

    examTimer.start(session.startTs);
  }

  // 6 – Start render loop
  renderer.setAnimationLoop(renderLoop);
}

// ── Render loop ──────────────────────────────────────────────────
function renderLoop() {
  const dt = Math.min(clock.getDelta(), 0.1);

  // Desktop locomotion
  if (controls && !examLocked && vrManager && !vrManager.active) {
    controls.update(dt);
  } else if (controls && !examLocked && !vrManager) {
    controls.update(dt);
  }

  // Real-time analog clock hands
  clockAnim && clockAnim.update();

  // In VR exam mode: raycast controller to 3D HUD for hover highlights
  if (vrExamHud && vrManager && vrManager.active && vrManager.controllers) {
    vrManager.controllers.forEach(({ ctrl }) => {
      vrExamHud.checkRaycast(ctrl);
    });
  }

  renderer.render(scene, camera);
}

// ── Go ───────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('EXAM//SIM boot error:', err);
  showError(err.message);
});
