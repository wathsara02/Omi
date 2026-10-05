/**
 * Seeded pseudo-random numbers (mulberry32). The whole generator state is one
 * unsigned 32-bit integer, so it can live inside the plain-data game state.
 */
export type RngState = number;

export interface RandomStep<T> {
  readonly value: T;
  readonly state: RngState;
}

export interface ShuffleResult<T> {
  readonly items: readonly T[];
  readonly state: RngState;
}

const INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 0x100000000;

export const seedRng = (seed: number): RngState => seed >>> 0;

/** Returns a float in [0, 1) and the next state. */
export const nextRandom = (rng: RngState): RandomStep<number> => {
  const state = (rng + INCREMENT) >>> 0;
  const mixed = Math.imul(state ^ (state >>> 15), state | 1);
  const remixed = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61));
  return { value: ((remixed ^ (remixed >>> 14)) >>> 0) / UINT32_RANGE, state };
};

/** Returns an integer in [0, maxExclusive) and the next state. */
export const randomInt = (rng: RngState, maxExclusive: number): RandomStep<number> => {
  const step = nextRandom(rng);
  return { value: Math.floor(step.value * maxExclusive), state: step.state };
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
