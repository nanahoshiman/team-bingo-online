"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { characters } from "@/lib/characters";

type Team = "red" | "blue";
type BoardSize = 3 | 5 | 7;
type MatchStatus = "selecting_players" | "picking" | "in_match" | "resolving";

type Player = {
  id: string;
  player_name: string;
  is_host: boolean;
  is_leader: boolean;
  team: Team | null;
};

type BoardData = { red: string[]; blue: string[] };

type RoomData = {
  board_size: number | null;
  board_data: unknown;
  match_status: MatchStatus | null;
  active_red_player_ids: unknown;
  active_blue_player_ids: unknown;
};

type MatchResult = {
  id: string;
  winning_team: Team;
  character_id: string;
};

type CharacterPick = {
  id: string;
  player_id: string;
  player_name: string;
  team: Team;
  character_id: string;
  is_ready: boolean;
};

function isBoardSize(value: number | null): value is BoardSize {
  return value === 3 || value === 5 || value === 7;
}

function isBoardData(value: unknown): value is BoardData {
  if (!value || typeof value !== "object") return false;
  const data = value as { red?: unknown; blue?: unknown };
  return Array.isArray(data.red) && Array.isArray(data.blue);
}

function isMatchStatus(value: unknown): value is MatchStatus {
  return (
    value === "selecting_players" ||
    value === "picking" ||
    value === "in_match" ||
    value === "resolving"
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getCharacter(id: string) {
  return characters.find((character) => character.id === id);
}

export default function StreamPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomCode = String(params.roomCode ?? "").toUpperCase();

  const transparent = searchParams.get("transparent") === "1";
  const showMembers = searchParams.get("members") !== "0";

  const [players, setPlayers] = useState<Player[]>([]);
  const [boardSize, setBoardSize] = useState<BoardSize>(5);
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("picking");
  const [activeRedPlayerIds, setActiveRedPlayerIds] = useState<string[]>([]);
  const [activeBluePlayerIds, setActiveBluePlayerIds] = useState<string[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [characterPicks, setCharacterPicks] = useState<CharacterPick[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player")
      .select("id, player_name, is_host, is_leader, team")
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });
    if (!error) setPlayers((data ?? []) as Player[]);
  }

  async function loadRoom() {
    const { data, error } = await supabase
      .from("rooms")
      .select("board_size, board_data, match_status, active_red_player_ids, active_blue_player_ids")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (error || !data) return;
    const room = data as RoomData;

    if (isBoardSize(room.board_size)) setBoardSize(room.board_size);
    setBoardData(isBoardData(room.board_data) ? room.board_data : null);
    if (isMatchStatus(room.match_status)) setMatchStatus(room.match_status);
    setActiveRedPlayerIds(stringArray(room.active_red_player_ids));
    setActiveBluePlayerIds(stringArray(room.active_blue_player_ids));
  }

  async function loadResults() {
    const { data, error } = await supabase
      .from("match_results")
      .select("id, winning_team, character_id")
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });
    if (!error) setMatchResults((data ?? []) as MatchResult[]);
  }

  async function loadPicks() {
    const { data, error } = await supabase
      .from("character_picks")
      .select("id, player_id, player_name, team, character_id, is_ready")
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });
    if (!error) setCharacterPicks((data ?? []) as CharacterPick[]);
  }

  async function resync() {
    await Promise.all([loadPlayers(), loadRoom(), loadResults(), loadPicks()]);
  }

  useEffect(() => {
    if (!roomCode) return;

    resync().finally(() => setLoading(false));

    const channel = supabase
      .channel(`stream-${roomCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "player", filter: `room_code=eq.${roomCode}` }, loadPlayers)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` }, loadRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results", filter: `room_code=eq.${roomCode}` }, loadResults)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_picks", filter: `room_code=eq.${roomCode}` }, loadPicks)
      .subscribe();

    const intervalId = window.setInterval(() => void resync(), 8000);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  const redPlayers = useMemo(() => players.filter((p) => p.team === "red"), [players]);
  const bluePlayers = useMemo(() => players.filter((p) => p.team === "blue"), [players]);

  const redClaimed = useMemo(
    () => new Set(matchResults.filter((r) => r.winning_team === "red").map((r) => r.character_id)),
    [matchResults]
  );
  const blueClaimed = useMemo(
    () => new Set(matchResults.filter((r) => r.winning_team === "blue").map((r) => r.character_id)),
    [matchResults]
  );

  const activeIds = useMemo(
    () => new Set([...activeRedPlayerIds, ...activeBluePlayerIds]),
    [activeRedPlayerIds, activeBluePlayerIds]
  );

  const readyPicks = useMemo(
    () => characterPicks.filter((pick) => pick.is_ready && activeIds.has(pick.player_id)),
    [characterPicks, activeIds]
  );

  const redPicks = readyPicks.filter((pick) => pick.team === "red");
  const bluePicks = readyPicks.filter((pick) => pick.team === "blue");

  if (loading) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: transparent ? "transparent" : "#111", color: "white", fontSize: 28, fontWeight: 900 }}>読み込み中...</main>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        boxSizing: "border-box",
        background: transparent
          ? "transparent"
          : "radial-gradient(circle at top, #25252d 0%, #0d0d12 65%, #050507 100%)",
        color: "white",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1920,
          minHeight: "calc(100vh - 40px)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(420px, 0.8fr)",
          gridTemplateRows: showMembers ? "1fr auto" : "1fr",
          gap: 18,
        }}
      >
        <section
          style={{
            gridRow: showMembers ? "1 / 2" : "1",
            padding: 24,
            borderRadius: 22,
            border: "2px solid rgba(255,255,255,0.18)",
            background: "rgba(10,10,14,0.92)",
            boxShadow: "0 16px 44px rgba(0,0,0,0.38)",
            display: "flex",
            flexDirection: "column",
            minHeight: 560,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ fontSize: 18, opacity: 0.72, fontWeight: 800 }}>TEAM BINGO ONLINE</div>
              <div style={{ fontSize: 32, fontWeight: 1000, letterSpacing: 1 }}>ROOM {roomCode}</div>
            </div>
            <StatusBadge status={matchStatus} />
          </div>

          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "30px 10px" }}>
            <MatchArea
              status={matchStatus}
              redPicks={redPicks}
              bluePicks={bluePicks}
              activeRed={redPlayers.filter((p) => activeRedPlayerIds.includes(p.id))}
              activeBlue={bluePlayers.filter((p) => activeBluePlayerIds.includes(p.id))}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16 }}>
            <Score team="red" count={matchResults.filter((r) => r.winning_team === "red").length} />
            <div style={{ fontSize: 20, fontWeight: 1000, opacity: 0.55 }}>MATCH WINS</div>
            <Score team="blue" count={matchResults.filter((r) => r.winning_team === "blue").length} />
          </div>
        </section>

        <aside style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 18, minHeight: 0 }}>
          <StreamBoard
            team="blue"
            ids={boardData?.blue ?? []}
            boardSize={boardSize}
            claimed={blueClaimed}
          />
          <StreamBoard
            team="red"
            ids={boardData?.red ?? []}
            boardSize={boardSize}
            claimed={redClaimed}
          />
        </aside>

        {showMembers && (
          <section
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
            }}
          >
            <MemberBar team="red" players={redPlayers} activeIds={activeIds} />
            <MemberBar team="blue" players={bluePlayers} activeIds={activeIds} />
          </section>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const label =
    status === "selecting_players"
      ? "対戦者選択中"
      : status === "picking"
        ? "キャラクター選択中"
        : status === "in_match"
          ? "試合中"
          : "結果反映中";

  return (
    <div style={{ padding: "10px 18px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", fontSize: 18, fontWeight: 1000 }}>
      {label}
    </div>
  );
}

function MatchArea({
  status,
  redPicks,
  bluePicks,
  activeRed,
  activeBlue,
}: {
  status: MatchStatus;
  redPicks: CharacterPick[];
  bluePicks: CharacterPick[];
  activeRed: Player[];
  activeBlue: Player[];
}) {
  if (status !== "in_match") {
    const title =
      status === "selecting_players"
        ? "NEXT PLAYERS"
        : status === "picking"
          ? "CHARACTER SELECT"
          : "RESULT";

    return (
      <div style={{ width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "clamp(46px, 5vw, 86px)", fontWeight: 1000, fontStyle: "italic", letterSpacing: 3 }}>{title}</div>
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 20, alignItems: "center" }}>
          <ActiveNames team="red" players={activeRed} />
          <div style={{ fontSize: 42, fontWeight: 1000, opacity: 0.55 }}>VS</div>
          <ActiveNames team="blue" players={activeBlue} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      <div style={{ fontSize: "clamp(38px, 4vw, 68px)", fontWeight: 1000, fontStyle: "italic", marginBottom: 28 }}>🔥 FIGHT! 🔥</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 20, alignItems: "center" }}>
        <PickSide team="red" picks={redPicks} />
        <div style={{ fontSize: "clamp(48px, 5vw, 92px)", fontWeight: 1000, fontStyle: "italic", textShadow: "0 5px 18px rgba(0,0,0,0.5)" }}>VS</div>
        <PickSide team="blue" picks={bluePicks} />
      </div>
    </div>
  );
}

function ActiveNames({ team, players }: { team: Team; players: Player[] }) {
  const color = team === "red" ? "#ff6b6b" : "#64a7ff";
  return (
    <div style={{ padding: 20, borderRadius: 18, border: `3px solid ${color}`, background: "rgba(255,255,255,0.06)" }}>
      <div style={{ color, fontSize: 22, fontWeight: 1000 }}>{team === "red" ? "RED TEAM" : "BLUE TEAM"}</div>
      <div style={{ marginTop: 12, fontSize: 28, fontWeight: 1000 }}>
        {players.length ? players.map((p) => p.player_name).join(" ＆ ") : "選択待ち"}
      </div>
    </div>
  );
}

function PickSide({ team, picks }: { team: Team; picks: CharacterPick[] }) {
  const color = team === "red" ? "#ff5252" : "#448aff";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
      {[0, 1].map((index) => {
        const pick = picks[index];
        const character = pick ? getCharacter(pick.character_id) : null;
        return (
          <div key={index} style={{ padding: 14, borderRadius: 18, border: `4px solid ${color}`, background: "rgba(255,255,255,0.08)", minWidth: 0 }}>
            <div style={{ aspectRatio: "1 / 1", display: "grid", placeItems: "center" }}>
              {character ? (
                <img src={character.image} alt={character.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ fontSize: 60, opacity: 0.25 }}>?</div>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 1000, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {character?.name ?? "WAIT"}
            </div>
            <div style={{ marginTop: 4, fontSize: 15, opacity: 0.72, fontWeight: 800 }}>{pick?.player_name ?? ""}</div>
          </div>
        );
      })}
    </div>
  );
}

function Score({ team, count }: { team: Team; count: number }) {
  const color = team === "red" ? "#ff5252" : "#448aff";
  return (
    <div style={{ padding: "14px 20px", borderRadius: 16, border: `2px solid ${color}`, background: "rgba(255,255,255,0.06)", textAlign: "center" }}>
      <span style={{ color, fontSize: 22, fontWeight: 1000 }}>{team === "red" ? "RED" : "BLUE"}</span>
      <span style={{ marginLeft: 14, fontSize: 34, fontWeight: 1000 }}>{count}</span>
    </div>
  );
}

function StreamBoard({
  team,
  ids,
  boardSize,
  claimed,
}: {
  team: Team;
  ids: string[];
  boardSize: BoardSize;
  claimed: Set<string>;
}) {
  const color = team === "red" ? "#ff5252" : "#448aff";
  const centerIndex = Math.floor((boardSize * boardSize) / 2);

  return (
    <section style={{ padding: 14, borderRadius: 20, border: `4px solid ${color}`, background: "rgba(10,10,14,0.94)", minHeight: 0 }}>
      <div style={{ color, textAlign: "center", fontSize: 24, fontWeight: 1000, marginBottom: 10 }}>
        {team === "red" ? "🔴 RED BINGO" : "🔵 BLUE BINGO"}
      </div>

      {!ids.length ? (
        <div style={{ height: "calc(100% - 40px)", display: "grid", placeItems: "center", opacity: 0.5, fontWeight: 900 }}>盤面生成待ち</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`, gap: 5 }}>
          {ids.map((id, index) => {
            const character = getCharacter(id);
            const acquired = index === centerIndex || claimed.has(id);
            return (
              <div
                key={`${id}-${index}`}
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: acquired ? `3px solid ${color}` : "1px solid rgba(255,255,255,0.2)",
                  background: acquired ? color : "rgba(255,255,255,0.07)",
                }}
              >
                {character && <img src={character.image} alt={character.name} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: acquired ? 1 : 0.72 }} />}
                {acquired && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.12)", fontSize: "clamp(16px, 2vw, 34px)", fontWeight: 1000 }}>
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MemberBar({
  team,
  players,
  activeIds,
}: {
  team: Team;
  players: Player[];
  activeIds: Set<string>;
}) {
  const color = team === "red" ? "#ff5252" : "#448aff";
  return (
    <div style={{ padding: "14px 18px", borderRadius: 18, border: `2px solid ${color}`, background: "rgba(10,10,14,0.92)" }}>
      <div style={{ color, fontWeight: 1000, fontSize: 20, marginBottom: 10 }}>{team === "red" ? "🔴 RED TEAM" : "🔵 BLUE TEAM"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        {players.map((player) => (
          <div
            key={player.id}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: activeIds.has(player.id) ? color : "rgba(255,255,255,0.1)",
              color: activeIds.has(player.id) ? "white" : "rgba(255,255,255,0.72)",
              fontWeight: 900,
            }}
          >
            {player.player_name}
            {player.is_leader ? " ⭐" : ""}
            {player.is_host ? " 👑" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
