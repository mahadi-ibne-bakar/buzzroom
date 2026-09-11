import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@buzzroom/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
interface SocketContextValue {
  socket: AppSocket;
  connected: boolean;
}
const SocketContext = createContext<SocketContextValue | null>(null);

/**
 * Where to reach the server.
 *
 * In production the server serves this bundle, so the socket belongs on the
 * same origin -- passing undefined is how socket.io is told that, and it
 * means a deployment needs no build-time configuration at all. In
 * development the two halves are on different ports, so it falls back to the
 * server's default. VITE_SERVER_URL overrides either.
 */
const SERVER_URL: string | undefined =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:3001" : undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  // Lazily created on first render and never again. Passing io(...) straight
  // to useRef would call it on *every* render, opening a fresh socket each
  // time and throwing all but the first away.
  const socketRef = useRef<AppSocket | null>(null);
  if (socketRef.current === null) {
    socketRef.current = io(SERVER_URL, { autoConnect: false }) as AppSocket;
  }
  const socket = socketRef.current;

  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    // Catch a connection that landed between render and this effect running.
    setConnected(socket.connected);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be inside SocketProvider");
  return ctx;
}
