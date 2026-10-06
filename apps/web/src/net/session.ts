/**
 * What a player needs to reclaim their seat after a reload. Kept in
 * localStorage so it survives a closed tab; the page ships no third-party
 * scripts and sets a strict Content-Security-Policy to protect it.
 */
export interface StoredSession {
  readonly playerId: string;
  readonly token: string;
}

const SESSION_PREFIX = 'omi.session.';
const NAME_KEY = 'omi.name';

const isStoredSession = (value: unknown): value is StoredSession => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { playerId?: unknown; token?: unknown };
  return typeof candidate.playerId === 'string' && typeof candidate.token === 'string';
};

/** Storage can throw (private mode, quota, blocked); the game must still work without it. */
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the only loss is reconnecting after a reload.
  }
};

export const loadSession = (roomCode: string): StoredSession | null => {
  const stored = read(SESSION_PREFIX + roomCode);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isStoredSession(parsed) ? { playerId: parsed.playerId, token: parsed.token } : null;
  } catch {
    return null;
  }
};

export const saveSession = (roomCode: string, session: StoredSession): void => {
  write(SESSION_PREFIX + roomCode, JSON.stringify(session));
};

export const clearSession = (roomCode: string): void => {
  write(SESSION_PREFIX + roomCode, null);
};

export const loadName = (): string => read(NAME_KEY) ?? '';

export const saveName = (name: string): void => {
  write(NAME_KEY, name);
};
