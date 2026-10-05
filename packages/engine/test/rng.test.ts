import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  isSeed,
  nextRandom,
  randomInt,
  seedFromInteger,
  seedRng,
  shuffle,
  type RngState,
  type Seed,
} from '../src/rng';

const UINT32_MAX = 0xffffffff;

const word = fc.integer({ min: 0, max: UINT32_MAX });
const seeds = fc.tuple(word, word, word, word);

const isUint32 = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;

const take = (seed: Seed, count: number): number[] => {
  const values: number[] = [];
  let state: RngState = seedRng(seed);
  for (let i = 0; i < count; i += 1) {
    const step = nextRandom(state);
    values.push(step.value);
    state = step.state;
  }
  return values;
};

describe('isSeed', () => {
  test('accepts four unsigned 32-bit integers', () => {
    expect(isSeed([0, 1, UINT32_MAX, 42])).toBe(true);
  });

  test.each([
    ['a plain number', 7],
    ['too few words', [1, 2, 3]],
    ['too many words', [1, 2, 3, 4, 5]],
    ['a negative word', [1, 2, 3, -1]],
    ['a fractional word', [1, 2, 3, 1.5]],
    ['a word past 32 bits', [1, 2, 3, 2 ** 32]],
    ['NaN', [1, 2, 3, Number.NaN]],
    ['a string word', [1, 2, 3, '4']],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isSeed(value)).toBe(false);
  });
});

describe('seedFromInteger', () => {
  test('always produces a valid seed', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        expect(isSeed(seedFromInteger(value))).toBe(true);
      }),
    );
  });

  test('is deterministic and differs between integers', () => {
    expect(seedFromInteger(5)).toEqual(seedFromInteger(5));
    expect(seedFromInteger(5)).not.toEqual(seedFromInteger(6));
  });
});

describe('nextRandom', () => {
  test('produces the same sequence for the same seed', () => {
    expect(take([1, 2, 3, 4], 10)).toEqual(take([1, 2, 3, 4], 10));
  });

  test('produces a different sequence when any one word of the seed differs', () => {
    const base = take([1, 2, 3, 4], 10);

    expect(take([9, 2, 3, 4], 10)).not.toEqual(base);
    expect(take([1, 9, 3, 4], 10)).not.toEqual(base);
    expect(take([1, 2, 9, 4], 10)).not.toEqual(base);
    expect(take([1, 2, 3, 9], 10)).not.toEqual(base);
  });

  test('returns values in [0, 1) for any seed', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        expect(take(seed, 20).every((value) => value >= 0 && value < 1)).toBe(true);
      }),
    );
  });

  test('keeps every word of the state an unsigned 32-bit integer', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { state } = nextRandom(seedRng(seed));

        expect(state).toHaveLength(4);
        expect(state.every(isUint32)).toBe(true);
      }),
    );
  });

  test('does not start from the raw seed words', () => {
    expect(seedRng([1, 2, 3, 4])).not.toEqual([1, 2, 3, 4]);
  });

  test('spreads values evenly enough across ten buckets', () => {
    const counts = new Array<number>(10).fill(0);
    for (const value of take([11, 22, 33, 44], 20_000)) {
      const bucket = Math.floor(value * 10);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    expect(Math.min(...counts)).toBeGreaterThan(1800);
    expect(Math.max(...counts)).toBeLessThan(2200);
  });
});

describe('randomInt', () => {
  test('returns an integer in [0, maxExclusive)', () => {
    fc.assert(
      fc.property(seeds, fc.integer({ min: 1, max: 1000 }), (seed, max) => {
        const { value } = randomInt(seedRng(seed), max);

        expect(Number.isInteger(value) && value >= 0 && value < max).toBe(true);
      }),
    );
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 32 }, (_unused, index) => index);
  const rng = seedRng([7, 7, 7, 7]);

  test('returns a permutation of the input', () => {
    const { items: shuffled } = shuffle(items, rng);

    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  test('does not mutate the input', () => {
    const original = [...items];

    shuffle(items, rng);

    expect(items).toEqual(original);
  });

  test('is deterministic for a seed and changes the order', () => {
    const first = shuffle(items, rng);
    const second = shuffle(items, rng);

    expect(first).toEqual(second);
    expect(first.items).not.toEqual(items);
  });

  test('returns an advanced rng state', () => {
    expect(shuffle(items, rng).state).not.toEqual(rng);
  });
});
