import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  addPlayer,
  applyAction,
  botAction,
  createRoom,
  ensureLobbyMap,
  tick,
  view,
} from "../shared/engine";
import { COLORS, RESOURCES, Room } from "../shared/types";
import { Store, MemoryStore, ROOM_IDLE_TIMEOUT_MS } from "./store";
const settings = z
  .object({
    seed: z.string().min(1).max(64).optional(),
    reactionSeconds: z.number().int().min(5).max(120).optional(),
    alliances: z.boolean().optional(),
    eliminationVictory: z.boolean().optional(),
  })
  .strict();
const action = z
  .object({
    type: z.enum([
      "profile",
      "ready",
      "settings",
      "generateMaps",
      "chooseMap",
      "addBot",
      "remove",
      "start",
      "rematch",
      "restart",
      "pause",
      "respond",
      "guard",
      "pledge",
      "draft",
      "end",
      "break",
      "separate",
      "discard",
      "scout",
      "reorganize",
      "buy",
      "bank",
      "trade",
      "alliance",
      "reinforce",
      "support",
      "reposition",
      "reorder",
      "ceasefire",
      "envoy",
      "patrol",
      "rebelMove",
      "recruit",
      "raid",
      "attack",
      "underground",
      "suppress",
    ]),
    target: z.string().max(100).optional(),
    mapCount: z.union([z.literal(1), z.literal(6)]).optional(),
    mapIndex: z.number().int().min(0).max(23).optional(),
    source: z.string().max(100).optional(),
    card: z.string().max(100).optional(),
    player: z.string().max(100).optional(),
    resource: z.enum(RESOURCES).optional(),
    give: z.enum(RESOURCES).optional(),
    amount: z.number().int().min(1).max(2).optional(),
    bottom: z.boolean().optional(),
    accept: z.boolean().optional(),
    color: z.enum(COLORS).optional(),
    name: z.string().trim().min(1).max(24).optional(),
    settings: settings.optional(),
    order: z.array(z.string().max(100)).max(3).optional(),
  })
  .strict();
const envelope = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().nonnegative(),
    action,
  })
  .strict();
const join = z
  .object({
    name: z.string().trim().min(1).max(24),
    spectator: z.boolean().optional(),
    color: z.enum(COLORS).optional(),
    practice: z.boolean().optional(),
  })
  .strict();
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function auth(s: Room, token: string) {
  const hash = digest(token);
  return s.players.find(
    (p) =>
      p.tokenHash.length === hash.length &&
      timingSafeEqual(Buffer.from(p.tokenHash), Buffer.from(hash)),
  );
}
const limits = new Map<string, { time: number; n: number }>();
function rate(key: string, now: number, limit: number) {
  let bucket = limits.get(key);
  if (!bucket || now - bucket.time > 60000) {
    bucket = { time: now, n: 0 };
    limits.set(key, bucket);
  }
  if (++bucket.n > limit)
    throw Object.assign(
      new Error("Please slow down and try again in a minute."),
      { status: 429 },
    );
  if (limits.size > 10000)
    for (const [k, v] of limits) if (now - v.time > 60000) limits.delete(k);
}
function bots(s: Room, now: number): Room {
  if (s.paused) return s;
  for (let i = 0; i < 12; i++) {
    let moved = false;
    for (const p of s.players.filter((p) => p.bot && !p.eliminated)) {
      const a = botAction(s, p);
      if (a) {
        try {
          s = applyAction(s, p.id, a, now);
          moved = true;
          break;
        } catch {
          continue;
        }
      }
    }
    if (!moved) break;
  }
  return s;
}
export async function handleApi(
  req: Request,
  store: Store,
  ip = "local",
): Promise<Response> {
  const now = Date.now();
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/\.netlify\/functions\/api/, "/api");
  const parts = pathname.split("/").filter(Boolean);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  try {
    if (
      process.env.ALLOWED_ORIGIN &&
      req.headers.get("origin") &&
      req.headers.get("origin") !== process.env.ALLOWED_ORIGIN
    )
      return json({ error: "Origin not allowed." }, 403);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method === "GET" && pathname === "/api/health")
      return json({
        ok: true,
        service: "hexfront",
        transport: "versioned-polling",
        storage:
          store instanceof MemoryStore
            ? "temporary-memory"
            : "temporary-netlify-blobs",
        idleTimeoutSeconds: ROOM_IDLE_TIMEOUT_MS / 1000,
      });
    rate(ip, now, 1200);
    if (!["GET", "POST"].includes(req.method))
      return json({ error: "Method not allowed." }, 405);
    let body: unknown;
    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > 8192) return json({ error: "Request too large." }, 413);
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }
    }
    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      if (store instanceof MemoryStore) await store.cleanup();
      rate(`create:${ip}`, now, 12);
      const data = join.parse(body);
      const code = randomBytes(6).toString("hex").slice(0, 6).toUpperCase();
      const id = randomBytes(12).toString("hex"),
        token = randomBytes(32).toString("hex");
      return await store.transaction(code, (previous) => {
        if (previous) throw new Error("Room code collision; try again.");
        let s = createRoom(
          code,
          id,
          data.name,
          digest(token),
          now,
          {},
          data.spectator,
          randomBytes(32).toString("hex"),
        );
        if (data.practice) {
          addPlayer(s, "bot-1", "The Cartographer", "", now, undefined, true);
          s.players[0].ready = true;
        }
        return {
          room: s,
          result: json({ code, token, view: view(s, id, now) }, 201),
        };
      });
    }
    const code = parts[2]?.toUpperCase();
    if (parts[1] !== "rooms" || !code || !/^[A-Z0-9]{6}$/.test(code))
      return json({ error: "Route not found." }, 404);
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    return await store.transaction(code, (existing) => {
      if (!existing || now - existing.updated >= ROOM_IDLE_TIMEOUT_MS)
        throw Object.assign(new Error("Room not found or expired."), {
          status: 404,
        });
      let s = existing;
      if (ensureLobbyMap(s)) s.version++;
      tick(s, now);
      if (parts[3] === "join" && req.method === "POST") {
        const data = join.parse(body);
        const id = randomBytes(12).toString("hex"),
          newToken = randomBytes(32).toString("hex");
        addPlayer(
          s,
          id,
          data.name,
          digest(newToken),
          now,
          data.color,
          false,
          !!data.spectator,
        );
        s.version++;
        s.updated = now;
        return {
          room: s,
          result: json({ code, token: newToken, view: view(s, id, now) }),
        };
      }
      const p = auth(s, token);
      if (!p)
        throw Object.assign(
          new Error(
            "Reconnect token is missing or invalid. Rejoin from the room link.",
          ),
          { status: 401 },
        );
      p.lastSeen = now;
      if (req.method === "POST" && parts[3] === "action") {
        const data = envelope.parse(body);
        rate(`action:${p.id}`, now, 100);
        if (s.processed[`${p.id}:${data.id}`] !== undefined) {
          s.updated = now;
          return {
            room: s,
            result: json({ view: view(s, p.id, now), duplicate: true }),
          };
        }
        if (data.version !== s.version)
          throw Object.assign(
            new Error("The room changed. Review the updated board and retry."),
            { status: 409 },
          );
        if (["rematch", "restart"].includes(data.action.type))
          s = { ...s, entropy: randomBytes(32).toString("hex") };
        s = applyAction(s, p.id, data.action, now);
        s.processed[`${p.id}:${data.id}`] = s.version;
      } else if (req.method !== "GET" || parts.length !== 3)
        throw Object.assign(new Error("Route not found."), { status: 404 });
      s = bots(s, now);
      s.updated = now;
      return { room: s, result: json({ view: view(s, p.id, now) }) };
    });
  } catch (e: any) {
    if (e instanceof z.ZodError)
      return json(
        { error: "Invalid request.", details: e.issues.map((x) => x.message) },
        400,
      );
    const status = e.status || (/not found/i.test(e.message) ? 404 : 400);
    if (status >= 500) console.error("Hexfront API:", e.message);
    return json(
      {
        error:
          status >= 500
            ? "Game service unavailable. Please retry."
            : e.message || "Request failed.",
      },
      status,
    );
  }
}
