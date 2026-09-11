import type {
  AssignTeamPayload,
  CreateTeamPayload,
  DeleteTeamPayload,
} from "@buzzroom/shared";
import { MAX_TEAMS } from "../../constants.js";
import type { Room, RoomStore } from "../../rooms/RoomStore.js";
import { sanitizeName } from "../../rooms/sanitize.js";
import { getHostRoom } from "../authHelpers.js";
import { emitScoreUpdate } from "../scoreHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Team roster changes all have the same two consequences, so they share one
 * exit: everyone needs the new roster, and the team board has to be rebuilt
 * because a team's score is the sum of its members'. Moving one player
 * between teams changes two totals without any score changing.
 */
function broadcastTeams(io: TypedServer, room: Room, store: RoomStore): void {
  io.to(room.roomId).emit("teams_updated", {
    teams: store.toTeamViews(room),
    players: Array.from(room.players.values()).map((p) =>
      store.toPlayerView(p),
    ),
  });
  emitScoreUpdate(io, room, store);
}

export function onCreateTeam(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: CreateTeamPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  const name = sanitizeName(payload.name);
  if (name.length === 0) {
    socket.emit("server_error", {
      code: "NAME_INVALID",
      message: "Team name must contain at least one visible character.",
    });
    return;
  }

  const taken = Array.from(room.teams.values()).some(
    (t) => t.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    socket.emit("server_error", {
      code: "NAME_TAKEN",
      message: `There is already a team called "${name}".`,
    });
    return;
  }

  const team = store.createTeam(room, name);
  if (!team) {
    socket.emit("server_error", {
      code: "INVALID_STATE",
      message: `A room can have at most ${MAX_TEAMS} teams.`,
    });
    return;
  }

  broadcastTeams(io, room, store);
  console.log(`[teams] created "${name}" in ${room.roomCode}`);
}

export function onDeleteTeam(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: DeleteTeamPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  // Members fall back to unassigned and keep their own scores; the team
  // total was only ever a sum of those.
  if (!store.deleteTeam(room, payload.teamId)) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "That team is not in this room.",
    });
    return;
  }

  broadcastTeams(io, room, store);
  console.log(`[teams] deleted a team in ${room.roomCode}`);
}

export function onAssignTeam(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: AssignTeamPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  if (!store.assignTeam(room, payload.playerId, payload.teamId)) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "That player or team is not in this room.",
    });
    return;
  }

  broadcastTeams(io, room, store);
}
