import { describe, expect, test } from 'vitest';
import { ConnectionCounter } from '../src/connectionCounter';

describe('ConnectionCounter', () => {
  test('allows connections up to the per-address cap', () => {
    const counter = new ConnectionCounter({ total: 100, perAddress: 2 });

    expect([counter.tryAdd('a'), counter.tryAdd('a'), counter.tryAdd('a')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(counter.tryAdd('b')).toBe(true);
    expect(counter.count()).toBe(3);
  });

  test('allows connections up to the total cap, whatever the address', () => {
    const counter = new ConnectionCounter({ total: 2, perAddress: 10 });

    expect([counter.tryAdd('a'), counter.tryAdd('b'), counter.tryAdd('c')]).toEqual([
      true,
      true,
      false,
    ]);
  });

  test('frees a slot when a connection closes', () => {
    const counter = new ConnectionCounter({ total: 100, perAddress: 1 });
    counter.tryAdd('a');

    counter.remove('a');

    expect(counter.tryAdd('a')).toBe(true);
  });

  test('forgets an address once its last connection closes', () => {
    const counter = new ConnectionCounter({ total: 100, perAddress: 5 });
    counter.tryAdd('a');
    counter.tryAdd('a');

    counter.remove('a');
    expect(counter.addresses()).toBe(1);
    counter.remove('a');

    expect(counter.addresses()).toBe(0);
    expect(counter.count()).toBe(0);
  });

  test('ignores a removal for an address it is not counting', () => {
    const counter = new ConnectionCounter({ total: 100, perAddress: 5 });

    counter.remove('never-seen');

    expect(counter.count()).toBe(0);
  });
});
