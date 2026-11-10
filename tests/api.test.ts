import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../server/store";
import { handleApi } from "../server/api";
import { RoomView } from "../shared/types";
describe("authenticated atomic API and temporary reconnect", () => {
  it("retains live snapshots, rejects forged tokens, stale/forged actions, and deduplicates concurrent submissions", async () => {
    {
      const store = new MemoryStore();
      let serial = 0;
      const call = async (url: string, body?: unknown, token?: string) =>
        handleApi(
          new Request(`http://localhost/api${url}`, {
            method: body ? "POST" : "GET",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          }),
          store,
          `test-${++serial}`,
        );
      const c = await call("/rooms", { name: "<b>Commander</b>" });
      expect(c.status, await c.clone().text()).toBe(201);
      const created = await c.json(),
        code = created.code,
        token = created.token;
      expect(created.view.players[0].name).toBe("<b>Commander</b>");
      const j = await call(`/rooms/${code}/join`, { name: "Blue" });
      const joined = await j.json();
      expect((await call(`/rooms/${code}`, undefined, "forged")).status).toBe(
        401,
      );
      expect((await call(`/rooms/${code}`)).status).toBe(401);
      let state = (
        await (await call(`/rooms/${code}`, undefined, token)).json()
      ).view as RoomView;
      const id = randomUUID();
      const body = { id, version: state.version, action: { type: "ready" } };
      const responses = await Promise.all([
        call(`/rooms/${code}/action`, body, token),
        call(`/rooms/${code}/action`, body, token),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const a = await responses[0].json(),
        b = await responses[1].json();
      expect(a.view.version).toBe(b.view.version);
      expect(b.duplicate).toBe(true);
      expect(
        b.view.players.find((p: any) => p.id === created.view.me).ready,
      ).toBe(true);
      const stale = await call(
        `/rooms/${code}/action`,
        { id: randomUUID(), version: state.version, action: { type: "ready" } },
        token,
      );
      expect(stale.status).toBe(409);
      state = a.view;
      const invalid = await call(
        `/rooms/${code}/action`,
        {
          id: randomUUID(),
          version: state.version,
          action: { type: "start", player: joined.view.me },
        },
        joined.token,
      );
      expect(invalid.status).toBe(400);
      const injection = await call(
        `/rooms/${code}/action`,
        {
          id: randomUUID(),
          version: state.version,
          action: { type: "ready", __protoInjected: "oops" },
        },
        token,
      );
      expect(injection.status).toBe(400);
      const restored = await handleApi(
        new Request(`http://localhost/api/rooms/${code}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        store,
        "restore",
      );
      expect(restored.status).toBe(200);
      expect((await restored.json()).view.me).toBe(created.view.me);
    }
  });
  it("validates colors, names, payloads and never accepts client-declared identity", async () => {
    {
      const store = new MemoryStore();
      const req = (body: unknown) =>
        handleApi(
          new Request("http://localhost/api/rooms", {
            method: "POST",
            body: JSON.stringify(body),
          }),
          store,
          randomUUID(),
        );
      expect((await req({ name: "" })).status).toBe(400);
      expect((await req({ name: "X", color: "red" })).status).toBe(400);
      expect((await req({ name: "X", tokenHash: "forge" })).status).toBe(400);
    }
  });
});
