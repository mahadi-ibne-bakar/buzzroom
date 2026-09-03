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
  server/   Node.js + TypeScript backend (Socket.io -- added in a later phase)
  client/   React + TypeScript frontend (Vite)
```

**Why a monorepo for a project this size?** One git history, one CI pipeline,
and -- most importantly -- the server and client can both import the _same_
type definitions for every WebSocket message from `packages/shared`, instead
of maintaining two hand-written copies of the protocol that can quietly drift
apart.

## Status

Phase 1: project scaffolding only. No application logic yet -- this commit
just proves the tooling (TypeScript, ESLint, Prettier, Vitest, CI) all work
together correctly.

## Setup

```bash
npm install
```

## Scripts (run from the repo root)

| Command                | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run lint`         | Lint every package                                   |
| `npm run format`       | Auto-format every package with Prettier              |
| `npm run format:check` | Check formatting without changing files (used in CI) |
| `npm test`             | Run tests in every package that has them             |

Per-package dev commands (run inside `packages/client`, etc.) will be added
as each package gains real functionality.
