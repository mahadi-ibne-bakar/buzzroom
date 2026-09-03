import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type {
  BuzzEntryView,
  LeaderboardEntry,
  ModeParams,
  PlayerView,
  RoomView,
  RoundView,
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
}

const initial: GameState = {
  screen: "landing",
  room: null,
  myPlayerId: null,
  leaderboard: [],
  errorMessage: null,
  hostGone: false,
  roundResult: null,
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
  | { type: "SCORE_UPDATED"; players: PlayerView[]; leaderboard: LeaderboardEntry[] }
  | {
      type: "ROUND_RESOLVED";
      winnerPlayerId: string;
      winnerName: string;
      pointsAwarded: number;
    }
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
      return {
        ...initial,
        screen: isHost ? "host" : "player",
        room: action.room,
        myPlayerId: action.myPlayerId,
        leaderboard: [],
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
      return {
        ...state,
        room: { ...state.room, players },
        hostGone:
          state.hostGone && action.player.playerId !== state.room.hostPlayerId
            ? true
            : false,
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
      };

    case "ROUND_CLOSED":
      if (!state.room?.round) return state;
      return {
        ...state,
        room: { ...state.room, round: { ...state.room.round, status: "closed" } },
      };

    case "ROUND_RESET":
      if (!state.room) return state;
      return { ...state, room: { ...state.room, round: null }, roundResult: null };

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
        room: { ...state.room, round: { ...state.room.round, status: "closed" } },
        roundResult: {
          winnerPlayerId: action.winnerPlayerId,
          winnerName: action.winnerName,
          pointsAwarded: action.pointsAwarded,
        },
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
    socket.on("room_created", ({ room, yourPlayerId }) => {
      sessionStorage.setItem(
        "buzzroom-session",
        JSON.stringify({ playerId: yourPlayerId, roomCode: room.roomCode }),
      );
      dispatch({ type: "ROOM_CREATED", room, myPlayerId: yourPlayerId });
    });
    socket.on("join_ok", ({ room, yourPlayerId }) => {
      sessionStorage.setItem(
        "buzzroom-session",
        JSON.stringify({ playerId: yourPlayerId, roomCode: room.roomCode }),
      );
      dispatch({ type: "JOINED", room, myPlayerId: yourPlayerId });
    });
    socket.on("reconnect_ok", ({ room, yourPlayerId }) => {
      sessionStorage.setItem(
        "buzzroom-session",
        JSON.stringify({ playerId: yourPlayerId, roomCode: room.roomCode }),
      );
      dispatch({ type: "RECONNECTED", room, myPlayerId: yourPlayerId });
    });
    socket.on("player_joined", ({ player }) =>
      dispatch({ type: "PLAYER_JOINED", player }),
    );
    socket.on("player_left", ({ playerId }) =>
      dispatch({ type: "PLAYER_LEFT", playerId }),
    );
    socket.on("host_left", () => dispatch({ type: "HOST_LEFT" }));
    socket.on("round_opened", ({ round }) => dispatch({ type: "ROUND_OPENED", round }));
    socket.on("round_closed", () => dispatch({ type: "ROUND_CLOSED" }));
    socket.on("round_reset", () => dispatch({ type: "ROUND_RESET" }));
    socket.on("buzz_order_updated", ({ buzzOrder, activePlayerId }) =>
      dispatch({ type: "BUZZ_ORDER_UPDATED", buzzOrder, activePlayerId }),
    );
    socket.on("score_update", ({ players, leaderboard }) =>
      dispatch({ type: "SCORE_UPDATED", players, leaderboard }),
    );
    socket.on("round_resolved", ({ winnerPlayerId, winnerName, pointsAwarded }) =>
      dispatch({ type: "ROUND_RESOLVED", winnerPlayerId, winnerName, pointsAwarded }),
    );
    socket.on("server_error", ({ message }) => dispatch({ type: "ERROR", message }));

    return () => {
      socket.removeAllListeners();
    };
  }, [socket]);

  // On mount, attempt reconnect from session storage
  useEffect(() => {
    const raw = sessionStorage.getItem("buzzroom-session");
    if (!raw) return;
    try {
      const { playerId, roomCode } = JSON.parse(raw) as {
        playerId: string;
        roomCode: string;
      };
      socket.connect();
      socket.once("connect", () => {
        socket.emit("reconnect_room", { playerId, roomCode });
      });
    } catch {
      sessionStorage.removeItem("buzzroom-session");
    }
  }, [socket]);

  return (
    <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
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
