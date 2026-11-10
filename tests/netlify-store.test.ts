import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  NetlifyStore,
  ROOM_IDLE_TIMEOUT_MS,
  type RoomBlobs,
} from "../server/store";
import { createRoom } from "../shared/engine";
import { handleApi } from "../server/api";
import type { Room } from "../shared/types";
class FakeBlobs implements RoomBlobs {
  entries = new Map<string, { value: string; etag: string }>();
  sequence = 0;
  failWrite = false;
  beforeWrite?: () => void;
  async getWithMetadata(key: string) {
    const entry = this.entries.get(key);
    return entry ? { data: JSON.parse(entry.value), etag: entry.etag } : null;
  }
  async set(
    key: string,
    value: string,
    options: Parameters<RoomBlobs["set"]>[2],
  ) {
    const hook = this.beforeWrite;
    this.beforeWrite = undefined;
    hook?.();
    if (this.failWrite) return { modified: true, etag: "" };
    const entry = this.entries.get(key);
    if (
      (options.onlyIfNew && entry) ||
      (options.onlyIfMatch && entry?.etag !== options.onlyIfMatch)
    )
      return { modified: false };
    const etag = String(++this.sequence);
    this.entries.set(key, { value, etag });
    return { modified: true, etag };
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
  async list() {
    return { blobs: [...this.entries.keys()].map((key) => ({ key })) };
  }
}
afterEach(() => vi.restoreAllMocks());
describe("Netlify temporary rooms across independent function instances", () => {
  it("preserves concurrent updates, rejects failed mutations and confirms every write", async () => {
    const blobs = new FakeBlobs(),
      a = new NetlifyStore(blobs),
      b = new NetlifyStore(blobs);
    const room = createRoom("NET123", "host", "Host", "token", Date.now());
    await a.transaction(room.code, () => ({ room, result: null }));
    await expect(
      a.transaction(room.code, (state) => {
        state!.players[0].name = "Rejected";
        throw new Error("invalid");
      }),
    ).rejects.toThrow("invalid");
    const versions = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? a : b).transaction(room.code, (state) => {
          expect(state!.players[0].name).toBe("Host");
          state!.version++;
          return { room: state!, result: state!.version };
        }),
      ),
    );
    expect(new Set(versions).size).toBe(8);
    blobs.failWrite = true;
    await expect(
      a.transaction(room.code, (state) => ({ room: state!, result: null })),
    ).rejects.toThrow("could not be confirmed");
  });
  it("deduplicates simultaneous API orders sent to different function instances", async () => {
    const blobs = new FakeBlobs(),
      stores = [new NetlifyStore(blobs), new NetlifyStore(blobs)];
    const create = await handleApi(
      new Request("http://localhost/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name: "Host" }),
      }),
      stores[0],
      randomUUID(),
    );
    const { code, token, view } = await create.json();
    const body = JSON.stringify({
      id: randomUUID(),
      version: view.version,
      action: { type: "ready" },
    });
    const responses = await Promise.all(
      stores.map((store) =>
        handleApi(
          new Request(`http://localhost/api/rooms/${code}/action`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body,
          }),
          store,
          randomUUID(),
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(results[0].view.version).toBe(results[1].view.version);
    expect(results.some((r) => r.duplicate)).toBe(true);
    expect(results.every((r) => r.view.players[0].ready)).toBe(true);
  });
  it("deletes expired data while keeping refreshed rooms and invalid requests from renewing expiry", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const blobs = new FakeBlobs(),
      store = new NetlifyStore(blobs);
    const room = createRoom("OLD123", "host", "Host", "token", now);
    await store.transaction(room.code, () => ({ room, result: null }));
    now += ROOM_IDLE_TIMEOUT_MS;
    // A valid heartbeat winning the compare-and-swap must prevent deletion.
    blobs.beforeWrite = () => {
      const entry = blobs.entries.get(room.code)!;
      const state: Room = JSON.parse(entry.value);
      state.updated = now;
      blobs.entries.set(room.code, {
        value: JSON.stringify(state),
        etag: String(++blobs.sequence),
      });
    };
    await store.cleanup();
    expect(blobs.entries.has(room.code)).toBe(true);
    now += ROOM_IDLE_TIMEOUT_MS;
    await store.cleanup();
    expect(blobs.entries.has(room.code)).toBe(false);
    await expect(
      store.transaction(room.code, () => {
        throw new Error("expired");
      }),
    ).rejects.toThrow("expired");
  });
  it("returns 404 for an expired room and physically removes its private state", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const blobs = new FakeBlobs(),
      store = new NetlifyStore(blobs);
    const room = createRoom("OLD456", "host", "Host", "token", now);
    await store.transaction(room.code, () => ({ room, result: null }));
    now += ROOM_IDLE_TIMEOUT_MS;
    await expect(
      store.transaction(room.code, () => {
        throw new Error("callback must not run");
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(blobs.entries.size).toBe(0);
  });
});
