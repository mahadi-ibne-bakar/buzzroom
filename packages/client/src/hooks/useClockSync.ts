import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SyncPongPayload,
} from "@buzzroom/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Number of ping samples to keep. We use the lowest-RTT sample's offset
// estimate — same heuristic as NTP reference implementations.
const MAX_SAMPLES = 8;
const PING_INTERVAL_MS = 2_000;

/**
 * Maintains a live estimate of (serverClock - clientClock) by running
 * sync_ping / sync_pong on a 2 s heartbeat.
 *
 * Returns a stable ref so consumers can read the current offset without
 * triggering re-renders.
 *
 * Usage:
 *   const offsetRef = useClockSync(socket, connected);
 *   // When buzzing:
 *   const localTime = Date.now();
 *   const adjustedTime = localTime + offsetRef.current;
 */
export function useClockSync(
  socket: AppSocket | null,
  connected: boolean,
): React.MutableRefObject<number> {
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!socket || !connected) return;

    const samples: Array<{ offset: number; rtt: number }> = [];

    const ping = () => {
      socket.emit("sync_ping", { t0: Date.now() });
    };

    const handlePong = ({ t0, ts }: SyncPongPayload) => {
      const t1 = Date.now();
      const rtt = t1 - t0;
      const offset = ts - (t0 + rtt / 2);

      samples.push({ offset, rtt });
      if (samples.length > MAX_SAMPLES) samples.shift();

      // Lowest RTT sample is the most accurate (least queuing jitter)
      const best = samples.reduce((a, b) => (a.rtt <= b.rtt ? a : b));
      offsetRef.current = best.offset;
    };

    socket.on("sync_pong", handlePong);
    ping(); // immediate first ping to get a baseline offset quickly
    const interval = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      socket.off("sync_pong", handlePong);
      clearInterval(interval);
    };
  }, [socket, connected]);

  return offsetRef;
}
