/**
 * session-manager.js
 * EXAM//SIM – Session persistence layer
 *
 * localStorage keys:
 *   "examSim_sessions" – JSON array of all session objects (most recent first)
 *   "examSim_pending"  – Single session object staged by exam-setup.html
 *
 * Session object schema:
 * {
 *   id:          string   – UUID v4
 *   durationMs:  number   – intended exam duration in milliseconds
 *   startTs:     number | null  – epoch ms when exam actually started
 *   endTs:       number | null  – epoch ms when exam ended
 *   completed:   boolean  – true = timer reached zero naturally
 *   exitedEarly: boolean  – true = user pressed EXIT before time ran out
 * }
 *
 * All functions are named exports; this file is an ES module.
 */

'use strict';

const SESSIONS_KEY = 'examSim_sessions';
const PENDING_KEY  = 'examSim_pending';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * _save(sessions)
 * Persists the sessions array to localStorage, overwriting any previous value.
 * @param {Array} sessions
 */
function _save(sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error('[session-manager] Failed to save sessions:', err);
  }
}

/**
 * _load()
 * Reads and parses the sessions array from localStorage.
 * Returns an empty array if the key is absent or the JSON is invalid.
 * @returns {Array}
 */
function _load() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[session-manager] Could not parse sessions from localStorage:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pending session (set by exam-setup.html before redirecting to index.html)
// ---------------------------------------------------------------------------

/**
 * getPendingSession()
 * Reads the staged session object written by exam-setup.html.
 * Returns null if nothing is pending or the stored value is invalid.
 * @returns {Object|null}
 */
export function getPendingSession() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Basic sanity check – must at minimum have an id and durationMs
    if (!session || typeof session.id !== 'string' || typeof session.durationMs !== 'number') {
      console.warn('[session-manager] Pending session has unexpected shape, ignoring.');
      return null;
    }
    return session;
  } catch (err) {
    console.warn('[session-manager] Could not parse pending session:', err);
    return null;
  }
}

/**
 * clearPendingSession()
 * Removes the pending session key from localStorage.
 * Call this after activateSession() so the same session is not re-activated
 * on a page reload.
 * @returns {void}
 */
export function clearPendingSession() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (err) {
    console.error('[session-manager] Failed to clear pending session:', err);
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * activateSession(session)
 * Records the moment the exam actually begins:
 *   - Sets startTs to the current epoch milliseconds (Date.now()).
 *   - Ensures completed and exitedEarly are false (exam is in progress).
 *   - Prepends the session to the persisted sessions array.
 *
 * Call this inside index.html as soon as the exam mode is fully initialised,
 * *after* calling getPendingSession() and clearPendingSession().
 *
 * @param {Object} session – The pending session object returned by getPendingSession()
 * @returns {void}
 */
export function activateSession(session) {
  if (!session || typeof session.id !== 'string') {
    console.error('[session-manager] activateSession: invalid session object', session);
    return;
  }

  const activated = Object.assign({}, session, {
    startTs:     Date.now(),
    endTs:       null,
    completed:   false,
    exitedEarly: false,
  });

  const sessions = _load();

  // Guard: prevent duplicate activations (e.g. rapid double-load)
  const existingIndex = sessions.findIndex(function(s) { return s.id === activated.id; });
  if (existingIndex !== -1) {
    // Update in place rather than prepending a duplicate
    sessions[existingIndex] = activated;
  } else {
    sessions.unshift(activated); // Most recent first
  }

  _save(sessions);
  clearPendingSession();   // remove pending once activated
  return activated;        // main.js needs the activated session object back
}

/**
 * completeSession(id, { completed, exitedEarly })
 * Marks the session identified by `id` as finished:
 *   - Sets endTs to the current epoch milliseconds (Date.now()).
 *   - Applies the supplied completed / exitedEarly flags.
 *
 * @param {string}  id
 * @param {Object}  flags
 * @param {boolean} flags.completed    – true if the timer reached zero
 * @param {boolean} flags.exitedEarly  – true if the user pressed EXIT
 * @returns {void}
 */
export function completeSession(id, flags) {
  if (typeof id !== 'string' || !id) {
    console.error('[session-manager] completeSession: id must be a non-empty string');
    return;
  }

  const resolvedFlags = {
    completed:   !!(flags && flags.completed),
    exitedEarly: !!(flags && flags.exitedEarly),
  };

  const sessions = _load();
  const index = sessions.findIndex(function(s) { return s.id === id; });

  if (index === -1) {
    console.warn('[session-manager] completeSession: session not found –', id);
    return;
  }

  sessions[index] = Object.assign({}, sessions[index], {
    endTs:       Date.now(),
    completed:   resolvedFlags.completed,
    exitedEarly: resolvedFlags.exitedEarly,
  });

  _save(sessions);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * getAllSessions()
 * Returns a copy of every stored session, most recent first.
 * @returns {Array}
 */
export function getAllSessions() {
  return _load();
}

/**
 * getSession(id)
 * Finds and returns the session with the given id, or null if not found.
 * @param {string} id
 * @returns {Object|null}
 */
export function getSession(id) {
  if (typeof id !== 'string' || !id) return null;
  const sessions = _load();
  return sessions.find(function(s) { return s.id === id; }) || null;
}

/**
 * getLatestSession()
 * Returns the most recently activated session (index 0 in the stored array),
 * or null if no sessions have been recorded yet.
 * @returns {Object|null}
 */
export function getLatestSession() {
  const sessions = _load();
  return sessions.length > 0 ? sessions[0] : null;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * clearAllSessions()
 * Removes the sessions array from localStorage entirely.
 * Useful for a "reset" or "clear history" button in dashboard.html.
 * @returns {void}
 */
export function clearAllSessions() {
  try {
    localStorage.removeItem(SESSIONS_KEY);
  } catch (err) {
    console.error('[session-manager] Failed to clear sessions:', err);
  }
}
