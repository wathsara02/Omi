import { useEffect, useState } from 'react';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const TICK_MS = 250;

/**
 * Time left until a server deadline, on this device. `clockOffset` is the
 * server clock minus the device clock, so a wrong device clock does not matter.
 */
export const remainingMs = (deadline: number, clockOffset: number, deviceNow: number): number =>
  Math.max(0, deadline - (deviceNow + clockOffset));

/** "0:09". Rounds up, so the display reaches 0:00 only when time is really up. */
export const formatClock = (ms: number): string => {
  const totalSeconds = Math.ceil(Math.max(0, ms) / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * The device clock, re-read a few times a second while `isRunning`. The time
 * is read during render, not kept in state, so the first frame after a
 * countdown starts is already current.
 */
export const useNow = (isRunning: boolean): number => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = setInterval(() => setTick((tick) => tick + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [isRunning]);
  return Date.now();
};

/** Milliseconds left until `deadline`, or null when there is no deadline. */
export const useCountdown = (deadline: number | null, clockOffset: number): number | null => {
  const now = useNow(deadline !== null);
  return deadline === null ? null : remainingMs(deadline, clockOffset, now);
};
