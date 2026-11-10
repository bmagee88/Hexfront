# Hexfront Command

Standalone multiplayer strategy game: React, TypeScript, MUI, and React Router. Repository: [bmagee88/Hexfront](https://github.com/bmagee88/Hexfront). Hosted entirely on Netlify, with no Render service or separate database server.

## Local development

Node 22.18+ and npm:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to port 4007. Local rooms use process memory and disappear when the local backend restarts. Production rooms use temporary Netlify Blobs storage, shared across Netlify Function instances.

Create a room, share its code, and ready two to four commanders. The host cycles connected random maps or compares six previews. Two/three commanders use 42 territories; four use 44. Three private basics are dealt to each player. Snake turns place a hand tile anywhere empty and draw one replacement until every base is occupied. The combined basic/special hand limit is three. Solo practice adds a server-operated automaton. The Field Manual explains the full rules.

## One-hour room expiry

Authenticated polls, valid joins, and accepted commands renew the room's activity timestamp. Visible tabs poll approximately every 1.2 seconds; background tabs heartbeat approximately every 30 seconds when browser timers permit. Invalid requests and bots without connected clients cannot keep rooms alive.

Rooms expire exactly one hour after their last activity and cannot be rejoined after that point. Requests remove expired rooms immediately; a Netlify scheduled function sweeps abandoned rooms every five minutes even when no one visits. Cleanup conditionally claims expired state before deletion, protecting rooms refreshed by a concurrent heartbeat. There is no permanent game archive. Reconnecting before expiry restores the player's seat using the browser reconnect key.

## Netlify deployment

Import this repository into the existing `hexfront.netlify.app` project and deploy `main`. Build: `npm run build`; publish: `dist`; Functions: `netlify/functions`. `netlify.toml` routes `/api/*` to the room API before the SPA fallback. No external backend URL, Render account, SQL database, or database migration is required. Remove any old `VITE_API_BASE_URL` build variable so the frontend uses its own `/api` endpoints.

The `@netlify/blobs` SDK obtains server-side credentials from the Netlify Functions environment. Strongly consistent reads and atomic conditional writes protect complete room snapshots across independent Function instances. Creation is conditional on the code being absent. Updates retry against fresh state on a storage conflict; stale game versions return HTTP 409, and command UUIDs deduplicate retries. A successful write must include a confirming ETag. Private room state is never placed in static assets or returned to unauthorized clients.

Production and preview stores are separated. Scheduled cleanup runs on published production deploys. `/api/health` reports the storage mode and 3,600-second timeout. Verify that endpoint and actual room creation after deployment; a successful static build alone does not prove the backend works.

Official references: [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).

## Map generation

Generation scores the classic Risk neighbor distribution (2/3/4/5/6 neighbors: 4/13/13/5/7 territories; average 3.95), scaled for 44 bases. Seeded growth and boundary relocation favor 3–4 neighbors while keeping the board and all six regions connected. Host previews display actual neighbor statistics.

## Routes and authority

The frontend follows Cougar Cash's `BrowserRouter`, lazy imports, `Suspense`, and explicit routes convention. `/` creates/joins rooms; `/room/:code` hosts the lobby and game; `/rules` shows the manual. The backend provides `/api/health`, `POST /api/rooms`, `POST /api/rooms/:code/join`, authenticated `GET /api/rooms/:code`, and versioned `POST /api/rooms/:code/action`.

`shared/engine.ts` validates actors, turns, phases, resources, cards, alliances, geometry, and capacity. `shared/types.ts` defines serializable entities; `shared/cards.ts` contains prices and abilities. Failed validation cannot mutate stored rooms. Server timers and bots progress when clients poll. Pausing suspends reactions and renews their deadline on resume.

Reconnect tokens are random bearer keys stored only as hashes on the server. Clients receive their own hand and public state. Secret entropy, deck order, other hands, and private command history never reach other players or public exports. Requests use strict schemas, bounded payloads, room-code validation, and per-instance rate limits. Responses use `no-store`.

## Validation

```sh
npm test
npm run build
npm run dev
# In a second terminal:
npm run test:e2e
```

Tests cover the engine, three-tile cap, maps, bot matches, privacy, concurrent API orders across Function instances, reconnects, one-hour expiry, cleanup races, and client routing. Browser checks exercise three/four independent players, map selection, draft, combat, reconnects, and mobile layout. Restricted Windows environments may require normal local permissions for browser networking.

`RULE_DECISIONS.md` documents explicit rules. `BUILD_SPECIFICATION.md` preserves the original prompt; later user changes supersede it.
