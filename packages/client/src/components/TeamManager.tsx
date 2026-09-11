import { useState } from "react";
import type { PlayerView, TeamView } from "@buzzroom/shared";

interface Props {
  teams: TeamView[];
  players: PlayerView[];
  onCreate: (name: string) => void;
  onDelete: (teamId: string) => void;
  onAssign: (playerId: string, teamId: string | null) => void;
}

/**
 * The host's team roster: create and delete teams, and put each player on one.
 *
 * Assignment is host-driven rather than player-chosen so nobody can stack a
 * team mid-game, and so the host can balance sides the way they would with
 * pen and paper.
 */
export function TeamManager({
  teams,
  players,
  onCreate,
  onDelete,
  onAssign,
}: Props) {
  const [newName, setNewName] = useState("");

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-4">
      <div className="text-slate-400 text-xs uppercase tracking-wider">
        Teams
      </div>

      {/* ── Create ── */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New team name"
          maxLength={20}
          className="flex-1 bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={create}
          disabled={!newName.trim()}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm"
        >
          Add
        </button>
      </div>

      {/* ── Existing teams ── */}
      {teams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <span
              key={team.teamId}
              className="inline-flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-1 text-sm text-white"
              style={{ borderLeft: `4px solid ${team.colour}` }}
            >
              {team.name}
              <button
                onClick={() => onDelete(team.teamId)}
                title={`Delete ${team.name}`}
                className="text-slate-400 hover:text-red-400"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Assignment ── */}
      {teams.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-slate-500 text-xs">Assign players</div>
          {players.map((player) => (
            <div
              key={player.playerId}
              className="flex items-center gap-2 text-sm"
            >
              <span className="flex-1 text-white truncate">
                {player.name}
                {!player.isConnected && " 📵"}
              </span>
              <select
                value={player.teamId ?? ""}
                onChange={(e) =>
                  onAssign(player.playerId, e.target.value || null)
                }
                aria-label={`Team for ${player.name}`}
                className="bg-slate-700 text-white rounded-lg px-2 py-1 text-xs"
              >
                <option value="">— none —</option>
                {teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
