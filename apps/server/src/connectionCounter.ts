export interface ConnectionCaps {
  /** Open connections allowed across the whole server. */
  readonly total: number;
  /** Open connections allowed from one client address. */
  readonly perAddress: number;
}

/** Counts open connections so that one address cannot hold all the server's rooms. */
export class ConnectionCounter {
  private readonly byAddress = new Map<string, number>();
  private total = 0;

  constructor(private readonly caps: ConnectionCaps) {}

  /** Counts a new connection, or returns false if a cap would be exceeded. */
  tryAdd(address: string): boolean {
    const current = this.byAddress.get(address) ?? 0;
    if (this.total >= this.caps.total || current >= this.caps.perAddress) return false;
    this.byAddress.set(address, current + 1);
    this.total += 1;
    return true;
  }

  remove(address: string): void {
    const current = this.byAddress.get(address);
    if (current === undefined) return;
    this.total -= 1;
    if (current <= 1) this.byAddress.delete(address);
    else this.byAddress.set(address, current - 1);
  }

  count(): number {
    return this.total;
  }

  addresses(): number {
    return this.byAddress.size;
  }
}
