import type { Card } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  actOnTurn,
  createHarness,
  errorOf,
  mustOk,
  socketOnTurn,
  startMatch,
  TEST_TIMINGS,
  type Harness,
} from './harness';

const { turnMs, roundPauseMs } = TEST_TIMINGS;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const started = (): Harness => {
  const harness = createHarness();
  startMatch(harness);
  return harness;
};

describe('turn timer', () => {
  test('tells players when the seat on turn will be played for', () => {
    const harness = started();

    expect(harness.game('s0').deadline).toBe(Date.now() + turnMs);
  });

  test('calls trump for a caller who runs out of time', () => {
    const harness = started();
    const { caller } = harness.game('s0').view;

    vi.advanceTimersByTime(turnMs);

    const { view, seq, events } = harness.game('s0');
    expect(view.phase).toBe('playing');
    expect(seq).toBe(1);
    expect(events).toMatchObject([{ type: 'trump-called', seat: caller }]);
  });

  test('does nothing before the time is up', () => {
    const harness = started();

    vi.advanceTimersByTime(turnMs - 1);

    expect(harness.game('s0').view.phase).toBe('calling-trump');
  });

  test('plays a legal card for a player who runs out of time', () => {
    const harness = started();
    mustOk(actOnTurn(harness));
    const before = harness.game(socketOnTurn(harness)).view;

    vi.advanceTimersByTime(turnMs);

    const [event] = harness.game('s0').events;
    expect(event).toMatchObject({ type: 'card-played', seat: before.seat });
    expect(before.legalMoves).toContainEqual(event?.type === 'card-played' ? event.card : null);
  });

  test('restarts for the next seat when a player acts in time', () => {
    const harness = started();
    vi.advanceTimersByTime(10_000);

    mustOk(actOnTurn(harness));
    vi.advanceTimersByTime(turnMs - 1);

    expect(harness.game('s0').seq).toBe(1);
    expect(harness.game('s0').deadline).toBe(Date.now() + 1);
  });

  test('makes a late action stale, so it cannot land on the player’s next turn', () => {
    const harness = started();
    mustOk(actOnTurn(harness));
    const late = socketOnTurn(harness);
    const { view, seq } = harness.game(late);

    vi.advanceTimersByTime(turnMs);
    const ack = harness.service.playCard(late, { seq, card: view.legalMoves[0] as Card });

    expect(errorOf(ack)).toBe('stale-action');
  });

  test('carries a whole match to its end when nobody acts', () => {
    const harness = started();

    for (let step = 0; step < 3000 && harness.room('s0').status === 'playing'; step += 1) {
      vi.advanceTimersByTime(Math.max(turnMs, roundPauseMs));
    }

    expect(harness.room('s0').status).toBe('finished');
    // Only the idle timer of the finished room is left.
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('closing the service', () => {
  test('cancels every pending timer', () => {
    const harness = started();

    harness.service.close();

    expect(vi.getTimerCount()).toBe(0);
  });
});
