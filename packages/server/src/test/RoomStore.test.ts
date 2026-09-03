import { randomUUID } from "node:crypto";
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

describe("RoomStore.markDisconnectedBySocketId", () => {
  it("keeps the player record and returns room + player", () => {
    const { room } = store.createRoom("s1", "Alice");
    store.addPlayer(room.roomId, "s2", "Bob");

    const result = store.markDisconnectedBySocketId("s2");
    expect(result).toBeDefined();
    expect(result!.player.name).toBe("Bob");
    expect(result!.player.isConnected).toBe(false);
    // The seat is kept so the player can reconnect onto it (spec §12).
    expect(room.players.size).toBe(2);
  });

  it("preserves the disconnected player's score", () => {
    const { room } = store.createRoom("s1", "Alice");
    const bob = store.addPlayer(room.roomId, "s2", "Bob")!;
    store.awardPoints(room.roomId, bob.playerId, 7);

    store.markDisconnectedBySocketId("s2");

    expect(room.players.get(bob.playerId)!.score).toBe(7);
  });

  it("reports whether the disconnected player was the host", () => {
    const { room } = store.createRoom("s1", "Alice");
    store.addPlayer(room.roomId, "s2", "Bob");

    expect(store.markDisconnectedBySocketId("s2")!.wasHost).toBe(false);
    expect(store.markDisconnectedBySocketId("s1")!.wasHost).toBe(true);
  });

  it("keeps the room alive when the last player disconnects", () => {
    // Everyone might be mid-reconnect, so an empty room is left for the
    // periodic cleanup job rather than torn down immediately.
    const { room } = store.createRoom("s1", "Alice");
    store.markDisconnectedBySocketId("s1");

    expect(store.roomCount).toBe(1);
    expect(store.getByCode(room.roomCode)).toBeDefined();
  });

  it("stops resolving the old socketId to the room", () => {
    store.createRoom("s1", "Alice");
    store.markDisconnectedBySocketId("s1");

    expect(store.getRoomBySocketId("s1")).toBeUndefined();
  });

  it("returns undefined for an unknown socketId", () => {
    expect(store.markDisconnectedBySocketId("no-such-socket")).toBeUndefined();
  });
});

describe("RoomStore.reconnectPlayer", () => {
  it("rebinds the player to a new socket with their score intact", () => {
    const { room } = store.createRoom("s1", "Alice");
    const bob = store.addPlayer(room.roomId, "s2", "Bob")!;
    store.awardPoints(room.roomId, bob.playerId, 3);
    store.markDisconnectedBySocketId("s2");

    const result = store.reconnectPlayer(room.roomCode, bob.playerId, "s2-new");

    expect(result).toBeDefined();
    expect(result!.player.isConnected).toBe(true);
    expect(result!.player.score).toBe(3);
    expect(store.getRoomBySocketId("s2-new")!.roomId).toBe(room.roomId);
  });

  it("moves hostSocketId when the returning player is the host", () => {
    // getHostRoom() authorises on socket.id === room.hostSocketId, so a
    // reconnected host would otherwise lose every control on their own game.
    const { room, player } = store.createRoom("s1", "Alice");
    store.markDisconnectedBySocketId("s1");

    store.reconnectPlayer(room.roomCode, player.playerId, "s1-new");

    expect(room.hostSocketId).toBe("s1-new");
  });

  it("accepts a lowercase room code", () => {
    const { room, player } = store.createRoom("s1", "Alice");
    store.markDisconnectedBySocketId("s1");

    const result = store.reconnectPlayer(
      room.roomCode.toLowerCase(),
      player.playerId,
      "s1-new",
    );

    expect(result).toBeDefined();
  });

  it("returns undefined for an unknown room code", () => {
    const { player } = store.createRoom("s1", "Alice");
    expect(
      store.reconnectPlayer("ZZZZZZ", player.playerId, "s9"),
    ).toBeUndefined();
  });

  it("returns undefined for a playerId that was never in the room", () => {
    const { room } = store.createRoom("s1", "Alice");
    expect(
      store.reconnectPlayer(room.roomCode, randomUUID(), "s9"),
    ).toBeUndefined();
  });

  it("releases the player's previous socket from the index", () => {
    // Reconnecting without a disconnect first (e.g. a second tab) must not
    // leave the old socketId resolving to the room.
    const { room, player } = store.createRoom("s1", "Alice");

    store.reconnectPlayer(room.roomCode, player.playerId, "s1-new");

    expect(store.getRoomBySocketId("s1")).toBeUndefined();
    expect(store.getRoomBySocketId("s1-new")).toBeDefined();
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
