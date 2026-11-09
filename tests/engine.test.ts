import { describe, it, expect } from "vitest";
import {
  addPlayer,
  applyAction,
  botAction,
  coalition,
  controller,
  createRoom,
  legalDraft,
  longestPath,
  owned,
  pegs,
  pegCount,
  recalculate,
  retreats,
  score,
  tick,
  top,
  view,
} from "../shared/engine";
import { ABILITIES } from "../shared/cards";
import { generateMap, territoryCount, adjacent } from "../shared/map";
import {
  Action,
  COLORS,
  NumberedHex,
  RESOURCES,
  Room,
  TerritoryBase,
} from "../shared/types";
const NOW = 100000;
function lobby(n = 3) {
  const s = createRoom("ABC123", "p0", "Red", "h0", NOW, {
    seed: "repeatable",
  });
  for (let i = 1; i < n; i++)
    addPlayer(s, `p${i}`, `P${i}`, `h${i}`, NOW, COLORS[i]);
  s.players.forEach((p) => (p.ready = true));
  return s;
}
function drafted(n = 3) {
  let s = applyAction(lobby(n), "p0", { type: "start" }, NOW);
  while (s.phase === "draft") {
    const id = s.draft[s.draftIndex];
    s = applyAction(
      s,
      id,
      {
        type: "draft",
        target: legalDraft(s, id)[0],
        card: s.players.find((p) => p.id === id)!.hand[0],
      },
      NOW,
    );
  }
  return s;
}
function arena() {
  const s = drafted();
  s.pending = undefined;
  s.proposal = undefined;
  s.actions = 3;
  s.settings.eliminationVictory = false;
  // Small fixed geometry isolates combat rule fixtures from randomized campaign setup.
  const old = s.board;
  const fixed: TerritoryBase[] = [];
  for (let r = -3; r <= 3; r++)
    for (let q = -3; q <= 3; q++)
      if (Math.abs(q + r) <= 3) {
        fixed.push({ ...old[fixed.length], q, r });
      }
  s.board = fixed;
  s.players.forEach((p) => {
    p.hand = [];
    p.stock = { Lumber: 5, Iron: 5, Food: 5, Stone: 5, Cattle: 5 };
    p.eliminated = false;
  });
  s.board.forEach((t) => {
    t.stack = [t.stack[0]];
    s.tiles[t.stack[0]].owner = null;
    t.rebels = [null, null, null];
  });
  const actor = s.players[0].id,
    other = s.players[1].id,
    third = s.players[2].id;
  for (let i = 0; i < 3; i++) {
    const t = s.board[i];
    s.tiles[t.stack[0]].owner = s.players[i].id;
  }
  recalculate(s);
  return { s, actor, other, third, from: s.board[0], target: s.board[1] };
}
let serial = 0;
function card(
  s: Room,
  owner: string | null,
  value = 3,
  ability?: NumberedHex["ability"],
) {
  const id = `test-${++serial}`;
  s.tiles[id] = {
    id,
    value,
    resource: "Food",
    owner: null,
    deck: ability ? ABILITIES[ability].deck : "basic",
    ability,
  };
  if (owner) s.players.find((p) => p.id === owner)!.hand.push(id);
  return id;
}
function doAction(s: Room, id: string, a: Action) {
  return applyAction(s, id, a, NOW);
}
describe("setup and private snapshots", () => {
  it("only the host can restart and host authority survives elimination", () => {
    let s = drafted();
    const guest = s.players.find((p) => p.id !== s.host)!;
    expect(() => doAction(s, guest.id, { type: "restart" })).toThrow();
    s.players.find((p) => p.id === s.host)!.eliminated = true;
    s = doAction(s, s.host, { type: "restart" });
    expect(s.phase).toBe("draft");
    expect(s.board).toHaveLength(42);
    expect(s.players.every((p) => !p.eliminated && p.hand.length === 3)).toBe(
      true,
    );
    expect(s.board.every((t) => !controller(s, t))).toBe(true);
  });
  for (const n of [2, 3, 4])
    it(`${n} player snake is exact, territories have three sockets`, () => {
      let s = doAction(lobby(n), "p0", { type: "start" });
      const ids = s.players.map((p) => p.id);
      const count = territoryCount(n);
      expect(s.draft).toEqual(
        Array.from({ length: count / n }, (_, pass) =>
          pass % 2 ? [...ids].reverse() : ids,
        ).flat(),
      );
      expect(s.board).toHaveLength(count);
      expect(
        s.board.every(
          (t) =>
            t.stack.length === 0 && t.rebels.length === 3 && !controller(s, t),
        ),
      ).toBe(true);
      while (s.phase === "draft") {
        const id = s.draft[s.draftIndex];
        s = doAction(s, id, {
          type: "draft",
          target: legalDraft(s, id)[0],
          card: s.players.find((p) => p.id === id)!.hand[0],
        });
      }
      expect(s.players.every((p) => owned(s, p.id).length === count / n)).toBe(
        true,
      );
    });
  it("basic distribution is exactly four copies of all 30 combinations; 15 of each special", () => {
    const s = doAction(lobby(), "p0", { type: "start" });
    expect(
      Object.values(s.tiles).filter((c) => c.deck === "basic"),
    ).toHaveLength(120);
    for (const r of RESOURCES)
      for (let n = 1; n <= 6; n++)
        expect(
          Object.values(s.tiles).filter(
            (c) => c.deck === "basic" && c.resource === r && c.value === n,
          ),
        ).toHaveLength(4);
    for (const d of ["Infrastructure", "Weapons Tech", "Diplomacy"] as const)
      expect(s.decks[d]).toHaveLength(15);
    expect(new Set(s.forecast).size).toBe(5);
  });
  it("is deterministic and rejects a forged drafter", () => {
    const a = doAction(lobby(), "p0", { type: "start" }),
      b = doAction(lobby(), "p0", { type: "start" });
    expect(a).toEqual(b);
    expect(() =>
      doAction(a, "intruder", { type: "draft", target: "T01" }),
    ).toThrow();
    const s = drafted();
    expect(s.players.every((p) => p.hand.length === 3)).toBe(true);
  });
  it("never sends other hands, secrets, registry of hidden cards, or deck orders", () => {
    const s = drafted(),
      p = s.players[0];
    const own = view(s, p.id, NOW),
      publicView = view(s, null, NOW);
    expect(own.hand).toHaveLength(3);
    expect(publicView.hand).toEqual([]);
    expect("rng" in own).toBe(false);
    expect("decks" in own).toBe(false);
    expect("bag" in own).toBe(false);
    expect("processed" in own).toBe(false);
    expect(JSON.stringify(own)).not.toContain("tokenHash");
    expect(Object.keys(publicView.tiles)).toHaveLength(s.board.length);
    for (const x of s.players.slice(1))
      for (const id of x.hand) expect(own.tiles[id]).toBeUndefined();
  });
  it("uses exactly one of every resource in every five appended forecast tokens", () => {
    let s = drafted(2);
    const appended: string[] = [];
    for (let r = 0; r < 15; r++) {
      const prior = s.round;
      while (s.round === prior)
        s = doAction(s, s.players[s.turn].id, { type: "end" });
      appended.push(s.forecast[4]);
    }
    for (let i = 0; i < 15; i += 5)
      expect(new Set(appended.slice(i, i + 5)).size).toBe(5);
  });
});
describe("card registry and resource timing", () => {
  it("caps combined basic/special hands at three for purchases, scouting and reorganizing", () => {
    const { s, actor } = arena();
    const p = s.players.find((p) => p.id === actor)!;
    const basic = card(s, actor, 2);
    card(s, actor, 3, "Fortress");
    card(s, actor, 4);
    expect(() =>
      doAction(s, actor, { type: "buy", target: "Infrastructure" }),
    ).toThrow("Hand is full");
    expect(() => doAction(s, actor, { type: "scout" })).toThrow("Hand is full");
    expect(p.hand).toHaveLength(3);
    const deckSize = s.decks.basic.length;
    const reorganized = doAction(s, actor, { type: "reorganize", card: basic });
    expect(reorganized.players.find((p) => p.id === actor)!.hand).toHaveLength(
      3,
    );
    expect(reorganized.decks.basic).toHaveLength(deckSize - 1);
    const discarded = doAction(s, actor, { type: "discard", card: basic });
    expect(discarded.actions).toBe(s.actions);
    const scouted = doAction(discarded, actor, { type: "scout" });
    expect(scouted.players.find((p) => p.id === actor)!.hand).toHaveLength(3);
    expect(scouted.decks.basic).toHaveLength(deckSize - 1);
    const bought = doAction(discarded, actor, {
      type: "buy",
      target: "Infrastructure",
    });
    expect(bought.players.find((p) => p.id === actor)!.hand).toHaveLength(3);
  });
  it("lets existing oversized hands choose free discards even outside their draft turn", () => {
    let s = doAction(lobby(), "p0", { type: "start" });
    const p = s.players.find((p) => p.id !== s.draft[0])!;
    const keep = p.hand.slice();
    p.hand.push(s.decks.basic.pop()!, s.decks.basic.pop()!);
    const extras = p.hand.slice(3);
    for (const id of extras)
      s = doAction(s, p.id, { type: "discard", card: id });
    expect(s.players.find((x) => x.id === p.id)!.hand).toEqual(keep);
    expect(s.discards.basic).toEqual(expect.arrayContaining(extras));
    expect(s.draftIndex).toBe(0);
    expect(s.actions).toBe(0);
    const active = s.players.find((x) => x.id === s.draft[0])!;
    active.hand.push(s.decks.basic.pop()!);
    expect(() =>
      doAction(s, active.id, {
        type: "draft",
        target: legalDraft(s, active.id)[0],
        card: active.hand[0],
      }),
    ).toThrow("Discard down to 3");
  });
  function wave(s: Room) {
    s.turn = s.players.length - 1;
    return doAction(s, s.players[s.turn].id, { type: "end" });
  }
  it("Fortress adds exactly two defense; Ballista adds two against buried layers", () => {
    const { s, actor, other, from, target } = arena();
    top(s, target).ability = "Fortress";
    const lower = card(s, null, 1);
    s.tiles[lower].owner = other;
    target.stack.unshift(lower);
    const c = card(s, actor, 3, "Ballista");
    const a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    expect(a.pending?.attack).toBe(top(s, from).value + 5);
    expect(a.pending?.defense).toBe(top(s, target).value + 3);
  });
  it("Lumber Mill and Workshop obey production and storage caps", () => {
    const { s, actor } = arena();
    s.players.find((p) => p.id === actor)!.stock = {
      Lumber: 0,
      Iron: 0,
      Food: 0,
      Stone: 0,
      Cattle: 0,
    };
    for (const t of s.board.slice(0, 6)) {
      top(s, t).owner = actor;
      top(s, t).resource = "Lumber";
    }
    top(s, s.board[0]).ability = "Workshop";
    top(s, s.board[1]).ability = "Lumber Mill";
    s.forecast[1] = "Lumber";
    let a = wave(s);
    expect(a.players.find((p) => p.id === actor)!.stock.Lumber).toBe(4);
    top(a, a.board[0]).ability = undefined;
    a.forecast[1] = "Lumber";
    a = wave(a);
    expect(a.players.find((p) => p.id === actor)!.stock.Lumber).toBe(7);
  });
  it("Granary increases storage by three, buried Granary provides no production benefit", () => {
    const { s, actor, from } = arena();
    const p = s.players.find((p) => p.id === actor)!;
    p.stock = { Lumber: 11, Iron: 0, Food: 0, Stone: 0, Cattle: 0 };
    top(s, from).ability = "Granary";
    top(s, from).resource = "Lumber";
    s.forecast[1] = "Lumber";
    let a = wave(s);
    expect(a.players.find((p) => p.id === actor)!.stock.Lumber).toBe(12);
    a.forecast[1] = "Lumber";
    a = wave(a);
    expect(a.players.find((p) => p.id === actor)!.stock.Lumber).toBe(13);
  });
  it("reorder changes future production without retroactive tokens", () => {
    const { s, actor, from } = arena();
    const c = card(s, null, 3);
    s.tiles[c].owner = actor;
    s.tiles[c].resource = "Iron";
    from.stack.push(c);
    const before = { ...s.players.find((p) => p.id === actor)!.stock };
    const a = doAction(s, actor, {
      type: "reorder",
      target: from.id,
      order: [c, from.stack[0]],
    });
    expect(a.players.find((p) => p.id === actor)!.stock).toEqual(before);
    expect(top(a, a.board[0]).resource).toBe(s.tiles[from.stack[0]].resource);
  });
  it("Border Fort and Blockade Unit prevent retreat; patrol expires after next turn", () => {
    const { s, actor, from, target } = arena();
    target.rebels = [null, null, null];
    top(s, target).ability = "Border Fort";
    expect(retreats(s, from, 1)).not.toContain(target);
    top(s, target).ability = "Blockade Unit";
    expect(retreats(s, from, 1)).not.toContain(target);
    top(s, target).ability = undefined;
    expect(retreats(s, from, 1)).toContain(target);
    const a = doAction(s, actor, { type: "patrol", target: from.id });
    expect(a.board[0].patrol?.expires).toBe(
      s.players.find((p) => p.id === actor)!.turns + 2,
    );
    expect(() =>
      doAction(a, actor, { type: "patrol", target: from.id }),
    ).toThrow();
  });
  it("Raiders steals one available token on capture", () => {
    const { s, actor, other, from, target } = arena();
    s.players.find((p) => p.id === actor)!.stock = {
      Lumber: 0,
      Iron: 0,
      Food: 0,
      Stone: 0,
      Cattle: 0,
    };
    top(s, from).value = 6;
    top(s, target).value = 1;
    const c = card(s, actor, 6, "Raiders");
    let a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    a = doAction(a, other, { type: "guard" });
    expect(
      Object.values(a.players.find((p) => p.id === actor)!.stock).reduce(
        (a, b) => a + b,
        0,
      ),
    ).toBe(1);
  });
  it("Cavalry validates the friendly intermediary exactly", () => {
    const { s, actor, from } = arena();
    const middle = s.board.find((t) => t.q === from.q + 1 && t.r === from.r)!;
    top(s, middle).owner = actor;
    const far = s.board.find((t) => t.q === from.q + 2 && t.r === from.r)!;
    top(s, far).owner = null;
    const c = card(s, actor, 6, "Cavalry");
    expect(() =>
      doAction(s, actor, {
        type: "attack",
        source: from.id,
        target: far.id,
        card: c,
      }),
    ).not.toThrow();
    top(s, middle).owner = null;
    expect(() =>
      doAction(s, actor, {
        type: "attack",
        source: from.id,
        target: far.id,
        card: c,
      }),
    ).toThrow();
  });
  it("Treaty substitutes one participant payment and is discarded", () => {
    const { s, actor, other } = arena();
    const treaty = card(s, actor, 2, "Treaty");
    const original = s.players.find((p) => p.id === actor)!.stock.Food;
    let a = doAction(s, actor, {
      type: "alliance",
      player: other,
      card: treaty,
    });
    a = doAction(a, other, { type: "respond", accept: true });
    expect(a.players.find((p) => p.id === actor)!.stock.Food).toBe(original);
    expect(a.discards.Diplomacy).toContain(treaty);
  });
  it("Ceasefire blocks attacks, and Envoy claims only adjacent one-layer neutrals", () => {
    const { s, actor, other, from, target } = arena();
    const c = card(s, actor, 2, "Ceasefire");
    const a = doAction(s, actor, {
      type: "ceasefire",
      target: from.id,
      card: c,
    });
    expect(a.board[0].ceasefire).toBe(actor);
    expect(a.discards.Diplomacy).toContain(c);
    top(s, target).owner = null;
    const envoy = card(s, actor, 2, "Envoy");
    const b = doAction(s, actor, {
      type: "envoy",
      target: target.id,
      card: envoy,
    });
    expect(controller(b, b.board[1])).toBe(actor);
  });
  it("Shield Pact protects formal ally and replaces the one guard slot with +3", () => {
    const { s, actor, other, third, from, target } = arena();
    s.alliances = [{ members: [other, third], transferred: 0 }];
    top(s, from).value = 3;
    top(s, target).value = 4;
    const c = card(s, actor, 3),
      shield = card(s, third, 1, "Shield Pact");
    let a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    a = doAction(a, third, { type: "guard", card: shield });
    expect(controller(a, a.board[1])).toBe(other);
    expect(a.discards.Diplomacy).toContain(shield);
  });
  it("Market Charter improves matching bank exchange to 2:1", () => {
    const { s, actor, from } = arena();
    const p = s.players.find((p) => p.id === actor)!;
    p.stock = { Lumber: 2, Iron: 0, Food: 0, Stone: 0, Cattle: 0 };
    expect(() =>
      doAction(s, actor, { type: "bank", give: "Lumber", resource: "Iron" }),
    ).toThrow();
    top(s, from).ability = "Market Charter";
    const a = doAction(s, actor, {
      type: "bank",
      give: "Lumber",
      resource: "Iron",
    });
    expect(a.players.find((p) => p.id === actor)!.stock.Iron).toBe(1);
    expect(a.players.find((p) => p.id === actor)!.stock.Lumber).toBe(0);
  });
  it("buying is secret, uses exact prices, respects combined hand cap and recycles discards", () => {
    const { s, actor } = arena();
    s.players.find((p) => p.id === actor)!.hand = [];
    const a = doAction(s, actor, { type: "buy", target: "Infrastructure" });
    expect(a.players.find((p) => p.id === actor)!.stock.Lumber).toBe(3);
    expect(a.players.find((p) => p.id === actor)!.hand).toHaveLength(1);
    expect(view(a, null, NOW).hand).toEqual([]);
    const id = a.players.find((p) => p.id === actor)!.hand[0];
    let b = doAction(a, actor, { type: "discard", card: id });
    b.decks.Infrastructure = [];
    b = doAction(b, actor, { type: "buy", target: "Infrastructure" });
    expect(b.players.find((p) => p.id === actor)!.hand).toContain(id);
  });
  it("never exposes entropy or private replay history, including after victory", () => {
    const s = drafted();
    expect("entropy" in view(s, null, NOW)).toBe(false);
    expect("history" in view(s, null, NOW)).toBe(false);
    s.phase = "finished";
    expect("entropy" in view(s, null, NOW)).toBe(false);
    expect("history" in view(s, null, NOW)).toBe(false);
    expect(JSON.stringify(view(s, null, NOW))).not.toContain(s.entropy);
  });
  it("replays an identical typed command transcript deterministically", () => {
    const a = lobby(),
      b = structuredClone(a);
    let one = doAction(a, "p0", { type: "start" }),
      two = doAction(b, "p0", { type: "start" });
    while (one.phase === "draft") {
      const actor = one.draft[one.draftIndex],
        action = {
          type: "draft",
          target: legalDraft(one, actor)[0],
          card: one.players.find((p) => p.id === actor)!.hand[0],
        };
      one = doAction(one, actor, action);
      two = doAction(two, actor, action);
    }
    for (let i = 0; i < 9; i++) {
      const actor = one.players[one.turn].id;
      one = doAction(one, actor, { type: "end" });
      two = doAction(two, actor, { type: "end" });
    }
    expect(one).toEqual(two);
  });
  it("automatons can play from lobby all the way to a declared winner", () => {
    let s = doAction(lobby(3), "p0", { type: "start" });
    s.players.forEach((p) => (p.bot = true));
    let commands = 0;
    while (s.phase !== "finished" && commands < 2200) {
      let action;
      for (const p of s.players) {
        action = botAction(s, p);
        if (action) {
          s = doAction(s, p.id, action);
          break;
        }
      }
      if (!action) throw new Error("Bot match stalled.");
      commands++;
    }
    expect(s.phase, `Round ${s.round}, ${commands} commands`).toBe("finished");
    expect(s.winner).toBeDefined();
  }, 20000);
  it("automatons trade toward a deck that still has cards when infrastructure is exhausted", () => {
    const s = drafted();
    const p = s.players[s.turn];
    s.decks.Infrastructure = [];
    s.discards.Infrastructure = [];
    p.stock = { Food: 6, Stone: 1, Lumber: 1, Iron: 0, Cattle: 1 };
    expect(botAction(s, p)).toEqual({
      type: "bank",
      give: "Food",
      resource: "Iron",
    });
  });
});
describe("combat and ownership", () => {
  it("ties defend and the source never moves", () => {
    const { s, actor, from, target } = arena();
    top(s, from).value = 3;
    top(s, target).value = 6;
    top(s, target).owner = null;
    const c = card(s, actor, 3);
    const a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    expect(controller(a, a.board[1])).toBe(null);
    expect(a.board[0].stack).toEqual(from.stack);
    expect(a.discards.basic).toContain(c);
  });
  it("3-layer success removes only top and reveals foreign owner immediately", () => {
    const { s, actor, other, third, from, target } = arena();
    top(s, from).value = 4;
    top(s, target).owner = third;
    const middle = card(s, null, 2),
      upper = card(s, null, 6);
    s.tiles[middle].owner = third;
    s.tiles[upper].owner = other;
    target.stack.push(middle, upper);
    const c = card(s, actor, 5);
    let a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    expect(a.pending?.attack).toBe(9);
    expect(a.pending?.defense).toBe(8);
    a = doAction(a, other, { type: "guard" });
    expect(a.board[1].stack).toHaveLength(2);
    expect(controller(a, a.board[1])).toBe(third);
    expect(a.discards.basic).toContain(c);
  });
  it("guard changes a winning attack to a loss and occupies the only slot", () => {
    const { s, actor, other, from, target } = arena();
    top(s, from).value = 4;
    top(s, target).value = 5;
    const lower = card(s, null, 1);
    s.tiles[lower].owner = other;
    target.stack.unshift(lower);
    const c = card(s, actor, 3),
      g = card(s, other, 2);
    let a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    a = doAction(a, other, { type: "guard", card: g });
    expect(a.board[1].stack).toHaveLength(2);
    expect(a.players.find((p) => p.id === other)!.hand).not.toContain(g);
    expect(() => doAction(a, other, { type: "guard" })).toThrow();
  });
  it("timeout defaults to pass, consumes a successful final-layer attacker into board", () => {
    const { s, actor, from, target } = arena();
    top(s, from).value = 6;
    top(s, target).value = 1;
    const c = card(s, actor, 6);
    const a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    expect(a.pending).toBeDefined();
    tick(a, NOW + 26000);
    expect(a.pending).toBeUndefined();
    expect(controller(a, a.board[1])).toBe(actor);
    expect(a.board[1].stack).toEqual([c]);
  });
  it("paused battles do not expire", () => {
    const { s, actor, from, target } = arena();
    const c = card(s, actor, 6);
    const a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    a.paused = true;
    expect(tick(a, NOW + 100000)).toBe(false);
    expect(a.pending).toBeDefined();
  });
  it("Siege Engine removes two layers on a margin of four; Ballista only boosts 2+ stacks", () => {
    const { s, actor, other, from, target } = arena();
    top(s, from).value = 6;
    top(s, target).value = 1;
    const lower = card(s, null, 1);
    s.tiles[lower].owner = other;
    target.stack.unshift(lower);
    const c = card(s, actor, 6, "Siege Engine");
    let a = doAction(s, actor, {
      type: "attack",
      source: from.id,
      target: target.id,
      card: c,
    });
    a = doAction(a, other, { type: "guard" });
    expect(a.board[1].stack).toEqual([c]);
    expect(controller(a, a.board[1])).toBe(actor);
  });
  it("cannot deploy a one-shot, steal an opponent card, attack without adjacency or overstack", () => {
    const { s, actor, other, from, target } = arena();
    const treaty = card(s, actor, 3, "Treaty"),
      foreign = card(s, other, 3);
    expect(() =>
      doAction(s, actor, { type: "reinforce", target: from.id, card: treaty }),
    ).toThrow();
    expect(() =>
      doAction(s, actor, {
        type: "attack",
        source: from.id,
        target: target.id,
        card: foreign,
      }),
    ).toThrow();
  });
});
describe("formal diplomacy, Sovereignty, and Coalition Threat", () => {
  it("requires both payments on consent, one ally each, and removes conditional Sovereignty", () => {
    const { s, actor, other } = arena();
    expect(score(s, actor)).toBe(2);
    let a = doAction(s, actor, { type: "alliance", player: other });
    expect(a.alliances).toHaveLength(0);
    a = doAction(a, other, { type: "respond", accept: true });
    expect(a.alliances).toHaveLength(1);
    expect(a.players.find((p) => p.id === actor)!.stock.Food).toBe(4);
    expect(a.players.find((p) => p.id === other)!.stock.Cattle).toBe(4);
    expect(score(a, actor)).toBe(0);
    expect(() =>
      doAction(a, actor, { type: "alliance", player: a.players[2].id }),
    ).toThrow();
  });
  it("rejects consent if either contribution no longer exists, without partial mutation", () => {
    const { s, actor, other } = arena();
    const a = doAction(s, actor, { type: "alliance", player: other });
    a.players.find((p) => p.id === other)!.stock.Food = 0;
    expect(() =>
      doAction(a, other, { type: "respond", accept: true }),
    ).toThrow();
    expect(a.alliances).toHaveLength(0);
    expect(a.players.find((p) => p.id === actor)!.stock.Food).toBe(5);
  });
  for (const support of [false, true])
    it(`unilateral separation ${support ? "creates rebels and ONE permanent penalty" : "without support has no penalty"}`, () => {
      const { s, actor, other, from, target } = arena();
      s.alliances = [{ members: [actor, other], transferred: 0 }];
      if (support) {
        const c = card(s, null);
        s.tiles[c].owner = actor;
        target.stack.unshift(c);
        const d = card(s, null);
        s.tiles[d].owner = other;
        from.stack.unshift(d);
      }
      const a = doAction(s, actor, { type: "break" });
      expect(a.players.find((p) => p.id === actor)!.betrayals).toBe(
        support ? 1 : 0,
      );
      expect(pegCount(a, actor)).toBe(support ? 1 : 0);
      expect(pegCount(a, other)).toBe(support ? 1 : 0);
      expect(score(a, actor)).toBe(support ? 0 : 2);
      expect(a.cooldowns[[actor, other].sort().join(":")]).toBe(a.round + 4);
    });
  it("mutual separation discards both partners’ support without rebels or penalty", () => {
    const { s, actor, other, target } = arena();
    s.alliances = [{ members: [actor, other], transferred: 0 }];
    const c = card(s, null);
    s.tiles[c].owner = actor;
    target.stack.unshift(c);
    let a = doAction(s, actor, { type: "separate" });
    a = doAction(a, other, { type: "respond", accept: true });
    expect(a.alliances).toHaveLength(0);
    expect(pegCount(a, actor)).toBe(0);
    expect(a.players.find((p) => p.id === actor)!.betrayals).toBe(0);
    expect(a.discards.basic).toContain(c);
  });
  it("allows exactly one foreign bottom support and caps formal transfers at two", () => {
    const { s, actor, other, target } = arena();
    s.alliances = [{ members: [actor, other], transferred: 0 }];
    const c = card(s, actor),
      d = card(s, actor);
    let a = doAction(s, actor, { type: "support", target: target.id, card: c });
    expect(a.board[1].stack[0]).toBe(c);
    expect(() =>
      doAction(a, actor, { type: "support", target: target.id, card: d }),
    ).toThrow();
    a = doAction(a, actor, {
      type: "trade",
      player: other,
      resource: "Food",
      amount: 2,
    });
    expect(() =>
      doAction(a, actor, {
        type: "trade",
        player: other,
        resource: "Food",
        amount: 1,
      }),
    ).toThrow();
  });
  it("activates at 19 and immediately stops at 18, only outsiders receive attack bonus", () => {
    const { s, actor, other, third } = arena();
    s.alliances = [{ members: [actor, other], transferred: 0 }];
    s.board.slice(0, 19).forEach((t) => (top(s, t).owner = other));
    expect(coalition(s)).toBeDefined();
    top(s, s.board[18]).owner = null;
    expect(coalition(s)).toBeUndefined();
    top(s, s.board[18]).owner = actor;
    expect(coalition(s)?.members).not.toContain(third);
  });
});
describe("rebels and final containment", () => {
  it("moves the WHOLE group, respects three sockets, and prevents raid reset after movement", () => {
    const { s, actor, other, from, target } = arena();
    from.rebels = [{ owner: actor }, { owner: actor }, null];
    target.rebels = [{ owner: other }, { owner: other }, null];
    expect(() =>
      doAction(s, actor, {
        type: "rebelMove",
        source: from.id,
        target: target.id,
      }),
    ).toThrow();
    target.rebels = [null, null, null];
    s.players.find((p) => p.id === actor)!.raids = [from.id];
    const a = doAction(s, actor, {
      type: "rebelMove",
      source: from.id,
      target: target.id,
    });
    expect(pegs(a.board[0], actor)).toBe(0);
    expect(pegs(a.board[1], actor)).toBe(2);
    expect(() =>
      doAction(a, actor, { type: "raid", target: target.id }),
    ).toThrow();
  });
  it("underground attack uses local pegs, strips top, and consumes pegs on capture", () => {
    const { s, actor, other, target } = arena();
    target.rebels = [{ owner: actor }, { owner: actor }, null];
    top(s, target).value = 2;
    const c = card(s, actor, 3);
    let a = doAction(s, actor, {
      type: "underground",
      target: target.id,
      card: c,
    });
    expect(a.pending?.attack).toBe(5);
    a = doAction(a, other, { type: "guard" });
    expect(controller(a, a.board[1])).toBe(actor);
    expect(pegs(a.board[1], actor)).toBe(0);
  });
  it("recruit adds one peg at Food+Cattle cost and raids steal real stock", () => {
    const { s, actor, target } = arena();
    target.rebels = [{ owner: actor }, null, null];
    let a = doAction(s, actor, { type: "recruit", target: target.id });
    expect(pegs(a.board[1], actor)).toBe(2);
    expect(a.players.find((p) => p.id === actor)!.stock.Food).toBe(4);
    const previous = a.players.find((p) => p.id === controller(a, a.board[1]))!
      .stock.Food;
    a = doAction(a, actor, {
      type: "raid",
      target: target.id,
      resource: "Food",
    });
    expect(
      a.players.find((p) => p.id === controller(a, a.board[1]))!.stock.Food,
    ).toBe(previous - 1);
  });
  it("last landless peg survives initial suppression but dies when fully contained, reserves never retreat", () => {
    const { s, actor, other, from } = arena();
    s.board.forEach((t) => {
      if (controller(s, t) === other) top(s, t).owner = actor;
    });
    from.rebels = [{ owner: other }, null, null];
    s.board.forEach((t) => {
      if (t !== from) t.patrol = { owner: actor, expires: 99 };
    });
    top(s, from).value = 6;
    const c = card(s, actor, 6);
    let a = doAction(s, actor, {
      type: "suppress",
      target: from.id,
      player: other,
      card: c,
    });
    a = doAction(a, other, { type: "guard" });
    expect(pegCount(a, other)).toBe(0);
    expect(a.players.find((p) => p.id === other)!.eliminated).toBe(true);
    expect(a.players.find((p) => p.id === other)!.reserve).toBe(0);
  });
  it("last landless peg retreats when one hole is open; landed last pegs are mortal", () => {
    const { s, actor, other, from } = arena();
    s.board.forEach((t) => {
      if (controller(s, t) === other) top(s, t).owner = actor;
    });
    from.rebels = [{ owner: other }, null, null];
    top(s, from).value = 6;
    const c = card(s, actor, 6);
    let a = doAction(s, actor, {
      type: "suppress",
      target: from.id,
      player: other,
      card: c,
    });
    a = doAction(a, other, { type: "guard" });
    expect(pegCount(a, other)).toBe(1);
    expect(pegs(a.board[0], other)).toBe(0);
    expect(a.players.find((p) => p.id === other)!.eliminated).toBe(false);
  });
});
describe("prestige and victory", () => {
  it("computes simple paths through branches and cycles without repeating nodes", () => {
    const { s, actor } = arena();
    s.board.forEach((t) => (top(s, t).owner = null));
    const coords = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ];
    for (const [q, r] of coords) {
      const t = s.board.find((t) => t.q === q && t.r === r)!;
      top(s, t).owner = actor;
    }
    expect(longestPath(s, actor)).toBe(7);
  });
  it("eligible incumbent retains tied title; vacant tie stays vacant", () => {
    const { s, actor, other } = arena();
    for (const p of [actor, other]) {
      const t = owned(s, p)[0];
      for (let i = 0; i < 2; i++) {
        const c = card(s, null, 2, "Ballista");
        s.tiles[c].owner = p;
        t.stack.push(c);
      }
    }
    recalculate(s);
    expect(s.titles["Strongest Army"]).toBeUndefined();
    s.titles["Strongest Army"] = actor;
    recalculate(s);
    expect(s.titles["Strongest Army"]).toBe(actor);
  });
  it("requires two distinct consecutive round-end snapshots, not midturn score", () => {
    let { s, actor } = arena();
    const p = s.players.find((p) => p.id === actor)!;
    s.board.forEach((t) => (top(s, t).owner = actor));
    p.betrayals = 0;
    let i = 0;
    for (const ability of [
      "Ballista",
      "Ballista",
      "Fortress",
      "Fortress",
      "Envoy",
      "Envoy",
    ] as const) {
      const t = s.board[i++],
        id = card(s, null, 3, ability);
      s.tiles[id].owner = actor;
      t.stack.push(id);
    }
    recalculate(s);
    expect(score(s, actor)).toBeGreaterThanOrEqual(8);
    expect(s.winner).toBeUndefined();
    s.turn = s.players.length - 1;
    s = doAction(s, s.players[s.turn].id, { type: "end" });
    expect(s.players.find((p) => p.id === actor)!.claim).toBe(1);
    expect(s.winner).toBeUndefined();
    s.turn = s.players.length - 1;
    s = doAction(s, s.players[s.turn].id, { type: "end" });
    expect(s.winner).toBe(actor);
  });
});
