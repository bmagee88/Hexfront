import {
  createRoom,
  addPlayer,
  applyAction,
  botAction,
  current,
  owned,
  score,
} from "../shared/engine";
let s = createRoom("SIM123", "p0", "A", "", 0, {
  seed: process.argv[2] || "campaign",
});
for (let i = 1; i < 3; i++)
  addPlayer(s, `p${i}`, String(i), "", 0, undefined, true);
s.players.forEach((p) => {
  p.ready = true;
  p.bot = true;
});
s = applyAction(s, "p0", { type: "start" }, 0);
let count = 0;
while (s.phase !== "finished" && count < Number(process.argv[3] || 1000)) {
  let moved = false;
  for (const p of s.players) {
    const a = botAction(s, p);
    if (a) {
      s = applyAction(s, p.id, a, count * 1000);
      moved = true;
      break;
    }
  }
  if (!moved) break;
  count++;
}
console.log({
  commands: count,
  round: s.round,
  phase: s.phase,
  winner: s.winner,
  players: s.players.map((p) => ({
    name: p.name,
    lands: owned(s, p.id).length,
    score: score(s, p.id),
    hand: p.hand.map((id) => s.tiles[id].ability || s.tiles[id].value),
    stock: p.stock,
    eliminated: p.eliminated,
  })),
  titles: s.titles,
  last: s.log.slice(-8),
});
