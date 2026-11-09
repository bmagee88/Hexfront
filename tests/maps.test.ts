import { describe, it, expect } from "vitest";
import {
  adjacent,
  generateMap,
  territoryCount,
  mapConnectivity,
  MAP_ALGORITHM,
} from "../shared/map";
import { RISK_NEIGHBORS, RISK_HISTOGRAM, RISK_AVERAGE } from "../shared/risk";
import {
  addPlayer,
  applyAction,
  coalition,
  controller,
  ensureLobbyMap,
  createRoom,
  legalDraft,
  view,
} from "../shared/engine";
import { Room, TerritoryBase } from "../shared/types";
const now = 1000;
function connected(board: TerritoryBase[]) {
  const seen = new Set([board[0].id]),
    queue = [board[0]];
  for (let i = 0; i < queue.length; i++)
    for (const t of board)
      if (!seen.has(t.id) && adjacent(queue[i], t)) {
        seen.add(t.id);
        queue.push(t);
      }
  return seen.size === board.length;
}
function lobby(n = 3) {
  const s = createRoom("MAP123", "host", "Host", "host-token", now);
  for (let i = 1; i < n; i++) addPlayer(s, `p${i}`, `Player ${i}`, "", now);
  s.players.forEach((p) => (p.ready = true));
  return s;
}
const act = (s: Room, id: string, action: Parameters<typeof applyAction>[2]) =>
  applyAction(s, id, action, now);
describe("randomized contiguous battlegrounds", () => {
  it("uses the classic 42-territory, 83-border Risk reference", () => {
    expect(Object.keys(RISK_NEIGHBORS)).toHaveLength(42);
    expect(RISK_HISTOGRAM).toEqual([0, 0, 4, 13, 13, 5, 7]);
    expect(RISK_AVERAGE).toBeCloseTo(166 / 42);
  });
  for (const players of [2, 3, 4])
    it(`${players} players receive a near-42 map with an equal number of opening placements`, () => {
      const count = territoryCount(players);
      expect(count % players).toBe(0);
      expect(Math.abs(count - 42)).toBeLessThanOrEqual(2);
      for (let seed = 0; seed < 30; seed++) {
        const board = generateMap(count, `test-${players}-${seed}`);
        expect(board).toHaveLength(count);
        expect(new Set(board.map((t) => `${t.q},${t.r}`)).size).toBe(count);
        expect(connected(board)).toBe(true);
        const { histogram, average, edges } = mapConnectivity(board);
        expect(histogram[0] + histogram[1]).toBe(0);
        expect(average).toBeGreaterThanOrEqual(3.8);
        expect(average).toBeLessThanOrEqual(4.1);
        expect(histogram[3] + histogram[4]).toBeGreaterThanOrEqual(count * 0.5);
        expect(histogram[6]).toBeLessThanOrEqual(Math.ceil(count * 0.2));
        expect(edges).toBe(
          board.reduce(
            (sum, t) => sum + board.filter((u) => adjacent(t, u)).length,
            0,
          ) / 2,
        );
        expect(
          board.every(
            (t) =>
              !t.stack.length &&
              t.rebels.length === 3 &&
              t.rebels.every((p) => !p),
          ),
        ).toBe(true);
        expect(new Set(board.map((t) => t.region)).size).toBe(6);
        for (let region = 0; region < 6; region++)
          expect(connected(board.filter((t) => t.region === region))).toBe(
            true,
          );
      }
    }, 15000);
  it("upgrades old lobby geography without replacing a game already in progress", () => {
    let s = lobby();
    s.mapAlgorithm = undefined;
    expect(ensureLobbyMap(s)).toBe(true);
    expect(s.mapAlgorithm).toBe(MAP_ALGORITHM);
    expect(ensureLobbyMap(s)).toBe(false);
    s = act(s, "host", { type: "start" });
    const board = structuredClone(s.board);
    s.mapAlgorithm = undefined;
    expect(ensureLobbyMap(s)).toBe(false);
    expect(s.board).toEqual(board);
  });
  it("seeded maps are reproducible and six choices have different shapes", () => {
    expect(generateMap(42, "repeat")).toEqual(generateMap(42, "repeat"));
    let s = lobby();
    const original = structuredClone(s.board);
    s = act(s, "host", { type: "generateMaps", mapCount: 6 });
    expect(s.mapChoices).toHaveLength(7);
    expect(
      new Set(
        s
          .mapChoices!.slice(-6)
          .map((c) => JSON.stringify(c.board.map((t) => [t.q, t.r]))),
      ).size,
    ).toBe(6);
    expect(s.board).toEqual(original);
    s = act(s, "host", { type: "chooseMap", mapIndex: 4 });
    expect(s.board).toEqual(s.mapChoices![4].board);
    expect(() => act(s, "p1", { type: "generateMaps", mapCount: 6 })).toThrow();
    expect(() => act(s, "p1", { type: "chooseMap", mapIndex: 1 })).toThrow();
    expect(() =>
      act(s, "host", { type: "chooseMap", mapIndex: 999 }),
    ).toThrow();
  });
  it("preserves selected terrain during six-map comparison and resizes only for commanders", () => {
    let s = lobby(3);
    s = act(s, "host", { type: "generateMaps", mapCount: 1 });
    const selected = structuredClone(s.board);
    addPlayer(s, "watch", "Projector", "", now, undefined, false, true);
    expect(s.board).toEqual(selected);
    addPlayer(s, "p3", "Fourth", "", now);
    expect(s.board).toHaveLength(44);
    expect(s.mapChoices).toHaveLength(1);
    s.players.find((p) => p.id === "p3")!.lastSeen = 0;
    s = applyAction(s, "host", { type: "remove", player: "p3" }, 40000);
    expect(s.board).toHaveLength(42);
  });
  it("locks the chosen map after deployment starts, including non-host attempts", () => {
    let s = lobby();
    s = act(s, "host", { type: "chooseMap", mapIndex: 0 });
    const selected = structuredClone(s.board);
    s = act(s, "host", { type: "start" });
    expect(s.board).toEqual(selected);
    expect(() =>
      act(s, "host", { type: "generateMaps", mapCount: 1 }),
    ).toThrow();
    expect(() => act(s, "host", { type: "chooseMap", mapIndex: 0 })).toThrow();
  });
  it("keeps the selected map intact when old preview history is pruned", () => {
    let s = lobby();
    const selected = structuredClone(s.board);
    for (let i = 0; i < 8; i++)
      s = act(s, "host", { type: "generateMaps", mapCount: 6 });
    expect(s.mapChoices!.length).toBeLessThanOrEqual(24);
    expect(s.board).toEqual(selected);
    expect(s.mapChoices![s.mapIndex!].board).toEqual(selected);
  });
});
describe("full-board snake deployment", () => {
  for (const n of [2, 3, 4])
    it(`fills every empty base from private hands with ${n} players`, () => {
      let s = act(lobby(n), "host", { type: "start" });
      const turns = s.draft.slice(),
        count = s.board.length;
      expect(s.decks.basic.length).toBe(120 - 3 * n);
      expect(s.players.every((p) => p.hand.length === 3)).toBe(true);
      expect(view(s, null, now).tiles).toEqual({});
      for (let step = 0; step < count; step++) {
        const id = turns[step],
          p = s.players.find((p) => p.id === id)!,
          played = p.hand[0],
          old = p.hand.slice();
        expect(s.draft[s.draftIndex]).toBe(id);
        const target = legalDraft(s, id).at(-1)!;
        const before = s.decks.basic.length;
        s = act(s, id, { type: "draft", target, card: played });
        const current = s.players.find((p) => p.id === id)!;
        expect(s.board.find((t) => t.id === target)!.stack).toEqual([played]);
        expect(
          controller(
            s,
            s.board.find((t) => t.id === target)!,
          ),
        ).toBe(id);
        expect(current.hand).not.toContain(played);
        expect(old.slice(1).every((card) => current.hand.includes(card))).toBe(
          true,
        );
        expect(current.hand.length).toBe(3);
        expect(s.decks.basic.length).toBeLessThan(before);
        if (step < count - 1) {
          expect(s.phase).toBe("draft");
          expect(s.round).toBe(0);
          expect(view(s, id, now).tiles[played]).toBeDefined();
        }
      }
      expect(s.phase).toBe("playing");
      expect(s.round).toBe(1);
      expect(s.board.every((t) => t.stack.length === 1)).toBe(true);
      expect(
        s.players.every(
          (p) =>
            s.board.filter((t) => controller(s, t) === p.id).length ===
            count / n,
        ),
      ).toBe(true);
    });
  it("allows nonadjacent placement, rejects occupied bases, missing/foreign cards and out-of-turn orders atomically", () => {
    let s = act(lobby(), "host", { type: "start" });
    const first = s.draft[0],
      p = s.players.find((p) => p.id === first)!,
      wrong = s.players.find((p) => p.id !== first)!;
    const target = s.board[0].id;
    expect(() => act(s, first, { type: "draft", target })).toThrow();
    expect(() =>
      act(s, wrong.id, { type: "draft", target, card: wrong.hand[0] }),
    ).toThrow();
    expect(() =>
      act(s, first, { type: "draft", target, card: wrong.hand[0] }),
    ).toThrow();
    s = act(s, first, { type: "draft", target, card: p.hand[0] });
    const next = s.draft[s.draftIndex],
      q = s.players.find((p) => p.id === next)!;
    expect(() =>
      act(s, next, { type: "draft", target, card: q.hand[0] }),
    ).toThrow();
    const far = s.board.find(
      (t) => !t.stack.length && !adjacent(s.board[0], t),
    )!;
    expect(legalDraft(s, next)).toContain(far.id);
    s = act(s, next, { type: "draft", target: far.id, card: q.hand[0] });
    expect(s.board.find((t) => t.id === far.id)!.stack).toHaveLength(1);
  });
  it("uses a strict map-relative majority for Coalition Threat", () => {
    let s = act(lobby(3), "host", { type: "start" });
    while (s.phase === "draft") {
      const id = s.draft[s.draftIndex];
      s = act(s, id, {
        type: "draft",
        target: legalDraft(s, id)[0],
        card: s.players.find((p) => p.id === id)!.hand[0],
      });
    }
    const [a, b, out] = s.players.map((p) => p.id);
    s.alliances = [{ members: [a, b], transferred: 0 }];
    s.board.forEach((t, i) => (s.tiles[t.stack[0]].owner = i < 21 ? a : out));
    expect(coalition(s)).toBeUndefined();
    s.tiles[s.board[21].stack[0]].owner = b;
    expect(coalition(s)).toBeDefined();
  });
});
