import { createHash } from "node:crypto";
import { adjacent } from "./map";
export { adjacent } from "./map";
import { ABILITIES, ONE_SHOT, PRICES } from "./cards";
import {
  Action,
  Ability,
  Alliance,
  COLORS,
  Deck,
  NumberedHex,
  PendingReaction,
  Player,
  RESOURCES,
  Resource,
  Room,
  RoomView,
  RuleSettings,
  Stock,
  TerritoryBase,
  TITLES,
} from "./types";
export const emptyStock = (): Stock => ({
  Lumber: 0,
  Iron: 0,
  Food: 0,
  Stone: 0,
  Cattle: 0,
});
function fail(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function random(s: Room): number {
  const bytes = createHash("sha256")
    .update(`${s.entropy}:${s.settings.seed}:${s.rng++}`)
    .digest();
  return bytes.readUIntBE(0, 6) / 281474976710656;
}
export function shuffle<T>(s: Room, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const top = (s: Room, t: TerritoryBase) =>
  s.tiles[t.stack[t.stack.length - 1]];
export const controller = (s: Room, t: TerritoryBase) =>
  top(s, t)?.owner ?? null;
export const owned = (s: Room, id: string) =>
  s.board.filter((t) => controller(s, t) === id);
export const neighbors = (s: Room, t: TerritoryBase) =>
  s.board.filter((x) => adjacent(t, x));
const player = (s: Room, id: string) => {
  const p = s.players.find((p) => p.id === id);
  fail(p, "Player not found.");
  return p;
};
const territory = (s: Room, id?: string) => {
  const t = s.board.find((t) => t.id === id);
  fail(t, "Choose a territory.");
  return t;
};
const handCard = (s: Room, p: Player, id?: string) => {
  fail(id && p.hand.includes(id), "Choose a tile from your hand.");
  return s.tiles[id];
};
const ally = (s: Room, id: string) =>
  s.alliances.find((a) => a.members.includes(id));
export const allied = (s: Room, a: string | null, b: string | null) =>
  !!a && !!b && a !== b && !!ally(s, a)?.members.includes(b);
export const pegs = (t: TerritoryBase, id: string) =>
  t.rebels.filter((p) => p?.owner === id).length;
export const pegCount = (s: Room, id: string) =>
  s.board.reduce((n, t) => n + pegs(t, id), 0) + player(s, id).reserve;
export const current = (s: Room) =>
  s.phase === "draft"
    ? s.draft[s.draftIndex]
    : s.players.filter((p) => !p.spectator)[s.turn]?.id;
export function log(s: Room, message: string, actor?: string) {
  s.log.push({ version: s.version + 1, round: s.round, message, actor });
}
export function createRoom(
  code: string,
  id: string,
  name: string,
  hash: string,
  now: number,
  settings: Partial<RuleSettings> = {},
  spectator = false,
  entropy = "deterministic-test-seed",
): Room {
  const seed = settings.seed || code;
  let rng = 2166136261;
  for (const c of seed) rng = Math.imul(rng ^ c.charCodeAt(0), 16777619) >>> 0;
  const s: Room = {
    code,
    version: 0,
    created: now,
    updated: now,
    host: id,
    phase: "lobby",
    paused: false,
    settings: {
      seed,
      reactionSeconds: 25,
      alliances: true,
      eliminationVictory: true,
      ...settings,
    },
    rng,
    entropy,
    history: [],
    players: [],
    board: [],
    tiles: {},
    decks: { basic: [], Infrastructure: [], "Weapons Tech": [], Diplomacy: [] },
    discards: {
      basic: [],
      Infrastructure: [],
      "Weapons Tech": [],
      Diplomacy: [],
    },
    bag: [],
    forecast: [],
    round: 0,
    turn: 0,
    actions: 0,
    draft: [],
    draftIndex: 0,
    alliances: [],
    cooldowns: {},
    titles: {},
    metrics: {},
    log: [],
    processed: {},
  };
  addPlayer(s, id, name, hash, now, COLORS[0], false, spectator);
  return s;
}
export function addPlayer(
  s: Room,
  id: string,
  name: string,
  hash: string,
  now: number,
  color?: string,
  bot = false,
  spectator = false,
) {
  fail(
    s.phase === "lobby" || spectator,
    "This match has started. Join as a spectator.",
  );
  fail(s.players.length < 20, "Room is full.");
  fail(
    spectator || s.players.filter((p) => !p.spectator).length < 4,
    "Four commanders maximum.",
  );
  const chosen =
    color ||
    COLORS.find((c) => !s.players.some((p) => !p.spectator && p.color === c)) ||
    COLORS[0];
  fail(COLORS.includes(chosen as any), "Choose a listed color.");
  fail(
    spectator || !s.players.some((p) => !p.spectator && p.color === chosen),
    "That color is taken.",
  );
  s.players.push({
    id,
    name: name.trim().slice(0, 24) || "Commander",
    color: chosen,
    tokenHash: hash,
    hand: [],
    stock: emptyStock(),
    ready: bot,
    bot,
    spectator,
    lastSeen: now,
    reserve: 0,
    betrayals: 0,
    eliminated: false,
    raids: [],
    patrolRound: 0,
    turns: 0,
  });
  log(s, `${name} joined${spectator ? " to spectate" : ""}.`);
}
function setup(s: Room) {
  s.rng = 0;
  s.tiles = {};
  for (const d of Object.keys(s.decks) as Deck[]) {
    s.decks[d] = [];
    s.discards[d] = [];
  }
  for (const resource of RESOURCES)
    for (let value = 1; value <= 6; value++)
      for (let n = 0; n < 4; n++) {
        const id = `b-${resource}-${value}-${n}`;
        s.tiles[id] = { id, value, resource, deck: "basic", owner: null };
        s.decks.basic.push(id);
      }
  for (const [index, [ability, data]] of Object.entries(ABILITIES).entries())
    for (let n = 0; n < 3; n++) {
      const id = `s-${index}-${n}`;
      s.tiles[id] = {
        id,
        value: 1 + ((index * 3 + n) % 6),
        resource: RESOURCES[(index + n) % 5],
        deck: data.deck,
        ability: ability as Ability,
        owner: null,
      };
      s.decks[data.deck].push(id);
    }
  for (const d of Object.keys(s.decks) as Deck[])
    s.decks[d] = shuffle(s, s.decks[d]);
  s.board = [];
  let i = 0;
  for (let r = -3; r <= 3; r++)
    for (let q = -3; q <= 3; q++)
      if (Math.abs(q + r) <= 3) {
        const radius = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        const angle =
          (Math.atan2(r * 1.5, Math.sqrt(3) * (q + r / 2)) + Math.PI * 2) %
          (Math.PI * 2);
        s.board.push({
          id: `T${String(++i).padStart(2, "0")}`,
          q,
          r,
          region:
            radius <= 1
              ? 0
              : 1 + Math.min(4, Math.floor(angle / ((Math.PI * 2) / 5))),
          stack: [s.decks.basic.pop()!],
          rebels: [null, null, null],
        });
      }
  const commanders = s.players.filter((p) => !p.spectator);
  s.players = [
    ...shuffle(s, commanders),
    ...s.players.filter((p) => p.spectator),
  ];
  for (const p of s.players) {
    p.hand = [];
    p.stock = { ...emptyStock(), Food: 2, Lumber: 1 };
    p.reserve = 0;
    p.betrayals = 0;
    p.eliminated = false;
    p.turns = 0;
    p.claim = undefined;
    p.raids = [];
    p.patrolRound = 0;
  }
  const ids = s.players.filter((p) => !p.spectator).map((p) => p.id);
  s.draft = [...ids, ...[...ids].reverse(), ...ids];
  s.draftIndex = 0;
  s.phase = "draft";
  s.round = 0;
  s.turn = 0;
  s.actions = 0;
  s.alliances = [];
  s.titles = {};
  s.cooldowns = {};
  s.forecast = [];
  s.bag = [];
  s.winner = undefined;
  s.pending = undefined;
  s.proposal = undefined;
  s.paused = false;
  for (let j = 0; j < 5; j++) s.forecast.push(bagDraw(s));
  log(s, "Snake draft begins. Claim three connected starting territories.");
}
export function legalDraft(s: Room, id: string): string[] {
  const free = s.board.filter((t) => !controller(s, t));
  const land = owned(s, id);
  const near = free.filter((t) => land.some((x) => adjacent(x, t)));
  return (land.length && near.length ? near : free).map((t) => t.id);
}
function bagDraw(s: Room): Resource {
  if (!s.bag.length) s.bag = shuffle(s, [...RESOURCES]);
  return s.bag.pop()!;
}
function draw(s: Room, p: Player, count: number) {
  for (let i = 0; i < count && p.hand.length < 7; i++) {
    if (!s.decks.basic.length)
      s.decks.basic = shuffle(s, s.discards.basic.splice(0));
    if (!s.decks.basic.length) break;
    p.hand.push(s.decks.basic.pop()!);
  }
}
function discard(s: Room, id: string) {
  s.tiles[id].owner = null;
  s.discards[s.tiles[id].deck].push(id);
}
function spendCard(s: Room, p: Player, id: string) {
  p.hand.splice(p.hand.indexOf(id), 1);
  discard(s, id);
}
function exposedAbility(s: Room, id: string, ability: Ability) {
  return owned(s, id).filter((t) => top(s, t).ability === ability).length;
}
function gain(s: Room, p: Player, r: Resource, n = 1) {
  const cap = 12 + 3 * exposedAbility(s, p.id, "Granary");
  p.stock[r] += Math.max(
    0,
    Math.min(n, cap - Object.values(p.stock).reduce((a, b) => a + b, 0)),
  );
}
function storageCaps(s: Room) {
  return Object.fromEntries(
    s.players.map((p) => [p.id, 12 + 3 * exposedAbility(s, p.id, "Granary")]),
  );
}
function trimLostStorage(s: Room, before: Record<string, number>) {
  for (const p of s.players) {
    const cap = 12 + 3 * exposedAbility(s, p.id, "Granary");
    if (cap >= before[p.id]) continue;
    let excess = Object.values(p.stock).reduce((a, b) => a + b, 0) - cap;
    for (const r of [...RESOURCES].reverse()) {
      const lost = Math.max(0, Math.min(excess, p.stock[r]));
      p.stock[r] -= lost;
      excess -= lost;
    }
  }
}
function pay(p: Player, cost: Partial<Stock>) {
  for (const r of RESOURCES)
    fail(p.stock[r] >= (cost[r] || 0), "Insufficient resources.");
  for (const r of RESOURCES) p.stock[r] -= cost[r] || 0;
}
function produce(s: Room) {
  const r = s.forecast[0];
  for (const p of s.players.filter((p) => !p.spectator && !p.eliminated)) {
    let n = owned(s, p.id).filter((t) => top(s, t).resource === r).length;
    if (r === "Lumber") n += exposedAbility(s, p.id, "Lumber Mill");
    gain(s, p, r, Math.min(n, 3 + exposedAbility(s, p.id, "Workshop")));
  }
  log(s, `${r} production distributed to all commanders.`);
}
export function coalition(s: Room): Alliance | undefined {
  return s.settings.alliances
    ? s.alliances.find(
        (a) => a.members.reduce((n, id) => n + owned(s, id).length, 0) >= 19,
      )
    : undefined;
}
function coalitionBonus(s: Room, attacker: string, defender: string | null) {
  const c = coalition(s);
  return c &&
    defender &&
    c.members.includes(defender) &&
    !c.members.includes(attacker)
    ? 1
    : 0;
}
function spawn(s: Room, id: string, t: TerritoryBase) {
  const dest = [t, ...neighbors(s, t)].find((x) => x.rebels.some((p) => !p));
  if (dest) dest.rebels[dest.rebels.findIndex((p) => !p)] = { owner: id };
  else player(s, id).reserve++;
}
function checkElimination(s: Room) {
  for (const p of s.players.filter((p) => !p.spectator))
    if (!owned(s, p.id).length && !pegCount(s, p.id) && s.phase === "playing") {
      p.eliminated = true;
      p.claim = undefined;
    }
}
function beginTurn(s: Room) {
  const p = player(s, current(s));
  p.turns++;
  p.raids = [];
  for (const t of s.board) {
    if (t.ceasefire === p.id) delete t.ceasefire;
    if (t.patrol?.owner === p.id && t.patrol.expires <= p.turns)
      delete t.patrol;
  }
  while (p.reserve) {
    const t = s.board.find((t) => t.rebels.some((x) => !x));
    if (!t) break;
    t.rebels[t.rebels.findIndex((x) => !x)] = { owner: p.id };
    p.reserve--;
  }
  const landless = !owned(s, p.id).length;
  s.actions = landless ? 2 : 3;
  draw(s, p, landless ? 2 : 3);
  log(s, `${p.name}'s ${landless ? "rebel " : ""}turn.`, p.id);
}
function endTurn(s: Room) {
  const list = s.players.filter((p) => !p.spectator);
  let wrapped = false;
  for (let i = 0; i < list.length; i++) {
    s.turn++;
    if (s.turn >= list.length) {
      s.turn = 0;
      wrapped = true;
    }
    if (!list[s.turn].eliminated) break;
  }
  if (wrapped) {
    recalculate(s);
    for (const p of list) {
      if (score(s, p.id) >= 8) {
        if (p.claim === undefined) p.claim = s.round;
      } else p.claim = undefined;
    }
    const contenders = list
      .filter(
        (p) =>
          !p.eliminated &&
          p.claim !== undefined &&
          p.claim < s.round &&
          score(s, p.id) >= 8,
      )
      .sort(
        (a, b) =>
          score(s, b.id) - score(s, a.id) ||
          owned(s, b.id).length - owned(s, a.id).length ||
          a.betrayals - b.betrayals,
      );
    if (
      contenders.length &&
      (!contenders[1] ||
        score(s, contenders[0].id) !== score(s, contenders[1].id) ||
        owned(s, contenders[0].id).length !==
          owned(s, contenders[1].id).length ||
        contenders[0].betrayals !== contenders[1].betrayals)
    ) {
      s.winner = contenders[0].id;
      s.phase = "finished";
      log(s, `${contenders[0].name} wins by prestige.`);
      return;
    }
    s.round++;
    s.forecast.shift();
    s.forecast.push(bagDraw(s));
    for (const a of s.alliances) a.transferred = 0;
    produce(s);
  }
  beginTurn(s);
}
export function longestPath(s: Room, id: string): number {
  const land = owned(s, id);
  if (!land.length) return 0;
  const links = land.map((t) =>
    land.map((u, i) => (adjacent(t, u) ? i : -1)).filter((i) => i >= 0),
  );
  let best = 0;
  const masks = land.map((_, i) => 1n << BigInt(i));
  const componentSizes = (allowed: bigint, removed = -1) => {
    const result: { size: number; containsStart: boolean }[] = [];
    let seen = removed < 0 ? 0n : masks[removed];
    for (let root = 0; root < land.length; root++) {
      if (!(allowed & masks[root]) || seen & masks[root]) continue;
      let size = 0;
      const front = [root];
      seen |= masks[root];
      while (front.length) {
        const x = front.pop()!;
        size++;
        for (const y of links[x])
          if (allowed & masks[y] && !(seen & masks[y])) {
            seen |= masks[y];
            front.push(y);
          }
      }
      result.push({ size, containsStart: false });
    }
    return result.map((x) => x.size).sort((a, b) => b - a);
  };
  const full = (1n << BigInt(land.length)) - 1n;
  let globalUpper = Math.max(...componentSizes(full));
  // A simple path can visit at most two branches at an articulation vertex.
  if (componentSizes(full).length === 1)
    for (let x = 0; x < land.length; x++) {
      const sizes = componentSizes(full, x);
      globalUpper = Math.min(
        globalUpper,
        1 + (sizes[0] || 0) + (sizes[1] || 0),
      );
    }
  const memo = new Set<string>();
  function dfs(v: number, visited: bigint, length: number) {
    if (length > best) best = length;
    if (best === globalUpper) return;
    const key = `${v}:${visited}`;
    if (memo.has(key)) return;
    memo.add(key);
    // An optimistic reachable-component bound safely prunes disconnected branches.
    let reach = 0n,
      front = [v];
    while (front.length) {
      const x = front.pop()!;
      for (const u of links[x])
        if (!(visited & masks[u]) && !(reach & masks[u])) {
          reach |= masks[u];
          front.push(u);
        }
    }
    let count = 0;
    for (let bits = reach; bits; bits &= bits - 1n) count++;
    if (length + count <= best) return;
    // The continuation cannot leave v into more than one remaining component.
    const branchSizes = componentSizes(reach);
    if (length + (branchSizes[0] || 0) <= best) return;
    const available = reach | masks[v];
    let leaves = 0;
    for (let x = 0; x < land.length; x++)
      if (reach & masks[x]) {
        let degree = 0;
        for (const y of links[x]) if (available & masks[y]) degree++;
        if (degree === 1) leaves++;
      }
    if (length + count - Math.max(0, leaves - 1) <= best) return;
    for (const u of [...links[v]].sort(
      (a, b) => links[a].length - links[b].length,
    ))
      if (!(visited & masks[u])) {
        dfs(u, visited | masks[u], length + 1);
        if (best === globalUpper) return;
      }
  }
  const starts = land
    .map((_, i) => i)
    .sort((a, b) => links[a].length - links[b].length);
  for (const i of starts) {
    if (best === globalUpper) break;
    dfs(i, masks[i], 1);
  }
  return best;
}
const pathCache = new Map<string, number>();
export function recalculate(s: Room) {
  const minimum = [5, 2, 2, 3, 2];
  for (const p of s.players.filter((p) => !p.spectator)) {
    const key = owned(s, p.id)
      .map((t) => t.id)
      .sort()
      .join(",");
    let path = pathCache.get(key);
    if (path === undefined) {
      path = longestPath(s, p.id);
      if (pathCache.size > 1000) pathCache.clear();
      pathCache.set(key, path);
    }
    const deployed = s.board
      .flatMap((t) => t.stack.map((id) => s.tiles[id]))
      .filter((t) => t.owner === p.id);
    s.metrics[p.id] = [
      path,
      deployed.filter((t) => t.deck === "Weapons Tech").length,
      deployed.filter((t) => t.deck === "Infrastructure").length,
      new Set(owned(s, p.id).map((t) => top(s, t).resource)).size,
      deployed.filter((t) => t.deck === "Diplomacy").length,
    ];
  }
  TITLES.forEach((title, i) => {
    const candidates = s.players.filter(
      (p) =>
        !p.spectator &&
        !p.eliminated &&
        (s.metrics[p.id]?.[i] || 0) >= minimum[i],
    );
    const max = Math.max(0, ...candidates.map((p) => s.metrics[p.id][i]));
    const leaders = candidates.filter((p) => s.metrics[p.id][i] === max);
    const incumbent = candidates.find((p) => p.id === s.titles[title]);
    if (incumbent && s.metrics[incumbent.id][i] === max) return;
    if (leaders.length === 1) s.titles[title] = leaders[0].id;
    else delete s.titles[title];
  });
}
export function score(s: Room, id: string) {
  return (
    2 * Object.values(s.titles).filter((x) => x === id).length +
    (owned(s, id).length && !ally(s, id) ? 2 : 0) -
    2 * player(s, id).betrayals
  );
}
function breakup(s: Room, a: Alliance, initiator: string, mutual: boolean) {
  let created = 0;
  for (const t of s.board) {
    const ctl = controller(s, t);
    if (!ctl || !a.members.includes(ctl)) continue;
    const remove = t.stack.filter(
      (id) =>
        s.tiles[id].owner !== ctl && a.members.includes(s.tiles[id].owner!),
    );
    for (const id of remove) {
      const owner = s.tiles[id].owner!;
      t.stack.splice(t.stack.indexOf(id), 1);
      discard(s, id);
      if (!mutual) {
        spawn(s, owner, t);
        created++;
      }
    }
  }
  if (created) player(s, initiator).betrayals++;
  s.cooldowns[[...a.members].sort().join(":")] = s.round + 4;
  s.alliances = s.alliances.filter((x) => x !== a);
  s.proposal = undefined;
  log(
    s,
    `${player(s, initiator).name} ${mutual ? "peacefully dissolves" : "ends"} the alliance. ${created} rebels created; ${created ? "-2" : "0"} permanent VP.`,
    initiator,
  );
}
function blocked(s: Room, t: TerritoryBase) {
  return (
    !!t.patrol ||
    top(s, t)?.ability === "Border Fort" ||
    top(s, t)?.ability === "Blockade Unit"
  );
}
export function retreats(s: Room, t: TerritoryBase, n: number) {
  return neighbors(s, t).filter(
    (x) => !blocked(s, x) && x.rebels.filter((p) => !p).length >= n,
  );
}
function steal(
  s: Room,
  from: Player,
  to: Player,
  n: number,
  preferred?: Resource,
) {
  for (let i = 0; i < n; i++) {
    const r =
      preferred && from.stock[preferred] > 0
        ? preferred
        : RESOURCES.find((r) => from.stock[r] > 0);
    if (!r) break;
    from.stock[r]--;
    gain(s, to, r);
  }
}
function resolveBattle(s: Room) {
  const beforeCaps = storageCaps(s);
  const b = s.pending!;
  const t = territory(s, b.target);
  const p = player(s, b.attacker);
  const c = s.tiles[b.card];
  const defense =
    b.defense +
    b.rebelBonus +
    (b.guard
      ? s.tiles[b.guard].ability === "Shield Pact"
        ? 3
        : s.tiles[b.guard].value
      : 0);
  const win = b.attack > defense;
  if (b.guard) spendCard(s, player(s, b.guardBy!), b.guard);
  p.hand.splice(p.hand.indexOf(c.id), 1);
  if (b.kind === "suppression") {
    discard(s, c.id);
    if (win) {
      const faction = player(s, b.faction!);
      const count = pegs(t, faction.id);
      const protectedLast =
        !owned(s, faction.id).length && pegCount(s, faction.id) === 1;
      const remaining = count - (protectedLast ? 0 : 1);
      t.rebels = t.rebels.map((x) =>
        x?.owner === faction.id ? null : x,
      ) as TerritoryBase["rebels"];
      if (remaining > 0) {
        const dest = retreats(s, t, remaining)[0];
        if (dest)
          for (let i = 0; i < remaining; i++)
            dest.rebels[dest.rebels.findIndex((x) => !x)] = {
              owner: faction.id,
            };
        log(
          s,
          dest
            ? `Rebels retreat to ${dest.id}.`
            : `No legal retreat. ${remaining} rebel${remaining === 1 ? "" : "s"} captured.`,
        );
      }
    }
  } else if (win) {
    const previous = controller(s, t);
    const remove =
      c.ability === "Siege Engine" && b.attack - defense >= 4 ? 2 : 1;
    for (let i = 0; i < remove && t.stack.length; i++)
      discard(s, t.stack.pop()!);
    if (!t.stack.length) {
      c.owner = p.id;
      t.stack.push(c.id);
      if (b.underground)
        t.rebels = t.rebels.map((x) =>
          x?.owner === p.id ? null : x,
        ) as TerritoryBase["rebels"];
      if (previous && c.ability === "Raiders")
        steal(s, player(s, previous), p, 1);
    } else discard(s, c.id);
    if (previous && !owned(s, previous).length) spawn(s, previous, t);
  } else discard(s, c.id);
  log(
    s,
    `${p.name}: ${b.kind === "suppression" ? "suppression" : "attack"} ${b.attack} vs ${defense} at ${t.id}. ${win ? "Success" : "Defended"}${win && t.stack.length > 1 ? " — lower layers remain" : ""}.`,
    p.id,
  );
  s.pending = undefined;
  trimLostStorage(s, beforeCaps);
  checkElimination(s);
}
export function tick(s: Room, now: number): boolean {
  let changed = false;
  if (s.paused) return false;
  if (s.proposal && s.proposal.expires <= now) {
    s.proposal = undefined;
    log(s, "Diplomatic proposal expired.");
    changed = true;
  }
  if (s.pending && s.pending.expires <= now) {
    resolveBattle(s);
    changed = true;
  }
  if (changed) {
    recalculate(s);
    finishElimination(s);
    s.version++;
    s.updated = now;
  }
  return changed;
}
function finishElimination(s: Room) {
  if (s.phase !== "playing" || !s.settings.eliminationVictory) return;
  const alive = s.players.filter((p) => !p.spectator && !p.eliminated);
  if (alive.length === 1) {
    s.winner = alive[0].id;
    s.phase = "finished";
    log(s, `${alive[0].name} wins by elimination.`);
  }
}
const spendAction = (s: Room) => {
  fail(s.actions > 0, "No actions left. End your turn.");
  s.actions--;
};
function alliancePay(s: Room, p: Player, card?: string) {
  if (card) {
    const c = handCard(s, p, card);
    fail(
      c.ability === "Treaty",
      "An alliance needs a Treaty or its resource price.",
    );
    spendCard(s, p, c.id);
  } else pay(p, { Food: 1, Cattle: 1, Stone: 1 });
}
export function applyAction(
  input: Room,
  actor: string,
  a: Action,
  now: number,
): Room {
  const s = structuredClone(input);
  const beforeCaps = storageCaps(s);
  tick(s, now);
  const p = player(s, actor);
  fail(
    !p.eliminated ||
      (actor === s.host && ["rematch", "restart", "pause"].includes(a.type)),
    "You are spectating after elimination.",
  );
  if (a.type === "profile") {
    fail(s.phase === "lobby", "Profiles lock when the draft begins.");
    if (a.name) p.name = a.name.trim().slice(0, 24) || p.name;
    if (a.color) {
      fail(
        COLORS.includes(a.color as any) &&
          !s.players.some(
            (x) => x.id !== p.id && !x.spectator && x.color === a.color,
          ),
        "That color is unavailable.",
      );
      p.color = a.color;
    }
  } else if (a.type === "ready") {
    fail(
      s.phase === "lobby" && !p.spectator,
      "Only lobby commanders can ready.",
    );
    p.ready = !p.ready;
  } else if (a.type === "settings") {
    fail(
      actor === s.host && s.phase === "lobby",
      "Only the lobby host can change settings.",
    );
    s.settings = { ...s.settings, ...a.settings };
  } else if (a.type === "addBot") {
    fail(
      actor === s.host && s.phase === "lobby",
      "Only the host can add bots.",
    );
    addPlayer(
      s,
      `bot-${s.players.length}`,
      `Automaton ${s.players.filter((x) => x.bot).length + 1}`,
      "",
      now,
      undefined,
      true,
    );
  } else if (a.type === "remove") {
    fail(
      actor === s.host && s.phase === "lobby",
      "Only the host can remove pregame players.",
    );
    const guest = player(s, a.player!);
    fail(
      guest.id !== s.host && (guest.bot || now - guest.lastSeen > 30000),
      "Only a bot or disconnected guest can be removed.",
    );
    s.players = s.players.filter((x) => x !== guest);
  } else if (a.type === "start") {
    fail(actor === s.host && s.phase === "lobby", "Only the host can start.");
    const ps = s.players.filter((p) => !p.spectator);
    fail(
      ps.length >= 2 && ps.length <= 4 && ps.every((p) => p.ready),
      "Need 2–4 ready commanders.",
    );
    setup(s);
  } else if (a.type === "rematch" || a.type === "restart") {
    fail(
      actor === s.host &&
        (a.type === "rematch"
          ? s.phase === "finished"
          : ["draft", "playing"].includes(s.phase)),
      "Only the host can restart an active match or rematch a finished game.",
    );
    setup(s);
  } else if (a.type === "pause") {
    fail(
      actor === s.host && (s.phase === "playing" || s.phase === "draft"),
      "Only the host can pause a match.",
    );
    s.paused = !s.paused;
    if (!s.paused && s.pending)
      s.pending.expires = now + s.settings.reactionSeconds * 1000;
    log(s, s.paused ? "Host paused the match." : "Host resumed the match.");
  } else {
    fail(!s.paused, "Match is paused.");
    fail(!p.spectator, "Spectators cannot submit game actions.");
    if (a.type === "respond") {
      fail(s.proposal?.to === actor, "No proposal for you.");
      const prop = s.proposal!;
      if (a.accept) {
        if (prop.kind === "alliance") {
          fail(
            !ally(s, prop.from) && !ally(s, actor),
            "One ally per commander.",
          );
          alliancePay(s, player(s, prop.from), prop.treaty);
          alliancePay(s, p, a.card);
          s.alliances.push({ members: [prop.from, actor], transferred: 0 });
          log(s, `${p.name} accepted the alliance.`, actor);
        } else breakup(s, ally(s, actor)!, prop.from, true);
      }
      s.proposal = undefined;
    } else if (a.type === "guard" || a.type === "pledge") {
      const b = s.pending;
      fail(b, "No battle is awaiting a response.");
      if (a.type === "pledge") {
        fail(
          b.kind === "battle" &&
            actor !== b.attacker &&
            pegs(territory(s, b.target), actor) > 0 &&
            !b.rebelBy,
          "Only one present rebel faction may pledge.",
        );
        b.rebelBy = actor;
        b.rebelBonus = pegs(territory(s, b.target), actor);
        log(s, `${p.name} pledged ${b.rebelBonus} rebels.`, actor);
      } else {
        fail(!b.guardDone, "The one guard slot has been used.");
        if (a.card) {
          const c = handCard(s, p, a.card);
          if (c.ability === "Shield Pact")
            fail(
              actor !== b.defender && allied(s, actor, b.defender),
              "Shield Pact protects a formal ally only.",
            );
          if (actor !== b.defender)
            fail(
              b.kind === "battle" &&
                c.ability === "Shield Pact" &&
                allied(s, actor, b.defender),
              "Only the defender or an allied Shield Pact can guard.",
            );
          b.guard = c.id;
          b.guardBy = actor;
        } else fail(actor === b.defender, "Only the defender can pass.");
        b.guardDone = true;
        resolveBattle(s);
      }
    } else {
      fail(!s.pending, "Resolve the pending reaction first.");
      fail(
        s.phase === "draft" || s.phase === "playing",
        "Start a match first.",
      );
      fail(current(s) === actor, "It is another commander’s turn.");
      if (s.phase === "draft") {
        fail(
          a.type === "draft" && legalDraft(s, actor).includes(a.target!),
          "Choose a highlighted neutral territory.",
        );
        const t = territory(s, a.target);
        top(s, t).owner = actor;
        s.draftIndex++;
        log(s, `${p.name} claimed ${t.id}.`, actor);
        if (s.draftIndex === s.draft.length) {
          s.phase = "playing";
          s.round = 1;
          for (const x of s.players.filter((x) => !x.spectator)) draw(s, x, 5);
          produce(s);
          beginTurn(s);
        }
      } else {
        const landless = !owned(s, actor).length;
        if (a.type === "end") {
          endTurn(s);
        } else if (a.type === "break" || a.type === "separate") {
          const alliance = ally(s, actor);
          fail(alliance, "No formal alliance.");
          if (a.type === "break") breakup(s, alliance, actor, false);
          else {
            fail(!s.proposal, "A proposal is already pending.");
            s.proposal = {
              kind: "separation",
              from: actor,
              to: alliance.members.find((x) => x !== actor)!,
              expires: now + 60000,
            };
          }
        } else {
          if (landless)
            fail(
              [
                "rebelMove",
                "underground",
                "raid",
                "recruit",
                "reorganize",
                "buy",
                "ceasefire",
                "discard",
              ].includes(a.type),
              "Landless commanders have rebel actions only.",
            );
          fail(
            s.actions > 0 || a.type === "discard",
            "No actions left. End your turn.",
          );
          if (a.type === "discard") {
            const c = handCard(s, p, a.card);
            spendCard(s, p, c.id);
          } else if (a.type === "scout") {
            fail(p.hand.length < 7, "Hand is full. Discard first.");
            draw(s, p, 2);
            spendAction(s);
          } else if (a.type === "reorganize") {
            const c = handCard(s, p, a.card);
            spendCard(s, p, c.id);
            draw(s, p, 2);
            spendAction(s);
          } else if (a.type === "buy") {
            const deck = a.target as Exclude<Deck, "basic">;
            fail(deck in PRICES, "Choose a special deck.");
            fail(p.hand.length < 7, "Hand is full.");
            if (!s.decks[deck].length)
              s.decks[deck] = shuffle(s, s.discards[deck].splice(0));
            fail(s.decks[deck].length, "That deck is empty.");
            pay(p, PRICES[deck]);
            p.hand.push(s.decks[deck].pop()!);
            spendAction(s);
          } else if (a.type === "bank") {
            fail(
              a.give && a.resource && a.give !== a.resource,
              "Choose two different resources.",
            );
            pay(p, {
              [a.give]: exposedAbility(s, actor, "Market Charter") ? 2 : 3,
            });
            gain(s, p, a.resource);
            spendAction(s);
          } else if (a.type === "trade") {
            const recipient = player(s, a.player!);
            fail(
              recipient.id !== actor &&
                !recipient.spectator &&
                !recipient.eliminated,
              "Choose another active commander.",
            );
            fail(
              a.resource &&
                a.amount &&
                Number.isInteger(a.amount) &&
                a.amount > 0 &&
                a.amount <= 2,
              "Transfer 1 or 2 tokens.",
            );
            const alliance = ally(s, actor);
            if (allied(s, actor, recipient.id)) {
              fail(
                alliance!.transferred + a.amount <= 2,
                "Alliance transfers are capped at 2 per round.",
              );
              alliance!.transferred += a.amount;
            } else
              fail(
                pegCount(s, recipient.id) > recipient.reserve,
                "Recipient needs active rebels unless formally allied.",
              );
            pay(p, { [a.resource]: a.amount });
            gain(s, recipient, a.resource, a.amount);
            spendAction(s);
          } else if (a.type === "alliance") {
            fail(s.settings.alliances, "Alliances disabled.");
            const other = player(s, a.player!);
            fail(
              other.id !== actor &&
                !other.spectator &&
                !other.eliminated &&
                !ally(s, actor) &&
                !ally(s, other.id),
              "Both commanders need an open alliance slot.",
            );
            fail(!s.proposal, "Another proposal is pending.");
            fail(
              (s.cooldowns[[actor, other.id].sort().join(":")] || 0) <= s.round,
              "Former allies must wait three complete rounds.",
            );
            if (a.card)
              fail(
                handCard(s, p, a.card).ability === "Treaty",
                "Select a Treaty.",
              );
            else
              for (const r of ["Food", "Cattle", "Stone"] as Resource[])
                fail(
                  p.stock[r] >= 1,
                  "Your contribution needs Food, Cattle, and Stone, or a Treaty.",
                );
            s.proposal = {
              kind: "alliance",
              from: actor,
              to: other.id,
              treaty: a.card,
              expires: now + 60000,
            };
            spendAction(s);
          } else if (a.type === "reinforce" || a.type === "support") {
            const t = territory(s, a.target);
            const ctl = controller(s, t);
            const c = handCard(s, p, a.card);
            fail(
              !c.ability || !ONE_SHOT.has(c.ability),
              "One-shot cards cannot be stacked.",
            );
            fail(t.stack.length < 3, "Maximum three numbered layers.");
            if (a.type === "support") {
              fail(allied(s, actor, ctl), "Support requires a formal ally.");
              fail(
                !t.stack.some((id) => s.tiles[id].owner !== ctl),
                "Only one foreign support tile per territory.",
              );
              t.stack.unshift(c.id);
            } else {
              fail(ctl === actor, "Reinforce your own territory.");
              if (a.bottom) t.stack.unshift(c.id);
              else t.stack.push(c.id);
            }
            c.owner = actor;
            p.hand.splice(p.hand.indexOf(c.id), 1);
            spendAction(s);
          } else if (a.type === "reposition") {
            const from = territory(s, a.source),
              to = territory(s, a.target);
            fail(
              controller(s, from) === actor &&
                controller(s, to) === actor &&
                adjacent(from, to) &&
                from.stack.length >= 2 &&
                to.stack.length < 3,
              "Move an owned top tile from a 2+ stack to adjacent friendly land.",
            );
            to.stack.push(from.stack.pop()!);
            spendAction(s);
          } else if (a.type === "reorder") {
            const t = territory(s, a.target);
            fail(
              controller(s, t) === actor,
              "Only the controller can reorder.",
            );
            fail(
              a.order &&
                a.order.length === t.stack.length &&
                new Set(a.order).size === t.stack.length &&
                a.order.every((id) => t.stack.includes(id)),
              "Order must contain every existing layer once.",
            );
            const foreign = t.stack.filter((id) => s.tiles[id].owner !== actor);
            fail(
              !foreign.length || a.order[0] === foreign[0],
              "Foreign support must remain below controller tiles.",
            );
            t.stack = [...a.order];
            spendAction(s);
          } else if (a.type === "ceasefire") {
            const t = territory(s, a.target),
              c = handCard(s, p, a.card);
            fail(
              controller(s, t) === actor && c.ability === "Ceasefire",
              "Play a Ceasefire on your territory.",
            );
            t.ceasefire = actor;
            spendCard(s, p, c.id);
            spendAction(s);
          } else if (a.type === "envoy") {
            const t = territory(s, a.target),
              c = handCard(s, p, a.card);
            fail(
              c.ability === "Envoy" &&
                !controller(s, t) &&
                t.stack.length === 1 &&
                neighbors(s, t).some((x) => controller(s, x) === actor),
              "Envoy needs an adjacent single-layer neutral territory.",
            );
            discard(s, t.stack.pop()!);
            t.stack.push(c.id);
            c.owner = actor;
            p.hand.splice(p.hand.indexOf(c.id), 1);
            spendAction(s);
          } else if (a.type === "patrol") {
            const t = territory(s, a.target);
            fail(
              controller(s, t) === actor &&
                p.patrolRound !== s.round &&
                s.board.filter((x) => x.patrol?.owner === actor).length < 2,
              "Patrol one own territory per round; max two active.",
            );
            t.patrol = { owner: actor, expires: p.turns + 2 };
            p.patrolRound = s.round;
            spendAction(s);
          } else if (a.type === "rebelMove") {
            const from = territory(s, a.source),
              to = territory(s, a.target);
            const n = pegs(from, actor);
            fail(
              n &&
                adjacent(from, to) &&
                !blocked(s, to) &&
                to.rebels.filter((x) => !x).length >= n,
              "Whole group needs adjacent unblocked holes.",
            );
            from.rebels = from.rebels.map((x) =>
              x?.owner === actor ? null : x,
            ) as TerritoryBase["rebels"];
            for (let i = 0; i < n; i++)
              to.rebels[to.rebels.findIndex((x) => !x)] = { owner: actor };
            if (p.raids.includes(from.id)) p.raids.push(to.id);
            spendAction(s);
          } else if (a.type === "recruit") {
            const t = territory(s, a.target);
            fail(
              pegs(t, actor) && t.rebels.some((x) => !x),
              "Recruit at an existing group with an empty hole.",
            );
            pay(p, { Food: 1, Cattle: 1 });
            t.rebels[t.rebels.findIndex((x) => !x)] = { owner: actor };
            spendAction(s);
          } else if (a.type === "raid") {
            const t = territory(s, a.target),
              ctl = controller(s, t);
            fail(
              pegs(t, actor) && ctl && ctl !== actor && !p.raids.includes(t.id),
              "Raid a foreign controller once per group per turn.",
            );
            steal(
              s,
              player(s, ctl),
              p,
              1 + coalitionBonus(s, actor, ctl),
              a.resource,
            );
            p.raids.push(t.id);
            spendAction(s);
          } else if (["attack", "underground", "suppress"].includes(a.type)) {
            const target = territory(s, a.target),
              c = handCard(s, p, a.card);
            fail(
              !c.ability || !ONE_SHOT.has(c.ability),
              "This one-shot cannot be used as an attack tile.",
            );
            const ctl = controller(s, target);
            const suppress = a.type === "suppress",
              underground = a.type === "underground";
            let source = target;
            let attack = c.value,
              defense =
                top(s, target).value +
                target.stack.length -
                1 +
                (top(s, target).ability === "Fortress" ? 2 : 0),
              defender = ctl;
            if (suppress) {
              fail(
                ctl === actor &&
                  a.player &&
                  a.player !== actor &&
                  pegs(target, a.player) > 0,
                "Choose a hostile rebel faction in your territory.",
              );
              attack += top(s, target).value;
              defense = pegs(target, a.player);
              defender = a.player;
            } else {
              fail(
                ctl !== actor && !allied(s, actor, ctl),
                "Cannot attack your own or a formal ally’s territory.",
              );
              fail(!target.ceasefire, "Ceasefire protects this territory.");
              if (underground) {
                fail(
                  pegs(target, actor) > 0,
                  "Underground attacks start with your rebels already inside the target.",
                );
                attack += pegs(target, actor);
              } else {
                source = territory(s, a.source);
                fail(
                  controller(s, source) === actor,
                  "Source must be your territory.",
                );
                const cavalry =
                  c.ability === "Cavalry" &&
                  neighbors(s, source).some(
                    (x) => controller(s, x) === actor && adjacent(x, target),
                  );
                fail(
                  adjacent(source, target) || cavalry,
                  "Target must be adjacent, or a legal Cavalry path.",
                );
                attack += top(s, source).value;
              }
              if (c.ability === "Ballista" && target.stack.length >= 2)
                attack += 2;
              attack += coalitionBonus(s, actor, ctl);
            }
            spendAction(s);
            s.pending = {
              kind: suppress ? "suppression" : "battle",
              attacker: actor,
              defender,
              source: source.id,
              target: target.id,
              card: c.id,
              underground,
              attack,
              defense,
              guardDone: false,
              rebelBonus: 0,
              expires: now + s.settings.reactionSeconds * 1000,
              faction: suppress ? a.player : undefined,
            };
            const rebelResponders = target.rebels.some(
              (x) => x && x.owner !== actor,
            );
            if (!defender && !rebelResponders) resolveBattle(s);
          } else throw new Error("Unknown action.");
          if (!["attack", "underground", "suppress"].includes(a.type))
            log(
              s,
              `${p.name}: ${a.type}${a.target ? ` · ${a.target}` : ""}.`,
              actor,
            );
        }
      }
    }
  }
  recalculate(s);
  finishElimination(s);
  trimLostStorage(s, beforeCaps);
  (s.history ??= []).push({ actor, action: structuredClone(a), at: now });
  s.version = input.version + 1;
  s.updated = now;
  return s;
}
export function view(s: Room, actor: string | null, now: number): RoomView {
  const visible = new Set(s.board.flatMap((t) => t.stack));
  const me = s.players.find((p) => p.id === actor);
  for (const id of me?.hand || []) visible.add(id);
  const {
    rng,
    entropy,
    history,
    bag,
    processed,
    decks,
    discards,
    created,
    updated,
    players,
    tiles,
    pending,
    ...rest
  } = s;
  return {
    ...rest,
    players: players.map(({ tokenHash, hand, raids, ...p }) => ({
      ...p,
      handCount: hand.length,
      score: score(s, p.id),
      territories: owned(s, p.id).length,
      online: p.bot || now - p.lastSeen < 15000,
    })),
    tiles: Object.fromEntries([...visible].map((id) => [id, tiles[id]])),
    deckCounts: Object.fromEntries(
      Object.entries(decks).map(([d, ids]) => [d, ids.length]),
    ) as RoomView["deckCounts"],
    hand: me?.hand.map((id) => tiles[id]) || [],
    me: actor,
    priority: current(s) || null,
    legalDraft:
      s.phase === "draft" && actor === current(s) ? legalDraft(s, actor) : [],
    pending: pending
      ? {
          ...pending,
          card: tiles[pending.card],
          guard: pending.guard ? tiles[pending.guard] : undefined,
        }
      : undefined,
  };
}
export function botAction(s: Room, p: Player): Action | undefined {
  if (s.pending) {
    if (s.pending.defender === p.id) return { type: "guard" };
    return;
  }
  if (s.proposal?.to === p.id) return { type: "respond", accept: false };
  if (current(s) !== p.id || s.paused) return;
  if (s.phase === "draft")
    return { type: "draft", target: legalDraft(s, p.id)[0] };
  if (s.phase !== "playing") return;
  if (!s.actions) return { type: "end" };
  if (score(s, p.id) >= 8) return { type: "end" };
  const cards = p.hand
    .map((id) => s.tiles[id])
    .filter((c) => !c.ability || !ONE_SHOT.has(c.ability))
    .sort((a, b) => b.value - a.value);
  const land = owned(s, p.id);
  const special = p.hand
    .map((id) => s.tiles[id])
    .find((c) => c.ability && !ONE_SHOT.has(c.ability));
  const buildAt = land.find((t) => t.stack.length < 3);
  if (special && buildAt)
    return { type: "reinforce", target: buildAt.id, card: special.id };
  if (p.hand.length < 7) {
    for (const d of Object.keys(PRICES) as Exclude<Deck, "basic">[]) {
      if (
        s.decks[d].length &&
        Object.entries(PRICES[d]).every(([r, n]) => p.stock[r as Resource] >= n)
      )
        return { type: "buy", target: d };
    }
  }
  if (land.length) {
    const wanted = Object.keys(PRICES.Infrastructure).find(
      (r) =>
        p.stock[r as Resource] < (PRICES.Infrastructure[r as Resource] || 0),
    ) as Resource | undefined;
    const surplus = RESOURCES.find(
      (r) => r !== wanted && p.stock[r] - (PRICES.Infrastructure[r] || 0) >= 3,
    );
    if (wanted && surplus)
      return { type: "bank", give: surplus, resource: wanted };
  }
  for (const t of land) {
    const faction = t.rebels.find((x) => x && x.owner !== p.id)?.owner;
    if (
      faction &&
      cards.length &&
      top(s, t).value + cards[0].value > pegs(t, faction)
    )
      return {
        type: "suppress",
        target: t.id,
        player: faction,
        card: cards[0].id,
      };
  }
  if (cards.length) {
    const c = cards[0];
    for (const from of land.sort((a, b) => top(s, b).value - top(s, a).value))
      for (const t of neighbors(s, from).sort(
        (a, b) => Number(!!controller(s, a)) - Number(!!controller(s, b)),
      ))
        if (
          controller(s, t) !== p.id &&
          !allied(s, p.id, controller(s, t)) &&
          !t.ceasefire &&
          top(s, from).value + c.value >
            top(s, t).value +
              t.stack.length -
              1 +
              (top(s, t).ability === "Fortress" ? 2 : 0)
        )
          return { type: "attack", source: from.id, target: t.id, card: c.id };
    for (const t of s.board)
      if (
        pegs(t, p.id) &&
        cards[0].value + pegs(t, p.id) >
          top(s, t).value +
            t.stack.length -
            1 +
            (top(s, t).ability === "Fortress" ? 2 : 0) &&
        controller(s, t) !== p.id &&
        !allied(s, p.id, controller(s, t)) &&
        !t.ceasefire
      )
        return { type: "underground", target: t.id, card: c.id };
    const reinforce = land.find((t) => t.stack.length < 3);
    if (reinforce)
      return {
        type: "reinforce",
        target: reinforce.id,
        card: cards[cards.length - 1].id,
      };
  }
  if (land.length && p.hand.length < 7) return { type: "scout" };
  if (!land.length) {
    const group = s.board.find((t) => pegs(t, p.id));
    if (group && group.rebels.some((x) => !x) && p.stock.Food && p.stock.Cattle)
      return { type: "recruit", target: group.id };
    const t = s.board.find(
      (t) =>
        pegs(t, p.id) &&
        controller(s, t) &&
        controller(s, t) !== p.id &&
        !p.raids.includes(t.id),
    );
    if (t) return { type: "raid", target: t.id };
  }
  if (p.hand.length >= 7)
    return { type: "discard", card: p.hand[p.hand.length - 1] };
  return { type: "end" };
}
