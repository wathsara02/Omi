import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { nextRandom, randomInt, seedRng, shuffle, type RngState } from '../src/rng';

const take = (seed: number, count: number): number[] => {
  const values: number[] = [];
  let state: RngState = seedRng(seed);
  for (let i = 0; i < count; i += 1) {
    const step = nextRandom(state);
    values.push(step.value);
    state = step.state;
  }
  return values;
};

describe('nextRandom', () => {
  test('produces the same sequence for the same seed', () => {
    expect(take(42, 10)).toEqual(take(42, 10));
  });

  test('produces different sequences for different seeds', () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  test('returns values in [0, 1) for any seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        expect(take(seed, 20).every((value) => value >= 0 && value < 1)).toBe(true);
      }),
    );
  });

  test('keeps the state a 32-bit unsigned integer', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { state } = nextRandom(seedRng(seed));

        expect(Number.isInteger(state) && state >= 0 && state <= 0xffffffff).toBe(true);
      }),
    );
  });
});

describe('randomInt', () => {
  test('returns an integer in [0, maxExclusive)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 1000 }), (seed, max) => {
        const { value } = randomInt(seedRng(seed), max);

        expect(Number.isInteger(value) && value >= 0 && value < max).toBe(true);
      }),
    );
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 32 }, (_unused, index) => index);

  test('returns a permutation of the input', () => {
    const { items: shuffled } = shuffle(items, seedRng(7));

    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  test('does not mutate the input', () => {
    const original = [...items];

    shuffle(items, seedRng(7));

    expect(items).toEqual(original);
  });

  test('is deterministic for a seed and changes the order', () => {
    const first = shuffle(items, seedRng(7));
    const second = shuffle(items, seedRng(7));

    expect(first).toEqual(second);
    expect(first.items).not.toEqual(items);
  });

  test('returns an advanced rng state', () => {
    const start = seedRng(7);

    expect(shuffle(items, start).state).not.toBe(start);
  });
});
