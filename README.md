# BuzzRoom

A latency-fair buzzer app for game shows and game nights. See
[`docs/spec.md`](./docs/spec.md) for the full product/technical spec.

## Project structure

This is an npm-workspaces monorepo: one repo, three packages, one shared
dependency tree.

```
packages/
  shared/   TypeScript types shared between server and client
            (the WebSocket protocol -- added in a later phase)
  server/   Node.js + TypeScript backend (Express + Socket.io)
  client/   React + TypeScript frontend (Vite -- added in a later phase)
```

**Why a monorepo for a project this size?** One git history, one CI pipeline,
and -- most importantly -- the server and client can both import the _same_
type definitions for every WebSocket message from `packages/shared`, instead
of maintaining two hand-written copies of the protocol that can quietly drift
apart.

## Status

Phase 2: minimal backend skeleton. The server boots, serves a `/health`
check, and accepts Socket.io connections (no rooms or buzz logic yet --
that's Phase 3). Both are covered by real tests now, not placeholders.

## Setup

```bash
npm install
cp packages/server/.env.example packages/server/.env
```

## Scripts (run from the repo root)

| Command                | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run lint`         | Lint every package                                   |
| `npm run format`       | Auto-format every package with Prettier              |
| `npm run format:check` | Check formatting without changing files (used in CI) |
| `npm test`             | Run tests in every package that has them             |

## Running the server

```bash
cd packages/server
npm run dev
```

Then in another terminal: `curl http://localhost:3001/health`

Per-package dev commands for the client will be added once it has anything
to talk to.
