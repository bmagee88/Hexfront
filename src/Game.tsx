import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  Action,
  COLORS,
  Deck,
  HAND_LIMIT,
  NumberedHex,
  RESOURCES,
  Resource,
  RoomView,
  TITLES,
} from "../shared/types";
import { ABILITIES, PRICES, ONE_SHOT } from "../shared/cards";
import { adjacent } from "../shared/map";
import LobbyMaps from "./LobbyMaps";
import {
  Board,
  Card,
  RESOURCE_COLOR,
  RESOURCE_SYMBOL,
  previewBoard,
} from "./Board";
import { Brand } from "./App";
import { command, remember, request, session, Session } from "./api";
const preview = previewBoard();
const names: Record<string, string> = {
  attack: "Attack",
  reinforce: "Reinforce",
  support: "Allied support",
  reposition: "Reposition",
  reorder: "Reorder",
  scout: "Scout",
  buy: "Buy a special",
  bank: "Bank trade",
  trade: "Transfer resources",
  alliance: "Propose alliance",
  patrol: "Patrol",
  underground: "Underground attack",
  rebelMove: "Move rebels",
  raid: "Rebel raid",
  recruit: "Recruit rebel",
  suppress: "Suppress rebels",
  reorganize: "Reorganize",
  ceasefire: "Play Ceasefire",
  envoy: "Deploy Envoy",
  discard: "Discard",
};
const hints: Record<string, string> = {
  attack:
    "Choose your source, one hand tile, then a neighboring target. A tie defends.",
  reinforce:
    "Choose your territory and a hand tile. Place it above or below the existing layers.",
  support:
    "Select an ally’s territory and your hand tile. Support always goes at the bottom.",
  reposition:
    "Select a friendly source with 2+ layers, then adjacent friendly destination.",
  reorder:
    "Select your territory, then choose the new exposed tile. Foreign support stays below.",
  scout: "Draw up to two basics. Your combined hand limit is three.",
  buy: "Choose a deck. Your purchase is drawn randomly and privately.",
  bank: "Trade matching resources for one chosen resource. Market Charter improves the rate.",
  trade:
    "Transfer up to two tokens to your formal ally or an active rebel faction.",
  alliance:
    "Both commanders must pay Food + Cattle + Stone, or discard one Treaty each.",
  patrol:
    "Select your territory. Prevent rebel entry until the end of your next turn.",
  underground:
    "Select a target that already contains your rebels, then a hand tile.",
  rebelMove:
    "Select your rebel group as source, then an adjacent unblocked destination.",
  raid: "Select a foreign-controlled territory containing your rebels.",
  recruit:
    "Select an existing rebel group with an empty socket. Costs Food + Cattle.",
  suppress: "Select your territory, a hostile rebel faction, and a hand tile.",
  reorganize: "Discard one hand tile, then draw up to two basics.",
  ceasefire:
    "Select your territory and a Ceasefire. Protection ends at your next turn.",
  envoy: "Select an adjacent single-layer neutral territory and an Envoy.",
  discard: "Discard a hand tile without spending an action.",
};
export default function Game() {
  const { code: raw = "" } = useParams(),
    code = raw.toUpperCase();
  const [sess, setSess] = useState<Session | null>(() => session(code));
  const [v, setV] = useState<RoomView | null>(null),
    [error, setError] = useState(""),
    [connection, setConnection] = useState("Connecting"),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(localStorage.getItem("hexfront:name") || ""),
    [spectator, setSpectator] = useState(false),
    [selected, setSelected] = useState(""),
    [source, setSource] = useState(""),
    [card, setCard] = useState(""),
    [mode, setMode] = useState("attack"),
    [bottom, setBottom] = useState(false),
    [targetPlayer, setTargetPlayer] = useState(""),
    [resource, setResource] = useState<Resource>("Food"),
    [give, setGive] = useState<Resource>("Lumber"),
    [amount, setAmount] = useState(1),
    [deck, setDeck] = useState<Exclude<Deck, "basic">>("Infrastructure"),
    [confirm, setConfirm] = useState<Action | null>(null),
    [clock, setClock] = useState(Date.now()),
    [tab, setTab] = useState("command"),
    [copied, setCopied] = useState(false),
    [handOpen, setHandOpen] = useState(false);
  const inFlight = useRef(false);
  const latest = useRef(v);
  latest.current = v;
  const refresh = useCallback(async () => {
    if (!sess || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await request(`/rooms/${code}`, undefined, sess.token);
      setV((old) =>
        !old || data.view.version >= old.version ? data.view : old,
      );
      setConnection("Live");
    } catch (e: any) {
      setConnection("Reconnecting");
      if (e.status === 401 || e.status === 404) setError(e.message);
    } finally {
      inFlight.current = false;
    }
  }, [code, sess]);
  useEffect(() => {
    refresh();
    let lastPoll = Date.now();
    const t = setInterval(() => {
      if (!document.hidden || Date.now() - lastPoll >= 30000) {
        lastPoll = Date.now();
        refresh();
      }
    }, 1200);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  async function send(a: Action) {
    if (!sess || !latest.current || busy) return;
    setBusy(true);
    setError("");
    setConfirm(null);
    try {
      const result = await command(sess, latest.current, a);
      setV(result.view);
      setCard("");
      if (
        !["draft", "profile", "ready", "settings", "guard", "respond"].includes(
          a.type,
        )
      ) {
        setSource("");
        setSelected("");
      }
      return result.view as RoomView;
    } catch (e: any) {
      setError(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await request(`/rooms/${code}/join`, { name, spectator });
      remember(data);
      setSess({ code, token: data.token });
      setV(data.view);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const me = v?.players.find((p) => p.id === v.me),
    priority = v?.players.find((p) => p.id === v.priority),
    mine = !!me && me.id === v?.priority && !me.eliminated && !me.spectator,
    host = me?.id === v?.host;
  useEffect(() => {
    if (
      v?.phase === "playing" &&
      me?.territories === 0 &&
      ![
        "underground",
        "rebelMove",
        "raid",
        "recruit",
        "reorganize",
        "buy",
        "discard",
      ].includes(mode)
    )
      setMode("underground");
  }, [me?.territories, mode, v?.phase]);
  const tile = v?.board.find((t) => t.id === selected),
    from = v?.board.find((t) => t.id === source),
    hand = v?.hand.find((c) => c.id === card);
  const top = tile ? v?.tiles[tile.stack.at(-1)!] : undefined,
    fromTop = from ? v?.tiles[from.stack.at(-1)!] : undefined;
  const ally = v?.alliances.find((a) => a.members.includes(me?.id || ""));
  const dominant = v?.alliances.find(
    (a) =>
      a.members.reduce(
        (n, id) => n + (v.players.find((p) => p.id === id)?.territories || 0),
        0,
      ) >
      (v?.board.length || 0) / 2,
  );
  const all = v?.board || [];
  const legal =
    v?.phase === "draft"
      ? v.legalDraft
      : all
          .filter((t) => {
            const ctl = v?.tiles[t.stack.at(-1)!]?.owner;
            if (mode === "attack" && from)
              return (
                ctl !== me?.id &&
                !ally?.members.includes(ctl || "") &&
                !t.ceasefire &&
                (adjacent(from, t) ||
                  (hand?.ability === "Cavalry" &&
                    all.some(
                      (x) =>
                        v?.tiles[x.stack.at(-1)!]?.owner === me?.id &&
                        adjacent(from, x) &&
                        adjacent(x, t),
                    )))
              );
            if (
              [
                "reinforce",
                "patrol",
                "reorder",
                "ceasefire",
                "suppress",
              ].includes(mode)
            )
              return ctl === me?.id;
            if (mode === "support")
              return ctl !== me?.id && ally?.members.includes(ctl || "");
            if (["underground", "raid", "recruit"].includes(mode))
              return t.rebels.some((x) => x?.owner === me?.id);
            if (mode === "rebelMove" && from) {
              const n = from.rebels.filter((x) => x?.owner === me?.id).length;
              return (
                n &&
                adjacent(from, t) &&
                t.rebels.filter((x) => !x).length >= n &&
                !t.patrol &&
                !["Border Fort", "Blockade Unit"].includes(
                  v?.tiles[t.stack.at(-1)!]?.ability || "",
                )
              );
            }
            if (mode === "reposition" && from)
              return ctl === me?.id && adjacent(from, t) && t.stack.length < 3;
            if (mode === "envoy")
              return (
                !ctl &&
                t.stack.length === 1 &&
                all.some(
                  (x) =>
                    v?.tiles[x.stack.at(-1)!]?.owner === me?.id &&
                    adjacent(x, t),
                )
              );
            return false;
          })
          .map((t) => t.id);
  function select(id: string) {
    if (v?.phase === "draft") {
      setSelected(id);
      return;
    }
    if (["attack", "reposition", "rebelMove"].includes(mode) && !source) {
      setSource(id);
      setSelected("");
    } else setSelected(id);
  }
  const rebelsHere =
    tile?.rebels.filter((x) => x?.owner === me?.id).length || 0;
  let attack =
    (hand?.value || 0) +
    (mode === "underground" ? rebelsHere : fromTop?.value || 0);
  if (mode === "suppress") attack = (hand?.value || 0) + (top?.value || 0);
  if (hand?.ability === "Ballista" && (tile?.stack.length || 0) > 1)
    attack += 2;
  if (
    dominant &&
    top?.owner &&
    dominant.members.includes(top.owner) &&
    !dominant.members.includes(me?.id || "")
  )
    attack++;
  const defense =
    mode === "suppress"
      ? tile?.rebels.filter((x) => x?.owner === targetPlayer).length || 0
      : (top?.value || 0) +
        (tile?.stack.length || 1) -
        1 +
        (top?.ability === "Fortress" ? 2 : 0);
  function action(): Action {
    if (mode === "buy") return { type: mode, target: deck };
    if (mode === "bank") return { type: mode, resource, give };
    if (mode === "trade")
      return { type: mode, player: targetPlayer, resource, amount };
    if (mode === "alliance")
      return {
        type: mode,
        player: targetPlayer,
        ...(hand?.ability === "Treaty" ? { card } : {}),
      };
    if (mode === "reorder" && tile) {
      const order = [...tile.stack.filter((id) => id !== card), card];
      return { type: mode, target: selected, order };
    }
    return {
      type: mode,
      ...(selected ? { target: selected } : {}),
      ...(source ? { source } : {}),
      ...(card ? { card } : {}),
      ...(mode === "suppress" ? { player: targetPlayer } : {}),
      ...(mode === "reinforce" ? { bottom } : {}),
      ...(mode === "raid" ? { resource } : {}),
    };
  }
  const needsCard = [
      "attack",
      "reinforce",
      "support",
      "underground",
      "suppress",
      "envoy",
      "ceasefire",
      "discard",
      "reorganize",
      "reorder",
    ].includes(mode),
    needsTarget = [
      "attack",
      "reinforce",
      "support",
      "reposition",
      "reorder",
      "patrol",
      "underground",
      "rebelMove",
      "raid",
      "recruit",
      "suppress",
      "ceasefire",
      "envoy",
    ].includes(mode),
    needsSource = ["attack", "reposition", "rebelMove"].includes(mode);
  const valid =
    (!needsCard || !!card) &&
    (!needsTarget || !!selected) &&
    (!needsSource || !!source) &&
    (!["trade", "alliance", "suppress"].includes(mode) || !!targetPlayer);
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(`Copy this link: ${location.href}`);
    }
  }
  function download() {
    if (!v) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            code: v.code,
            seed: v.settings.seed,
            events: v.log,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hexfront-${code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!sess)
    return (
      <div className="join-page">
        <Brand />
        <form className="panel join-form" onSubmit={join}>
          <div className="eyebrow">FRONTIER {code}</div>
          <h1>Take your place.</h1>
          <TextField
            label="Commander name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 24 } }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={spectator}
                onChange={(e) => setSpectator(e.target.checked)}
              />
            }
            label="Join as public spectator"
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            variant="contained"
            type="submit"
            disabled={busy || !name.trim()}
          >
            Join room
          </Button>
        </form>
      </div>
    );
  if (!v)
    return (
      <div className="loading" role="status">
        {error || "Establishing your uplink…"}
        <p>
          <Link to="/">Return home</Link>
        </p>
      </div>
    );
  return (
    <div className={`game ${me?.spectator ? "projector" : ""}`}>
      <header className="game-header">
        <Brand />
        <div className="room-id">
          <span className="muted">ROOM</span>
          <button onClick={share} title="Copy room link">
            {code} <small>{copied ? "COPIED" : "↗"}</small>
          </button>
          <span className={`status ${connection === "Live" ? "online" : ""}`}>
            {connection}
          </span>
        </div>
        <nav>
          <Link to="/rules" target="_blank">
            Field manual ↗
          </Link>
          {host && v.phase !== "lobby" && v.phase !== "finished" && (
            <>
              <Button size="small" onClick={() => send({ type: "pause" })}>
                {v.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                size="small"
                onClick={() => setConfirm({ type: "restart" })}
              >
                Restart
              </Button>
            </>
          )}
        </nav>
      </header>
      {error && (
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {v.phase === "lobby" ? (
        <main className="lobby">
          <div className="lobby-heading">
            <div>
              <div className="eyebrow">ASSEMBLE YOUR COMMANDERS</div>
              <h1>
                The calm before
                <br />
                <em>the campaign.</em>
              </h1>
              <p className="muted">
                Share your room link. Choose a color. Ready the frontier.
              </p>
            </div>
            <div className="invite-code">
              <small>INVITE CODE</small>
              <b>{code}</b>
              <Button variant="outlined" onClick={share}>
                {copied ? "Link copied" : "Copy invite link ↗"}
              </Button>
            </div>
          </div>
          <div className="lobby-grid">
            <section className="panel">
              <div className="section-label">
                COMMANDERS{" "}
                <span>{v.players.filter((p) => !p.spectator).length} / 4</span>
              </div>
              {v.players.map((p) => (
                <div className="lobby-player" key={p.id}>
                  <span
                    className="player-swatch"
                    style={{ background: p.color }}
                  />
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {p.id === v.host ? "Host · " : ""}
                      {p.spectator
                        ? "Projector / spectator"
                        : p.bot
                          ? "Automaton"
                          : p.online
                            ? "Connected"
                            : "Disconnected"}
                    </small>
                  </div>
                  <span className={p.ready ? "ready-label" : "muted"}>
                    {p.spectator
                      ? "Viewing"
                      : p.ready
                        ? "✓ Ready"
                        : "Preparing"}
                  </span>
                  {host && p.id !== v.host && (p.bot || !p.online) && (
                    <button
                      onClick={() => send({ type: "remove", player: p.id })}
                      aria-label={`Remove ${p.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {me && !me.spectator && (
                <>
                  <div
                    className="color-picker"
                    aria-label="Choose player color"
                  >
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        style={{ background: c }}
                        aria-label={`Choose color ${c}`}
                        aria-pressed={me.color === c}
                        disabled={v.players.some(
                          (p) =>
                            p.id !== me.id && !p.spectator && p.color === c,
                        )}
                        onClick={() => send({ type: "profile", color: c })}
                      >
                        {me.color === c ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant={me.ready ? "outlined" : "contained"}
                    fullWidth
                    disabled={busy}
                    onClick={() => send({ type: "ready" })}
                  >
                    {me.ready
                      ? "Ready ✓ · Click to unready"
                      : "Ready for the campaign"}
                  </Button>
                </>
              )}
              {host && (
                <div className="lobby-actions">
                  <Button
                    variant="outlined"
                    onClick={() => send({ type: "addBot" })}
                    disabled={
                      busy || v.players.filter((p) => !p.spectator).length >= 4
                    }
                  >
                    + Add automaton
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => send({ type: "start" })}
                    disabled={
                      busy ||
                      v.players.filter((p) => !p.spectator).length < 2 ||
                      !v.players
                        .filter((p) => !p.spectator)
                        .every((p) => p.ready)
                    }
                  >
                    Begin snake draft →
                  </Button>
                </div>
              )}
            </section>
            <section className="panel settings-panel">
              <div className="section-label">CAMPAIGN SETTINGS</div>
              <TextField
                label="Auditable shuffle seed"
                defaultValue={v.settings.seed}
                disabled={!host}
                onBlur={(e) =>
                  send({
                    type: "settings",
                    settings: { seed: e.target.value || code },
                  })
                }
                helperText="Recorded seed. Turn order is shuffled at setup."
              />
              <TextField
                select
                label="Reaction window"
                value={v.settings.reactionSeconds}
                disabled={!host}
                onChange={(e) =>
                  send({
                    type: "settings",
                    settings: { reactionSeconds: Number(e.target.value) },
                  })
                }
              >
                {[5, 15, 25, 45, 60, 120].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n} seconds
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={v.settings.alliances}
                    disabled={!host}
                    onChange={(e) =>
                      send({
                        type: "settings",
                        settings: { alliances: e.target.checked },
                      })
                    }
                  />
                }
                label="Formal alliances & Coalition Threat"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={v.settings.eliminationVictory}
                    disabled={!host}
                    onChange={(e) =>
                      send({
                        type: "settings",
                        settings: { eliminationVictory: e.target.checked },
                      })
                    }
                  />
                }
                label="Last commander standing can win"
              />
              <p className="muted small">
                {v.board.length} territories · 3 layers · 3 rebel sockets ·
                First to hold 8 VP across two consecutive round ends wins.
              </p>
              <p className="muted small">
                Optional experimental variants are not enabled in this release.
              </p>
            </section>
            <LobbyMaps room={v} host={host} busy={busy} onSend={send} />
          </div>
        </main>
      ) : (
        <main className="battlefield">
          <div className="campaign-bar">
            <div>
              <div className="eyebrow">
                {v.phase === "draft"
                  ? "THE OPENING CLAIM"
                  : v.phase === "finished"
                    ? "CAMPAIGN COMPLETE"
                    : `ROUND ${String(v.round).padStart(2, "0")}`}
              </div>
              <h1>
                {v.phase === "finished"
                  ? `${v.players.find((p) => p.id === v.winner)?.name} wins.`
                  : v.paused
                    ? "Campaign paused"
                    : v.phase === "draft"
                      ? `${priority?.name} is drafting`
                      : `${priority?.name} has command`}
              </h1>
            </div>
            <div className="turn-badge">
              {v.phase === "draft" ? (
                <>
                  <b>
                    {v.draftIndex + 1} / {v.draft.length}
                  </b>
                  <small>SNAKE DRAFT</small>
                </>
              ) : (
                <>
                  <b>
                    {v.actions}
                    <span> / {me?.territories === 0 ? 2 : 3}</span>
                  </b>
                  <small>ACTIONS REMAINING</small>
                </>
              )}
            </div>
          </div>
          {dominant && (
            <Alert severity="warning">
              Dominant Coalition:{" "}
              {dominant.members
                .map((id) => v.players.find((p) => p.id === id)?.name)
                .join(" + ")}
              . Outsiders gain +1 attack and an extra raid token.
            </Alert>
          )}
          {v.phase === "finished" && (
            <div className="winner-bar">
              <p>
                Victory is individual. Seed: <b>{v.settings.seed}</b>
              </p>
              <Button variant="outlined" onClick={download}>
                Download campaign log
              </Button>
              {host && (
                <Button
                  variant="contained"
                  onClick={() => setConfirm({ type: "rematch" })}
                >
                  Rematch
                </Button>
              )}
            </div>
          )}
          <div className="game-grid">
            <aside className="players-panel">
              <div className="section-label">THE COMMANDERS</div>
              {v.players
                .filter((p) => !p.spectator)
                .map((p) => (
                  <div
                    key={p.id}
                    className={`commander ${p.id === v.priority ? "has-turn" : ""}`}
                    style={{ "--player": p.color } as React.CSSProperties}
                  >
                    <div className="commander-heading">
                      <span
                        className="player-swatch"
                        style={{ background: p.color }}
                      />
                      <b>
                        {p.name}
                        {p.id === me?.id ? " · You" : ""}
                      </b>
                      <span className="vp">
                        {p.score}
                        <small>VP</small>
                      </span>
                    </div>
                    <div className="commander-meta">
                      <span>{p.territories} territories</span>
                      <span>{p.handCount} hexes</span>
                    </div>
                    <div className="commander-tags">
                      {p.eliminated ? (
                        <span>Eliminated · Spectating</span>
                      ) : (
                        <>
                          <span>
                            {v.alliances.some((a) => a.members.includes(p.id))
                              ? "Formally allied"
                              : v.phase === "draft"
                                ? "Opening deployment"
                                : p.territories
                                  ? "Sovereign +2 VP"
                                  : "Rebel mode"}
                          </span>
                          <span>{p.online ? "● Online" : "○ Away"}</span>
                        </>
                      )}
                    </div>
                    {p.betrayals > 0 && (
                      <small className="penalty">
                        −{p.betrayals * 2} permanent betrayal VP
                      </small>
                    )}
                    {p.claim !== undefined && (
                      <small className="ready-label">
                        Victory contender since round {p.claim}
                      </small>
                    )}
                    {p.reserve > 0 && (
                      <small>Reserve: {p.reserve} dormant pegs</small>
                    )}
                  </div>
                ))}
              <div className="section-label prestige-label">
                PRESTIGE <span>+2 VP EACH</span>
              </div>
              {TITLES.map((title, i) => (
                <div className="prestige" key={title}>
                  <span className="prestige-icon">
                    {["⌁", "⚔", "▱", "◇", "✧"][i]}
                  </span>
                  <div>
                    <b>{title}</b>
                    <small>
                      {v.players.find((p) => p.id === v.titles[title])?.name ||
                        "Unclaimed"}{" "}
                      · minimum {[5, 2, 2, 3, 2][i]}
                    </small>
                    <small>
                      {v.players
                        .filter((p) => !p.spectator)
                        .map((p) => `${p.name}: ${v.metrics[p.id]?.[i] || 0}`)
                        .join(" / ")}
                    </small>
                  </div>
                </div>
              ))}
            </aside>
            <section className="map-panel" id="frontier-map">
              <div className="forecast">
                <div className="forecast-label">
                  PRODUCTION
                  <br />
                  <small>ONE SHUFFLED BAG · NO REPLACEMENT</small>
                </div>
                {v.forecast.map((r, i) => (
                  <div
                    key={i}
                    className={`forecast-token ${i === 0 ? "current" : ""}`}
                    style={
                      { "--resource": RESOURCE_COLOR[r] } as React.CSSProperties
                    }
                  >
                    <small>
                      {i === 0 ? "ACTIVE" : `+${i} ROUND${i > 1 ? "S" : ""}`}
                    </small>
                    <span>{RESOURCE_SYMBOL[r]}</span>
                    <b>{r}</b>
                  </div>
                ))}
              </div>
              {v.phase === "draft" && (
                <div className="draft-banner">
                  <b>
                    {mine
                      ? "Choose your foothold."
                      : "Watch the opening unfold."}
                  </b>
                  <span>
                    Place a hand hex anywhere empty, then draw one replacement.
                    Fill all {v.board.length} territories.
                  </span>
                  <div className="draft-order">
                    {v.draft
                      .slice(
                        Math.floor(
                          v.draftIndex /
                            v.players.filter((p) => !p.spectator).length,
                        ) * v.players.filter((p) => !p.spectator).length,
                        Math.floor(
                          v.draftIndex /
                            v.players.filter((p) => !p.spectator).length,
                        ) *
                          v.players.filter((p) => !p.spectator).length +
                          v.players.filter((p) => !p.spectator).length,
                      )
                      .map((id, i) => (
                        <span
                          key={i}
                          className={
                            i ===
                            v.draftIndex %
                              v.players.filter((p) => !p.spectator).length
                              ? "current"
                              : ""
                          }
                          style={{
                            color: v.players.find((p) => p.id === id)?.color,
                          }}
                        >
                          {v.players.find((p) => p.id === id)?.name}
                          {i < v.draft.length - 1 ? " → " : ""}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              <Board
                board={v.board}
                tiles={v.tiles}
                players={v.players}
                selected={selected}
                source={source}
                legal={mine ? legal : []}
                onSelect={select}
              />
              <div className="board-legend">
                <span>◉ Flush owner chip</span>
                <span>••• Three rebel sockets</span>
                <span>▱ Up to three tile layers</span>
              </div>
              {tile && (
                <div className="territory-detail">
                  <div className="section-label">
                    {tile.id} · REGION {tile.region + 1}
                    <span>
                      {top?.owner
                        ? v.players.find((p) => p.id === top.owner)?.name
                        : "NEUTRAL"}
                    </span>
                  </div>
                  <div className="stack-layers">
                    {tile.stack.map((id, i) => {
                      const c = v.tiles[id];
                      return (
                        <button
                          key={id}
                          className={card === id ? "chosen" : ""}
                          onClick={() => mode === "reorder" && setCard(id)}
                        >
                          <small>
                            {i === tile.stack.length - 1
                              ? "EXPOSED"
                              : i === 0
                                ? "BOTTOM"
                                : "BURIED"}
                          </small>
                          <b style={{ color: RESOURCE_COLOR[c.resource] }}>
                            {c.value} {c.resource}
                          </b>
                          <span
                            style={{
                              color: v.players.find((p) => p.id === c.owner)
                                ?.color,
                            }}
                          >
                            {v.players.find((p) => p.id === c.owner)?.name ||
                              "Neutral"}
                          </span>
                          {c.ability && (
                            <small title={ABILITIES[c.ability].text}>
                              {c.ability}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="peg-details">
                    {tile.rebels.map((p, i) => (
                      <span
                        key={i}
                        style={{
                          color: v.players.find((x) => x.id === p?.owner)
                            ?.color,
                        }}
                      >
                        ○{" "}
                        {p
                          ? v.players.find((x) => x.id === p.owner)?.name
                          : "Empty socket"}
                      </span>
                    ))}
                  </div>
                  {top?.ability && (
                    <p className="small muted">
                      {top.ability}: {ABILITIES[top.ability].text}
                    </p>
                  )}
                  {tile.rebels.some((x) => x) && (
                    <p className="small muted">
                      Retreats:{" "}
                      {v.board
                        .filter((t) => adjacent(t, tile))
                        .map(
                          (t) =>
                            `${t.id}: ${t.rebels.filter((p) => !p).length} free${t.patrol || ["Border Fort", "Blockade Unit"].includes(v.tiles[t.stack.at(-1)!].ability || "") ? " · blocked" : ""}`,
                        )
                        .join(" / ")}
                      . Whole group must fit. Last landless peg must retreat or
                      dies.
                    </p>
                  )}
                </div>
              )}
            </section>
            <aside className="command-panel" id="frontier-orders">
              <div className="panel-tabs">
                <button
                  className={tab === "command" ? "active" : ""}
                  onClick={() => setTab("command")}
                >
                  Command
                </button>
                <button
                  className={tab === "log" ? "active" : ""}
                  onClick={() => setTab("log")}
                >
                  Chronicle
                </button>
              </div>
              {tab === "log" ? (
                <div className="log" aria-live="polite">
                  {v.log
                    .slice(-60)
                    .reverse()
                    .map((entry, i) => (
                      <div key={i}>
                        <small>
                          ROUND {entry.round} · v{entry.version}
                        </small>
                        <p>{entry.message}</p>
                      </div>
                    ))}
                  <Button onClick={download}>Download full log</Button>
                </div>
              ) : (
                <>
                  {v.pending ? (
                    <div className="reaction-panel" role="status">
                      <div className="eyebrow">
                        REACTION WINDOW ·{" "}
                        {Math.max(
                          0,
                          Math.ceil((v.pending.expires - clock) / 1000),
                        )}
                        s
                      </div>
                      <h2>
                        {v.pending.kind === "suppression"
                          ? "Rebel suppression"
                          : "An attack is incoming."}
                      </h2>
                      <p>
                        {
                          v.players.find((p) => p.id === v.pending!.attacker)
                            ?.name
                        }{" "}
                        → {v.pending.target}
                      </p>
                      <div className="combat-preview">
                        <div>
                          <small>ATTACK</small>
                          <b>{v.pending.attack}</b>
                        </div>
                        <span>vs</span>
                        <div>
                          <small>DEFENSE</small>
                          <b>{v.pending.defense + v.pending.rebelBonus}</b>
                        </div>
                      </div>
                      <p className="small muted">
                        One hand guard adds its number. Ties defend. Default on
                        timeout: pass.
                      </p>
                      {(v.pending.defender === me?.id ||
                        ally?.members.includes(v.pending.defender || "")) && (
                        <>
                          <Button
                            variant="contained"
                            disabled={busy || !card}
                            onClick={() => send({ type: "guard", card })}
                          >
                            Discard selected guard
                            {hand
                              ? ` (+${hand.ability === "Shield Pact" ? 3 : hand.value})`
                              : ""}
                          </Button>
                          {v.pending.defender === me?.id && (
                            <Button
                              variant="outlined"
                              onClick={() => send({ type: "guard" })}
                              disabled={busy}
                            >
                              Pass reaction
                            </Button>
                          )}
                        </>
                      )}
                      {v.pending.kind === "battle" &&
                        v.pending.attacker !== me?.id &&
                        v.board
                          .find((t) => t.id === v.pending!.target)
                          ?.rebels.some((x) => x?.owner === me?.id) &&
                        !v.pending.rebelBy && (
                          <Button onClick={() => send({ type: "pledge" })}>
                            Pledge all local rebels to defense
                          </Button>
                        )}
                    </div>
                  ) : v.phase === "draft" ? (
                    <div className="draft-command">
                      <div className="eyebrow">
                        CLAIM{" "}
                        {Math.floor(
                          v.draftIndex /
                            v.players.filter((p) => !p.spectator).length,
                        ) + 1}{" "}
                        OF{" "}
                        {v.board.length /
                          v.players.filter((p) => !p.spectator).length}
                      </div>
                      <h2>
                        {mine
                          ? "Make your opening."
                          : `${priority?.name} is choosing.`}
                      </h2>
                      <p className="muted">
                        Select a hex from your private hand and any empty
                        territory. You draw one replacement after placing it.
                      </p>
                      <Button
                        variant="contained"
                        fullWidth
                        disabled={
                          busy ||
                          v.paused ||
                          !mine ||
                          !v.legalDraft.includes(selected) ||
                          !hand
                        }
                        onClick={() =>
                          send({ type: "draft", target: selected, card })
                        }
                      >
                        Place {hand ? `${hand.value} ${hand.resource}` : "hex"}{" "}
                        on {selected || "territory"} →
                      </Button>
                    </div>
                  ) : me?.spectator || me?.eliminated ? (
                    <div className="draft-command">
                      <div className="eyebrow">PUBLIC PROJECTION</div>
                      <h2>The frontier, in full view.</h2>
                      <p className="muted">
                        Select a territory to inspect its layers and rebels.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="section-label">
                        YOUR RESOURCES{" "}
                        <span>
                          {Object.values(me?.stock || {}).reduce(
                            (a, b) => a + b,
                            0,
                          )}{" "}
                          /{" "}
                          {12 +
                            3 *
                              v.board.filter(
                                (t) =>
                                  v.tiles[t.stack.at(-1)!].owner === me?.id &&
                                  v.tiles[t.stack.at(-1)!].ability ===
                                    "Granary",
                              ).length}
                        </span>
                      </div>
                      <div className="stock">
                        {RESOURCES.map((r) => (
                          <div key={r} style={{ color: RESOURCE_COLOR[r] }}>
                            <span>{RESOURCE_SYMBOL[r]}</span>
                            <b>{me?.stock[r]}</b>
                            <small>{r}</small>
                          </div>
                        ))}
                      </div>
                      <div className="section-label">
                        {mine ? "ISSUE AN ORDER" : "PLAN YOUR NEXT TURN"}
                      </div>
                      <TextField
                        select
                        label="Action"
                        size="small"
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value);
                          setSelected("");
                          setSource("");
                          setCard("");
                        }}
                        fullWidth
                      >
                        {Object.entries(names)
                          .filter(
                            ([key]) =>
                              me?.territories !== 0 ||
                              [
                                "underground",
                                "rebelMove",
                                "raid",
                                "recruit",
                                "reorganize",
                                "buy",
                                "discard",
                              ].includes(key),
                          )
                          .map(([key, name]) => (
                            <MenuItem key={key} value={key}>
                              {name}
                            </MenuItem>
                          ))}
                      </TextField>
                      <p className="action-hint">{hints[mode]}</p>
                      {needsSource && (
                        <div className="selection-row">
                          <span>01 · Source</span>
                          <button
                            onClick={() => {
                              setSource("");
                              setSelected("");
                            }}
                          >
                            {source || "Tap the board"} {source ? "×" : ""}
                          </button>
                        </div>
                      )}
                      {needsCard && (
                        <div className="selection-row">
                          <span>
                            {needsSource ? "02" : "01"} ·{" "}
                            {mode === "reorder" ? "Exposed layer" : "Hand tile"}
                          </span>
                          <span>
                            {hand
                              ? `${hand.value} ${hand.resource}`
                              : card || "Select below"}
                          </span>
                        </div>
                      )}
                      {needsTarget && (
                        <div className="selection-row">
                          <span>Target</span>
                          <span>{selected || "Tap the board"}</span>
                        </div>
                      )}
                      {mode === "reinforce" && (
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={bottom}
                              onChange={(e) => setBottom(e.target.checked)}
                            />
                          }
                          label="Place at bottom"
                        />
                      )}
                      {["alliance", "trade", "suppress"].includes(mode) && (
                        <TextField
                          select
                          label={
                            mode === "suppress"
                              ? "Hostile rebel faction"
                              : "Commander"
                          }
                          size="small"
                          value={targetPlayer}
                          onChange={(e) => setTargetPlayer(e.target.value)}
                          fullWidth
                        >
                          {v.players
                            .filter(
                              (p) =>
                                p.id !== me?.id &&
                                !p.spectator &&
                                !p.eliminated,
                            )
                            .map((p) => (
                              <MenuItem key={p.id} value={p.id}>
                                {p.name}
                              </MenuItem>
                            ))}
                        </TextField>
                      )}
                      {mode === "buy" && (
                        <>
                          <TextField
                            select
                            label="Secret deck"
                            size="small"
                            value={deck}
                            onChange={(e) => setDeck(e.target.value as any)}
                            fullWidth
                          >
                            {Object.keys(PRICES).map((d) => (
                              <MenuItem key={d} value={d}>
                                {d} · {v.deckCounts[d as Deck]} left
                              </MenuItem>
                            ))}
                          </TextField>
                          <p className="small muted">
                            Price:{" "}
                            {Object.entries(PRICES[deck])
                              .map(([r, n]) => `${n} ${r}`)
                              .join(" + ")}
                          </p>
                        </>
                      )}
                      {mode === "bank" && (
                        <TextField
                          select
                          label="Give matching tokens"
                          value={give}
                          size="small"
                          onChange={(e) => setGive(e.target.value as Resource)}
                          fullWidth
                        >
                          {RESOURCES.map((r) => (
                            <MenuItem key={r} value={r}>
                              {r}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      {["bank", "trade", "raid"].includes(mode) && (
                        <TextField
                          select
                          label={mode === "bank" ? "Receive" : "Resource"}
                          size="small"
                          value={resource}
                          onChange={(e) =>
                            setResource(e.target.value as Resource)
                          }
                          fullWidth
                        >
                          {RESOURCES.map((r) => (
                            <MenuItem key={r} value={r}>
                              {r}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      {mode === "trade" && (
                        <TextField
                          select
                          label="Tokens"
                          size="small"
                          value={amount}
                          onChange={(e) => setAmount(Number(e.target.value))}
                        >
                          {[1, 2].map((n) => (
                            <MenuItem key={n} value={n}>
                              {n}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      {["attack", "underground", "suppress"].includes(mode) &&
                        tile &&
                        hand && (
                          <div className="combat-preview">
                            <div>
                              <small>ATTACK</small>
                              <b>{attack}</b>
                            </div>
                            <span>vs</span>
                            <div>
                              <small>BEFORE GUARD</small>
                              <b>{defense}</b>
                            </div>
                            <p className="small">
                              {mode === "underground"
                                ? `Hand ${hand.value} + ${rebelsHere} local pegs`
                                : mode === "suppress"
                                  ? `Top ${top?.value} + hand ${hand.value}`
                                  : `Source ${fromTop?.value || 0} + hand ${hand.value}`}{" "}
                              · Must be strictly greater. Only exposed layers
                              are removed.
                            </p>
                          </div>
                        )}
                      <Button
                        variant="contained"
                        fullWidth
                        disabled={
                          busy ||
                          !mine ||
                          v.paused ||
                          v.phase !== "playing" ||
                          !valid ||
                          (v.actions === 0 && mode !== "discard")
                        }
                        onClick={() => setConfirm(action())}
                      >
                        Review {names[mode]?.toLowerCase()} →
                      </Button>
                      <Button
                        variant="outlined"
                        fullWidth
                        disabled={
                          busy ||
                          !mine ||
                          !!v.pending ||
                          v.paused ||
                          v.phase !== "playing"
                        }
                        onClick={() => setConfirm({ type: "end" })}
                      >
                        End turn
                        {v.actions > 0
                          ? ` · forgo ${v.actions} action${v.actions > 1 ? "s" : ""}`
                          : ""}
                      </Button>
                      {ally && (
                        <div className="alliance-panel">
                          <div className="section-label">
                            YOUR FORMAL ALLIANCE
                          </div>
                          <p>
                            {ally.members
                              .map(
                                (id) =>
                                  v.players.find((p) => p.id === id)?.name,
                              )
                              .join(" + ")}
                          </p>
                          <small className="muted">
                            {ally.transferred}/2 resources transferred this
                            round
                          </small>
                          <Button
                            disabled={!mine}
                            onClick={() => setConfirm({ type: "separate" })}
                          >
                            Request mutual separation
                          </Button>
                          <Button
                            color="warning"
                            disabled={!mine}
                            onClick={() => setConfirm({ type: "break" })}
                          >
                            Break alliance unilaterally
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  {v.proposal?.to === me?.id && (
                    <div className="proposal">
                      <div className="eyebrow">DIPLOMATIC OFFER</div>
                      <p>
                        {v.players.find((p) => p.id === v.proposal!.from)?.name}{" "}
                        proposes{" "}
                        {v.proposal!.kind === "alliance"
                          ? "a formal alliance"
                          : "mutual separation"}
                        .
                      </p>
                      <p className="small muted">
                        {v.proposal!.kind === "alliance"
                          ? "Your payment: Food + Cattle + Stone, or select your Treaty before accepting."
                          : "All foreign support is discarded peacefully. No rebels or VP penalty."}
                      </p>
                      <Button
                        variant="contained"
                        onClick={() =>
                          setConfirm({
                            type: "respond",
                            accept: true,
                            ...(hand?.ability === "Treaty" ? { card } : {}),
                          })
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        onClick={() => send({ type: "respond", accept: false })}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
          {me && !me.spectator && !me.eliminated && (
            <section className="hand-panel">
              <div className="hand-heading">
                <div>
                  <div className="eyebrow">PRIVATE INTELLIGENCE</div>
                  <h2>
                    Your hand{" "}
                    <span>
                      {v.hand.length} / {HAND_LIMIT}
                    </span>
                  </h2>
                </div>
                <p className="small muted">
                  Select a hex to use it. Only you can see these tiles.
                </p>
              </div>
              <div className="hand-cards">
                {v.hand.map((c) => (
                  <Card
                    key={c.id}
                    card={c}
                    selected={c.id === card}
                    onClick={() => setCard(c.id === card ? "" : c.id)}
                  />
                ))}
                {!v.hand.length && (
                  <p className="muted">
                    No tiles in hand. Scout or wait for your next draw.
                  </p>
                )}
              </div>
              {v.hand.length > HAND_LIMIT && (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      disabled={busy || v.paused || !card}
                      onClick={() => send({ type: "discard", card })}
                    >
                      Discard selected tile
                    </Button>
                  }
                >
                  The hand limit is now {HAND_LIMIT}. Choose{" "}
                  {v.hand.length - HAND_LIMIT} tile
                  {v.hand.length - HAND_LIMIT === 1 ? "" : "s"} to discard
                  before continuing.
                </Alert>
              )}
              {hand?.ability && (
                <p className="card-explainer">
                  <b>{hand.ability}</b> · {ABILITIES[hand.ability].trigger} ·{" "}
                  {ABILITIES[hand.ability].text}
                </p>
              )}
            </section>
          )}
        </main>
      )}
      {["playing", "draft"].includes(v.phase) &&
        me &&
        !me.spectator &&
        !me.eliminated && (
          <nav className="mobile-dock" aria-label="Game navigation">
            <a href="#frontier-map">⌁ Board</a>
            <a href="#frontier-orders">⚔ Orders</a>
            <button onClick={() => setHandOpen(true)}>
              ▱ Hand · {v.hand.length}/{HAND_LIMIT}
            </button>
          </nav>
        )}
      <Dialog
        open={handOpen}
        onClose={() => setHandOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Your private hand</DialogTitle>
        <DialogContent>
          <p className="small muted">Select a tile, then review your order.</p>
          <div className="sheet-cards">
            {v.hand.map((c) => (
              <Card
                key={c.id}
                card={c}
                selected={c.id === card}
                onClick={() => {
                  setCard(c.id);
                  setHandOpen(false);
                }}
              />
            ))}
          </div>
          {v.hand.length === 0 && <p>Your hand is empty.</p>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHandOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {confirm?.type === "end"
            ? "End your command?"
            : confirm?.type === "break"
              ? "Unilateral separation"
              : `Confirm ${names[confirm?.type || ""] || confirm?.type}`}
        </DialogTitle>
        <DialogContent>
          <p>
            {confirm?.type === "restart"
              ? "The current campaign will reset for every player, including hands, resources, claims, alliances and rebels. A fresh shuffled draft will begin."
              : confirm?.type === "break"
                ? "All foreign support tiles between both partners are discarded. Each creates one rebel for its owner, overflowing to creation reserves. If any are created, you take one permanent −2 VP penalty."
                : "The server will validate this order against the current game state."}
          </p>
          {confirm?.type === "break" && (
            <p className="small">
              {v.board
                .flatMap((t) => {
                  const ctl = v.tiles[t.stack.at(-1)!].owner;
                  return ally?.members.includes(ctl || "")
                    ? t.stack
                        .filter(
                          (id) =>
                            v.tiles[id].owner !== ctl &&
                            ally.members.includes(v.tiles[id].owner || ""),
                        )
                        .map(
                          (id) =>
                            `${v.tiles[id].owner === me?.id ? "Your" : v.players.find((p) => p.id === v.tiles[id].owner)?.name + "’s"} rebel at ${t.id} or adjacent / reserve`,
                        )
                    : [];
                })
                .join("; ") || "No foreign support: no rebels and no penalty."}
            </p>
          )}
          {confirm?.type === "end" ? (
            <p>
              {v.actions} unused action{v.actions !== 1 ? "s" : ""} will be
              forfeited.
            </p>
          ) : (
            <div className="confirmation-summary">
              {source && (
                <p>
                  Source: <b>{source}</b>
                </p>
              )}
              {selected && (
                <p>
                  Target: <b>{selected}</b>
                </p>
              )}
              {hand && (
                <p>
                  Tile:{" "}
                  <b>
                    {hand.value} {hand.resource}
                    {hand.ability ? ` · ${hand.ability}` : ""}
                  </b>
                </p>
              )}
              {["attack", "underground", "suppress"].includes(
                confirm?.type || "",
              ) && (
                <p>
                  Attack {attack} vs defense {defense} before reactions.
                </p>
              )}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => confirm && send(confirm)}
          >
            Confirm order
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
