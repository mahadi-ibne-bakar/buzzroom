import { describe, expect, it, vi } from "vitest";
import { whenConnected, type ConnectLike } from "../lib/whenConnected.js";

function fakeSocket(connected: boolean) {
  const listeners: (() => void)[] = [];
  const socket: ConnectLike & {
    connectCalls: number;
    fireConnect: () => void;
  } = {
    connected,
    connectCalls: 0,
    connect() {
      this.connectCalls++;
    },
    once(_event, listener) {
      listeners.push(listener);
    },
    fireConnect() {
      for (const l of listeners.splice(0)) l();
    },
  };
  return socket;
}

describe("whenConnected", () => {
  it("sends immediately when the socket is already open", () => {
    // The regression this exists for: GameProvider connects on mount to try a
    // session restore, so by the time someone submits the join form the
    // socket is often already up and "connect" will never fire again.
    const socket = fakeSocket(true);
    const send = vi.fn();

    whenConnected(socket, send);

    expect(send).toHaveBeenCalledOnce();
    expect(socket.connectCalls).toBe(0);
  });

  it("waits for the connection when the socket is closed", () => {
    const socket = fakeSocket(false);
    const send = vi.fn();

    whenConnected(socket, send);
    expect(send).not.toHaveBeenCalled();
    expect(socket.connectCalls).toBe(1);

    socket.fireConnect();
    expect(send).toHaveBeenCalledOnce();
  });

  it("sends once, not once per connect event", () => {
    const socket = fakeSocket(false);
    const send = vi.fn();

    whenConnected(socket, send);
    socket.fireConnect();
    socket.fireConnect();

    expect(send).toHaveBeenCalledOnce();
  });
});
