import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@buzzroom/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
interface SocketContextValue {
  socket: AppSocket;
  connected: boolean;
}
const SocketContext = createContext<SocketContextValue | null>(null);

const SERVER_URL =
  (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? "http://localhost:3001";

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<AppSocket>(
    io(SERVER_URL, { autoConnect: false }) as AppSocket,
  );
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = socketRef.current;
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be inside SocketProvider");
  return ctx;
}
