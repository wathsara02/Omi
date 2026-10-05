import type { Room } from './room/types';

/** Where rooms live. In memory for now; the interface allows a later swap. */
export interface RoomStore {
  find(code: string): Room | undefined;
  save(room: Room): void;
  remove(code: string): void;
  count(): number;
  codes(): readonly string[];
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  find(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  save(room: Room): void {
    this.rooms.set(room.code, room);
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  count(): number {
    return this.rooms.size;
  }

  codes(): readonly string[] {
    return [...this.rooms.keys()];
  }
}
