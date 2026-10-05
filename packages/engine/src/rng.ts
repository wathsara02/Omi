/**
 * Seeded pseudo-random numbers (sfc32) with 128 bits of state held as plain
 * data, so the generator can live inside the game state and be replayed.
 *
 * The seed for each round must come from a cryptographic source on the server.
 * A player sees all 32 cards by the end of a round, so a small or reused seed
 * would let them work the generator out and predict the next deal. With 128
 * fresh bits per round, nothing learned in one round says anything about the
 * next, and a player's own cards do not pin down the rest of the deck.
 */
export type Seed = readonly [number, number, number, number];

export type RngState = readonly [number, number, number, number];

export interface RandomStep<T> {
  readonly value: T;
  readonly state: RngState;
}

export interface ShuffleResult<T> {
  readonly items: readonly T[];
  readonly state: RngState;
}

const UINT32_MAX = 0xffffffff;
const UINT32_RANGE = 0x100000000;
const SEED_WORDS = 4;
/** Steps discarded after seeding so that similar seeds do not give similar output. */
const WARM_UP_STEPS = 15;

const isUint32 = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;

export const isSeed = (value: unknown): value is Seed =>
  Array.isArray(value) && value.length === SEED_WORDS && value.every(isUint32);

/** One sfc32 step: a uint32 output and the next state. */
const step = ([a, b, c, counter]: RngState): RandomStep<number> => {
  const output = (((a + b) | 0) + counter) | 0;
  const rotated = (c << 21) | (c >>> 11);
  return {
    value: output >>> 0,
    state: [
      (b ^ (b >>> 9)) >>> 0,
      (c + (c << 3)) >>> 0,
      (rotated + output) >>> 0,
      (counter + 1) >>> 0,
    ],
  };
};

export const seedRng = (seed: Seed): RngState => {
  let state: RngState = [seed[0] >>> 0, seed[1] >>> 0, seed[2] >>> 0, seed[3] >>> 0];
  for (let i = 0; i < WARM_UP_STEPS; i += 1) {
    state = step(state).state;
  }
  return state;
};

const GOLDEN_GAMMA = 0x9e3779b9;

const mix = (value: number): number => {
  const first = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  const second = Math.imul(first ^ (first >>> 13), 0xc2b2ae35);
  return (second ^ (second >>> 16)) >>> 0;
};

/**
 * Stretches one integer into a seed. For tests and fixed-seed runs only: the
 * result has at most 32 bits of entropy, which is not enough for a real match.
 */
export const seedFromInteger = (value: number): Seed => {
  const wordAt = (index: number): number => mix((value + Math.imul(index, GOLDEN_GAMMA)) >>> 0);
  return [wordAt(1), wordAt(2), wordAt(3), wordAt(4)];
};

/** Returns a float in [0, 1) and the next state. */
export const nextRandom = (rng: RngState): RandomStep<number> => {
  const next = step(rng);
  return { value: next.value / UINT32_RANGE, state: next.state };
};

/** Returns an integer in [0, maxExclusive) and the next state. */
export const randomInt = (rng: RngState, maxExclusive: number): RandomStep<number> => {
  const next = nextRandom(rng);
  return { value: Math.floor(next.value * maxExclusive), state: next.state };
};

/** Fisher–Yates on a copy; the input array is left untouched. */
export const shuffle = <T>(items: readonly T[], rng: RngState): ShuffleResult<T> => {
  const shuffled = [...items];
  let state = rng;
  for (let last = shuffled.length - 1; last > 0; last -= 1) {
    const pick = randomInt(state, last + 1);
    state = pick.state;
    const moved = shuffled[last] as T;
    shuffled[last] = shuffled[pick.value] as T;
    shuffled[pick.value] = moved;
  }
  return { items: shuffled, state };
};
