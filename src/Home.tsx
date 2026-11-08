import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
} from "@mui/material";
import { Brand } from "./App";
import { Board, previewBoard } from "./Board";
import { remember, request } from "./api";
const preview = previewBoard();
export default function Home() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"create" | "join" | "practice" | null>(null),
    [name, setName] = useState(localStorage.getItem("hexfront:name") || ""),
    [code, setCode] = useState(""),
    [spectator, setSpectator] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("hexfront:name", name);
      const data = await request(
        mode === "join" ? `/rooms/${code.trim().toUpperCase()}/join` : "/rooms",
        {
          name,
          spectator: mode === "practice" ? false : spectator,
          ...(mode === "practice" ? { practice: true } : {}),
        },
      );
      remember(data);
      nav(`/room/${data.code}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home">
      <header className="site-header">
        <Brand />
        <nav>
          <Link to="/rules">
            Field manual <span>↗</span>
          </Link>
          <span className="version-tag">STRATEGY · 2–4 PLAYERS</span>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> THE FRONTIER IS YOURS TO CLAIM
            </div>
            <h1>
              Build your power.
              <br />
              Choose your allies.
              <br />
              <em>Hold your ground.</em>
            </h1>
            <p>
              A living battlefield of shifting alliances. Stack your defenses,
              command the resource flow, and rise from the underground when an
              empire falls.
            </p>
            <div className="hero-buttons">
              <Button
                variant="contained"
                size="large"
                onClick={() => setMode("create")}
              >
                Create a room <span>↗</span>
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => setMode("join")}
              >
                Join with a code
              </Button>
            </div>
            <button
              className="practice-link"
              onClick={() => setMode("practice")}
            >
              Learn the frontier · Solo against an automaton <span>→</span>
            </button>
            <div className="hero-facts">
              <div>
                <b>37</b>
                <span>territories to claim</span>
              </div>
              <div>
                <b>3</b>
                <span>actions. Your call.</span>
              </div>
              <div>
                <b>1</b>
                <span>sovereign victor</span>
              </div>
            </div>
          </div>
          <div className="hero-map">
            <div className="map-orbit orbit-one" />
            <div className="map-orbit orbit-two" />
            <div className="map-caption">
              <span>THE FRONTIER</span>
              <small>37 CONNECTED TERRITORIES</small>
            </div>
            <Board {...preview} decorative />
            <div className="map-note">
              <span className="live-dot" /> Every layer changes the balance.
            </div>
          </div>
        </section>
        <section className="pillars">
          <article>
            <span className="pillar-number">01 / EXPAND</span>
            <h2>Strength in every layer.</h2>
            <p>
              Claim a foothold. Build a three-layer defense. Every exposed hex
              shapes your economy.
            </p>
          </article>
          <article>
            <span className="pillar-number">02 / NEGOTIATE</span>
            <h2>Allies, until they aren’t.</h2>
            <p>
              Share support, make a pact, or stand sovereign. Betrayal leaves
              more than a memory.
            </p>
          </article>
          <article>
            <span className="pillar-number">03 / RESURGE</span>
            <h2>No land. Still a threat.</h2>
            <p>
              Rebels live at the edges of empires. Move underground, raid
              resources, and reclaim your place.
            </p>
          </article>
        </section>
      </main>
      <footer>
        <span>
          HEXFRONT <span className="muted">/</span> A game of territory & trust.
        </span>
        <Link to="/rules">Read the rules →</Link>
      </footer>
      <Dialog
        open={!!mode}
        onClose={() => !busy && setMode(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {mode === "join"
            ? "Join the frontier"
            : mode === "practice"
              ? "Your first campaign"
              : "Establish your command"}
        </DialogTitle>
        <DialogContent>
          <form onSubmit={go} className="dialog-form">
            <TextField
              label="Commander name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              slotProps={{ htmlInput: { maxLength: 24 } }}
            />
            {mode === "join" && (
              <TextField
                label="Six-character room code"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
                required
                slotProps={{ htmlInput: { maxLength: 6, minLength: 6 } }}
              />
            )}
            <p className="muted">
              {mode === "practice"
                ? "A server-operated automaton joins your campaign. The same rules apply."
                : "No account needed. Your reconnect key stays in this browser."}
            </p>
            {mode !== "practice" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={spectator}
                    onChange={(e) => setSpectator(e.target.checked)}
                  />
                }
                label={
                  mode === "create"
                    ? "Host as public spectator / projector"
                    : "Join as public spectator"
                }
              />
            )}{" "}
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              variant="contained"
              size="large"
              type="submit"
              disabled={
                busy || !name.trim() || (mode === "join" && code.length !== 6)
              }
            >
              {busy
                ? "Connecting…"
                : mode === "join"
                  ? "Join room"
                  : mode === "practice"
                    ? "Begin practice"
                    : "Create room"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
