import { seedFromInteger, type Seed } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SOCKETS, createHarness, playRound, startMatch, TEST_TIMINGS } from './harness';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A seed source that hands out 1, 2, 3… and records how often it was asked. */
const countingSeeds = () => {
  const drawn: Seed[] = [];
  const newSeed = (): Seed => {
    const seed = seedFromInteger(drawn.length + 1);
    drawn.push(seed);
    return seed;
  };
  return { drawn, newSeed };
};

/** Every hand dealt at the start of a match, in seat order whatever socket holds the seat. */
const handsBySeat = (newSeed?: () => Seed): string[] => {
  const harness = createHarness(newSeed ? { newSeed } : {});
  startMatch(harness);
  return SOCKETS.map((socketId) => harness.game(socketId).view)
    .sort((a, b) => a.seat - b.seat)
    .map((view) => JSON.stringify([view.dealer, view.hand]));
};

describe('the seed source', () => {
  test('a given source deals the same match every time', () => {
    const first = handsBySeat(countingSeeds().newSeed);
    const second = handsBySeat(countingSeeds().newSeed);

    expect(second).toEqual(first);
  });

  test('is asked once for the match and once more for each later round', () => {
    const seeds = countingSeeds();
    const harness = createHarness({ newSeed: seeds.newSeed });
    startMatch(harness);
    expect(seeds.drawn).toHaveLength(1);

    playRound(harness);
    vi.advanceTimersByTime(TEST_TIMINGS.roundPauseMs);

    expect(harness.game('s0').view.roundNumber).toBe(2);
    expect(seeds.drawn).toHaveLength(2);
  });

  test('left out, each match is dealt from fresh random bits', () => {
    expect(handsBySeat()).not.toEqual(handsBySeat());
  });

  test('left out, the match and each later round draw from the cryptographic generator', () => {
    const drawn = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const harness = createHarness();
    startMatch(harness);
    expect(drawn).toHaveBeenCalledTimes(1);

    playRound(harness);
    vi.advanceTimersByTime(TEST_TIMINGS.roundPauseMs);

    expect(harness.game('s0').view.roundNumber).toBe(2);
    expect(drawn).toHaveBeenCalledTimes(2);
    drawn.mockRestore();
  });
});
