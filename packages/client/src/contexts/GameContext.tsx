import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import type {
  BuzzEntryView,
  BuzzOrderUpdatedPayload,
  EarlyBuzzPenaltyPayload,
  JoinOkPayload,
  PingUpdatePayload,
  LeaderboardEntry,
  ModeParams,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerView,
  ReconnectOkPayload,
  RoomCreatedPayload,
  RoomSettingsView,
  RoomView,
  RoundOpenedPayload,
  RoundResolvedPayload,
  RoundView,
  ScoreUpdatePayload,
  ServerErrorPayload,
  SettingsUpdatedPayload,
} from "@buzzroom/shared";
import { useSocket } from "./SocketContext.js";

// ── State ─────────────────────────────────────────────────────────────────

export interface GameState {
  screen: "landing" | "host" | "player";
  room: RoomView | null;
  myPlayerId: string | null;
  leaderboard: LeaderboardEntry[];
  errorMessage: string | null;
  hostGone: boolean;
  roundResult: {
    winnerPlayerId: string;
    winnerName: string;
    pointsAwarded: number;
  } | null;
  // Set when the server applies an early-buzz penalty. `until` is a local
  // epoch-ms deadline, so components can render a countdown without asking
  // the server again.
  lockout: { until: number; offenseCount: number } | null;
  // Latest round-trip time per playerId, as reported by each client and fanned
  // out by the server. Kept out of `room.players` so a ping refresh every
  // couple of seconds doesn't churn the player list.
  pings: Record<string, number | null>;
}

const initial: GameState = {
  screen: "landing",
  room: null,
  myPlayerId: null,
  leaderboard: [],
  errorMessage: null,
  hostGone: false,
  roundResult: null,
  lockout: null,
  pings: {},
};

// ── Actions ───────────────────────────────────────────────────────────────

export type GameAction =
  | { type: "ROOM_CREATED"; room: RoomView; myPlayerId: string }
  | { type: "JOINED"; room: RoomView; myPlayerId: string }
  | { type: "RECONNECTED"; room: RoomView; myPlayerId: string }
  | { type: "PLAYER_JOINED"; player: PlayerView }
  | { type: "PLAYER_LEFT"; playerId: string }
  | { type: "HOST_LEFT" }
  | { type: "ROUND_OPENED"; round: RoundView }
  | { type: "ROUND_CLOSED" }
  | { type: "ROUND_RESET" }
  | {
      type: "BUZZ_ORDER_UPDATED";
      buzzOrder: BuzzEntryView[];
      activePlayerId: string | null;
    }
  | {
      type: "SCORE_UPDATED";
      players: PlayerView[];
      leaderboard: LeaderboardEntry[];
    }
  | {
      type: "ROUND_RESOLVED";
      winnerPlayerId: string;
      winnerName: string;
      pointsAwarded: number;
    }
  | { type: "EARLY_BUZZ_PENALTY"; lockedForMs: number; offenseCount: number }
  | { type: "SETTINGS_UPDATED"; settings: RoomSettingsView }
  | { type: "PING_UPDATE"; pings: PingUpdatePayload["pings"] }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "LEAVE" };

// ── Reducer ───────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "ROOM_CREATED":
      return {
        ...initial,
        screen: "host",
        room: action.room,
        myPlayerId: action.myPlayerId,
      };

    case "JOINED":
    case "RECONNECTED": {
      const isHost = action.myPlayerId === action.room.hostPlayerId;
      // Keep the leaderboard and any round result already on screen. A
      // RECONNECTED that reset them would discard exactly the state the
      // reconnect was meant to restore.
      return {
        ...state,
        screen: isHost ? "host" : "player",
        room: action.room,
        myPlayerId: action.myPlayerId,
        errorMessage: null,
        hostGone: false,
      };
    }

    case "PLAYER_JOINED": {
      if (!state.room) return state;
      const existing = state.room.players.find(
        (p) => p.playerId === action.player.playerId,
      );
      const players = existing
        ? state.room.players.map((p) =>
            p.playerId === action.player.playerId ? action.player : p,
          )
        : [...state.room.players, action.player];
      // Only the host coming back clears the host-gone banner. The previous
      // expression cleared it whenever *any* player rejoined.
      const hostIsBack = action.player.playerId === state.room.hostPlayerId;
      return {
        ...state,
        room: { ...state.room, players },
        hostGone: hostIsBack ? false : state.hostGone,
      };
    }

    case "PLAYER_LEFT":
      if (!state.room) return state;
      return {
        ...state,
        room: {
          ...state.room,
          players: state.room.players.map((p) =>
            p.playerId === action.playerId ? { ...p, isConnected: false } : p,
          ),
        },
      };

    case "HOST_LEFT":
      return { ...state, hostGone: true };

    case "ROUND_OPENED":
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, round: action.round },
        roundResult: null,
        lockout: null,
      };

    case "ROUND_CLOSED":
      if (!state.room?.round) return state;
      return {
        ...state,
        room: {
          ...state.room,
          round: { ...state.room.round, status: "closed" },
        },
      };

    case "ROUND_RESET":
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, round: null },
        roundResult: null,
      };

    case "BUZZ_ORDER_UPDATED":
      if (!state.room?.round) return state;
      return {
        ...state,
        room: {
          ...state.room,
          round: {
            ...state.room.round,
            buzzOrder: action.buzzOrder,
            activePlayerId: action.activePlayerId,
          },
        },
      };

    case "SCORE_UPDATED":
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, players: action.players },
        leaderboard: action.leaderboard,
      };

    case "ROUND_RESOLVED":
      if (!state.room?.round) return state;
      return {
        ...state,
        room: {
          ...state.room,
          round: { ...state.room.round, status: "closed" },
        },
        roundResult: {
          winnerPlayerId: action.winnerPlayerId,
          winnerName: action.winnerName,
          pointsAwarded: action.pointsAwarded,
        },
      };

    case "EARLY_BUZZ_PENALTY":
      return {
        ...state,
        lockout: {
          until: Date.now() + action.lockedForMs,
          offenseCount: action.offenseCount,
        },
      };

    case "SETTINGS_UPDATED":
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, settings: action.settings },
      };

    case "PING_UPDATE":
      return {
        ...state,
        pings: Object.fromEntries(
          action.pings.map((p) => [p.playerId, p.rttMs]),
        ),
      };

    case "ERROR":
      return { ...state, errorMessage: action.message };

    case "CLEAR_ERROR":
      return { ...state, errorMessage: null };

    case "LEAVE":
      sessionStorage.removeItem("buzzroom-session");
      return { ...initial };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────

interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initial);
  const { socket } = useSocket();

  // Wire all server→client events to dispatch
  useEffect(() => {
    const saveSession = (playerId: string, roomCode: string) => {
      sessionStorage.setItem(
        "buzzroom-session",
        JSON.stringify({ playerId, roomCode }),
      );
    };

    // Named handlers so the cleanup can remove exactly these. The previous
    // version called socket.removeAllListeners(), which also tore off the
    // connect/disconnect listeners SocketProvider owns -- under StrictMode's
    // mount/unmount/remount that left `connected` stuck and the
    // "Reconnecting…" banner up for the rest of the session.
    const handlers = {
      room_created: ({ room, yourPlayerId }: RoomCreatedPayload) => {
        saveSession(yourPlayerId, room.roomCode);
        dispatch({ type: "ROOM_CREATED", room, myPlayerId: yourPlayerId });
      },
      join_ok: ({ room, yourPlayerId }: JoinOkPayload) => {
        saveSession(yourPlayerId, room.roomCode);
        dispatch({ type: "JOINED", room, myPlayerId: yourPlayerId });
      },
      reconnect_ok: ({ room, yourPlayerId }: ReconnectOkPayload) => {
        saveSession(yourPlayerId, room.roomCode);
        dispatch({ type: "RECONNECTED", room, myPlayerId: yourPlayerId });
      },
      player_joined: ({ player }: PlayerJoinedPayload) =>
        dispatch({ type: "PLAYER_JOINED", player }),
      player_left: ({ playerId }: PlayerLeftPayload) =>
        dispatch({ type: "PLAYER_LEFT", playerId }),
      host_left: () => dispatch({ type: "HOST_LEFT" }),
      round_opened: ({ round }: RoundOpenedPayload) =>
        dispatch({ type: "ROUND_OPENED", round }),
      round_closed: () => dispatch({ type: "ROUND_CLOSED" }),
      round_reset: () => dispatch({ type: "ROUND_RESET" }),
      buzz_order_updated: ({
        buzzOrder,
        activePlayerId,
      }: BuzzOrderUpdatedPayload) =>
        dispatch({ type: "BUZZ_ORDER_UPDATED", buzzOrder, activePlayerId }),
      score_update: ({ players, leaderboard }: ScoreUpdatePayload) =>
        dispatch({ type: "SCORE_UPDATED", players, leaderboard }),
      round_resolved: ({
        winnerPlayerId,
        winnerName,
        pointsAwarded,
      }: RoundResolvedPayload) =>
        dispatch({
          type: "ROUND_RESOLVED",
          winnerPlayerId,
          winnerName,
          pointsAwarded,
        }),
      early_buzz_penalty: ({
        lockedForMs,
        offenseCount,
      }: EarlyBuzzPenaltyPayload) => {
        // Spec §5 asks for a haptic nudge alongside the cooldown. Not every
        // browser implements it, hence the guard.
        navigator.vibrate?.(200);
        dispatch({ type: "EARLY_BUZZ_PENALTY", lockedForMs, offenseCount });
      },
      settings_updated: ({ settings }: SettingsUpdatedPayload) =>
        dispatch({ type: "SETTINGS_UPDATED", settings }),
      ping_update: ({ pings }: PingUpdatePayload) =>
        dispatch({ type: "PING_UPDATE", pings }),
      server_error: ({ message }: ServerErrorPayload) =>
        dispatch({ type: "ERROR", message }),
    } as const;

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event as keyof typeof handlers, handler as never);
    }
    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event as keyof typeof handlers, handler as never);
      }
    };
  }, [socket]);

  // On mount, attempt to rejoin whatever room this tab was last in.
  useEffect(() => {
    const raw = sessionStorage.getItem("buzzroom-session");
    if (!raw) return;

    let session: { playerId: string; roomCode: string };
    try {
      session = JSON.parse(raw) as { playerId: string; roomCode: string };
    } catch {
      sessionStorage.removeItem("buzzroom-session");
      return;
    }

    const rejoin = () => {
      socket.emit("reconnect_room", session);
    };

    // Re-emit on every reconnect, not just the first connect: socket.io
    // restores the transport on its own after a network blip, and the server
    // has no memory of which room the new socket belongs to.
    socket.on("connect", rejoin);
    if (socket.connected) rejoin();
    else socket.connect();

    return () => {
      socket.off("connect", rejoin);
    };
  }, [socket]);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be inside GameProvider");
  return ctx;
}

export function useModeParams(): ModeParams | null {
  const { state } = useGame();
  return state.room?.round?.modeParams ?? null;
}
