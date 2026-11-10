# Hexfront Command

A standalone multiplayer strategy game built with React, TypeScript, MUI, and React Router. Repository: [bmagee88/Hexfront](https://github.com/bmagee88/Hexfront). It has its own backend and does not depend on Cougar Cash or Padlet at runtime.

## Run locally

Requires Node 22.18+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite serves the frontend and proxies `/api` to the temporary room server on port 4007. Rooms live only in backend memory: no database, disk snapshots, or room persistence across backend restarts.

Create a room, share the code, and ready two to four commanders. The host can cycle connected random maps or compare six previews. Two/three commanders use 42 territories; four use 44. Three private basic tiles are dealt to each player. Snake turns place a hand tile anywhere empty and draw one replacement until every base is occupied. The maximum combined basic/special hand size is three. Solo practice adds a server-operated automaton. The in-app Field Manual explains the complete rules.

## Temporary rooms

The backend follows Cougar Cash Padlet's process-local `Map` storage pattern. Padlet's fixed one-hour lifetime is replaced here by a sliding **one-hour inactivity timeout**. Authenticated polls, joins, and accepted commands keep a room alive. Invalid requests and bots alone cannot extend its lifetime. Visible tabs poll approximately every 1.2 seconds; background tabs request a heartbeat approximately every 30 seconds when the browser permits timers to run.

A room is inaccessible exactly one hour after its last authenticated request. A background sweep removes expired rooms from memory every minute, even when no new requests arrive. Closing the last tab stops heartbeats, so the room expires within one hour; immediate tab-close deletion is not required or relied upon. Reconnecting before expiration restores the seat using its browser reconnect key. Restarting, redeploying, or suspending the backend can lose rooms sooner. Run exactly one backend process/instance; multiple independent memory servers cannot share rooms.

## Deploy: Netlify frontend and standalone room server

1. Create a separate Render Node web service from this repository, or import `render.yaml`. Build: `npm ci --include=dev`; start: `npm start`; health check: `/api/health`; one instance. No database or persistent disk is needed.
2. Set the backend's `ALLOWED_ORIGIN` to the exact HTTPS origin of the Hexfront Netlify site, without a trailing slash. The server binds to `0.0.0.0` and uses Render's `PORT`.
3. Import this repository as a separate Netlify project. Build: `npm run build`; publish: `dist`. Set the Netlify build variable `VITE_API_BASE_URL` to the new backend's HTTPS origin, without `/api`, then deploy/rebuild.
4. Test the health endpoint, direct `/room/:code` and `/rules` reloads, multiplayer synchronization, private hands, reactions, and reconnects.

`netlify.toml` provides the SPA fallback; Netlify Functions and PostgreSQL are no longer used. `render.yaml` uses the Free plan; backend sleep/restarts may clear in-memory rooms. Use a continuously running service if reconnecting during the full idle hour is required. Actual hosted deployment and URLs still require account configuration and verification.

References: [Render web services](https://render.com/docs/web-services), [Render Blueprint configuration](https://render.com/docs/blueprint-spec).

## Map generation

Map generation scores the classic Risk neighbor distribution (2/3/4/5/6 neighbors: 4/13/13/5/7 territories; average 3.95), scaled for 44 bases. Seeded randomized growth and boundary relocation favor 3–4 neighbors while keeping the board and all six regions connected. Host previews display each map's actual neighbor statistics.

## Routes and authority

The frontend uses Cougar Cash's `BrowserRouter`, lazy imports, `Suspense`, and explicit routes convention. `/` creates/joins rooms; `/room/:code` hosts the lobby and game; `/rules` shows the manual. The backend exposes `/api/health`, `POST /api/rooms`, `POST /api/rooms/:code/join`, authenticated `GET /api/rooms/:code`, and versioned `POST /api/rooms/:code/action`.

`shared/engine.ts` validates actors, turns, phases, resources, cards, alliances, geometry, and capacity. `shared/types.ts` defines serializable entities; `shared/cards.ts` contains prices and abilities. Synchronous in-memory transactions use copies to prevent failed validation from mutating stored rooms. UUID command IDs deduplicate retries; stale versions return HTTP 409. Timers and bots progress when clients poll. Pausing suspends reactions and renews their deadline on resume.

Reconnect tokens are random bearer keys stored only as hashes on the server. Clients receive their own private hand plus public state. Secret entropy, deck order, other hands, and private command history never reach other players or public exports. Requests use strict schemas, bounded payloads, room-code validation, CORS origin checks, and per-process rate limits. API responses use `no-store`.

## Validation

```sh
npm test
npm run build
npm run dev
# In a second terminal:
npm run test:e2e
```

Tests cover the engine, three-tile cap, randomized maps, complete bot matches, privacy, validation, concurrent commands, reconnects, one-hour inactivity expiry, background cleanup, and cross-origin preflight. Browser checks exercise three/four independent players, the map chooser, draft, combat, reconnects, and mobile layout. Browser networking may require normal local permissions on restricted Windows systems.

See `RULE_DECISIONS.md` for explicit game-rule decisions. `BUILD_SPECIFICATION.md` preserves the original reference prompt; subsequent user changes supersede it.
