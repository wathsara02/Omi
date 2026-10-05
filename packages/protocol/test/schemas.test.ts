import { describe, expect, test } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  callTrumpSchema,
  createRoomSchema,
  joinRoomSchema,
  playCardSchema,
  playerNameSchema,
  resumeSchema,
  roomCodeSchema,
} from '../src/index';

const TOKEN = 'a'.repeat(43);

describe('playerNameSchema', () => {
  test('trims the name', () => {
    expect(playerNameSchema.parse('  Nimal  ')).toBe('Nimal');
  });

  test('accepts 1 to 20 characters', () => {
    expect(playerNameSchema.safeParse('A').success).toBe(true);
    expect(playerNameSchema.safeParse('A'.repeat(20)).success).toBe(true);
  });

  test.each([
    ['an empty name', ''],
    ['only spaces', '    '],
    ['21 characters', 'A'.repeat(21)],
    ['a control character', 'Ni\u0007mal'],
    ['a right-to-left override', 'Ni\u202Emal'],
    ['a zero-width space', 'Ni\u200Bmal'],
    ['a number', 7],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(playerNameSchema.safeParse(value).success).toBe(false);
  });
});

describe('roomCodeSchema', () => {
  test('trims and upper-cases the code', () => {
    expect(roomCodeSchema.parse(' abc234 ')).toBe('ABC234');
  });

  test('leaves out characters that are easy to confuse', () => {
    for (const confusing of ['0', 'O', '1', 'I', 'L']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(confusing);
    }
  });

  test.each([
    ['too short', 'ABC23'],
    ['too long', 'ABC2345'],
    ['a confusable character', 'ABC10O'],
    ['punctuation', 'ABC-23'],
    ['a number', 123456],
  ])('rejects a code that is %s', (_label, value) => {
    expect(roomCodeSchema.safeParse(value).success).toBe(false);
  });
});

describe('createRoomSchema and joinRoomSchema', () => {
  test('accept a well-formed payload', () => {
    expect(createRoomSchema.parse({ name: 'Nimal' })).toEqual({ name: 'Nimal' });
    expect(joinRoomSchema.parse({ code: 'abc234', name: 'Kamala' })).toEqual({
      code: 'ABC234',
      name: 'Kamala',
    });
  });

  test('reject unknown keys', () => {
    expect(createRoomSchema.safeParse({ name: 'Nimal', seat: 0 }).success).toBe(false);
    expect(joinRoomSchema.safeParse({ code: 'ABC234', name: 'K', isHost: true }).success).toBe(
      false,
    );
  });

  test('reject a missing payload', () => {
    expect(createRoomSchema.safeParse(undefined).success).toBe(false);
    expect(joinRoomSchema.safeParse(null).success).toBe(false);
  });
});

describe('resumeSchema', () => {
  test('accepts a room code and a 43-character url-safe token', () => {
    expect(resumeSchema.safeParse({ code: 'ABC234', token: TOKEN }).success).toBe(true);
  });

  test.each([
    ['a short token', 'abc'],
    ['an over-long token', 'a'.repeat(44)],
    ['a token with other characters', `${'a'.repeat(42)}!`],
    ['a non-string token', 12345],
  ])('rejects %s', (_label, token) => {
    expect(resumeSchema.safeParse({ code: 'ABC234', token }).success).toBe(false);
  });
});

describe('callTrumpSchema', () => {
  test('accepts a sequence number and a suit', () => {
    expect(callTrumpSchema.parse({ seq: 3, suit: 'hearts' })).toEqual({ seq: 3, suit: 'hearts' });
  });

  test.each([
    ['an unknown suit', { seq: 0, suit: 'no-trump' }],
    ['a negative sequence number', { seq: -1, suit: 'hearts' }],
    ['a fractional sequence number', { seq: 1.5, suit: 'hearts' }],
    ['a missing sequence number', { suit: 'hearts' }],
    ['a seat chosen by the client', { seq: 0, suit: 'hearts', seat: 2 }],
  ])('rejects %s', (_label, payload) => {
    expect(callTrumpSchema.safeParse(payload).success).toBe(false);
  });
});

describe('playCardSchema', () => {
  test('accepts a sequence number and a card', () => {
    const payload = { seq: 9, card: { suit: 'spades', rank: '10' } };

    expect(playCardSchema.parse(payload)).toEqual(payload);
  });

  test.each([
    ['a rank outside the deck', { seq: 0, card: { suit: 'spades', rank: '2' } }],
    ['an unknown suit', { seq: 0, card: { suit: 'stars', rank: 'A' } }],
    ['extra properties on the card', { seq: 0, card: { suit: 'spades', rank: 'A', note: 'x' } }],
    ['a card given as a string', { seq: 0, card: 'A-spades' }],
    ['a seat chosen by the client', { seq: 0, card: { suit: 'spades', rank: 'A' }, seat: 1 }],
  ])('rejects %s', (_label, payload) => {
    expect(playCardSchema.safeParse(payload).success).toBe(false);
  });
});
