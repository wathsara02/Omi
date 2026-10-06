import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RoomTimers } from '../src/roomTimers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RoomTimers', () => {
  test('runs a step after its delay', () => {
    const timers = new RoomTimers();
    const run = vi.fn();

    timers.setStep('A', 1000, run);
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(run).toHaveBeenCalledTimes(1);
  });

  test('replaces a room’s step, so only the latest one runs', () => {
    const timers = new RoomTimers();
    const first = vi.fn();
    const second = vi.fn();

    timers.setStep('A', 1000, first);
    timers.setStep('A', 1000, second);
    vi.advanceTimersByTime(1000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('keeps the step, idle and hold timers of a room apart', () => {
    const timers = new RoomTimers();
    const step = vi.fn();
    const idle = vi.fn();
    const hold = vi.fn();
    timers.setStep('A', 1000, step);
    timers.setIdle('A', 1000, idle);
    timers.setHold('A', 'p1', 1000, hold);

    timers.clearStep('A');
    vi.advanceTimersByTime(1000);

    expect(step).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(hold).toHaveBeenCalledTimes(1);
  });

  test('restarts the idle countdown when it is set again', () => {
    const timers = new RoomTimers();
    const run = vi.fn();

    timers.setIdle('A', 1000, run);
    vi.advanceTimersByTime(900);
    timers.setIdle('A', 1000, run);
    vi.advanceTimersByTime(900);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);

    expect(run).toHaveBeenCalledTimes(1);
  });

  test('holds one timer per player and clears them separately', () => {
    const timers = new RoomTimers();
    const one = vi.fn();
    const two = vi.fn();
    timers.setHold('A', 'p1', 1000, one);
    timers.setHold('A', 'p2', 1000, two);

    timers.clearHold('A', 'p1');
    vi.advanceTimersByTime(1000);

    expect(one).not.toHaveBeenCalled();
    expect(two).toHaveBeenCalledTimes(1);
  });

  test('clears every hold of a room at once', () => {
    const timers = new RoomTimers();
    timers.setHold('A', 'p1', 1000, vi.fn());
    timers.setHold('A', 'p2', 1000, vi.fn());
    timers.setStep('A', 1000, vi.fn());

    timers.clearHolds('A');

    expect(vi.getTimerCount()).toBe(1);
  });

  test('clears one room without touching another', () => {
    const timers = new RoomTimers();
    const other = vi.fn();
    timers.setStep('A', 1000, vi.fn());
    timers.setIdle('A', 1000, vi.fn());
    timers.setHold('A', 'p1', 1000, vi.fn());
    timers.setStep('B', 1000, other);

    timers.clearRoom('A');
    vi.advanceTimersByTime(1000);

    expect(other).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('clears everything', () => {
    const timers = new RoomTimers();
    timers.setStep('A', 1000, vi.fn());
    timers.setIdle('B', 1000, vi.fn());
    timers.setHold('C', 'p1', 1000, vi.fn());

    timers.clearAll();

    expect(vi.getTimerCount()).toBe(0);
  });

  test('ignores clears for rooms and players it has never seen', () => {
    const timers = new RoomTimers();

    expect(() => {
      timers.clearStep('Z');
      timers.clearIdle('Z');
      timers.clearHold('Z', 'p');
      timers.clearHolds('Z');
      timers.clearRoom('Z');
    }).not.toThrow();
  });
});
