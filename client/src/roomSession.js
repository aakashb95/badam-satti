const LEGACY_ROOM_SESSION_KEY = 'badam-satti-room-session';
const TAB_ROOM_SESSION_KEY = 'badam-satti-tab-room-session-v2';
const SAVED_ROOM_SESSIONS_KEY = 'badam-satti-saved-room-sessions-v2';
const MAX_SAVED_ROOM_SESSIONS = 8;

function isRoomSession(value) {
  return Boolean(
    value &&
    typeof value.username === 'string' &&
    value.username.trim().length > 0 &&
    typeof value.roomCode === 'string' &&
    /^[A-Z0-9]{6}$/.test(value.roomCode) &&
    typeof value.sessionToken === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.sessionToken)
  );
}

function normalizeRoomSession(value) {
  if (!isRoomSession(value)) return null;
  return {
    username: value.username.trim(),
    roomCode: value.roomCode,
    sessionToken: value.sessionToken,
  };
}

function parseStoredValue(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function sameRoomSession(first, second) {
  return Boolean(
    first &&
    second &&
    first.roomCode === second.roomCode &&
    first.username === second.username &&
    first.sessionToken === second.sessionToken
  );
}

function readSavedRoomSessions(localStorage) {
  const stored = parseStoredValue(localStorage, SAVED_ROOM_SESSIONS_KEY);
  if (!Array.isArray(stored)) return [];

  return stored
    .map((entry) => {
      const session = normalizeRoomSession(entry);
      return session
        ? { ...session, updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0 }
        : null;
    })
    .filter(Boolean)
    .sort((first, second) => second.updatedAt - first.updatedAt);
}

function writeSavedRoomSessions(localStorage, sessions) {
  try {
    if (sessions.length === 0) {
      localStorage.removeItem(SAVED_ROOM_SESSIONS_KEY);
      return;
    }
    localStorage.setItem(SAVED_ROOM_SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SAVED_ROOM_SESSIONS)));
  } catch {
    // The room still works in this tab when browser storage is unavailable.
  }
}

export function loadTabRoomSession(sessionStorage = window.sessionStorage) {
  return normalizeRoomSession(parseStoredValue(sessionStorage, TAB_ROOM_SESSION_KEY));
}

export function loadMostRecentSavedRoomSession(localStorage = window.localStorage) {
  const savedSession = readSavedRoomSessions(localStorage)[0];
  if (savedSession) return normalizeRoomSession(savedSession);
  return normalizeRoomSession(parseStoredValue(localStorage, LEGACY_ROOM_SESSION_KEY));
}

export function findSavedRoomSession(
  roomCode,
  username,
  sessionStorage = window.sessionStorage,
  localStorage = window.localStorage,
) {
  const normalizedCode = roomCode.trim().toUpperCase();
  const normalizedUsername = username.trim();
  const tabSession = loadTabRoomSession(sessionStorage);
  if (
    tabSession?.roomCode === normalizedCode &&
    tabSession.username === normalizedUsername
  ) {
    return tabSession;
  }

  const savedSession = readSavedRoomSessions(localStorage).find(
    (session) => session.roomCode === normalizedCode && session.username === normalizedUsername,
  );
  if (savedSession) return normalizeRoomSession(savedSession);

  const legacySession = normalizeRoomSession(parseStoredValue(localStorage, LEGACY_ROOM_SESSION_KEY));
  return legacySession?.roomCode === normalizedCode && legacySession.username === normalizedUsername
    ? legacySession
    : null;
}

export function findSavedRoomSessionForRoom(
  roomCode,
  sessionStorage = window.sessionStorage,
  localStorage = window.localStorage,
) {
  const normalizedCode = roomCode.trim().toUpperCase();
  const tabSession = loadTabRoomSession(sessionStorage);
  if (tabSession?.roomCode === normalizedCode) return tabSession;

  const savedSession = readSavedRoomSessions(localStorage).find(
    (session) => session.roomCode === normalizedCode,
  );
  if (savedSession) return normalizeRoomSession(savedSession);

  const legacySession = normalizeRoomSession(parseStoredValue(localStorage, LEGACY_ROOM_SESSION_KEY));
  return legacySession?.roomCode === normalizedCode ? legacySession : null;
}

export function saveRoomSession(
  value,
  sessionStorage = window.sessionStorage,
  localStorage = window.localStorage,
  now = Date.now(),
) {
  const session = normalizeRoomSession(value);
  if (!session) return;

  try {
    sessionStorage.setItem(TAB_ROOM_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The live in-memory session still works when browser storage is unavailable.
  }

  const savedSessions = readSavedRoomSessions(localStorage)
    .filter((candidate) => (
      candidate.roomCode !== session.roomCode || candidate.username !== session.username
    ));
  writeSavedRoomSessions(localStorage, [{ ...session, updatedAt: now }, ...savedSessions]);

  try {
    localStorage.removeItem(LEGACY_ROOM_SESSION_KEY);
  } catch {
    // Ignore cleanup failures because the new records are already saved.
  }
}

export function clearRoomSession(
  value,
  sessionStorage = window.sessionStorage,
  localStorage = window.localStorage,
) {
  const tabSession = loadTabRoomSession(sessionStorage);
  const session = normalizeRoomSession(value) || tabSession;
  if (!session) return;

  if (!value || sameRoomSession(tabSession, session)) {
    try {
      sessionStorage.removeItem(TAB_ROOM_SESSION_KEY);
    } catch {
      // The live in-memory session can still be cleared.
    }
  }

  const remainingSessions = readSavedRoomSessions(localStorage)
    .filter((candidate) => !sameRoomSession(candidate, session));
  writeSavedRoomSessions(localStorage, remainingSessions);

  const legacySession = normalizeRoomSession(parseStoredValue(localStorage, LEGACY_ROOM_SESSION_KEY));
  if (sameRoomSession(legacySession, session)) {
    try {
      localStorage.removeItem(LEGACY_ROOM_SESSION_KEY);
    } catch {
      // Ignore cleanup failures because the active tab state is already cleared.
    }
  }
}

export const roomSessionStorageKeys = {
  legacy: LEGACY_ROOM_SESSION_KEY,
  tab: TAB_ROOM_SESSION_KEY,
  saved: SAVED_ROOM_SESSIONS_KEY,
};
