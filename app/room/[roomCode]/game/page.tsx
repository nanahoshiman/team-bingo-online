"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { characters } from "@/lib/characters";

type Team = "red" | "blue";
type BoardSize = 3 | 5 | 7;
type MatchStatus = "picking" | "in_match" | "resolving";

type Player = {
  id: string;
  player_name: string;
  is_host: boolean;
  is_leader: boolean;
  team: Team | null;
};

type BoardData = {
  red: string[];
  blue: string[];
};

type RoomData = {
  board_size: number | null;
  board_data: unknown;
  match_status: MatchStatus | null;
  last_red_picks: unknown;
  last_blue_picks: unknown;
};

type MatchResult = {
  id: string;
  created_at: string;
  room_code: string;
  winning_team: Team;
  character_id: string;
  registered_by_player_id: string;
  registered_by_name: string;
};

type CharacterPick = {
  id: string;
  created_at: string;
  room_code: string;
  player_id: string;
  player_name: string;
  team: Team;
  character_id: string;
  is_ready: boolean;
};

function shuffleArray<T>(items: T[]) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function isBoardSize(value: number | null): value is BoardSize {
  return value === 3 || value === 5 || value === 7;
}

function isBoardData(value: unknown): value is BoardData {
  if (typeof value !== "object" || value === null) return false;

  const data = value as {
    red?: unknown;
    blue?: unknown;
  };

  return Array.isArray(data.red) && Array.isArray(data.blue);
}

function isMatchStatus(value: unknown): value is MatchStatus {
  return (
    value === "picking" ||
    value === "in_match" ||
    value === "resolving"
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string => typeof item === "string"
  );
}

function getCharacter(characterId: string) {
  return characters.find(
    (character) => character.id === characterId
  );
}

function makeBoard(boardSize: BoardSize) {
  const totalCells = boardSize * boardSize;

  return shuffleArray(characters)
    .slice(0, totalCells)
    .map((character) => character.id);
}


function getWinningLines(boardSize: BoardSize) {
  const lines: number[][] = [];

  for (let row = 0; row < boardSize; row += 1) {
    lines.push(
      Array.from({ length: boardSize }, (_, col) => row * boardSize + col)
    );
  }

  for (let col = 0; col < boardSize; col += 1) {
    lines.push(
      Array.from({ length: boardSize }, (_, row) => row * boardSize + col)
    );
  }

  lines.push(
    Array.from({ length: boardSize }, (_, index) => index * boardSize + index)
  );

  lines.push(
    Array.from(
      { length: boardSize },
      (_, index) => index * boardSize + (boardSize - 1 - index)
    )
  );

  return lines;
}

function getBoardProgress(
  ids: string[],
  claimedIds: Set<string>,
  boardSize: BoardSize
) {
  const centerIndex = Math.floor((boardSize * boardSize) / 2);
  const acquiredIndexes = new Set<number>([centerIndex]);

  ids.forEach((id, index) => {
    if (claimedIds.has(id)) acquiredIndexes.add(index);
  });

  const lines = getWinningLines(boardSize);

  const bingoLines = lines.filter((line) =>
    line.every((index) => acquiredIndexes.has(index))
  );

  const reachLines = lines.filter((line) => {
    const remaining = line.filter(
      (index) => !acquiredIndexes.has(index)
    ).length;

    return remaining === 1 || remaining === 2;
  });

  const reachIndexes = new Set<number>();

  reachLines.forEach((line) => {
    line.forEach((index) => {
      if (!acquiredIndexes.has(index)) {
        reachIndexes.add(index);
      }
    });
  });

  return {
    bingoLines,
    reachLines,
    bingoIndexes: new Set(bingoLines.flat()),
    reachIndexes,
  };
}

export default function GamePage() {
  const params = useParams();
  const roomCode = String(params.roomCode ?? "").toUpperCase();

  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [boardSize, setBoardSize] =
    useState<BoardSize>(5);

  const [boardData, setBoardData] =
    useState<BoardData | null>(null);

  const [matchStatus, setMatchStatus] =
    useState<MatchStatus>("picking");

  const [lastRedPicks, setLastRedPicks] =
    useState<string[]>([]);

  const [lastBluePicks, setLastBluePicks] =
    useState<string[]>([]);

  const [matchResults, setMatchResults] =
    useState<MatchResult[]>([]);

  const [characterPicks, setCharacterPicks] =
    useState<CharacterPick[]>([]);

  const [generating, setGenerating] = useState(false);
  const [savingPick, setSavingPick] = useState(false);
  const [registeringResult, setRegisteringResult] =
    useState(false);

  const [selectedCharacterId, setSelectedCharacterId] =
    useState<string | null>(null);

  const [selectedWinningTeam, setSelectedWinningTeam] =
    useState<Team>("red");

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player")
      .select(
        "id, player_name, is_host, is_leader, team"
      )
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("プレイヤー取得エラー:", error);
      return;
    }

    setPlayers((data ?? []) as Player[]);
  }

  async function loadRoom() {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        "board_size, board_data, match_status, last_red_picks, last_blue_picks"
      )
      .eq("room_code", roomCode)
      .maybeSingle();

    if (error) {
      console.error("ルーム取得エラー:", error);
      return;
    }

    const room = data as RoomData | null;

    if (!room) return;

    if (isBoardSize(room.board_size)) {
      setBoardSize(room.board_size);
    }

    if (isBoardData(room.board_data)) {
      setBoardData(room.board_data);
    } else {
      setBoardData(null);
    }

    if (isMatchStatus(room.match_status)) {
      setMatchStatus(room.match_status);
    }

    setLastRedPicks(stringArray(room.last_red_picks));
    setLastBluePicks(stringArray(room.last_blue_picks));
  }

  async function loadMatchResults() {
    const { data, error } = await supabase
      .from("match_results")
      .select(
        "id, created_at, room_code, winning_team, character_id, registered_by_player_id, registered_by_name"
      )
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("勝敗履歴取得エラー:", error);
      return;
    }

    setMatchResults((data ?? []) as MatchResult[]);
  }

  async function loadCharacterPicks() {
    const { data, error } = await supabase
      .from("character_picks")
      .select(
        "id, created_at, room_code, player_id, player_name, team, character_id, is_ready"
      )
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("キャラ選択取得エラー:", error);
      return;
    }

    setCharacterPicks((data ?? []) as CharacterPick[]);
  }

  useEffect(() => {
    if (!roomCode) return;

    setMyPlayerId(sessionStorage.getItem("playerId"));

    Promise.all([
      loadPlayers(),
      loadRoom(),
      loadMatchResults(),
      loadCharacterPicks(),
    ]).finally(() => {
      setLoading(false);
    });

    const playerChannel = supabase
      .channel(`game-players-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player",
          filter: `room_code=eq.${roomCode}`,
        },
        () => loadPlayers()
      )
      .subscribe();

    const roomChannel = supabase
      .channel(`game-room-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `room_code=eq.${roomCode}`,
        },
        async (payload) => {
          const nextStatus = payload.new.match_status;

          if (nextStatus === "picking") {
            // 勝敗登録が終わって次の試合に入った瞬間、
            // 全ブラウザで前試合のピック状態を即クリアする。
            setCharacterPicks([]);
            setSelectedCharacterId(null);

            await Promise.all([
              loadRoom(),
              loadCharacterPicks(),
            ]);

            return;
          }

          await loadRoom();
        }
      )
      .subscribe();

    const resultChannel = supabase
      .channel(`game-results-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_results",
          filter: `room_code=eq.${roomCode}`,
        },
        () => loadMatchResults()
      )
      .subscribe();

    const picksChannel = supabase
      .channel(`game-picks-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "character_picks",
          filter: `room_code=eq.${roomCode}`,
        },
        () => loadCharacterPicks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(resultChannel);
      supabase.removeChannel(picksChannel);
    };
  }, [roomCode]);

  const redPlayers = useMemo(
    () =>
      players.filter(
        (player) => player.team === "red"
      ),
    [players]
  );

  const bluePlayers = useMemo(
    () =>
      players.filter(
        (player) => player.team === "blue"
      ),
    [players]
  );

  const myPlayer = useMemo(
    () =>
      players.find(
        (player) => player.id === myPlayerId
      ) ?? null,
    [players, myPlayerId]
  );

  const amHost = myPlayer?.is_host === true;
  const amLeader = myPlayer?.is_leader === true;

  const claimedRedIds = useMemo(
    () =>
      new Set(
        matchResults
          .filter(
            (result) =>
              result.winning_team === "red"
          )
          .map(
            (result) => result.character_id
          )
      ),
    [matchResults]
  );

  const claimedBlueIds = useMemo(
    () =>
      new Set(
        matchResults
          .filter(
            (result) =>
              result.winning_team === "blue"
          )
          .map(
            (result) => result.character_id
          )
      ),
    [matchResults]
  );

  const myPick = useMemo(
    () =>
      characterPicks.find(
        (pick) =>
          pick.player_id === myPlayerId &&
          pick.is_ready
      ) ?? null,
    [characterPicks, myPlayerId]
  );

  const readyPlayerIds = useMemo(
    () =>
      new Set(
        characterPicks
          .filter((pick) => pick.is_ready)
          .map((pick) => pick.player_id)
      ),
    [characterPicks]
  );

  const allPlayersReady =
    players.length > 0 &&
    players.every((player) =>
      readyPlayerIds.has(player.id)
    );

  const lockedRedIds = useMemo(
    () => new Set(lastRedPicks),
    [lastRedPicks]
  );

  const lockedBlueIds = useMemo(
    () => new Set(lastBluePicks),
    [lastBluePicks]
  );

  const redProgress = useMemo(
    () =>
      boardData
        ? getBoardProgress(boardData.red, claimedRedIds, boardSize)
        : {
            bingoLines: [],
            reachLines: [],
            bingoIndexes: new Set<number>(),
            reachIndexes: new Set<number>(),
          },
    [boardData, claimedRedIds, boardSize]
  );

  const blueProgress = useMemo(
    () =>
      boardData
        ? getBoardProgress(boardData.blue, claimedBlueIds, boardSize)
        : {
            bingoLines: [],
            reachLines: [],
            bingoIndexes: new Set<number>(),
            reachIndexes: new Set<number>(),
          },
    [boardData, claimedBlueIds, boardSize]
  );

  const winningTeam: Team | null =
    redProgress.bingoLines.length >= 2
      ? "red"
      : blueProgress.bingoLines.length >= 2
        ? "blue"
        : null;

  const gameFinished = winningTeam !== null;

  const canRegisterRed =
    !gameFinished &&
    allPlayersReady &&
    matchStatus === "in_match" &&
    (amHost ||
      (amLeader &&
        myPlayer?.team === "red"));

  const canRegisterBlue =
    !gameFinished &&
    allPlayersReady &&
    matchStatus === "in_match" &&
    (amHost ||
      (amLeader &&
        myPlayer?.team === "blue"));

  const canRegisterAny =
    canRegisterRed || canRegisterBlue;

  useEffect(() => {
    if (!myPlayer) return;

    if (
      !amHost &&
      amLeader &&
      myPlayer.team
    ) {
      setSelectedWinningTeam(
        myPlayer.team
      );
    }
  }, [myPlayer, amHost, amLeader]);

  async function generateBoards() {
    if (!amHost || generating) return;

    if (
      matchResults.length > 0 ||
      characterPicks.length > 0
    ) {
      alert(
        "ゲーム進行開始後は盤面を再生成できません。"
      );
      return;
    }

    const totalCells =
      boardSize * boardSize;

    if (
      characters.length <
      totalCells
    ) {
      alert(
        "盤面生成に必要なキャラクター数が足りません。"
      );
      return;
    }

    setGenerating(true);

    try {
      const nextBoardData: BoardData = {
        red: makeBoard(boardSize),
        blue: makeBoard(boardSize),
      };

      const { error } = await supabase
        .from("rooms")
        .update({
          board_size: boardSize,
          board_data: nextBoardData,
          match_status: "picking",
          last_red_picks: [],
          last_blue_picks: [],
        })
        .eq(
          "room_code",
          roomCode
        );

      if (error) {
        console.error(
          "盤面保存エラー:",
          error
        );

        alert(
          `ビンゴカードの保存に失敗しました。\n${error.message ?? ""}`
        );

        return;
      }

      setBoardData(nextBoardData);
      setMatchStatus("picking");
      setLastRedPicks([]);
      setLastBluePicks([]);
    } finally {
      setGenerating(false);
    }
  }

  function selectCharacter(
    characterId: string
  ) {
    if (
      !myPlayer ||
      !boardData ||
      myPick ||
      allPlayersReady ||
      matchStatus !== "picking"
    ) {
      return;
    }

    const myBoard =
      myPlayer.team === "red"
        ? boardData.red
        : myPlayer.team === "blue"
          ? boardData.blue
          : [];

    if (
      !myBoard.includes(characterId)
    ) {
      return;
    }

    const claimedIds =
      myPlayer.team === "red"
        ? claimedRedIds
        : claimedBlueIds;

    const lockedIds =
      myPlayer.team === "red"
        ? lockedRedIds
        : lockedBlueIds;

    if (
      claimedIds.has(characterId)
    ) {
      alert(
        "このマスはすでに獲得済みです。"
      );
      return;
    }

    if (
      lockedIds.has(characterId)
    ) {
      return;
    }

    setSelectedCharacterId(
      characterId
    );
  }

  async function confirmCharacterPick() {
    if (
      !myPlayer ||
      !myPlayer.team ||
      !selectedCharacterId ||
      !boardData ||
      savingPick ||
      myPick ||
      matchStatus !== "picking"
    ) {
      return;
    }

    const lockedIds =
      myPlayer.team === "red"
        ? lockedRedIds
        : lockedBlueIds;

    if (
      lockedIds.has(
        selectedCharacterId
      )
    ) {
      alert(
        "直前の試合でチームが使用したキャラは連続で選べません。"
      );
      return;
    }

    const character =
      getCharacter(
        selectedCharacterId
      );

    if (
      !window.confirm(
        `${character?.name ?? selectedCharacterId}で決定しますか？`
      )
    ) {
      return;
    }

    setSavingPick(true);

    try {
      const { error } =
        await supabase
          .from("character_picks")
          .insert({
            room_code:
              roomCode,
            player_id:
              myPlayer.id,
            player_name:
              myPlayer.player_name,
            team:
              myPlayer.team,
            character_id:
              selectedCharacterId,
            is_ready: true,
          });

      if (error) {
        console.error(
          "キャラ選択保存エラー:",
          error
        );

        alert(
          `キャラ選択の保存に失敗しました。\n${error.message ?? ""}`
        );

        return;
      }

      setSelectedCharacterId(
        null
      );

      const {
        count: readyCount,
        error: readyCountError,
      } = await supabase
        .from("character_picks")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("room_code", roomCode)
        .eq("is_ready", true);

      if (readyCountError) {
        console.error(
          "選択完了人数確認エラー:",
          readyCountError
        );
      }

      if (
        !readyCountError &&
        (readyCount ?? 0) >= players.length
      ) {
        const { error: startError } =
          await supabase
            .from("rooms")
            .update({
              match_status: "in_match",
            })
            .eq("room_code", roomCode)
            .eq("match_status", "picking");

        if (startError) {
          console.error(
            "試合開始状態更新エラー:",
            startError
          );
        }
      }

      await Promise.all([
        loadCharacterPicks(),
        loadRoom(),
      ]);
    } finally {
      setSavingPick(false);
    }
  }

  async function registerMatchResult() {
    if (
      !myPlayer ||
      !allPlayersReady ||
      !canRegisterAny ||
      registeringResult
    ) {
      return;
    }

    if (
      selectedWinningTeam === "red" &&
      !canRegisterRed
    ) {
      alert(
        "赤チームの勝利を登録する権限がありません。"
      );
      return;
    }

    if (
      selectedWinningTeam === "blue" &&
      !canRegisterBlue
    ) {
      alert(
        "青チームの勝利を登録する権限がありません。"
      );
      return;
    }

    setRegisteringResult(true);

    try {
      const {
        data: lockRows,
        error: lockError,
      } = await supabase
        .from("rooms")
        .update({
          match_status: "resolving",
        })
        .eq(
          "room_code",
          roomCode
        )
        .eq(
          "match_status",
          "in_match"
        )
        .select("room_code");

      if (lockError) {
        console.error(
          "勝敗登録ロックエラー:",
          lockError
        );

        alert(
          "勝敗登録の開始に失敗しました。"
        );

        return;
      }

      if (
        !lockRows ||
        lockRows.length === 0
      ) {
        alert(
          "この試合の勝敗はすでに登録処理されています。"
        );

        await loadRoom();
        await loadCharacterPicks();
        return;
      }

      const winningPicks =
        characterPicks.filter(
          (pick) =>
            pick.is_ready &&
            pick.team ===
              selectedWinningTeam
        );

      const existingClaimedIds =
        selectedWinningTeam === "red"
          ? claimedRedIds
          : claimedBlueIds;

      const uniqueWinningCharacterIds =
        Array.from(
          new Set(
            winningPicks
              .map(
                (pick) =>
                  pick.character_id
              )
              .filter(
                (id) =>
                  !existingClaimedIds.has(
                    id
                  )
              )
          )
        );

      if (
        !window.confirm(
          `${
            selectedWinningTeam ===
            "red"
              ? "🔴 赤チーム"
              : "🔵 青チーム"
          }の勝利を登録しますか？\n\n獲得マス：${uniqueWinningCharacterIds.length}マス`
        )
      ) {
        await supabase
          .from("rooms")
          .update({
            match_status:
              "in_match",
          })
          .eq(
            "room_code",
            roomCode
          )
          .eq(
            "match_status",
            "resolving"
          );

        return;
      }

      if (
        uniqueWinningCharacterIds.length >
        0
      ) {
        const rows =
          uniqueWinningCharacterIds.map(
            (characterId) => ({
              room_code:
                roomCode,
              winning_team:
                selectedWinningTeam,
              character_id:
                characterId,
              registered_by_player_id:
                myPlayer.id,
              registered_by_name:
                myPlayer.player_name,
            })
          );

        const { error: resultError } =
          await supabase
            .from(
              "match_results"
            )
            .insert(rows);

        if (resultError) {
          console.error(
            "勝敗登録エラー:",
            resultError
          );

          await supabase
            .from("rooms")
            .update({
              match_status:
                "in_match",
            })
            .eq(
              "room_code",
              roomCode
            )
            .eq(
              "match_status",
              "resolving"
            );

          alert(
            `勝敗登録に失敗しました。\n${resultError.message ?? ""}`
          );

          return;
        }
      }

      const currentRedPicks =
        Array.from(
          new Set(
            characterPicks
              .filter(
                (pick) =>
                  pick.is_ready &&
                  pick.team === "red"
              )
              .map(
                (pick) =>
                  pick.character_id
              )
          )
        );

      const currentBluePicks =
        Array.from(
          new Set(
            characterPicks
              .filter(
                (pick) =>
                  pick.is_ready &&
                  pick.team === "blue"
              )
              .map(
                (pick) =>
                  pick.character_id
              )
          )
        );

      const { error: deleteError } =
        await supabase
          .from(
            "character_picks"
          )
          .delete()
          .eq(
            "room_code",
            roomCode
          );

      if (deleteError) {
        console.error(
          "キャラ選択リセットエラー:",
          deleteError
        );

        alert(
          `次試合へのリセットに失敗しました。\n${deleteError.message ?? ""}`
        );

        return;
      }

      const { error: roomError } =
        await supabase
          .from("rooms")
          .update({
            last_red_picks:
              currentRedPicks,
            last_blue_picks:
              currentBluePicks,
            match_status:
              "picking",
          })
          .eq(
            "room_code",
            roomCode
          )
          .eq(
            "match_status",
            "resolving"
          );

      if (roomError) {
        console.error(
          "次試合状態更新エラー:",
          roomError
        );

        alert(
          `次試合の準備に失敗しました。\n${roomError.message ?? ""}`
        );

        return;
      }

      setSelectedCharacterId(
        null
      );

      await Promise.all([
        loadRoom(),
        loadMatchResults(),
        loadCharacterPicks(),
      ]);
    } finally {
      setRegisteringResult(false);
    }
  }


  async function playAgainSameMembers() {
    if (!amHost) return;

    const { error: picksError } = await supabase
      .from("character_picks")
      .delete()
      .eq("room_code", roomCode);

    if (picksError) {
      alert(`キャラ選択のリセットに失敗しました。\n${picksError.message ?? ""}`);
      return;
    }

    const { error: resultsError } = await supabase
      .from("match_results")
      .delete()
      .eq("room_code", roomCode);

    if (resultsError) {
      alert(`獲得履歴のリセットに失敗しました。\n${resultsError.message ?? ""}`);
      return;
    }

    const { error: playersError } = await supabase
      .from("player")
      .update({
        team: null,
        is_leader: false,
      })
      .eq("room_code", roomCode);

    if (playersError) {
      alert(`チーム情報のリセットに失敗しました。\n${playersError.message ?? ""}`);
      return;
    }

    const { error: roomError } = await supabase
      .from("rooms")
      .update({
        status: "team_setup",
        board_data: null,
        match_status: "picking",
        last_red_picks: [],
        last_blue_picks: [],
      })
      .eq("room_code", roomCode);

    if (roomError) {
      alert(`ゲームのリセットに失敗しました。\n${roomError.message ?? ""}`);
      return;
    }

    window.location.href = `/room/${roomCode}/teams`;
  }

  function returnToStart() {
    sessionStorage.removeItem("playerId");
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
        }}
      >
        読み込み中...
      </main>
    );
  }

  return (
    <main
      className="game-main"
      style={{
        minHeight: "100vh",
        padding: 20,
        background:
          "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)",
        color: "#222",
      }}
    >
      <style>{`
        @keyframes bingoReachFlash {
          0%, 100% {
            opacity: 0.18;
            box-shadow:
              inset 0 0 6px rgba(255,255,255,0.35),
              0 0 4px rgba(255,255,255,0.25);
          }
          45% {
            opacity: 1;
            box-shadow:
              inset 0 0 28px rgba(255,255,255,0.98),
              0 0 22px rgba(255,255,255,0.98),
              0 0 36px rgba(255,255,255,0.75);
          }
          60% {
            opacity: 0.45;
            box-shadow:
              inset 0 0 12px rgba(255,255,255,0.55),
              0 0 10px rgba(255,255,255,0.45);
          }
        }

        @media (max-width: 700px) {
          .game-main {
            padding: 10px !important;
            align-items: start;
          }

          .game-shell {
            padding: 16px 12px !important;
            border-radius: 16px !important;
          }

          .responsive-team-grid,
          .responsive-board-grid {
            grid-template-columns: 1fr !important;
          }

          .responsive-team-item[data-own="true"],
          .responsive-board-item[data-own="true"] {
            order: 0;
          }

          .responsive-team-item[data-own="false"],
          .responsive-board-item[data-own="false"] {
            order: 1;
          }

          .team-members-card {
            padding: 12px !important;
          }

          .team-members-title {
            margin: 4px 0 8px !important;
            font-size: 20px !important;
          }

          .team-member-row {
            gap: 10px !important;
            align-items: center !important;
          }

          .team-member-name {
            min-width: 0;
            overflow-wrap: anywhere;
          }

          .team-member-status {
            flex-shrink: 0;
            white-space: nowrap;
            font-size: 14px;
          }

          .character-board {
            padding: 10px !important;
          }

          .character-board[data-own="true"] {
            border-width: 8px !important;
          }

          .character-board[data-own="false"] {
            border-width: 3px !important;
          }

          .character-board-title {
            margin: 4px 0 8px !important;
            font-size: 20px !important;
          }

          .character-board-grid {
            gap: 5px !important;
          }
        }
      `}</style>

      <section
        className="game-shell"
        style={{
          width: "100%",
          maxWidth: 1180,
          margin: "0 auto",
          padding: 28,
          borderRadius: 20,
          backgroundColor: "white",
          boxShadow:
            "0 12px 32px rgba(0,0,0,0.12)",
        }}
      >
        <header
          style={{
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <h1 style={{ margin: 0 }}>
            ななほしのビンゴツール
          </h1>

          <div
            style={{
              marginTop: 6,
              color: "#6a1b9a",
              fontWeight: 900,
            }}
          >
            ONLINE
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#666",
              fontWeight: 800,
            }}
          >
            ROOM {roomCode}
          </div>
        </header>

        <div
          className="responsive-team-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div
            className="responsive-team-item"
            data-own={myPlayer?.team === "red"}
          >
          <TeamMembers
            title="🔴 赤チーム"
            players={redPlayers}
            readyPlayerIds={
              readyPlayerIds
            }
            myPlayerId={
              myPlayerId
            }
            borderColor="#d32f2f"
            backgroundColor="#fff7f7"
            titleColor="#b71c1c"
          />
          </div>

          <div
            className="responsive-team-item"
            data-own={myPlayer?.team === "blue"}
          >
          <TeamMembers
            title="🔵 青チーム"
            players={bluePlayers}
            readyPlayerIds={
              readyPlayerIds
            }
            myPlayerId={
              myPlayerId
            }
            borderColor="#1565c0"
            backgroundColor="#f5f9ff"
            titleColor="#0d47a1"
          />
          </div>
        </div>

        {boardData === null ? (
          amHost ? (
            <section
              style={{
                marginTop: 24,
                padding: 18,
                borderRadius: 16,
                backgroundColor:
                  "#fafafa",
                border:
                  "1px solid #ddd",
              }}
            >
              <h2
                style={{
                  textAlign:
                    "center",
                }}
              >
                ビンゴ盤面サイズ
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {[3, 5, 7].map(
                  (size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() =>
                        setBoardSize(
                          size as BoardSize
                        )
                      }
                      style={{
                        padding: 18,
                        borderRadius:
                          12,
                        border:
                          boardSize ===
                          size
                            ? "3px solid #6a1b9a"
                            : "1px solid #ccc",
                        fontWeight:
                          900,
                        cursor:
                          "pointer",
                      }}
                    >
                      {size}×{size}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={
                  generateBoards
                }
                disabled={
                  generating
                }
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: 15,
                  border: "none",
                  borderRadius:
                    12,
                  backgroundColor:
                    "#6a1b9a",
                  color:
                    "white",
                  fontWeight:
                    900,
                }}
              >
                🎲 ビンゴカードを生成
              </button>
            </section>
          ) : (
            <StatusBox text="ホストがビンゴカードを生成しています..." />
          )
        ) : (
          <>
            {gameFinished && winningTeam && (
              <section
                style={{
                  marginTop: 26,
                  padding: "34px 20px",
                  borderRadius: 22,
                  textAlign: "center",
                  background:
                    winningTeam === "red"
                      ? "linear-gradient(135deg, #4b0000 0%, #d32f2f 55%, #ffca28 100%)"
                      : "linear-gradient(135deg, #001d4b 0%, #1565c0 55%, #ffca28 100%)",
                  color: "white",
                  border: "4px solid #ffd54f",
                  boxShadow: "0 14px 36px rgba(0,0,0,0.28)",
                }}
              >
                <div
                  style={{
                    fontSize: "clamp(42px, 9vw, 78px)",
                    lineHeight: 1,
                    fontWeight: 1000,
                    letterSpacing: 3,
                    textShadow: "0 4px 14px rgba(0,0,0,0.35)",
                  }}
                >
                  {winningTeam === "red" ? "RED TEAM" : "BLUE TEAM"}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: "clamp(34px, 7vw, 62px)",
                    fontWeight: 1000,
                    letterSpacing: 8,
                  }}
                >
                  WIN!!
                </div>

                {amHost ? (
                  <div
                    style={{
                      marginTop: 30,
                      padding: 18,
                      borderRadius: 18,
                      backgroundColor: "rgba(0,0,0,0.30)",
                      border: "2px solid rgba(255,255,255,0.72)",
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 14,
                        fontSize: 20,
                        fontWeight: 1000,
                        letterSpacing: 1,
                      }}
                    >
                      NEXT GAME
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 14,
                      }}
                    >
                      <button
                        type="button"
                        onClick={playAgainSameMembers}
                        style={{
                          minHeight: 86,
                          padding: "16px 14px",
                          border: "3px solid white",
                          borderRadius: 14,
                          backgroundColor: "#6a1b9a",
                          color: "white",
                          fontSize: 18,
                          fontWeight: 1000,
                          cursor: "pointer",
                          boxShadow: "0 8px 18px rgba(0,0,0,0.24)",
                        }}
                      >
                        🎲 同じメンバーで
                        <br />
                        チームを組み直す
                      </button>

                      <button
                        type="button"
                        onClick={returnToStart}
                        style={{
                          minHeight: 86,
                          padding: "16px 14px",
                          border: "3px solid white",
                          borderRadius: 14,
                          backgroundColor: "#263238",
                          color: "white",
                          fontSize: 18,
                          fontWeight: 1000,
                          cursor: "pointer",
                          boxShadow: "0 8px 18px rgba(0,0,0,0.24)",
                        }}
                      >
                        🏠 メンバーを変更して
                        <br />
                        最初の画面へ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 24, fontWeight: 900 }}>
                    ホストが次のゲームを準備しています...
                  </div>
                )}
              </section>
            )}

            {!gameFinished &&
              allPlayersReady &&
              matchStatus ===
                "in_match" && (
                <div
                  style={{
                    marginTop:
                      26,
                    padding:
                      "24px 16px",
                    borderRadius:
                      18,
                    textAlign:
                      "center",
                    background:
                      "linear-gradient(135deg, #fff1d6 0%, #ffe6e6 50%, #eee7ff 100%)",
                    border:
                      "3px solid #ff7a00",
                    fontSize:
                      "clamp(30px, 7vw, 54px)",
                    fontWeight:
                      1000,
                  }}
                >
                  🔥 試合開始！！ 🔥
                </div>
              )}

            <section
              style={{
                marginTop: 26,
              }}
            >
              <div
                className="responsive-board-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: 16,
                }}
              >
                <div
                  className="responsive-board-item"
                  data-own={myPlayer?.team === "red"}
                >
                <CharacterBoard
                  title="🔴 赤チーム"
                  team="red"
                  ids={
                    boardData.red
                  }
                  claimedIds={
                    claimedRedIds
                  }
                  bingoIndexes={redProgress.bingoIndexes}
                  reachIndexes={redProgress.reachIndexes}
                  lockedIds={
                    lockedRedIds
                  }
                  boardSize={
                    boardSize
                  }
                  borderColor="#d32f2f"
                  claimColor="rgba(211,47,47,0.32)"
                  isOwnBoard={
                    myPlayer?.team ===
                    "red"
                  }
                  canSelect={
                    myPlayer?.team ===
                      "red" &&
                    !gameFinished &&
                    !myPick &&
                    !allPlayersReady &&
                    matchStatus ===
                      "picking"
                  }
                  selectedCharacterId={
                    myPlayer?.team ===
                    "red"
                      ? selectedCharacterId
                      : null
                  }
                  onSelect={
                    selectCharacter
                  }
                />
                </div>

                <div
                  className="responsive-board-item"
                  data-own={myPlayer?.team === "blue"}
                >
                <CharacterBoard
                  title="🔵 青チーム"
                  team="blue"
                  ids={
                    boardData.blue
                  }
                  claimedIds={
                    claimedBlueIds
                  }
                  bingoIndexes={blueProgress.bingoIndexes}
                  reachIndexes={blueProgress.reachIndexes}
                  lockedIds={
                    lockedBlueIds
                  }
                  boardSize={
                    boardSize
                  }
                  borderColor="#1565c0"
                  claimColor="rgba(21,101,192,0.32)"
                  isOwnBoard={
                    myPlayer?.team ===
                    "blue"
                  }
                  canSelect={
                    myPlayer?.team ===
                      "blue" &&
                    !gameFinished &&
                    !myPick &&
                    !allPlayersReady &&
                    matchStatus ===
                      "picking"
                  }
                  selectedCharacterId={
                    myPlayer?.team ===
                    "blue"
                      ? selectedCharacterId
                      : null
                  }
                  onSelect={
                    selectCharacter
                  }
                />
                </div>
              </div>
            </section>

            {!gameFinished &&
              !allPlayersReady &&
              matchStatus ===
                "picking" && (
                <section
                  style={{
                    marginTop:
                      24,
                    padding: 18,
                    borderRadius:
                      16,
                    backgroundColor:
                      "#fafafa",
                    border:
                      "1px solid #ddd",
                  }}
                >
                  <h2
                    style={{
                      textAlign:
                        "center",
                    }}
                  >
                    キャラ選択
                  </h2>

                  {myPick ? (
                    <StatusBox text="✓ キャラ選択完了" />
                  ) : selectedCharacterId ? (
                    <>
                      <div
                        style={{
                          width:
                            150,
                          margin:
                            "0 auto",
                          aspectRatio:
                            "1 / 1",
                          display:
                            "grid",
                          placeItems:
                            "center",
                        }}
                      >
                        {(() => {
                          const character =
                            getCharacter(
                              selectedCharacterId
                            );

                          if (
                            !character
                          ) {
                            return "?";
                          }

                          return (
                            <img
                              src={
                                character.image
                              }
                              alt={
                                character.name
                              }
                              style={{
                                width:
                                  "92%",
                                height:
                                  "92%",
                                objectFit:
                                  "contain",
                              }}
                            />
                          );
                        })()}
                      </div>

                      <button
                        type="button"
                        onClick={
                          confirmCharacterPick
                        }
                        disabled={
                          savingPick
                        }
                        style={{
                          width:
                            "100%",
                          marginTop:
                            16,
                          padding:
                            15,
                          border:
                            "none",
                          borderRadius:
                            12,
                          backgroundColor:
                            "#188038",
                          color:
                            "white",
                          fontWeight:
                            900,
                        }}
                      >
                        ✓ このキャラで決定！
                      </button>
                    </>
                  ) : (
                    <StatusBox text="自分のチームのカードからキャラを選択してください" />
                  )}
                </section>
              )}

            {allPlayersReady &&
              matchStatus ===
                "in_match" &&
              canRegisterAny && (
                <section
                  style={{
                    marginTop:
                      24,
                    padding: 20,
                    borderRadius:
                      16,
                    border:
                      "2px solid #ff9800",
                    backgroundColor:
                      "#fffaf0",
                  }}
                >
                  <h2
                    style={{
                      textAlign:
                        "center",
                    }}
                  >
                    🏆 勝敗登録
                  </h2>

                  {amHost && (
                    <div
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "repeat(2, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedWinningTeam(
                            "red"
                          )
                        }
                        style={{
                          padding: "14px 12px",
                          borderRadius: 12,
                          border:
                            selectedWinningTeam === "red"
                              ? "4px solid #d32f2f"
                              : "2px solid #c8c8c8",
                          background:
                            selectedWinningTeam === "red"
                              ? "linear-gradient(145deg, #fff 0%, #ffcaca 100%)"
                              : "#fff",
                          color: "#b71c1c",
                          fontSize: 17,
                          fontWeight: 1000,
                          cursor: "pointer",
                          boxShadow:
                            selectedWinningTeam === "red"
                              ? "0 0 0 3px rgba(211,47,47,0.16)"
                              : "none",
                        }}
                      >
                        {selectedWinningTeam === "red"
                          ? "🔴 RED TEAM 勝利を選択中"
                          : "🔴 RED TEAM 勝利"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedWinningTeam(
                            "blue"
                          )
                        }
                        style={{
                          padding: "14px 12px",
                          borderRadius: 12,
                          border:
                            selectedWinningTeam === "blue"
                              ? "4px solid #1565c0"
                              : "2px solid #c8c8c8",
                          background:
                            selectedWinningTeam === "blue"
                              ? "linear-gradient(145deg, #fff 0%, #c9ddff 100%)"
                              : "#fff",
                          color: "#0d47a1",
                          fontSize: 17,
                          fontWeight: 1000,
                          cursor: "pointer",
                          boxShadow:
                            selectedWinningTeam === "blue"
                              ? "0 0 0 3px rgba(21,101,192,0.16)"
                              : "none",
                        }}
                      >
                        {selectedWinningTeam === "blue"
                          ? "🔵 BLUE TEAM 勝利を選択中"
                          : "🔵 BLUE TEAM 勝利"}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={
                      registerMatchResult
                    }
                    disabled={
                      registeringResult
                    }
                    style={{
                      width:
                        "100%",
                      marginTop:
                        16,
                      padding: 15,
                      border:
                        "none",
                      borderRadius:
                        12,
                      backgroundColor:
                        "#188038",
                      color:
                        "white",
                      fontWeight:
                        900,
                    }}
                  >
                    {amHost
                      ? `✓ ${
                          selectedWinningTeam === "red"
                            ? "RED TEAM"
                            : "BLUE TEAM"
                        } の勝利を登録して次の試合へ`
                      : "✓ 勝敗を登録して次の試合へ"}
                  </button>
                </section>
              )}

            {matchStatus ===
              "resolving" && (
              <StatusBox text="勝敗を反映しています..." />
            )}

            <MatchHistory
              results={
                matchResults
              }
            />
          </>
        )}
      </section>
    </main>
  );
}

function TeamMembers({
  title,
  players,
  readyPlayerIds,
  myPlayerId,
  borderColor,
  backgroundColor,
  titleColor,
}: {
  title: string;
  players: Player[];
  readyPlayerIds: Set<string>;
  myPlayerId: string | null;
  borderColor: string;
  backgroundColor: string;
  titleColor: string;
}) {
  return (
    <section
      className="team-members-card"
      style={{
        padding: 16,
        border: `2px solid ${borderColor}`,
        borderRadius: 14,
        backgroundColor,
      }}
    >
      <h2
        className="team-members-title"
        style={{
          color: titleColor,
          textAlign: "center",
        }}
      >
        {title}
      </h2>

      {players.map(
        (player) => (
          <div
            className="team-member-row"
            key={
              player.id
            }
            style={{
              padding: 10,
              marginTop: 8,
              borderRadius:
                9,
              backgroundColor:
                "white",
              fontWeight:
                800,
              display:
                "flex",
              justifyContent:
                "space-between",
            }}
          >
            <span className="team-member-name">
              {
                player.player_name
              }
              {player.id ===
              myPlayerId
                ? "（あなた）"
                : ""}
              {player.is_host
                ? " 👑"
                : ""}
              {player.is_leader
                ? " ⭐"
                : ""}
            </span>

            <span className="team-member-status">
              {readyPlayerIds.has(
                player.id
              )
                ? "✓ 選択済み"
                : "未選択"}
            </span>
          </div>
        )
      )}
    </section>
  );
}

function CharacterBoard({
  title,
  team,
  ids,
  claimedIds,
  bingoIndexes,
  reachIndexes,
  lockedIds,
  boardSize,
  borderColor,
  claimColor,
  isOwnBoard,
  canSelect,
  selectedCharacterId,
  onSelect,
}: {
  title: string;
  team: Team;
  ids: string[];
  claimedIds: Set<string>;
  bingoIndexes: Set<number>;
  reachIndexes: Set<number>;
  lockedIds: Set<string>;
  boardSize: BoardSize;
  borderColor: string;
  claimColor: string;
  isOwnBoard: boolean;
  canSelect: boolean;
  selectedCharacterId: string | null;
  onSelect: (
    characterId: string
  ) => void;
}) {
  const centerIndex =
    Math.floor(
      (boardSize * boardSize) /
        2
    );

  return (
    <section
      className="character-board"
      data-own={isOwnBoard}
      style={{
        padding: 16,
        border: `${isOwnBoard ? 12 : 4}px solid ${borderColor}`,
        borderRadius: 18,
        background: isOwnBoard
          ? team === "red"
            ? "linear-gradient(145deg, #ffffff 0%, #ffcaca 100%)"
            : "linear-gradient(145deg, #ffffff 0%, #c9ddff 100%)"
          : "linear-gradient(145deg, #bdbdbd 0%, #8f8f8f 100%)",
        boxShadow: isOwnBoard
          ? `0 8px 22px ${
              team === "red"
                ? "rgba(211,47,47,0.12)"
                : "rgba(21,101,192,0.12)"
            }`
          : "none",
        opacity: 1,
      }}
    >
      <h2
        className="character-board-title"
        style={{
          textAlign: "center",
        }}
      >
        {title}
      </h2>

      <div
        className="character-board-grid"
        style={{
          display: "grid",
          gridTemplateColumns:
            `repeat(${boardSize}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {ids.map(
          (
            id,
            index
          ) => {
            const character =
              getCharacter(id);

            const centerFree =
              index === centerIndex;

            const claimed =
              centerFree ||
              claimedIds.has(id);

            const locked =
              isOwnBoard &&
              lockedIds.has(id) &&
              !claimed;

            const selected =
              selectedCharacterId ===
              id;

            const inBingo =
              bingoIndexes.has(index);

            const inReach =
              reachIndexes.has(index) &&
              !claimed &&
              !inBingo;

            const clickable =
              canSelect &&
              !claimed &&
              !locked;

            return (
              <button
                key={`${team}-${id}-${index}`}
                type="button"
                onClick={() =>
                  clickable &&
                  onSelect(id)
                }
                disabled={
                  !clickable
                }
                style={{
                  position:
                    "relative",
                  aspectRatio:
                    "1 / 1",
                  padding: 4,
                 border:
  selected
  ? `4px solid ${team === "red" ? "#e53935" : "#1e88e5"}`
    : inBingo
      ? `5px solid ${
          team === "red" ? "#8b0000" : "#003b8f"
        }`
      : inReach
        ? "4px solid #ffd400"
        : `2px solid ${borderColor}`,
                  borderRadius:
                    8,
                  overflow:
                    "hidden",
                  backgroundColor:
                    selected
  ? team === "red"
    ? "#ffe5e5"
    : "#e5f0ff"
                      : "white",
                  cursor:
                    clickable
                      ? "pointer"
                      : "default",
                }}
              >
                {character ? (
                  <img
                    src={
                      character.image
                    }
                    alt={
                      character.name
                    }
                    style={{
                      width:
                        "92%",
                      height:
                        "92%",
                      objectFit:
                        "contain",
                      opacity:
                        claimed
                          ? 0.72
                          : locked
                            ? 0.48
                            : 1,
                      filter:
                        locked
                          ? "grayscale(0.85)"
                          : "none",
                    }}
                  />
                ) : (
                  "?"
                )}

                {claimed && (
                  <div
                    style={{
                      position:
                        "absolute",
                      inset: 0,
                      backgroundColor:
                        claimColor,
                    }}
                  />
                )}

                {locked && (
                  <div
                    style={{
                      position:
                        "absolute",
                      inset: 0,
                      background:
                        "repeating-linear-gradient(135deg, rgba(60,60,60,0.16) 0 7px, rgba(60,60,60,0.38) 7px 12px)",
                    }}
                  />
                )}

                {inReach && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 2,
                      border: "2px solid rgba(255,232,74,0.95)",
                      borderRadius: 6,
                      background:
                        "radial-gradient(circle at center, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.10) 48%, rgba(255,255,255,0) 76%)",
                      animation: "bingoReachFlash 0.95s ease-in-out infinite",
                      pointerEvents: "none",
                    }}
                  />
                )}

               

                {selected &&
                  !claimed &&
                  !locked && (
                    <div
                      style={{
                        position:
                          "absolute",
                        inset:
                          3,
                        border:
                          "3px solid #ff9800",
                        borderRadius:
                          6,
                        pointerEvents:
                          "none",
                      }}
                    />
                  )}
              </button>
            );
          }
        )}
      </div>
    </section>
  );
}

function MatchHistory({
  results,
}: {
  results: MatchResult[];
}) {
  return (
    <section
      style={{
        marginTop: 24,
        padding: 18,
        borderRadius: 16,
        backgroundColor:
          "#fafafa",
        border:
          "1px solid #ddd",
      }}
    >
      <h2
        style={{
          textAlign: "center",
        }}
      >
        📜 獲得履歴
      </h2>

      {results.length === 0 ? (
        <div
          style={{
            textAlign:
              "center",
            color: "#777",
          }}
        >
          まだ獲得マスはありません
        </div>
      ) : (
        [...results]
          .reverse()
          .map(
            (result) => {
              const character =
                getCharacter(
                  result.character_id
                );

              return (
                <div
                  key={
                    result.id
                  }
                  style={{
                    padding:
                      10,
                    marginTop:
                      8,
                    borderRadius:
                      10,
                    backgroundColor:
                      result.winning_team ===
                      "red"
                        ? "#fff0f0"
                        : "#eef5ff",
                    fontWeight:
                      800,
                  }}
                >
                  {result.winning_team ===
                  "red"
                    ? "🔴 赤チーム"
                    : "🔵 青チーム"}{" "}
                  /{" "}
                  {character?.name ??
                    result.character_id}
                </div>
              );
            }
          )
      )}
    </section>
  );
}

function StatusBox({
  text,
}: {
  text: string;
}) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: 14,
        textAlign: "center",
        backgroundColor:
          "#f5f5f5",
        borderRadius: 12,
        fontWeight: 800,
        color: "#666",
      }}
    >
      {text}
    </div>
  );
}
