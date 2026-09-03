import { describe, expect, it, beforeEach } from "vitest";
import { RoomStore } from "../rooms/RoomStore.js";

// A fresh store for every test — no shared state between cases.
let store: RoomStore;
beforeEach(() => {
  store = new RoomStore();
});

describe("RoomStore.createRoom", () => {
  it("returns a room with a 6-char code and the host as a player", () => {
    const { room, player } = store.createRoom("socket-1", "Alice");

    expect(room.roomCode).toHaveLength(6);
    expect(room.hostPlayerId).toBe(player.playerId);
    expect(room.hostSocketId).toBe("socket-1");
    expect(room.players.size).toBe(1);
    expect(player.name).toBe("Alice");
    expect(player.score).toBe(0);
    expect(player.isConnected).toBe(true);
  });

  it("increments roomCount", () => {
    expect(store.roomCount).toBe(0);
    store.createRoom("s1", "Alice");
    expect(store.roomCount).toBe(1);
    store.createRoom("s2", "Bob");
    expect(store.roomCount).toBe(2);
  });
});

describe("RoomStore.getByCode", () => {
  it("finds a room by its code", () => {
    const { room } = store.createRoom("s1", "Alice");
    const found = store.getByCode(room.roomCode);
    expect(found?.roomId).toBe(room.roomId);
  });

  it("is case-insensitive", () => {
    const { room } = store.createRoom("s1", "Alice");
    const found = store.getByCode(room.roomCode.toLowerCase());
    expect(found?.roomId).toBe(room.roomId);
  });

  it("returns undefined for an unknown code", () => {
    expect(store.getByCode("XXXXXX")).toBeUndefined();
  });
});

describe("RoomStore.addPlayer", () => {
  it("adds a player to an existing room", () => {
    const { room } = store.createRoom("s1", "Alice");
    const player = store.addPlayer(room.roomId, "s2", "Bob");

    expect(player).toBeDefined();
    expect(player!.name).toBe("Bob");
    expect(room.players.size).toBe(2);
  });

  it("returns undefined for an unknown roomId", () => {
    expect(store.addPlayer("nonexistent", "s1", "Bob")).toBeUndefined();
  });
});

describe("RoomStore.removePlayerBySocketId", () => {
  it("removes the player and returns room + player", () => {
    const { room } = store.createRoom("s1", "Alice");
    store.addPlayer(room.roomId, "s2", "Bob");

    const result = store.removePlayerBySocketId("s2");
    expect(result).toBeDefined();
    expect(result!.player.name).toBe("Bob");
    expect(room.players.size).toBe(1);
  });

  it("deletes the room when the last player leaves", () => {
    const { room } = store.createRoom("s1", "Alice");
    store.removePlayerBySocketId("s1");

    expect(store.roomCount).toBe(0);
    expect(store.getByCode(room.roomCode)).toBeUndefined();
  });

  it("returns undefined for an unknown socketId", () => {
    expect(store.removePlayerBySocketId("no-such-socket")).toBeUndefined();
  });
});

describe("RoomStore.cleanupStaleRooms", () => {
  it("removes rooms older than maxAgeMs", () => {
    const { room } = store.createRoom("s1", "Alice");

    // Backdate the room so it appears stale
    room.lastActivityAt = Date.now() - 10_000;

    const removed = store.cleanupStaleRooms(5_000); // 5s threshold
    expect(removed).toBe(1);
    expect(store.roomCount).toBe(0);
  });

  it("leaves rooms that are still fresh", () => {
    store.createRoom("s1", "Alice");

    const removed = store.cleanupStaleRooms(60_000); // 60s threshold
    expect(removed).toBe(0);
    expect(store.roomCount).toBe(1);
  });
});

describe("RoomStore view helpers", () => {
  it("toRoomView omits socketId and internal fields", () => {
    const { room } = store.createRoom("s1", "Alice");
    const view = store.toRoomView(room);

    expect(view.roomCode).toBe(room.roomCode);
    expect(view.players).toHaveLength(1);
    // PlayerView should not expose socketId
    expect("socketId" in view.players[0]!).toBe(false);
  });
});
