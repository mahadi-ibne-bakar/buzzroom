# BuzzRoom

A latency-fair buzzer app for game shows and game nights. See
[`docs/spec.md`](./docs/spec.md) for the full product/technical spec.

## Project structure

This is an npm-workspaces monorepo: one repo, three packages, one shared
dependency tree.

```
packages/
  shared/   TypeScript types and Zod schemas for the WebSocket protocol,
            imported by both sides
  server/   Node.js + TypeScript backend (Express + Socket.io)
  client/   React + TypeScript frontend (Vite + Tailwind)
```

**Why a monorepo for a project this size?** One git history, one CI pipeline,
and -- most importantly -- the server and client can both import the _same_
type definitions for every WebSocket message from `packages/shared`, instead
of maintaining two hand-written copies of the protocol that can quietly drift
apart.

## Status

Feature-complete against the v1 scope in the spec.

- **Rooms** — create/join by 6-character code or QR scan, name sanitising and
  duplicate detection, a 20-player cap, and idle-room expiry.
- **Rounds** — host opens, closes and resets the buzz window, works down the
  ranked queue marking answers correct or wrong, and sets what each question
  is worth.
- **Buzz window** — per-room toggle between **locked** (a buzz only counts once
  the host opens the window; buzzing early earns a lockout) and **free**
  (players buzz whenever they like, including before the host opens anything —
  the first buzz opens the round — with no penalty).
- **Buzz-in modes** — button, slide and pattern. The gesture parameters are
  generated fresh every time the host opens a round and must be echoed back
  with the buzz, so no one can pre-practise the specific gesture.
- **Fairness engine** — NTP-style clock sync on a 2s heartbeat during a round,
  ranking by latency-corrected `adjustedTime` rather than packet arrival,
  near-tie flagging within 50ms, and server-side clamping so a client cannot
  win by backdating its timestamp.
- **Early-buzz penalty** — escalating lockout (0.5s → 1s → 1.5s) with a
  countdown on the player's buzzer and a haptic nudge where supported. Applies
  in locked mode only.
- **Connection quality** — each client reports its measured round-trip time on
  its next clock sync; the host sees a live per-player indicator and each
  player sees their own.
- **Scoring** — per-player scores, manual award/deduct, and a live leaderboard
  using standard competition ranking (1-1-3).
- **Reconnect** — a player who drops comes back on the same `playerId` with
  their score and any buzz they already made intact; a host disconnect pauses
  the game rather than ending it.

Deferred to post-v1 by the spec itself (§13): team mode, a separate presenter
view, a native app wrapper, saved question banks, sound and theming, the
audience agree/disagree mechanic, and multi-server scaling.

## Setup

```bash
npm install
cp packages/server/.env.example packages/server/.env
```

## Scripts (run from the repo root)

| Command                | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run lint`         | Lint every package                                   |
| `npm run typecheck`    | Type-check every package                             |
| `npm run format`       | Auto-format every package with Prettier              |
| `npm run format:check` | Check formatting without changing files (used in CI) |
| `npm test`             | Run tests in every package that has them             |

## Running it

Two terminals, from the repo root:

```bash
npm run dev -w @buzzroom/server
```

```bash
npm run dev -w @buzzroom/client
```

The server listens on `http://localhost:3001` (`curl
http://localhost:3001/health` to check) and the client on
`http://localhost:5173`. Open the client in two browser windows to play both
sides: host a game in one, join with the room code in the other.

Point the client at a different backend with `VITE_SERVER_URL`.
