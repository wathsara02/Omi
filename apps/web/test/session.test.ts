import { describe, expect, test, vi } from 'vitest';
import { clearSession, loadName, loadSession, saveName, saveSession } from '../src/net/session';

const session = { playerId: 'p'.repeat(16), token: 't'.repeat(43) };

describe('session storage', () => {
  test('returns a saved session for its room', () => {
    saveSession('ABC234', session);

    expect(loadSession('ABC234')).toEqual(session);
  });

  test('keeps sessions for different rooms apart', () => {
    saveSession('ABC234', session);

    expect(loadSession('XYZ789')).toBeNull();
  });

  test('forgets a cleared session', () => {
    saveSession('ABC234', session);

    clearSession('ABC234');

    expect(loadSession('ABC234')).toBeNull();
  });

  test.each([
    ['text that is not JSON', 'not json'],
    ['JSON of the wrong shape', JSON.stringify({ token: 5 })],
    ['a missing token', JSON.stringify({ playerId: 'p' })],
  ])('ignores stored %s', (_label, stored) => {
    localStorage.setItem('omi.session.ABC234', stored);

    expect(loadSession('ABC234')).toBeNull();
  });

  test('carries on when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => saveSession('ABC234', session)).not.toThrow();
    expect(loadSession('ABC234')).toBeNull();
    expect(loadName()).toBe('');

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe('remembered name', () => {
  test('is empty until one is saved', () => {
    expect(loadName()).toBe('');
  });

  test('returns the last saved name', () => {
    saveName('Ruwan');

    expect(loadName()).toBe('Ruwan');
  });
});
