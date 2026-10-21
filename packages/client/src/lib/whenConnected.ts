/** The slice of a socket this helper needs. Keeps it testable with a fake. */
export interface ConnectLike {
  readonly connected: boolean;
  connect: () => void;
  once: (event: "connect", listener: () => void) => void;
}

/**
 * Runs `send` as soon as the socket is up, connecting first if it isn't.
 *
 * The obvious version of this -- `socket.connect()` then
 * `socket.once("connect", send)` -- has a race that bites in exactly one
 * situation, and it is a common one: the socket may be connected *already*,
 * because GameProvider connects on mount to try a session restore. "connect"
 * does not fire again for an open socket, so `send` would never run and the
 * form would sit on "Connecting…" for ever.
 */
export function whenConnected(socket: ConnectLike, send: () => void): void {
  if (socket.connected) {
    send();
    return;
  }
  socket.once("connect", send);
  socket.connect();
}
