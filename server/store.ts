import { Room } from "../shared/types";
import { getStore as getBlobs, type SetOptions } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
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
type RetiredRoom = { retired: true; nonce: string };
type StoredRoom = Room | RetiredRoom;
export interface RoomBlobs {
  getWithMetadata(
    key: string,
    options: { type: "json" },
  ): Promise<{ data: StoredRoom; etag: string } | null>;
  set(
    key: string,
    value: string,
    options: SetOptions,
  ): Promise<{ modified: boolean; etag?: string }>;
  delete(key: string): Promise<void>;
  list(): Promise<{ blobs: { key: string }[] }>;
}
const retired = (room: StoredRoom): room is RetiredRoom => "retired" in room;
const notFound = () =>
  Object.assign(new Error("Room not found or expired."), { status: 404 });
function netlifyRoomBlobs(): RoomBlobs {
  const blobs = getBlobs({
    name: `hexfront-rooms-${process.env.CONTEXT === "production" || !process.env.CONTEXT ? "production" : process.env.DEPLOY_ID || "preview"}`,
    consistency: "strong",
  });
  return {
    async getWithMetadata(key) {
      const entry = await blobs.getWithMetadata(key, { type: "json" });
      if (!entry) return null;
      if (!entry.etag) throw new Error("Room version could not be confirmed.");
      return { data: entry.data as StoredRoom, etag: entry.etag };
    },
    set: (key, value, options) => blobs.set(key, value, options),
    delete: (key) => blobs.delete(key),
    list: () => blobs.list(),
  };
}
/** Strong reads plus conditional writes protect a complete room across Functions. */
export class NetlifyStore implements Store {
  constructor(private blobs: RoomBlobs = netlifyRoomBlobs()) {}
  private async expire(
    code: string,
    entry: { data: StoredRoom; etag: string },
  ) {
    if (retired(entry.data)) return true;
    if (Date.now() - entry.data.updated < ROOM_IDLE_TIMEOUT_MS) return false;
    // Claim expiration before deleting: a concurrent heartbeat can defeat this
    // write, and competing sweepers cannot delete a newly refreshed room.
    const write = await this.blobs.set(
      code,
      JSON.stringify({ retired: true, nonce: randomUUID() }),
      { onlyIfMatch: entry.etag },
    );
    if (!write.modified) return false;
    if (!write.etag) throw new Error("Room expiration could not be confirmed.");
    await this.blobs.delete(code);
    return true;
  }
  async transaction<T>(code: string, fn: RoomTransaction<T>): Promise<T> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const entry = await this.blobs.getWithMetadata(code, { type: "json" });
      if (
        entry &&
        (retired(entry.data) ||
          Date.now() - entry.data.updated >= ROOM_IDLE_TIMEOUT_MS)
      ) {
        if (await this.expire(code, entry)) throw notFound();
        continue;
      }
      const { room, result } = fn(
        entry ? structuredClone(entry.data as Room) : null,
      );
      const write = await this.blobs.set(
        code,
        JSON.stringify(room),
        entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
      );
      if (write.modified) {
        if (!write.etag) throw new Error("Room save could not be confirmed.");
        return result;
      }
      await delay(10 + Math.floor(Math.random() * 30));
    }
    throw Object.assign(
      new Error("The room is busy. Please retry your order."),
      { status: 409 },
    );
  }
  async cleanup() {
    const { blobs } = await this.blobs.list();
    for (let offset = 0; offset < blobs.length; offset += 8) {
      await Promise.all(
        blobs.slice(offset, offset + 8).map(async ({ key }) => {
          const entry = await this.blobs.getWithMetadata(key, { type: "json" });
          if (entry && !retired(entry.data)) await this.expire(key, entry);
        }),
      );
    }
  }
}
let singleton: Store | undefined;
export function getStore(): Store {
  return (singleton ??= process.env.NETLIFY
    ? new NetlifyStore()
    : new MemoryStore());
}
