import { describe, expect, test } from 'vitest';
import { SEATS, isSeat, mapSeats, nextSeat, otherTeam, teamOf } from '../src/seats';

describe('teamOf', () => {
  test('seats 0 and 2 are Team A, seats 1 and 3 are Team B', () => {
    expect(SEATS.map(teamOf)).toEqual(['A', 'B', 'A', 'B']);
  });
});

describe('otherTeam', () => {
  test('returns the opposing team', () => {
    expect(otherTeam('A')).toBe('B');
    expect(otherTeam('B')).toBe('A');
  });
});

describe('nextSeat', () => {
  test('counter-clockwise goes 0 → 1 → 2 → 3 → 0', () => {
    expect(SEATS.map((seat) => nextSeat(seat, 'counter-clockwise'))).toEqual([1, 2, 3, 0]);
  });

  test('clockwise goes 0 → 3 → 2 → 1 → 0', () => {
    expect(SEATS.map((seat) => nextSeat(seat, 'clockwise'))).toEqual([3, 0, 1, 2]);
  });
});

describe('isSeat', () => {
  test('accepts 0 to 3 only', () => {
    expect(SEATS.every(isSeat)).toBe(true);
    expect(isSeat(4)).toBe(false);
    expect(isSeat(-1)).toBe(false);
    expect(isSeat(1.5)).toBe(false);
    expect(isSeat('1')).toBe(false);
  });
});

describe('mapSeats', () => {
  test('builds one value per seat in seat order', () => {
    expect(mapSeats((seat) => seat * 10)).toEqual([0, 10, 20, 30]);
  });
});
