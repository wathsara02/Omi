import { isSeed } from '@omi/engine';
import { resumeSchema, roomCodeSchema } from '@omi/protocol';
import { describe, expect, test } from 'vitest';
import {
  hashToken,
  newPlayerId,
  newRoomCode,
  newSeed,
  newSessionToken,
  shuffled,
  tokenMatches,
} from '../src/ids';

const many = <T>(make: () => T, count = 500): T[] => Array.from({ length: count }, make);

describe('newRoomCode', () => {
  test('always produces a code the protocol accepts', () => {
    expect(many(newRoomCode).every((code) => roomCodeSchema.safeParse(code).success)).toBe(true);
  });

  test('does not repeat itself in practice', () => {
    expect(new Set(many(newRoomCode)).size).toBeGreaterThan(495);
  });
});

describe('newSessionToken', () => {
  test('always produces a token the protocol accepts', () => {
    const accepted = many(newSessionToken, 50).every(
      (token) => resumeSchema.safeParse({ code: 'ABC234', token }).success,
    );

    expect(accepted).toBe(true);
  });

  test('never repeats', () => {
    expect(new Set(many(newSessionToken)).size).toBe(500);
  });
});

describe('tokenMatches', () => {
  test('accepts the token that produced the hash', () => {
    const token = newSessionToken();

    expect(tokenMatches(token, hashToken(token))).toBe(true);
  });

  test('rejects any other token', () => {
    const hash = hashToken(newSessionToken());

    expect(tokenMatches(newSessionToken(), hash)).toBe(false);
    expect(tokenMatches('', hash)).toBe(false);
  });

  test('does not keep the token itself in the hash', () => {
    const token = newSessionToken();

    expect(hashToken(token).toString('utf8')).not.toContain(token);
    expect(hashToken(token)).toHaveLength(32);
  });
});

describe('newPlayerId', () => {
  test('is url-safe and never repeats', () => {
    const ids = many(newPlayerId);

    expect(ids.every((id) => /^[A-Za-z0-9_-]{16}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(500);
  });
});

describe('newSeed', () => {
  test('always produces a seed the engine accepts, and never the same one', () => {
    const seeds = many(newSeed, 100);

    expect(seeds.every(isSeed)).toBe(true);
    expect(new Set(seeds.map((seed) => seed.join('-'))).size).toBe(100);
  });
});

describe('shuffled', () => {
  const items = [0, 1, 2, 3];

  test('returns the same items without changing the input', () => {
    const result = shuffled(items);

    expect([...result].sort()).toEqual([0, 1, 2, 3]);
    expect(items).toEqual([0, 1, 2, 3]);
  });

  test('produces every ordering sooner or later', () => {
    const orders = new Set(many(() => shuffled(items).join(''), 2000));

    expect(orders.size).toBe(24);
  });
});
