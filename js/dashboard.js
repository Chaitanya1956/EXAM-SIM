/**
 * dashboard.js – EXAM//SIM Dashboard Logic
 * ES Module. Loaded by dashboard.html.
 */

import { getLatestSession, getAllSessions, clearAllSessions } from './session-manager.js';

// ─── Design Tokens (mirrored from CSS for canvas & badges) ──────────────────
const COLOR_ACCENT  = '#58a6ff';
const COLOR_ACCENT2 = '#c8a84b';
const COLOR_MUTED   = '#8b949e';
const COLOR_SUCCESS = '#3fb950';
const COLOR_DANGER  = '#f85149';
const COLOR_TEXT    = '#e6edf3';
const COLOR_SURFACE = '#161b22';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * formatDuration(ms) → "10m 00s" or "1h 00m 00s" for >= 1 hr
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '0m 00s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * formatTime(ms) → "MM:SS" or "HH:MM:SS"
 * @param {number} ms
 * @returns {string}
 */
function formatTime(ms) {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * seededRand(seed) → deterministic 0-1 value from integer seed
 * @param {number} seed – integer
 * @returns {number} value in [0, 1)
 */
function seededRand(seed) {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Score Computation ───────────────────────────────────────────────────────

function computeScores(session) {
  const elapsed = typeof session.endTs === 'number' && typeof session.startTs === 'number'
    ? Math.max(0, session.endTs - session.startTs)
    : 0;
  const total = typeof session.durationMs === 'number' && session.durationMs > 0 ? session.durationMs : 1;
  const pct = Math.min(elapsed / total, 1);

  // Hash ID to integer seed
  let seedNum = 42;
  if (session.id && typeof session.id === 'string') {
    for (let i = 0; i < session.id.length; i++) {
      seedNum = ((seedNum << 5) - seedNum) + session.id.charCodeAt(i);
      seedNum |= 0;
    }
  }

  // Focus Score: based on completion % (high completion = high score)
  const baseF = 40 + pct * 55;
  const jitterF = (seededRand(seedNum >>> 0) - 0.5) * 8;
  const focusScore = Math.round(Math.max(10, Math.min(98, baseF + jitterF)));

  // Time Management: how close elapsed is to total
  const deviation = Math.abs(1 - pct);
  const baseT = (1 - deviation) * 95;
  const jitterT = (seededRand((seedNum + 1) >>> 0) - 0.5) * 6;
  const timeManagement = Math.round(Math.max(10, Math.min(99, baseT + jitterT)));

  // Session Consistency: fixed at 85 for MVP
  const sessionConsistency = 85;

  return { focusScore, timeManagement, sessionConsistency };
}

// ─── Overview Section ────────────────────────────────────────────────────────

function populateOverview(session) {
  const grid = document.querySelector('.overview-grid');
  if (!grid) return;

  const elapsed = Math.max(0, (session.endTs || 0) - (session.startTs || 0));
  const total   = session.durationMs || 1;
  const pct     = Math.min(100, Math.round((elapsed / total) * 100));

  let statusText  = 'INCOMPLETE';
  let statusColor = COLOR_MUTED;
  if (session.completed) {
    statusText  = 'COMPLETED';
    statusColor = COLOR_SUCCESS;
  } else if (session.exitedEarly) {
    statusText  = 'EXITED EARLY';
    statusColor = COLOR_DANGER;
  }

  grid.innerHTML = `
    <div class="stat-card" style="--card-accent: ${COLOR_ACCENT}">
      <div class="stat-label">Selected Duration</div>
      <div class="stat-value accent">${formatDuration(session.durationMs)}</div>
      <div class="stat-sub">configured exam time</div>
    </div>
    <div class="stat-card" style="--card-accent: ${COLOR_ACCENT2}">
      <div class="stat-label">Time Spent</div>
      <div class="stat-value amber">${formatDuration(elapsed)}</div>
      <div class="stat-sub">active desk duration</div>
    </div>
    <div class="stat-card" style="--card-accent: ${COLOR_SUCCESS}">
      <div class="stat-label">Completion</div>
      <div class="stat-value success">${pct}%</div>
      <div class="stat-sub">of allocated duration</div>
    </div>
    <div class="stat-card" style="--card-accent: ${statusColor}">
      <div class="stat-label">Session Status</div>
      <div class="stat-value" style="color:${statusColor}; font-size:20px; font-weight:700;">${statusText}</div>
      <div class="stat-sub">termination state</div>
    </div>
  `;
}

// ─── Performance Statistics ──────────────────────────────────────────────────

function populateStats(session) {
  const perfGrid = document.querySelector('.perf-grid');
  if (!perfGrid) return;

  const { focusScore, timeManagement, sessionConsistency } = computeScores(session);

  perfGrid.innerHTML = `
    <div class="perf-card">
      <div class="perf-card-top">
        <span class="perf-label">Simulated Focus</span>
        <span class="simulated-badge">SIMULATED</span>
      </div>
      <div class="perf-pct">${focusScore}%</div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${focusScore}%; --bar-color-start: #58a6ff; --bar-color-end: #79c0ff;"></div>
      </div>
      <div class="perf-desc">Demo estimation of sustained attention and gaze stability at the primary exam desk.</div>
    </div>

    <div class="perf-card">
      <div class="perf-card-top">
        <span class="perf-label">Time Management</span>
        <span class="simulated-badge">SIMULATED</span>
      </div>
      <div class="perf-pct">${timeManagement}%</div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${timeManagement}%; --bar-color-start: #3fb950; --bar-color-end: #56d364;"></div>
      </div>
      <div class="perf-desc">Demo calculation based on pacing against overall allocated exam time.</div>
    </div>

    <div class="perf-card">
      <div class="perf-card-top">
        <span class="perf-label">Session Consistency</span>
        <span class="simulated-badge">SIMULATED</span>
      </div>
      <div class="perf-pct">${sessionConsistency}%</div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${sessionConsistency}%; --bar-color-start: #c8a84b; --bar-color-end: #d4b55a;"></div>
      </div>
      <div class="perf-desc">Standard benchmark score indicating steady simulation environment uptime.</div>
    </div>
  `;
}

// ─── Performance Graph (Canvas) ──────────────────────────────────────────────

function drawPerformanceGraph(canvas, session) {
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width || 600;
  const H = 180;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = COLOR_SURFACE;
  ctx.fillRect(0, 0, W, H);

  const PAD_L = 44, PAD_R = 24, PAD_T = 20, PAD_B = 32;
  const graphW = W - PAD_L - PAD_R;
  const graphH = H - PAD_T - PAD_B;

  // Grid lines
  const yGridLines = [0, 25, 50, 75, 100];
  ctx.strokeStyle = COLOR_MUTED;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.15;
  yGridLines.forEach(val => {
    const y = PAD_T + graphH - (val / 100) * graphH;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(PAD_L + graphW, y);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // Y-axis labels
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.textAlign = 'right';
  yGridLines.forEach(val => {
    const y = PAD_T + graphH - (val / 100) * graphH;
    ctx.fillText(`${val}%`, PAD_L - 6, y + 3);
  });

  // X-axis time points
  const SEGMENTS = 6;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR_MUTED;
  const elapsed = Math.max(0, (session.endTs || 0) - (session.startTs || 0));

  for (let i = 0; i <= SEGMENTS; i++) {
    const x = PAD_L + (i / SEGMENTS) * graphW;
    const tMs = (i / SEGMENTS) * elapsed;
    ctx.fillText(formatTime(tMs), x, PAD_T + graphH + 18);
  }

  // Build simulated curve points
  let seedNum = 99;
  if (session.id && typeof session.id === 'string') {
    for (let i = 0; i < session.id.length; i++) {
      seedNum = ((seedNum << 5) - seedNum) + session.id.charCodeAt(i);
      seedNum |= 0;
    }
  }

  const PTS_COUNT = 10;
  const pts = [];
  const baseY = [92, 88, 82, 75, 68, 72, 78, 85, 89, 90, 88];

  for (let i = 0; i <= PTS_COUNT; i++) {
    const jitter = (seededRand((seedNum + i * 13) >>> 0) - 0.5) * 12;
    const raw = Math.max(20, Math.min(98, baseY[i] + jitter));
    const px = PAD_L + (i / PTS_COUNT) * graphW;
    const py = PAD_T + graphH - (raw / 100) * graphH;
    pts.push({ x: px, y: py });
  }

  // Smooth line
  ctx.strokeStyle = COLOR_ACCENT;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    const cpX = (pts[i].x + pts[i + 1].x) / 2;
    const cpY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpX, cpY);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + graphH);
  grad.addColorStop(0, 'rgba(88,166,255,0.22)');
  grad.addColorStop(1, 'rgba(88,166,255,0.00)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const cpX = (pts[i].x + pts[i + 1].x) / 2;
    const cpY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpX, cpY);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.lineTo(pts[pts.length - 1].x, PAD_T + graphH);
  ctx.lineTo(pts[0].x, PAD_T + graphH);
  ctx.closePath();
  ctx.fill();

  // Data point dots
  ctx.fillStyle = COLOR_ACCENT;
  pts.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Watermark
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = 'bold 36px "IBM Plex Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 12);
  ctx.fillText('SIMULATED DATA', 0, 0);
  ctx.restore();
}

// ─── Timeline ────────────────────────────────────────────────────────────────

function populateTimeline(session) {
  const list = document.getElementById('timeline-list');
  if (!list) return;

  const elapsed = Math.max(0, (session.endTs || 0) - (session.startTs || 0));
  const total   = session.durationMs || 0;

  const milestones = [];

  // 1. Exam started
  milestones.push({
    offsetMs: 0,
    title: 'Exam Session Commenced',
    desc: 'Player anchored at primary examination desk facing blackboard.',
    color: COLOR_ACCENT
  });

  // 2. 50% elapsed mark
  const halfPoint = Math.round(session.durationMs / 2);
  if (elapsed >= halfPoint) {
    milestones.push({
      offsetMs: halfPoint,
      title: '50% Duration Elapsed',
      desc: 'Subtle halfway pacing notification triggered in environment.',
      color: COLOR_ACCENT2
    });
  }

  // 3. 5-minute warning (if duration >= 10 min and session reached that point)
  if (total >= 600000) {
    const fiveMinOffset = total - 300000;
    if (elapsed >= fiveMinOffset) {
      milestones.push({
        offsetMs: fiveMinOffset,
        title: '5-Minute Final Warning',
        desc: 'Prompt notified user that 5 minutes remain in the examination.',
        color: COLOR_ACCENT2
      });
    }
  }

  // 4. 1-minute warning (if session reached that point)
  if (total > 60000) {
    const oneMinOffset = total - 60000;
    if (elapsed >= oneMinOffset) {
      milestones.push({
        offsetMs: oneMinOffset,
        title: '1-Minute Final Warning',
        desc: 'Urgent 60-second remaining advisory displayed.',
        color: COLOR_DANGER
      });
    }
  }

  // 5. Session ended
  const endTitle = session.completed ? 'Exam Completed' : 'Session Exited Early';
  const endDesc = session.completed
    ? 'Timer reached zero. Session concluded normally.'
    : 'Emergency EXIT triggered by student prior to timer expiration.';
  const endColor = session.completed ? COLOR_SUCCESS : COLOR_DANGER;

  milestones.push({
    offsetMs: elapsed,
    title: endTitle,
    desc: endDesc,
    color: endColor
  });

  milestones.sort((a, b) => a.offsetMs - b.offsetMs);

  list.innerHTML = milestones.map(m => `
    <li class="tl-item">
      <div class="tl-dot" style="--dot-color: ${m.color};"></div>
      <div class="tl-content">
        <div class="tl-event">${m.title}</div>
        <div class="tl-desc" style="font-size:12px; color:${COLOR_MUTED}; margin-top:2px;">${m.desc}</div>
        <div class="tl-time" style="font-family:var(--mono); font-size:11px; color:${COLOR_MUTED}; margin-top:4px;">${formatTime(m.offsetMs)} elapsed</div>
      </div>
    </li>
  `).join('');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function populateSummary(session) {
  const summaryText = document.getElementById('summary-text');
  if (!summaryText) return;

  const elapsed = Math.max(0, (session.endTs || 0) - (session.startTs || 0));
  const total = session.durationMs || 1;
  const pct = Math.min(100, Math.round((elapsed / total) * 100));

  const statusPhrase = session.completed
    ? 'completed the full allocated duration'
    : 'exited the examination session early';

  summaryText.textContent = `Your examination session lasted ${formatDuration(elapsed)} out of a planned ${formatDuration(total)} (${pct}% completion). You ${statusPhrase}. This was a simulated examination environment session. All recorded metrics and performance scores are simulated demonstration indicators.`;
}

// ─── Main Initialisation ─────────────────────────────────────────────────────

function init() {
  const session = getLatestSession();

  const noDataEl = document.getElementById('no-data');
  const overviewEl = document.getElementById('overview');
  const statsEl = document.getElementById('stats');
  const timelineEl = document.getElementById('timeline');
  const summaryEl = document.getElementById('summary');
  const btnClear = document.getElementById('btn-clear');

  if (!session) {
    if (noDataEl) noDataEl.hidden = false;
    if (overviewEl) overviewEl.hidden = true;
    if (statsEl) statsEl.hidden = true;
    if (timelineEl) timelineEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (btnClear) btnClear.style.display = 'none';
    return;
  }

  if (noDataEl) noDataEl.hidden = true;
  if (overviewEl) overviewEl.hidden = false;
  if (statsEl) statsEl.hidden = false;
  if (timelineEl) timelineEl.hidden = false;
  if (summaryEl) summaryEl.hidden = false;
  if (btnClear) btnClear.style.display = '';

  populateOverview(session);
  populateStats(session);

  const canvas = document.getElementById('perf-graph');
  if (canvas) {
    drawPerformanceGraph(canvas, session);
    window.addEventListener('resize', () => drawPerformanceGraph(canvas, session));
  }

  populateTimeline(session);
  populateSummary(session);

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (confirm('Clear all session history?')) {
        clearAllSessions();
        location.reload();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
