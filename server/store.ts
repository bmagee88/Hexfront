import { Room } from "../shared/types";
export const ROOM_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export type RoomTransaction<T> = (room: Room | null) => {
  room: Room;
  result: T;
};
export interface Store {
  transaction<T>(code: string, fn: RoomTransaction<T>): Promise<T>;
  cleanup(): Promise<void>;
}
/** One process owns these rooms. Restarting the backend discards all of them. */
export class MemoryStore implements Store {
  private rooms = new Map<string, Room>();
  async transaction<T>(code: string, fn: RoomTransaction<T>): Promise<T> {
    let previous = this.rooms.get(code);
    if (previous && Date.now() - previous.updated >= ROOM_IDLE_TIMEOUT_MS) {
      this.rooms.delete(code);
      previous = undefined;
    }
    // Synchronous callbacks serialize operations; copies isolate rejected commands.
    const { room, result } = fn(previous ? structuredClone(previous) : null);
    this.rooms.set(code, structuredClone(room));
    return result;
  }
  async cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms)
      if (now - room.updated >= ROOM_IDLE_TIMEOUT_MS) this.rooms.delete(code);
  }
}
let singleton: Store | undefined;
export function getStore(): Store {
  return (singleton ??= new MemoryStore());
}
