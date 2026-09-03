import { describe, expect, it } from "vitest";
import {
  gameReducer,
  type GameState,
  type GameAction,
} from "../contexts/GameContext.js";
import type { RoomView } from "@buzzroom/shared";

// ── helpers ───────────────────────────────────────────────────────────────

const initial: GameState = {
  screen: "landing",
  room: null,
  myPlayerId: null,
  leaderboard: [],
  errorMessage: null,
  hostGone: false,
  roundResult: null,
  lockout: null,
};

function makeRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: "room-1",
    roomCode: "ABCDEF",
    hostPlayerId: "host-1",
    players: [
      { playerId: "host-1", name: "Host", score: 0, isConnected: true },
    ],
    round: null,
    ...overrides,
  };
}

function dispatch(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

// ── ROOM_CREATED ──────────────────────────────────────────────────────────

describe("ROOM_CREATED", () => {
  it("switches to host screen with the room", () => {
    const room = makeRoom();
    const next = dispatch(initial, {
      type: "ROOM_CREATED",
      room,
      myPlayerId: "host-1",
    });
    expect(next.screen).toBe("host");
    expect(next.room?.roomCode).toBe("ABCDEF");
    expect(next.myPlayerId).toBe("host-1");
  });
});

// ── JOINED ────────────────────────────────────────────────────────────────

describe("JOINED", () => {
  it("switches to host screen when myPlayerId === hostPlayerId", () => {
    const room = makeRoom();
    const next = dispatch(initial, {
      type: "JOINED",
      room,
      myPlayerId: "host-1",
    });
    expect(next.screen).toBe("host");
  });

  it("switches to player screen for non-hosts", () => {
    const room = makeRoom({
      players: [
        { playerId: "host-1", name: "Host", score: 0, isConnected: true },
        { playerId: "p2", name: "Alice", score: 0, isConnected: true },
      ],
    });
    const next = dispatch(initial, { type: "JOINED", room, myPlayerId: "p2" });
    expect(next.screen).toBe("player");
  });
});

// ── PLAYER_JOINED ─────────────────────────────────────────────────────────

describe("PLAYER_JOINED", () => {
  it("adds a new player to the room", () => {
    const room = makeRoom();
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, {
      type: "PLAYER_JOINED",
      player: { playerId: "p2", name: "Alice", score: 0, isConnected: true },
    });
    expect(next.room?.players).toHaveLength(2);
    expect(next.room?.players[1]?.name).toBe("Alice");
  });

  it("updates an existing player (reconnect case)", () => {
    const room = makeRoom({
      players: [
        { playerId: "host-1", name: "Host", score: 0, isConnected: true },
        { playerId: "p2", name: "Alice", score: 3, isConnected: false },
      ],
    });
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, {
      type: "PLAYER_JOINED",
      player: { playerId: "p2", name: "Alice", score: 3, isConnected: true },
    });
    expect(next.room?.players).toHaveLength(2);
    expect(
      next.room?.players.find((p) => p.playerId === "p2")?.isConnected,
    ).toBe(true);
  });
});

// ── PLAYER_LEFT ───────────────────────────────────────────────────────────

describe("PLAYER_LEFT", () => {
  it("marks the player as disconnected", () => {
    const room = makeRoom({
      players: [
        { playerId: "host-1", name: "Host", score: 0, isConnected: true },
        { playerId: "p2", name: "Alice", score: 0, isConnected: true },
      ],
    });
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, { type: "PLAYER_LEFT", playerId: "p2" });
    expect(
      next.room?.players.find((p) => p.playerId === "p2")?.isConnected,
    ).toBe(false);
  });
});

// ── HOST_LEFT ─────────────────────────────────────────────────────────────

describe("HOST_LEFT", () => {
  it("sets hostGone flag", () => {
    const room = makeRoom();
    const state: GameState = {
      ...initial,
      screen: "player",
      room,
      myPlayerId: "p2",
    };
    const next = dispatch(state, { type: "HOST_LEFT" });
    expect(next.hostGone).toBe(true);
  });
});

// ── ROUND_OPENED / CLOSED / RESET ─────────────────────────────────────────

describe("round lifecycle", () => {
  const roundView = {
    roundId: "r1",
    status: "open" as const,
    modeParams: { mode: "button" as const },
    activePlayerId: null,
    buzzOrder: [],
  };

  it("ROUND_OPENED: sets room.round and clears roundResult", () => {
    const room = makeRoom();
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
      roundResult: { winnerPlayerId: "x", winnerName: "X", pointsAwarded: 1 },
    };
    const next = dispatch(state, { type: "ROUND_OPENED", round: roundView });
    expect(next.room?.round?.roundId).toBe("r1");
    expect(next.roundResult).toBeNull();
  });

  it("ROUND_CLOSED: sets status to closed", () => {
    const room = makeRoom({ round: roundView });
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, { type: "ROUND_CLOSED" });
    expect(next.room?.round?.status).toBe("closed");
  });

  it("ROUND_RESET: clears round", () => {
    const room = makeRoom({ round: roundView });
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, { type: "ROUND_RESET" });
    expect(next.room?.round).toBeNull();
  });
});

// ── BUZZ_ORDER_UPDATED ────────────────────────────────────────────────────

describe("BUZZ_ORDER_UPDATED", () => {
  it("replaces buzzOrder in the current round", () => {
    const round = {
      roundId: "r1",
      status: "open" as const,
      modeParams: { mode: "button" as const },
      activePlayerId: null,
      buzzOrder: [],
    };
    const room = makeRoom({ round });
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const entry = {
      rank: 1,
      playerId: "p2",
      playerName: "Alice",
      eliminated: false,
      adjustedTime: 1000,
      nearTie: false,
      mode: "button" as const,
    };
    const next = dispatch(state, {
      type: "BUZZ_ORDER_UPDATED",
      buzzOrder: [entry],
      activePlayerId: "p2",
    });
    expect(next.room?.round?.buzzOrder).toHaveLength(1);
    expect(next.room?.round?.activePlayerId).toBe("p2");
  });
});

// ── SCORE_UPDATED ─────────────────────────────────────────────────────────

describe("SCORE_UPDATED", () => {
  it("updates players and leaderboard", () => {
    const room = makeRoom();
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, {
      type: "SCORE_UPDATED",
      players: [
        { playerId: "host-1", name: "Host", score: 5, isConnected: true },
      ],
      leaderboard: [
        {
          rank: 1,
          playerId: "host-1",
          name: "Host",
          score: 5,
          isConnected: true,
          isTied: false,
        },
      ],
    });
    expect(next.room?.players[0]?.score).toBe(5);
    expect(next.leaderboard[0]?.score).toBe(5);
  });
});

// ── ERROR / LEAVE ─────────────────────────────────────────────────────────

describe("ERROR and LEAVE", () => {
  it("ERROR sets errorMessage", () => {
    const next = dispatch(initial, {
      type: "ERROR",
      message: "Something went wrong",
    });
    expect(next.errorMessage).toBe("Something went wrong");
  });

  it("CLEAR_ERROR clears errorMessage", () => {
    const state: GameState = { ...initial, errorMessage: "oops" };
    const next = dispatch(state, { type: "CLEAR_ERROR" });
    expect(next.errorMessage).toBeNull();
  });

  it("LEAVE resets to initial (minus sessionStorage side-effect)", () => {
    const room = makeRoom();
    const state: GameState = {
      ...initial,
      screen: "host",
      room,
      myPlayerId: "host-1",
    };
    const next = dispatch(state, { type: "LEAVE" });
    expect(next.screen).toBe("landing");
    expect(next.room).toBeNull();
  });
});

// ── hostGone lifecycle ────────────────────────────────────────────────────

describe("hostGone", () => {
  const joined: GameState = {
    ...initial,
    screen: "player",
    room: makeRoom({
      players: [
        { playerId: "host-1", name: "Host", score: 0, isConnected: false },
        { playerId: "p2", name: "Alice", score: 0, isConnected: true },
      ],
    }),
    myPlayerId: "p2",
    hostGone: true,
  };

  it("stays set when a non-host player rejoins", () => {
    const next = dispatch(joined, {
      type: "PLAYER_JOINED",
      player: { playerId: "p3", name: "Bob", score: 0, isConnected: true },
    });
    expect(next.hostGone).toBe(true);
  });

  it("clears when the host themselves rejoins", () => {
    const next = dispatch(joined, {
      type: "PLAYER_JOINED",
      player: { playerId: "host-1", name: "Host", score: 0, isConnected: true },
    });
    expect(next.hostGone).toBe(false);
  });
});

// ── RECONNECTED ───────────────────────────────────────────────────────────

describe("RECONNECTED", () => {
  it("keeps the leaderboard already on screen", () => {
    const withScores: GameState = {
      ...initial,
      screen: "player",
      room: makeRoom(),
      myPlayerId: "p2",
      leaderboard: [
        {
          rank: 1,
          playerId: "p2",
          name: "Alice",
          score: 4,
          isConnected: true,
          isTied: false,
        },
      ],
    };

    const next = dispatch(withScores, {
      type: "RECONNECTED",
      room: makeRoom(),
      myPlayerId: "p2",
    });

    expect(next.leaderboard).toHaveLength(1);
    expect(next.leaderboard[0]?.score).toBe(4);
  });

  it("clears a stale error and the host-gone banner", () => {
    const stale: GameState = {
      ...initial,
      screen: "player",
      room: makeRoom(),
      myPlayerId: "p2",
      errorMessage: "Connection lost",
      hostGone: true,
    };

    const next = dispatch(stale, {
      type: "RECONNECTED",
      room: makeRoom(),
      myPlayerId: "p2",
    });

    expect(next.errorMessage).toBeNull();
    expect(next.hostGone).toBe(false);
  });
});

// ── EARLY_BUZZ_PENALTY ────────────────────────────────────────────────────

describe("EARLY_BUZZ_PENALTY", () => {
  it("records a deadline in the future and the offense count", () => {
    const before = Date.now();
    const next = dispatch(initial, {
      type: "EARLY_BUZZ_PENALTY",
      lockedForMs: 500,
      offenseCount: 2,
    });

    expect(next.lockout?.offenseCount).toBe(2);
    expect(next.lockout!.until).toBeGreaterThanOrEqual(before + 500);
  });

  it("is cleared when the next round opens", () => {
    const locked = dispatch(
      { ...initial, room: makeRoom() },
      { type: "EARLY_BUZZ_PENALTY", lockedForMs: 500, offenseCount: 1 },
    );
    expect(locked.lockout).not.toBeNull();

    const next = dispatch(locked, {
      type: "ROUND_OPENED",
      round: {
        roundId: "r1",
        status: "open",
        modeParams: { mode: "button" },
        activePlayerId: null,
        buzzOrder: [],
      },
    });

    expect(next.lockout).toBeNull();
  });
});
