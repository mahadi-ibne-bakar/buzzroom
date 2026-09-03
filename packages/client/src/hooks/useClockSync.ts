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

// Spec §7.1: ~2s while a round is live, so the offset is as fresh as possible
// at the moment someone buzzes; ~8s while idle, because a sync every 2s for a
// room sitting between questions is pure battery and bandwidth cost.
const PING_INTERVAL_ACTIVE_MS = 2_000;
const PING_INTERVAL_IDLE_MS = 8_000;

/**
 * Maintains a live estimate of (serverClock - clientClock) by running
 * sync_ping / sync_pong on a 2 s heartbeat.
 *
 * Returns a stable ref so consumers can read the current offset without
 * triggering re-renders.
 *
 * Usage:
 *   const offsetRef = useClockSync(socket, connected, roundOpen);
 *   // When buzzing:
 *   const localTime = Date.now();
 *   const adjustedTime = localTime + offsetRef.current;
 */
export function useClockSync(
  socket: AppSocket | null,
  connected: boolean,
  roundActive: boolean,
): React.MutableRefObject<number> {
  const offsetRef = useRef(0);
  // Held across effect re-runs so switching cadence when a round opens does
  // not throw away the samples already collected.
  const samplesRef = useRef<Array<{ offset: number; rtt: number }>>([]);

  useEffect(() => {
    if (!socket || !connected) return;

    const samples = samplesRef.current;

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
    const interval = setInterval(
      ping,
      roundActive ? PING_INTERVAL_ACTIVE_MS : PING_INTERVAL_IDLE_MS,
    );

    return () => {
      socket.off("sync_pong", handlePong);
      clearInterval(interval);
    };
  }, [socket, connected, roundActive]);

  return offsetRef;
}
