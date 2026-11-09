import type { TerritoryBase } from "./types";
import { RISK_AVERAGE, RISK_HISTOGRAM } from "./risk";
export const MAP_ALGORITHM = 2;
export const territoryCount = (players: number) => {
  const n = Math.max(2, Math.min(4, players));
  return Math.floor(42 / n + 0.5) * n;
};
const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;
type Cell = { q: number; r: number };
const key = (q: number, r: number) => `${q},${r}`;
export function mapConnectivity(board: readonly Cell[]) {
  const occupied = new Set(board.map((t) => key(t.q, t.r)));
  const histogram = Array<number>(7).fill(0);
  for (const t of board) {
    const degree = DIRECTIONS.filter(([q, r]) =>
      occupied.has(key(t.q + q, t.r + r)),
    ).length;
    histogram[degree]++;
  }
  const total = histogram.reduce((sum, n, degree) => sum + n * degree, 0);
  return {
    histogram,
    average: board.length ? total / board.length : 0,
    edges: total / 2,
  };
}
// Compare the entire distribution, not just its mean: a mix of dead ends and
// saturated centers can have the right mean while still playing poorly.
function profileScore(histogram: number[], size: number) {
  const distribution = histogram.reduce((sum, n, degree) => {
    const target = (RISK_HISTOGRAM[degree] * size) / 42;
    return sum + (n - target) ** 2 / (target + 1);
  }, 0);
  const average =
    histogram.reduce((sum, n, degree) => sum + n * degree, 0) / size;
  return distribution + 8 * size * (average - RISK_AVERAGE) ** 2;
}
function growGeography(count: number, random: () => number): Cell[] {
  let best: Cell[] = [],
    bestScore = Infinity;
  // Independent randomized growths keep the seed reproducible while selecting
  // geography with Risk-like borders. The search is bounded for six-map previews.
  for (let attempt = 0; attempt < 12; attempt++) {
    const cells = new Map<string, Cell & { degree: number }>([
      ["0,0", { q: 0, r: 0, degree: 2 }],
      ["1,0", { q: 1, r: 0, degree: 2 }],
      ["0,1", { q: 0, r: 1, degree: 2 }],
    ]);
    let histogram = [0, 0, 3, 0, 0, 0, 0];
    const temperature = 0.35 + random() * 0.65;
    while (cells.size < count) {
      const frontier = new Map<string, Cell>();
      for (const c of cells.values())
        for (const [dq, dr] of DIRECTIONS) {
          const q = c.q + dq,
            r = c.r + dr,
            k = key(q, r);
          if (
            !cells.has(k) &&
            Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 6
          )
            frontier.set(k, { q, r });
        }
      const options: {
        cell: Cell;
        neighbors: (Cell & { degree: number })[];
        histogram: number[];
        score: number;
      }[] = [];
      for (const c of frontier.values()) {
        const neighbors = DIRECTIONS.map(([q, r]) =>
          cells.get(key(c.q + q, c.r + r)),
        ).filter((t): t is Cell & { degree: number } => !!t);
        // Attaching on two or more sides keeps all territories at degree >= 2;
        // scoring discourages filling holes into six-sided blocks.
        if (neighbors.length < 2) continue;
        const next = histogram.slice();
        next[neighbors.length]++;
        for (const n of neighbors) {
          next[n.degree]--;
          next[n.degree + 1]++;
        }
        options.push({
          cell: c,
          neighbors,
          histogram: next,
          score: profileScore(next, cells.size + 1),
        });
      }
      const low = Math.min(...options.map((o) => o.score));
      const weights = options.map((o) =>
        Math.exp(-(o.score - low) / temperature),
      );
      let roll = random() * weights.reduce((sum, w) => sum + w, 0),
        selected = options.length - 1;
      for (let i = 0; i < options.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          selected = i;
          break;
        }
      }
      const chosen = options[selected];
      for (const n of chosen.neighbors) n.degree++;
      cells.set(key(chosen.cell.q, chosen.cell.r), {
        ...chosen.cell,
        degree: chosen.neighbors.length,
      });
      histogram = chosen.histogram;
    }
    const shape = [...cells.values()];
    const xs = shape.map((c) => Math.sqrt(3) * (c.q + c.r / 2)),
      ys = shape.map((c) => c.r * 1.5);
    const width = Math.max(...xs) - Math.min(...xs) + Math.sqrt(3),
      height = Math.max(...ys) - Math.min(...ys) + 2;
    const aspect = Math.max(width / height, height / width);
    const score =
      profileScore(histogram, count) + Math.max(0, aspect - 1.8) ** 2 * 3;
    if (score < bestScore) {
      bestScore = score;
      best = shape;
    }
  }
  // Relocate boundary cells to escape the local choices made during growth.
  // Connectivity and minimum degree are checked before accepting a mutation;
  // cooling permits temporary score increases without returning a worse map.
  let current = best,
    currentScore = profileScore(mapConnectivity(best).histogram, count);
  bestScore = currentScore;
  for (let step = 0; step < 320; step++) {
    const remove = Math.floor(random() * current.length);
    const remaining = current.filter((_, i) => i !== remove);
    const occupied = new Set(remaining.map((c) => key(c.q, c.r)));
    const frontier = new Map<string, Cell>();
    for (const c of remaining)
      for (const [dq, dr] of DIRECTIONS) {
        const q = c.q + dq,
          r = c.r + dr,
          k = key(q, r);
        if (
          !occupied.has(k) &&
          Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 6
        )
          frontier.set(k, { q, r });
      }
    const options = [...frontier.values()];
    const proposed = [
      ...remaining,
      options[Math.floor(random() * options.length)],
    ];
    const stats = mapConnectivity(proposed);
    if (stats.histogram[0] || stats.histogram[1]) continue;
    const proposedKeys = new Set(proposed.map((c) => key(c.q, c.r)));
    const queue = [proposed[0]],
      seen = new Set([key(proposed[0].q, proposed[0].r)]);
    for (let i = 0; i < queue.length; i++)
      for (const [dq, dr] of DIRECTIONS) {
        const q = queue[i].q + dq,
          r = queue[i].r + dr,
          k = key(q, r);
        if (proposedKeys.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push({ q, r });
        }
      }
    if (seen.size !== count) continue;
    const score = profileScore(stats.histogram, count);
    const heat = 0.7 * (1 - step / 320) + 0.03;
    if (
      score <= currentScore ||
      random() < Math.exp((currentScore - score) / heat)
    ) {
      current = proposed;
      currentScore = score;
      if (score < bestScore) {
        bestScore = score;
        best = proposed;
      }
    }
  }
  return best;
}
/** Public seeded geography only. Never used for private cards. */
export function generateMap(count: number, seed: string): TerritoryBase[] {
  let state = 2166136261;
  for (const ch of seed)
    state = Math.imul(state ^ ch.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const board = growGeography(count, random)
    .sort((a, b) => a.r - b.r || a.q - b.q)
    .map((c, i): TerritoryBase => ({
      id: `T${String(i + 1).padStart(2, "0")}`,
      q: c.q,
      r: c.r,
      region: -1,
      stack: [],
      rebels: [null, null, null],
    }));
  // Balanced frontier growth from farthest-point seeds keeps each of six regions connected.
  const links = board.map((t) =>
    board.map((u, i) => (adjacent(t, u) ? i : -1)).filter((i) => i >= 0),
  );
  const seeds = [Math.floor(random() * board.length)];
  while (seeds.length < 6) {
    const distances = board.map(() => Infinity),
      queue = [...seeds];
    for (const i of seeds) distances[i] = 0;
    for (let j = 0; j < queue.length; j++)
      for (const next of links[queue[j]])
        if (distances[next] === Infinity) {
          distances[next] = distances[queue[j]] + 1;
          queue.push(next);
        }
    const max = Math.max(...distances);
    const far = distances
      .map((d, i) => (d === max ? i : -1))
      .filter((i) => i >= 0);
    seeds.push(far[Math.floor(random() * far.length)]);
  }
  const sizes = seeds.map(() => 1);
  seeds.forEach((i, region) => (board[i].region = region));
  let assigned = seeds.length;
  while (assigned < board.length) {
    const regions = seeds
      .map((_, i) => i)
      .sort((a, b) => sizes[a] - sizes[b] || a - b);
    for (const region of regions) {
      const candidates = board
        .map((t, i) =>
          t.region === -1 && links[i].some((j) => board[j].region === region)
            ? i
            : -1,
        )
        .filter((i) => i >= 0);
      if (!candidates.length) continue;
      board[candidates[Math.floor(random() * candidates.length)]].region =
        region;
      sizes[region]++;
      assigned++;
      break;
    }
  }
  return board;
}
export const adjacent = (a: TerritoryBase, b: TerritoryBase) =>
  Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.q + a.r - b.q - b.r),
  ) === 1;
