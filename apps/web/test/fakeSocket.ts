import type { Ack } from '@omi/protocol';
import type { SocketLike } from '../src/net/connection';

type Listener = (...args: unknown[]) => void;
type Responder = (...payload: unknown[]) => Ack<unknown> | Promise<Ack<unknown>>;

export interface SentRequest {
  readonly event: string;
  readonly payload: readonly unknown[];
}

/** A stand-in for the Socket.IO client that tests can script and inspect. */
export class FakeSocket implements SocketLike {
  connected = false;
  readonly sent: SentRequest[] = [];
  closed = false;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly responders = new Map<string, Responder>();

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  timeout(): { emitWithAck: (event: string, ...payload: unknown[]) => Promise<unknown> } {
    return {
      emitWithAck: async (event, ...payload) => {
        this.sent.push({ event, payload });
        const responder = this.responders.get(event);
        if (!responder) throw new Error('operation has timed out');
        return responder(...payload);
      },
    };
  }

  close(): this {
    this.closed = true;
    return this;
  }

  // --- test controls

  /** Scripts the server's answer to one kind of request. */
  respond(event: string, responder: Responder): void {
    this.responders.set(event, responder);
  }

  /** Delivers a message from the server. */
  receive(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  goOnline(): void {
    this.connected = true;
    this.receive('connect');
  }

  goOffline(): void {
    this.connected = false;
    this.receive('disconnect', 'transport close');
  }

  requestsOf(event: string): SentRequest[] {
    return this.sent.filter((request) => request.event === event);
  }
}

export const ok = <T>(data: T): Ack<T> => ({ ok: true, data });

export const failed = (code: string): Ack<never> =>
  ({ ok: false, error: { code, message: `Server said: ${code}` } }) as Ack<never>;
