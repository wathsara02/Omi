import { describe, expect, test } from 'vitest';
import { RateLimiter } from '../src/rateLimiter';

const clock = (start = 1_000_000) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
};

const allowedOutOf = (limiter: RateLimiter, key: string, attempts: number): number =>
  Array.from({ length: attempts }, () => limiter.allow(key)).filter(Boolean).length;

describe('RateLimiter', () => {
  test('allows a burst up to its capacity, then refuses', () => {
    const limiter = new RateLimiter({ capacity: 5, refillPerSecond: 1 }, clock().now);

    expect(allowedOutOf(limiter, 'a', 8)).toBe(5);
  });

  test('refills over time, up to its capacity and no further', () => {
    const time = clock();
    const limiter = new RateLimiter({ capacity: 5, refillPerSecond: 2 }, time.now);
    allowedOutOf(limiter, 'a', 5);

    time.advance(1000);
    expect(allowedOutOf(limiter, 'a', 8)).toBe(2);

    time.advance(60_000);
    expect(allowedOutOf(limiter, 'a', 8)).toBe(5);
  });

  test('counts each key separately', () => {
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1 }, clock().now);
    allowedOutOf(limiter, 'a', 2);

    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
  });

  test('forgets a key on request', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 0 }, clock().now);
    limiter.allow('a');

    limiter.forget('a');

    expect(limiter.allow('a')).toBe(true);
  });

  test('prunes only the keys that have fully refilled', () => {
    const time = clock();
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1 }, time.now);
    limiter.allow('old');
    time.advance(5000);
    limiter.allow('recent');

    limiter.prune();

    expect(limiter.size()).toBe(1);
    expect(allowedOutOf(limiter, 'recent', 5)).toBe(1);
  });
});
