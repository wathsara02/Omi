interface Entry {
  step: NodeJS.Timeout | null;
  idle: NodeJS.Timeout | null;
  readonly holds: Map<string, NodeJS.Timeout>;
}

/**
 * The timer handles for every room. Each room has at most one step timer (a
 * turn timeout, a bot's move or the next deal), one idle timer, and one hold
 * timer per disconnected player. What happens when a timer fires is decided by
 * the caller; this class only makes sure handles are replaced and cleared.
 */
export class RoomTimers {
  private readonly rooms = new Map<string, Entry>();

  /** Replaces the room's step timer. */
  setStep(code: string, delayMs: number, run: () => void): void {
    this.clearStep(code);
    this.entryFor(code).step = setTimeout(run, delayMs);
  }

  clearStep(code: string): void {
    const entry = this.rooms.get(code);
    if (!entry || entry.step === null) return;
    clearTimeout(entry.step);
    entry.step = null;
  }

  /** Starts, or restarts, the room's idle countdown. */
  setIdle(code: string, delayMs: number, run: () => void): void {
    this.clearIdle(code);
    this.entryFor(code).idle = setTimeout(run, delayMs);
  }

  clearIdle(code: string): void {
    const entry = this.rooms.get(code);
    if (!entry || entry.idle === null) return;
    clearTimeout(entry.idle);
    entry.idle = null;
  }

  /** Replaces a player's hold timer. The handle is forgotten before `run` is called. */
  setHold(code: string, playerId: string, delayMs: number, run: () => void): void {
    this.clearHold(code, playerId);
    const { holds } = this.entryFor(code);
    const hold = setTimeout(() => {
      holds.delete(playerId);
      run();
    }, delayMs);
    holds.set(playerId, hold);
  }

  clearHold(code: string, playerId: string): void {
    const holds = this.rooms.get(code)?.holds;
    clearTimeout(holds?.get(playerId));
    holds?.delete(playerId);
  }

  clearHolds(code: string): void {
    const holds = this.rooms.get(code)?.holds;
    for (const hold of holds?.values() ?? []) clearTimeout(hold);
    holds?.clear();
  }

  /** Cancels everything for a room and forgets it. */
  clearRoom(code: string): void {
    this.clearStep(code);
    this.clearIdle(code);
    this.clearHolds(code);
    this.rooms.delete(code);
  }

  clearAll(): void {
    for (const code of [...this.rooms.keys()]) this.clearRoom(code);
  }

  private entryFor(code: string): Entry {
    const existing = this.rooms.get(code);
    if (existing) return existing;
    const created: Entry = { step: null, idle: null, holds: new Map() };
    this.rooms.set(code, created);
    return created;
  }
}
