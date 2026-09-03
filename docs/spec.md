# BuzzRoom — Product & Technical Spec (v1)

_(Working name — swap in whatever you want to call it. Everything below is name-agnostic.)_

A web app (no install, works in any mobile/desktop browser) where one person hosts a live buzzer round and everyone else joins from their own phone. The app's core job: capture who buzzed in first — and second, and third — accurately, regardless of whose phone or internet connection is worse, then let the host run the round and track points through it.

---

## 1. Roles

- **Host** — runs the session from their own device. Reads questions out loud (or however they want), controls when buzzing is open, picks the buzz-in mode per round, sees the ranked buzz order, awards points.
- **Player** — joins a room from their phone, buzzes in using whichever mode the host selected, sees their own status (waiting / locked out / their rank / score).

One device can theoretically be both (host plays too), but v1 assumes a dedicated host who isn't also competing.

---

## 2. Core concepts

| Term           | Meaning                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Room**       | A single game session, identified by a short join code (e.g. `7KQ2`) or QR code. Holds the player list, scores, and current round state. |
| **Round**      | One question's buzz-in cycle: opened → players buzz → resolved (host moves on or resets).                                                |
| **Buzz event** | A single player's buzz-in attempt for the current round, carrying a fairness-adjusted timestamp (see §8).                                |
| **Buzz order** | The ranked list of buzz events for the current round, soonest-adjusted-time first.                                                       |

---

## 3. Tech stack (recommendation)

- **Frontend**: Plain web app, mobile-first responsive layout. A Progressive Web App (installable via "Add to Home Screen") is a nice optional upgrade later, but not required for v1 — it just needs to load fast in mobile Safari/Chrome.
- **Realtime transport**: WebSockets (Socket.io recommended over raw `ws` for built-in reconnection handling) — not a polling-based service. The fairness mechanism in §8 needs tight control over round-trip timing, which is awkward to bolt onto a generic pub/sub backend.
- **Backend**: Node.js process holding room state in memory. One room = one lightweight in-memory object; no database required for v1 (sessions are ephemeral).
- **Hosting**: Needs a host that supports long-lived WebSocket connections (Render, Fly.io, Railway, a small VPS). Avoid pure serverless function platforms for the socket server itself — they're built for short-lived requests, not persistent connections.
- **Scaling note**: in-memory state is fine for casual use (one server process, dozens of rooms, tens of players each). If this ever needs to run across multiple server instances, you'd add a Redis pub/sub backplane — explicitly out of scope for v1.

---

## 4. Room & session flow

1. Host opens the app → taps **Host a game** → server generates a room code + QR code.
2. Players open the app on their phones → enter the code (or scan the QR) → enter a display name → join the room.
3. Host's screen shows a live player list as people join, with a connection-quality indicator per player (see §8 — this comes for free once clock sync is running, and it's good for trust: players can see their own ping too).
4. Host starts a round whenever ready.

---

## 5. Host controls

| Control                                       | Behavior                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Buzz window mode**                          | Toggle per round: **Free buzz** (players can buzz anytime, even before host opens it) vs **Locked** (buzzing only counts once host explicitly opens it).                                                                                                                                         |
| **Open / Close / Reset**                      | Open starts accepting buzzes. Close stops accepting new ones immediately. Reset clears the current round's buzz order and re-arms for the next question.                                                                                                                                         |
| **Buzz-in mode picker**                       | Per round, host picks which input mode applies (§6) — all players use the same mode for a given round.                                                                                                                                                                                           |
| **Early-buzz penalty** (optional, default on) | If a player buzzes while the round is in **Locked** mode and not yet open, their device shakes/vibrates and locks them out for a short cooldown (starts at ~0.5s, escalates on repeat offenses within the round). Discourages jumping the gun without being punitive on a single accidental tap. |
| **Advance / Award points**                    | Host taps the top-ranked player to "call on" them, then marks correct (awards points, round resolved) or wrong (that player is removed from the active queue, the next-ranked player becomes "up," buzzing for everyone else stays locked — no re-buzzing mid-round).                            |
| **Manual point adjustment**                   | Host can also award/deduct points free-form, independent of a buzz round (bonus points, penalties, etc.).                                                                                                                                                                                        |

---

## 6. Buzz-in modes (all three ship in v1)

| Mode                | Player action                                                | Timestamp captured at                                                                                       |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Simple button**   | Tap a big button                                             | The earliest raw touch/pointer-down event — not the higher-level "click," which has extra processing delay. |
| **Slide to unlock** | Drag a slider fully across                                   | The moment the slider crosses the completion threshold (gesture _finished_, not started).                   |
| **Pattern draw**    | Trace a short dot-to-dot pattern (like a phone lock pattern) | The moment the final correct dot is reached and the gesture is validated.                                   |

**Fairness note on the gesture-based modes**: the slide and pattern parameters (slider length, pattern shape/dot count) must be generated and broadcast to every player at the exact instant the host opens that round — never reusable from a previous round — so nobody can pre-practice the specific gesture before everyone else sees it. Even with that safeguard, these modes inherently introduce some device-dependent variance (screen size, touch responsiveness) that a flat button doesn't have. That's a reasonable trade for the added "skill round" fun factor, but it's worth the host knowing the simple button is the most purely lag-fair of the three, and the other two trade a sliver of that purity for variety.

---

## 7. The fairness engine (the part that actually makes this trustworthy)

This is the core technical problem: **a buzz timestamped on arrival at the server unfairly punishes whoever has worse internet**, because their packet simply takes longer to arrive — regardless of how fast they actually pressed. The fix is continuous clock synchronization between every player's phone and the server, similar in spirit to NTP (the protocol computers use to sync clocks across the internet).

### 7.1 Clock sync (continuous, per player)

1. On join, and then periodically (every ~5–10s while idle, more frequently — every ~2s — during an active round), the player's phone sends a `sync_ping` carrying its own local send time `t0`.
2. The server replies immediately with a `sync_pong` echoing `t0` plus the server's own clock reading `ts` at the moment it processed the ping.
3. The phone receives the reply at local time `t1`. Round-trip time `RTT = t1 - t0`.
4. Estimated clock offset for that phone:
   ```
   offset = ts - (t0 + RTT / 2)
   ```
   (This assumes the network delay is roughly symmetric in both directions — a standard, reasonable assumption for this use case.)
5. Take several samples and keep the one(s) with the **lowest RTT** (low RTT = least queuing/jitter, so it's the most trustworthy sample — this is the standard NTP trick). Discard high-RTT outliers rather than averaging them in.
6. Store a smoothed `offset` per player, refreshed on every sync cycle so it tracks any change in their network conditions.

### 7.2 Buzz event

When a player buzzes (per the trigger moments defined in §6):

1. The phone captures its own local high-resolution timestamp `localTime` at that instant.
2. It computes `adjustedTime = localTime + offset`.
3. It sends both values to the server in the buzz payload (raw `localTime` is kept for debugging/audit, `adjustedTime` is what actually gets used).

### 7.3 Server-side resolution

- The server collects all buzz events for the open round.
- It ranks them by **`adjustedTime`**, ascending — _not_ by the order packets happened to arrive at the server.
- If two adjusted times fall within a small margin (suggested default: 50ms, configurable), the server flags them as a near-tie rather than asserting false precision — display both to the host as "too close to call" and let the host's judgment break the tie.
- The full ranked list (not just first place) is what populates the buzz order, so when first place answers wrong, second place is already known and ready.

### 7.4 Why this matters in practice

Without this, a player on slow hotel wifi could press the button a full second before someone on great wifi, and still show up "second" at the server purely because their packet took longer to arrive. With offset correction, the server is comparing _when they actually pressed_, estimated in a shared clock, not _when their network finally delivered the news_.

---

## 8. Buzz queue & answering flow

1. Round opens → players buzz → server builds the ranked `adjustedTime` order in real time as buzzes come in.
2. Host sees the live-updating ranked list (not just whoever's "winning" at any moment — the full order so far).
3. Host calls on rank #1.
4. Host marks correct → round resolved, points awarded, move to next question.
5. Host marks wrong → rank #1 is removed from this round's active queue (they don't get to re-buzz), host calls on rank #2 automatically promoted, and so on. Buzzing stays locked for everyone the entire time — no new buzzes accepted mid-resolution, only progression through the existing order.

---

## 9. Scoring

- Points are tracked per player (team mode is a future enhancement, not v1 — see §13).
- Host can award points tied to a buzz-in result, or independently at any time (bonus points, manual corrections).
- A live leaderboard is visible on the host's screen at minimum; optionally pushed to players' own screens too (recommend on by default — it adds to the game-show feel).

---

## 10. Data model (server-side, in-memory)

```
Room {
  roomCode: string
  hostId: string
  players: Player[]
  settings: {
    buzzWindowMode: "free" | "locked"
    earlyBuzzPenalty: boolean
  }
  currentRound: Round | null
  createdAt: timestamp
}

Player {
  playerId: string
  name: string
  clockOffset: number        // ms, from sync protocol
  lastRtt: number             // ms, for the ping indicator
  score: number
  connectionStatus: "connected" | "disconnected"
}

Round {
  roundId: string
  buzzMode: "button" | "slide" | "pattern"
  modeParams: object          // e.g. generated pattern shape, broadcast at open time
  status: "idle" | "open" | "locked" | "resolved"
  openedAtServerTime: timestamp
  buzzOrder: [
    { playerId: string, adjustedTime: number, rank: number }
  ]
}
```

---

## 11. WebSocket protocol (event summary)

| Direction       | Event                           | Payload (key fields)                              |
| --------------- | ------------------------------- | ------------------------------------------------- |
| Host → Server   | `create_room`                   | host display info                                 |
| Host → Server   | `open_buzz`                     | `buzzMode`, `buzzWindowMode`                      |
| Host → Server   | `close_buzz` / `reset_round`    | —                                                 |
| Host → Server   | `advance_queue`                 | `result: "correct" \| "wrong"`                    |
| Host → Server   | `award_points`                  | `playerId`, `delta`                               |
| Player → Server | `join_room`                     | `roomCode`, `name`                                |
| Player → Server | `sync_ping`                     | `t0`                                              |
| Player → Server | `buzz`                          | `mode`, `localTime`, `adjustedTime`               |
| Server → Host   | `player_joined` / `player_left` | player info                                       |
| Server → Host   | `buzz_order_update`             | ranked list with adjusted times + ping per player |
| Server → Player | `sync_pong`                     | echoed `t0`, server time `ts`                     |
| Server → Player | `round_state`                   | `open` / `locked` / mode params                   |
| Server → Player | `your_rank`                     | this player's position once they've buzzed        |
| Server → All    | `score_update`                  | current leaderboard                               |

---

## 12. Edge cases & reliability

- **Reconnect mid-round**: player keeps a stable `playerId` (stored client-side); on reconnect they immediately re-run clock sync and rejoin the live state. A buzz they already submitted before disconnecting still stands.
- **Host disconnects**: round state pauses; v1 assumes a single host with no automatic host-migration to another device.
- **Room cleanup**: auto-expire rooms after a period of inactivity (e.g. 2 hours) to avoid leaking memory on the server.
- **Clock drift over a long session**: handled by the periodic re-sync in §7.1 — offsets stay fresh rather than being computed once at join time.
- **Mid-game joiners**: get a full state snapshot (current scores, room settings) immediately on joining.

---

## 13. V1 scope (locked) vs. future enhancements

**In v1:**

- Room create/join via code or QR
- Free-buzz vs. locked buzz window modes, full open/close/reset control
- All three buzz-in modes (button, slide, pattern), host-selectable per round
- Latency-compensated full ranked buzz order (§7–8)
- Early-buzz penalty option
- Individual scoring + live leaderboard
- Reconnect handling

**Explicitly deferred (not v1):**

- Team mode (grouping players, team scores)
- Separate big-screen "presenter" view distinct from the host's control screen
- Native mobile app wrapper (v1 is web-only, per your call)
- Saved question banks / persistent history across sessions
- Sound effects, themes, branding
- "Agree/disagree with the fastest player's answer" audience mechanic
- Multi-server scaling (Redis backplane) for very large events — v1 targets casual game-night sizes (roughly 2–30 players per room)

---

## 14. Open decisions for later

A few things intentionally left flexible, to settle once you start building:

- Exact slide length / pattern shape generation rules (how hard should these be by default?)
- Whether players see their own score live, or only the host does, during a round
- Whether a "too close to call" tie pauses the round for host judgment or just displays both names side by side and lets the host decide on the fly
