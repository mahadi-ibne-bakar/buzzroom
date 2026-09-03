import type { SyncPingPayload } from "@buzzroom/shared";
import { PING_BROADCAST_INTERVAL_MS } from "../../constants.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Handles a clock-sync ping from a client.
 *
 * Protocol:
 *   Client sends:  { t0: clientLocalTime, lastRtt? }
 *   Server reads:  ts = Date.now()  ← captured as early as possible
 *   Server sends:  { t0, ts }
 *   Client computes:
 *     RTT    = t1 - t0           (t1 = client local time on pong receipt)
 *     offset = ts - (t0 + RTT/2) (how to convert client time → server time)
 *
 * The offset is then applied to the press timestamp when buzzing:
 *   adjustedTime = localTime + offset ≈ serverTime_when_buzzed
 *
 * On the server we store ts - t0 as a rough proxy for (offset + half_RTT).
 * This is not the same as the client's computed offset, but it's useful for
 * monitoring and anomaly detection — a very large value suggests the client's
 * clock is badly out of sync or the network latency is unusually high.
 *
 * The RTT itself can only be measured client-side (it needs t1, which the
 * server never sees), so the client reports its previous measurement here and
 * the server fans it out to the room for the connection-quality display.
 */
export function onSyncPing(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: SyncPingPayload,
): void {
  // Capture server time first — before any other work — so the timestamp
  // reflects when the ping actually arrived, not after processing overhead.
  const ts = Date.now();

  // Update the player's clock metadata if they're in a room.
  // Sockets that haven't joined a room yet (e.g., still on the lobby screen)
  // can still sync — we just won't have a player record to update.
  const context = store.getPlayerBySocketId(socket.id);
  if (!context) {
    socket.emit("sync_pong", { t0: payload.t0, ts });
    return;
  }

  const { room, player } = context;

  // ts - t0 ≈ offset + half_RTT from the server's perspective.
  // We store it in clockOffset as a monitoring value; the client's own
  // computed offset (used for adjustedTime) is more accurate.
  player.clockOffset = ts - payload.t0;
  if (payload.lastRtt !== undefined) player.lastRtt = payload.lastRtt;

  socket.emit("sync_pong", { t0: payload.t0, ts });

  // Every player syncs on their own heartbeat, so broadcasting on each ping
  // would mean a room-wide fan-out several times a second. One coalesced
  // broadcast per interval carries everyone's latest figure anyway.
  if (ts - room.lastPingBroadcastAt >= PING_BROADCAST_INTERVAL_MS) {
    room.lastPingBroadcastAt = ts;
    io.to(room.roomId).emit("ping_update", {
      pings: Array.from(room.players.values()).map((p) => ({
        playerId: p.playerId,
        rttMs: p.lastRtt,
      })),
    });
  }
}
