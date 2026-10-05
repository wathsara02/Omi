import { describe, expect, test } from 'vitest';
import { createRoom } from '../src/room/lobby';
import { InMemoryRoomStore } from '../src/roomStore';

const room = (code: string) =>
  createRoom(code, {
    id: 'a',
    name: 'Nimal',
    tokenHash: Buffer.from('hash'),
    socketId: 'socket-a',
    isBot: false,
    seat: null,
  });

describe('InMemoryRoomStore', () => {
  test('returns a saved room by its code', () => {
    const store = new InMemoryRoomStore();
    const saved = room('ABC234');

    store.save(saved);

    expect(store.find('ABC234')).toBe(saved);
    expect(store.count()).toBe(1);
  });

  test('replaces a room saved under the same code', () => {
    const store = new InMemoryRoomStore();
    const updated = { ...room('ABC234'), seq: 5 };

    store.save(room('ABC234'));
    store.save(updated);

    expect(store.find('ABC234')).toBe(updated);
    expect(store.count()).toBe(1);
  });

  test('returns undefined for an unknown code', () => {
    expect(new InMemoryRoomStore().find('ZZZZZZ')).toBeUndefined();
  });

  test('forgets a removed room', () => {
    const store = new InMemoryRoomStore();
    store.save(room('ABC234'));

    store.remove('ABC234');

    expect(store.find('ABC234')).toBeUndefined();
    expect(store.count()).toBe(0);
  });

  test('lists the codes of all rooms', () => {
    const store = new InMemoryRoomStore();
    store.save(room('ABC234'));
    store.save(room('XYZ789'));

    expect(store.codes()).toEqual(['ABC234', 'XYZ789']);
  });
});
