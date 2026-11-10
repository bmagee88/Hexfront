# Hexfront Command

A standalone multiplayer strategy game built with React, TypeScript, MUI, and React Router. Its own repository is [bmagee88/Hexfront](https://github.com/bmagee88/Hexfront). It does not import or run Cougar Cash, Rabbit Hole, or their backend services.

## Run locally

Requires Node 22.18+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. This single command starts Vite and the authoritative API on port 4007. Local rooms are stored as atomic snapshots under ignored `data/`. Restarting the server preserves seats, hands, turns, and reactions. Use separate browser profiles or private windows for separate commanders; a browser profile retains one reconnect key per room.

Create a room, share the code, and ready two to four commanders. The host cycles random contiguous maps or previews six in a modal and chooses one. Use 42 territories with two/three commanders or 44 with four; both counts divide evenly. All bases start empty. Deal three basics each, then take snake turns placing any hand tile anywhere empty and drawing one replacement. Fill the entire board before round-one production and normal turns. The host may spectate or add bots. Solo practice starts a two-player campaign against a server-operated automaton. Use the in-app Field Manual for rules and examples. Mobile has Board, Orders, and private Hand navigation.

## Map generation

Map generation scores the full classic Risk neighbor distribution (2/3/4/5/6 neighbors: 4/13/13/5/7 territories; average 3.95), scaled for 44 bases. Seeded randomized growth and boundary relocation favor 3–4 neighbors and fewer fully surrounded hexes while keeping the board and all six regions connected. Each lobby preview shows its actual neighbor statistics. Existing lobbies adopt the new generator; active campaigns retain their boards.

## Routes

The routing follows Cougar Cash's `BrowserRouter` + lazy imports + `Suspense` + explicit `Routes` convention, with Netlify's SPA fallback:

| Route                     | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `/`                       | Create, Join, Solo Practice                         |
| `/room/:code`             | Lobby, draft, campaign, spectator, results          |
| `/rules`                  | Rules, scenario walkthroughs, all fifteen abilities |
| `/api/health`             | API health                                          |
| `/api/rooms`              | Create a room (POST)                                |
| `/api/rooms/:code/join`   | Join as a commander or spectator (POST)             |
| `/api/rooms/:code`        | Authenticated per-player snapshot (GET)             |
| `/api/rooms/:code/action` | Versioned, idempotent typed order (POST)            |

## Deploy to its own Netlify subdomain

Import **this repository** into your Netlify account as a new project. Choose `hexfront-command` as the site name if available, producing `https://hexfront-command.netlify.app`. That is an intended name, not a claim that the site has already been provisioned. `netlify.toml` sets build `npm run build`, publish `dist`, Node 22, API routing before the SPA fallback, and function bundling. Connect the `main` branch for automatic deployment on pushes.

The app uses **Netlify Functions plus managed Postgres**. The installed `@netlify/database` package enables Netlify Database provisioning on a compatible credit-based plan. The committed migration under `netlify/database/migrations/` creates the room table during deployment. Database credentials stay server-side. Verify Database is enabled in the project and that the migration succeeds before testing rooms. Do not publish a static-only upload of `dist/`: it cannot run multiplayer.

Alternatively, use the official Netlify CLI:

```sh
npx netlify-cli login
npx netlify-cli init
# Link this standalone GitHub repo to a new Netlify project.
npx netlify-cli database init --yes
npx netlify-cli deploy --build --prod
```

Review generated starter migration files if `database init` adds them; preserve the existing Hexfront migration. Do not reset an existing production database. No extra Render/Railway server, Firebase project, or account login is required for players. Optional `DATABASE_URL` allows an external Postgres; apply the committed migration through that provider's migration workflow. No client environment secret or hardcoded API hostname is needed.

After deployment, verify `/api/health`, direct reload of `/room/:code` and `/rules`, a three-player room, independent private hands, reaction pass/guard, and reload/reconnect. The deployed URL and production database have **not** been verified until Netlify authorization and deployment succeed.

Official references: [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/), [database setup](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/), [migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/), [SPA rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

## Authority, persistence, and transport

`shared/engine.ts` is a deterministic command reducer. `shared/types.ts` defines serializable entities; `shared/cards.ts` is the typed ability/price registry; `shared/map.ts` contains browser-safe geometry. React never receives the authoritative Room or submits replacement state. Every action validates actor, turn, phase, resources, cards, alliance status, geometry, capacity, and applicable effects.

The API uses authenticated, versioned HTTP snapshots about every 1.2 seconds. This is live polling, not Socket.IO or WebSockets; it works within Netlify Functions' short-lived request model. Server timers are persisted deadlines resolved by the next request, including spectator requests. Bots also run on server requests, so closing all clients suspends progress until someone reconnects. Pausing suspends reactions; resuming renews their configured window.

Production room operations use Postgres transactions, a room-scoped advisory lock, and row locks. Creation is locked even before the row exists. No two clients can mutate the same turn simultaneously. UUID action IDs deduplicate retries; stale versions return HTTP 409 instead of silently applying old decisions. Local storage uses a serialized per-room queue and atomic rename, intended for a single local API process. Deployment must use Postgres, never local disk in a Function.

Reconnect tokens are 256-bit random bearer keys whose SHA-256 hashes are stored server-side. Only a player's own hand is serialized. Spectators receive no private cards, deck order, RNG state, tokens, or pending private command transcript. Server-generated 256-bit entropy is mixed with the host seed through a SHA-256 counter RNG. The public seed alone cannot reconstruct secret draws. Entropy and the private command transcript remain server-side even after victory. Public downloads contain the host seed and basic public log, so spectators cannot reconstruct unseen cards. Rematches rotate entropy. Authorized server operators can audit private snapshots; players and public hosts receive no such access.

Anonymous room names are bounded strings rendered through React text escaping. Requests use strict Zod schemas, bounded payloads, room-code validation, and per-process rate limits (1,200 requests/IP/minute, 12 creates/IP/minute, 100 orders/seat/minute). These counters are best-effort per Function instance; use Netlify traffic controls if stronger global abuse protection is needed. API responses are `no-store`. Rooms expire after 24 hours without requests; room creation removes expired database records, and local mode also performs hourly cleanup.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run dev                 # keep running in another terminal
npm run test:e2e
npx tsx scripts/simulate.ts repeatable 1000
```

Engine/API tests exercise setup, bags, hands, all fifteen abilities, caps, combat, reactions, alliances, betrayal, rebels, prestige, victory, command replay, private serialization, forged tokens, strict input validation, concurrent duplicate commands, stale commands, durable reconnection, and a complete server-bot campaign through winner declaration. Browser tests use independent contexts for three and four players, draft, combat, synchronized snapshots, reload/reconnect, direct routes, and phone layout. Test screenshots are written to ignored `test-results/`.

On locked-down Windows sandboxes, atomic file rename and browser networking may require running the tests with normal local permissions. Production Postgres provisioning, hosted function routing, and hosted concurrency still require a real Netlify deployment verification.

## Scope

The canonical baseline is playable, including all fifteen abilities, formal diplomacy, rebels, scoring, and individual victory. Earlier experimental variants are deliberately deferred and unavailable; there are no nonfunctional variant toggles. There is no built-in chat, human negotiation/payment market, host rollback, or native touch-drag requirement. Resource gifts can compensate rebel support using the legal Transfer action. See `RULE_DECISIONS.md` for exact interpretations and limits.
