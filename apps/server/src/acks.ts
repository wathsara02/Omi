import type { EngineError } from '@omi/engine';
import type { Ack, ErrorCode } from '@omi/protocol';

/** Short messages safe to show a player. They never include server detail. */
const MESSAGES: Readonly<Record<ErrorCode, string>> = {
  'invalid-payload': 'That request was not understood.',
  'rate-limited': 'Too many requests. Slow down and try again.',
  'room-not-found': 'No room has that code.',
  'room-full': 'That room already has four players.',
  'server-full': 'The server is full. Try again later.',
  'match-in-progress': 'That match has already started.',
  'already-in-room': 'You are already in a room.',
  'not-in-room': 'You are not in a room.',
  'not-host': 'Only the host can start the match.',
  'not-enough-players': 'Four players are needed to start.',
  'player-not-found': 'That player is not in the room.',
  'cannot-kick-self': 'You cannot remove yourself; leave the room instead.',
  'no-match': 'There is no match in progress.',
  'stale-action': 'That turn has already passed.',
  'session-invalid': 'That seat could not be restored.',
  internal: 'Something went wrong.',
  'invalid-config': 'Something went wrong.',
  'invalid-seed': 'Something went wrong.',
  'invalid-action': 'That move is not possible.',
  'wrong-phase': 'That is not possible right now.',
  'not-trump-caller': 'Only the trump caller can name trump.',
  'not-your-turn': 'It is not your turn.',
  'card-not-in-hand': 'You do not hold that card.',
  'must-follow-suit': 'You must follow suit.',
};

export const succeed = <T>(data: T): Ack<T> => ({ ok: true, data });

export const OK: Ack = succeed(null);

export const fail = (code: ErrorCode): Ack<never> => ({
  ok: false,
  error: { code, message: MESSAGES[code] },
});

export const failFromEngine = (error: EngineError): Ack<never> => fail(error.code);
