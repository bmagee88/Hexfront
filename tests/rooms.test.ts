import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { MemoryStore, ROOM_IDLE_TIMEOUT_MS } from "../server/store";
import { handleApi } from "../server/api";
import { createRoom } from "../shared/engine";
afterEach(() => vi.restoreAllMocks());
describe("temporary room lifetime", () => {
  it("keeps authenticated tabs alive and expires after an hour without one, even when bots are present", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const store = new MemoryStore();
    const call = (url: string, token?: string, body?: unknown) =>
      handleApi(
        new Request(`http://localhost/api${url}`, {
          method: body ? "POST" : "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: body ? JSON.stringify(body) : undefined,
        }),
        store,
        randomUUID(),
      );
    const created = await (
      await call("/rooms", undefined, { name: "Host", practice: true })
    ).json();
    const url = `/rooms/${created.code}`;
    now += ROOM_IDLE_TIMEOUT_MS - 1000;
    expect((await call(url, created.token)).status).toBe(200);
    now += 2000;
    expect((await call(url, created.token)).status).toBe(200);
    now += ROOM_IDLE_TIMEOUT_MS - 1;
    expect((await call(url, "forged")).status).toBe(401);
    now += 1;
    expect((await call(url, created.token)).status).toBe(404);
    await expect(
      store.transaction(created.code, (room) => {
        expect(room).toBeNull();
        throw new Error("Expired room is deleted");
      }),
    ).rejects.toThrow("Expired room is deleted");
  });
  it("sweeps abandoned rooms without requests and does not persist across backend instances", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const store = new MemoryStore();
    const room = createRoom("TMP123", "host", "Host", "token", now);
    await store.transaction(room.code, () => ({ room, result: undefined }));
    const assertMissing = (other: MemoryStore) =>
      expect(
        other.transaction(room.code, (value) => {
          expect(value).toBeNull();
          throw new Error("missing");
        }),
      ).rejects.toThrow("missing");
    await assertMissing(new MemoryStore());
    now += ROOM_IDLE_TIMEOUT_MS;
    await store.cleanup();
    await assertMissing(store);
  });
  it("rolls back failed mutations and serializes simultaneous room operations", async () => {
    const store = new MemoryStore();
    const room = createRoom("TMP456", "host", "Host", "token", Date.now());
    await store.transaction(room.code, () => ({ room, result: undefined }));
    await expect(
      store.transaction(room.code, (value) => {
        value!.players[0].name = "Should not persist";
        throw new Error("Rejected");
      }),
    ).rejects.toThrow("Rejected");
    const versions = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.transaction(room.code, (value) => {
          expect(value!.players[0].name).toBe("Host");
          value!.version++;
          return { room: value!, result: value!.version };
        }),
      ),
    );
    expect(new Set(versions).size).toBe(10);
  });
  it("supports the separate Netlify frontend's preflight and rejects other origins", async () => {
    vi.stubEnv("ALLOWED_ORIGIN", "https://hexfront.example");
    try {
      const store = new MemoryStore();
      const preflight = await handleApi(
        new Request("http://localhost/api/rooms", {
          method: "OPTIONS",
          headers: { Origin: "https://hexfront.example" },
        }),
        store,
      );
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://hexfront.example",
      );
      expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
        "Authorization",
      );
      const denied = await handleApi(
        new Request("http://localhost/api/health", {
          headers: { Origin: "https://other.example" },
        }),
        store,
      );
      expect(denied.status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
