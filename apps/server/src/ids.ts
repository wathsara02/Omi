import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Seed } from '@omi/engine';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@omi/protocol';

// Everything here draws from the operating system's cryptographic generator.
// Room codes, session tokens and shuffle seeds all guard hidden information.

const SESSION_TOKEN_BYTES = 32;
const PLAYER_ID_BYTES = 12;
const SEED_WORDS = 4;

export const newRoomCode = (): string =>
  Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
  ).join('');

/** The secret a player presents to reclaim their seat. Sent to them once. */
export const newSessionToken = (): string => randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

/** Public id used to tell players apart; reveals nothing about the token. */
export const newPlayerId = (): string => randomBytes(PLAYER_ID_BYTES).toString('base64url');

/** Only this hash is kept in memory, never the token itself. */
export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

export const tokenMatches = (token: string, expectedHash: Buffer): boolean =>
  timingSafeEqual(hashToken(token), expectedHash);

/** 128 fresh bits for the engine's shuffle; one per match and one per round. */
export const newSeed = (): Seed =>
  Array.from(crypto.getRandomValues(new Uint32Array(SEED_WORDS))) as [
    number,
    number,
    number,
    number,
  ];

/** Fisher–Yates on a copy, using the cryptographic generator. */
export const shuffled = <T>(items: readonly T[]): T[] => {
  const result = [...items];
  for (let last = result.length - 1; last > 0; last -= 1) {
    const pick = randomInt(last + 1);
    const moved = result[last] as T;
    result[last] = result[pick] as T;
    result[pick] = moved;
  }
  return result;
};
