"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  active_red_player_ids: unknown;
  active_blue_player_ids: unknown;
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
    value === "selecting_players" ||
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

  const [activeRedPlayerIds, setActiveRedPlayerIds] =
    useState<string[]>([]);

  const [activeBluePlayerIds, setActiveBluePlayerIds] =
    useState<string[]>([]);

  const [draftRedPlayerIds, setDraftRedPlayerIds] =
    useState<string[]>([]);

  const [draftBluePlayerIds, setDraftBluePlayerIds] =
    useState<string[]>([]);

  const [savingActivePlayers, setSavingActivePlayers] =
    useState(false);

  const [matchResults, setMatchResults] =
    useState<MatchResult[]>([]);

  const [characterPicks, setCharacterPicks] =
    useState<CharacterPick[]>([]);

  const [generating, setGenerating] = useState(false);
  const [savingPick, setSavingPick] = useState(false);
  const [registeringResult, setRegisteringResult] =
    useState(false);
  const [undoingResult, setUndoingResult] = useState(false);

  const [selectedCharacterId, setSelectedCharacterId] =
    useState<string | null>(null);

  const [selectedWinningTeam, setSelectedWinningTeam] =
    useState<Team>("red");

  const [refreshingState, setRefreshingState] = useState(false);

  function getStoredPlayerId() {
    const sessionRoomCode = sessionStorage.getItem("roomCode");
    const sessionPlayerId = sessionStorage.getItem("playerId");
    if (sessionPlayerId && (!sessionRoomCode || sessionRoomCode === roomCode)) {
      return sessionPlayerId;
    }

    const savedRoomCode = localStorage.getItem("roomCode");
    const savedPlayerId = localStorage.getItem("playerId");
    if (savedPlayerId && savedRoomCode === roomCode) {
      sessionStorage.setItem("playerId", savedPlayerId);
      sessionStorage.setItem("roomCode", roomCode);
      const savedGameMode = localStorage.getItem("gameMode");
      if (savedGameMode) sessionStorage.setItem("gameMode", savedGameMode);
      return savedPlayerId;
    }

    return null;
  }

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
        "board_size, board_data, match_status, last_red_picks, last_blue_picks, active_red_player_ids, active_blue_player_ids"
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
    setActiveRedPlayerIds(stringArray(room.active_red_player_ids));
    setActiveBluePlayerIds(stringArray(room.active_blue_player_ids));
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

  async function resyncGameState() {
    await Promise.all([
      loadPlayers(),
      loadRoom(),
      loadMatchResults(),
      loadCharacterPicks(),
    ]);
  }

  async function refreshGameStateManually() {
    if (refreshingState) return;

    setRefreshingState(true);

    try {
      await resyncGameState();
    } finally {
      setRefreshingState(false);
    }
  }

  useEffect(() => {
    if (!roomCode) return;

    setMyPlayerId(getStoredPlayerId());

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

          if (nextStatus === "picking" || nextStatus === "selecting_players") {
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

  useEffect(() => {
    if (!roomCode) return;

    const syncWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void resyncGameState();
    };

    const syncWhenFocused = () => {
      void resyncGameState();
    };

    window.addEventListener("focus", syncWhenFocused);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.removeEventListener("focus", syncWhenFocused);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void resyncGameState();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
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

  const activePlayerIds = useMemo(
    () => new Set([...activeRedPlayerIds, ...activeBluePlayerIds]),
    [activeRedPlayerIds, activeBluePlayerIds]
  );

  const activePlayers = useMemo(
    () => players.filter((player) => activePlayerIds.has(player.id)),
    [players, activePlayerIds]
  );

  const amActivePlayer =
    !!myPlayerId && activePlayerIds.has(myPlayerId);

  const readyActivePlayerCount = activePlayers.filter((player) =>
    readyPlayerIds.has(player.id)
  ).length;

  const remainingActivePlayerCount = Math.max(
    0,
    activePlayers.length - readyActivePlayerCount
  );

  const allPlayersReady =
    activePlayers.length === 4 &&
    activePlayers.every((player) =>
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

  useEffect(() => {
    if (matchStatus !== "selecting_players") return;

    setDraftRedPlayerIds(
      activeRedPlayerIds.length > 0
        ? activeRedPlayerIds.slice(0, 2)
        : redPlayers.length === 2
          ? redPlayers.map((player) => player.id)
          : []
    );

    setDraftBluePlayerIds(
      activeBluePlayerIds.length > 0
        ? activeBluePlayerIds.slice(0, 2)
        : bluePlayers.length === 2
          ? bluePlayers.map((player) => player.id)
          : []
    );
  }, [
    matchStatus,
    activeRedPlayerIds,
    activeBluePlayerIds,
    redPlayers,
    bluePlayers,
  ]);

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

      const isFourPlayerGame = players.length === 4;
      const initialRedPlayerIds = isFourPlayerGame
        ? redPlayers.map((player) => player.id)
        : [];
      const initialBluePlayerIds = isFourPlayerGame
        ? bluePlayers.map((player) => player.id)
        : [];
      const nextMatchStatus: MatchStatus = isFourPlayerGame
        ? "picking"
        : "selecting_players";

      const { error } = await supabase
        .from("rooms")
        .update({
          board_size: boardSize,
          board_data: nextBoardData,
          match_status: nextMatchStatus,
          last_red_picks: [],
          last_blue_picks: [],
          active_red_player_ids: initialRedPlayerIds,
          active_blue_player_ids: initialBluePlayerIds,
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
      setMatchStatus(nextMatchStatus);
      setLastRedPicks([]);
      setLastBluePicks([]);
      setActiveRedPlayerIds(initialRedPlayerIds);
      setActiveBluePlayerIds(initialBluePlayerIds);
    } finally {
      setGenerating(false);
    }
  }

  function canEditTeamSelection(team: Team) {
    return (
      matchStatus === "selecting_players" &&
      amLeader &&
      myPlayer?.team === team
    );
  }

  function toggleDraftPlayer(team: Team, playerId: string) {
    if (!canEditTeamSelection(team)) return;

    const teamPlayers = team === "red" ? redPlayers : bluePlayers;
    if (!teamPlayers.some((player) => player.id === playerId)) return;

    const current = team === "red" ? draftRedPlayerIds : draftBluePlayerIds;
    const setter = team === "red" ? setDraftRedPlayerIds : setDraftBluePlayerIds;

    if (current.includes(playerId)) {
      setter(current.filter((id) => id !== playerId));
      return;
    }

    if (current.length >= 2) return;
    setter([...current, playerId]);
  }

  async function confirmActivePlayers(team: Team) {
    if (
      !canEditTeamSelection(team) ||
      savingActivePlayers ||
      matchStatus !== "selecting_players"
    ) {
      return;
    }

    const selectedIds =
      team === "red" ? draftRedPlayerIds : draftBluePlayerIds;

    if (selectedIds.length !== 2) return;

    setSavingActivePlayers(true);

    try {
      const updatePayload =
        team === "red"
          ? { active_red_player_ids: selectedIds }
          : { active_blue_player_ids: selectedIds };

      const { error } = await supabase
        .from("rooms")
        .update(updatePayload)
        .eq("room_code", roomCode)
        .eq("match_status", "selecting_players");

      if (error) {
        console.error("対戦者保存エラー:", error);
        alert(`対戦者の保存に失敗しました。\n${error.message ?? ""}`);
        return;
      }

      if (team === "red") {
        setActiveRedPlayerIds(selectedIds);
      } else {
        setActiveBluePlayerIds(selectedIds);
      }

      // 相手チームの確定と同時になっても取りこぼさないよう、
      // DBの最新状態を読み直してから4人が揃ったか判定する。
      const { data: latestRoom, error: latestRoomError } = await supabase
        .from("rooms")
        .select("active_red_player_ids, active_blue_player_ids, match_status")
        .eq("room_code", roomCode)
        .maybeSingle();

      if (latestRoomError) {
        console.error("対戦者確定状態取得エラー:", latestRoomError);
        await loadRoom();
        return;
      }

      const latestRedIds = stringArray(latestRoom?.active_red_player_ids);
      const latestBlueIds = stringArray(latestRoom?.active_blue_player_ids);

      if (
        latestRoom?.match_status === "selecting_players" &&
        latestRedIds.length === 2 &&
        latestBlueIds.length === 2
      ) {
        const { error: startPickError } = await supabase
          .from("rooms")
          .update({ match_status: "picking" })
          .eq("room_code", roomCode)
          .eq("match_status", "selecting_players");

        if (startPickError) {
          console.error("キャラ選択開始エラー:", startPickError);
        } else {
          setMatchStatus("picking");
          setSelectedCharacterId(null);
        }
      }

      await loadRoom();
    } finally {
      setSavingActivePlayers(false);
    }
  }

  function selectCharacter(
    characterId: string
  ) {
    if (
      !myPlayer ||
      !boardData ||
      !amActivePlayer ||
      myPick ||
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
      !amActivePlayer ||
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

      await Promise.all([
        loadCharacterPicks(),
        loadRoom(),
      ]);
    } finally {
      setSavingPick(false);
    }
  }

  async function resetMyCharacterPick() {
    if (
      !myPlayer ||
      !myPick ||
      !amActivePlayer ||
      savingPick ||
      matchStatus !== "picking"
    ) {
      return;
    }

    const character = getCharacter(myPick.character_id);

    if (
      !window.confirm(
        `${character?.name ?? myPick.character_id}の確定を解除して、キャラを選び直しますか？`
      )
    ) {
      return;
    }

    setSavingPick(true);

    try {
      const { error } = await supabase
        .from("character_picks")
        .delete()
        .eq("room_code", roomCode)
        .eq("player_id", myPlayer.id);

      if (error) {
        console.error("キャラ選択解除エラー:", error);
        alert(`キャラ選択の解除に失敗しました。\n${error.message ?? ""}`);
        return;
      }

      setSelectedCharacterId(myPick.character_id);
      await loadCharacterPicks();
    } finally {
      setSavingPick(false);
    }
  }

  async function startMatch() {
    if (
      !amHost ||
      !allPlayersReady ||
      matchStatus !== "picking"
    ) {
      return;
    }

    const { data: latestPicks, error: picksError } = await supabase
      .from("character_picks")
      .select("player_id")
      .eq("room_code", roomCode)
      .eq("is_ready", true);

    if (picksError) {
      console.error("試合開始前READY確認エラー:", picksError);
      alert("READY状態の確認に失敗しました。もう一度お試しください。");
      return;
    }

    const latestReadyIds = new Set(
      (latestPicks ?? [])
        .map((pick) => pick.player_id)
        .filter((playerId) => activePlayerIds.has(playerId))
    );

    if (activePlayerIds.size !== 4 || latestReadyIds.size !== 4) {
      alert("対戦者4人全員のキャラ確定を待ってください。");
      await loadCharacterPicks();
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({ match_status: "in_match" })
      .eq("room_code", roomCode)
      .eq("match_status", "picking");

    if (error) {
      console.error("試合開始エラー:", error);
      alert(`試合開始に失敗しました。\n${error.message ?? ""}`);
      return;
    }

    setMatchStatus("in_match");
    setSelectedCharacterId(null);
    await Promise.all([loadRoom(), loadCharacterPicks()]);
  }

  async function registerMatchResult() {
    if (!myPlayer || !allPlayersReady || !canRegisterAny || registeringResult) return;

    if (selectedWinningTeam === "red" && !canRegisterRed) {
      alert("赤チームの勝利を登録する権限がありません。");
      return;
    }
    if (selectedWinningTeam === "blue" && !canRegisterBlue) {
      alert("青チームの勝利を登録する権限がありません。");
      return;
    }

    const claimed = selectedWinningTeam === "red" ? claimedRedIds : claimedBlueIds;
    const gained = new Set(
      characterPicks
        .filter((pick) => pick.is_ready && activePlayerIds.has(pick.player_id) && pick.team === selectedWinningTeam)
        .map((pick) => pick.character_id)
        .filter((id) => !claimed.has(id))
    ).size;

    if (!window.confirm(
      `${selectedWinningTeam === "red" ? "🔴 赤チーム" : "🔵 青チーム"}の勝利を登録しますか？\n\n獲得マス：${gained}マス`
    )) return;

    setRegisteringResult(true);
    try {
      const { error } = await supabase.rpc("register_bingo_match", {
        p_room_code: roomCode,
        p_winning_team: selectedWinningTeam,
        p_player_id: myPlayer.id,
      });
      if (error) {
        console.error("勝敗登録エラー:", error);
        alert(`勝敗登録に失敗しました。\n${error.message}`);
        return;
      }
      setSelectedCharacterId(null);
      await resyncGameState();
    } finally {
      setRegisteringResult(false);
    }
  }

  async function undoLastMatchResult() {
    if (!amHost || !myPlayer || undoingResult || registeringResult) return;
    if (!window.confirm(
      "直前の試合の勝敗登録を取り消しますか？\n\n獲得マスを戻し、4人のキャラ選択と試合中の状態を復元します。\n次の試合のキャラ選択が始まっている場合は取り消せません。"
    )) return;

    setUndoingResult(true);
    try {
      const { error } = await supabase.rpc("undo_last_bingo_match", {
        p_room_code: roomCode,
        p_player_id: myPlayer.id,
      });
      if (error) {
        console.error("勝敗取り消しエラー:", error);
        alert(`取り消しできませんでした。\n${error.message}`);
        return;
      }
      setSelectedCharacterId(null);
      await resyncGameState();
      alert("直前の試合を取り消しました。勝敗を登録し直せます。");
    } finally {
      setUndoingResult(false);
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
        active_red_player_ids: [],
        active_blue_player_ids: [],
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

          .matchup-display {
            padding: 16px 8px 18px !important;
          }

          .matchup-title {
            font-size: clamp(26px, 8vw, 38px) !important;
          }

          .matchup-grid {
            margin-top: 14px !important;
            gap: 4px !important;
          }

          .matchup-team {
            min-width: 0;
          }

          .matchup-team-label {
            margin-bottom: 7px !important;
            font-size: 14px !important;
          }

          .matchup-pick-icons {
            gap: 4px !important;
          }

          .matchup-pick-pair {
            gap: 4px !important;
            min-width: 0;
          }

          .matchup-ampersand {
            font-size: 18px !important;
          }

          .matchup-character-icon {
            width: clamp(46px, 13vw, 58px) !important;
            border-width: 3px !important;
            border-radius: 12px !important;
          }

          .matchup-vs {
            font-size: clamp(22px, 6vw, 30px) !important;
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
            <a
              href="/"
              style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
              title="ホーム画面に戻る"
            >
              ななほしのビンゴツール
            </a>
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
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: -10,
            marginBottom: 18,
          }}
        >
          <button
            type="button"
            onClick={refreshGameStateManually}
            disabled={refreshingState}
            style={{
              padding: "9px 14px",
              borderRadius: 999,
              border: "1px solid #d7d7d7",
              backgroundColor: refreshingState ? "#f1f1f1" : "#ffffff",
              color: "#555",
              fontSize: 14,
              fontWeight: 800,
              cursor: refreshingState ? "default" : "pointer",
              opacity: refreshingState ? 0.7 : 1,
            }}
          >
            {refreshingState ? "更新中..." : "🔄 最新状態に更新"}
          </button>
        </div>

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
            activePlayerIds={activePlayerIds}
            matchStatus={matchStatus}
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
            activePlayerIds={activePlayerIds}
            matchStatus={matchStatus}
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
            {!gameFinished && matchStatus === "selecting_players" && (
              <section
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 16,
                  border: "2px solid #6a1b9a",
                  backgroundColor: "#fbf5fd",
                }}
              >
                <h2 style={{ textAlign: "center", marginTop: 0 }}>
                  ⚔️ この試合の対戦者を選択
                </h2>

                <div
                  style={{
                    marginBottom: 16,
                    textAlign: "center",
                    color: "#555",
                    fontWeight: 800,
                    lineHeight: 1.6,
                  }}
                >
                  各チームのリーダーが、自分のチームから対戦者2人を決めます。
                  <br />
                  両チームが決定すると自動でキャラ選択へ進みます。
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <PlayerSelector
                      title="🔴 赤チームから2人"
                      players={redPlayers}
                      selectedIds={draftRedPlayerIds}
                      onToggle={(playerId) => toggleDraftPlayer("red", playerId)}
                      accentColor="#d32f2f"
                      canEdit={canEditTeamSelection("red")}
                    />

                    {activeRedPlayerIds.length === 2 ? (
                      <StatusBox text="✓ 赤チーム 対戦者決定済み" />
                    ) : canEditTeamSelection("red") ? (
                      <button
                        type="button"
                        onClick={() => confirmActivePlayers("red")}
                        disabled={savingActivePlayers || draftRedPlayerIds.length !== 2}
                        style={{
                          width: "100%",
                          marginTop: 10,
                          padding: 13,
                          border: "none",
                          borderRadius: 12,
                          backgroundColor: "#d32f2f",
                          color: "white",
                          fontWeight: 900,
                          cursor:
                            !savingActivePlayers && draftRedPlayerIds.length === 2
                              ? "pointer"
                              : "not-allowed",
                          opacity:
                            !savingActivePlayers && draftRedPlayerIds.length === 2
                              ? 1
                              : 0.45,
                        }}
                      >
                        {savingActivePlayers ? "保存中..." : "✓ 赤チームの2人を決定"}
                      </button>
                    ) : (
                      <StatusBox text="赤チームリーダーの決定待ち" />
                    )}
                  </div>

                  <div>
                    <PlayerSelector
                      title="🔵 青チームから2人"
                      players={bluePlayers}
                      selectedIds={draftBluePlayerIds}
                      onToggle={(playerId) => toggleDraftPlayer("blue", playerId)}
                      accentColor="#1565c0"
                      canEdit={canEditTeamSelection("blue")}
                    />

                    {activeBluePlayerIds.length === 2 ? (
                      <StatusBox text="✓ 青チーム 対戦者決定済み" />
                    ) : canEditTeamSelection("blue") ? (
                      <button
                        type="button"
                        onClick={() => confirmActivePlayers("blue")}
                        disabled={savingActivePlayers || draftBluePlayerIds.length !== 2}
                        style={{
                          width: "100%",
                          marginTop: 10,
                          padding: 13,
                          border: "none",
                          borderRadius: 12,
                          backgroundColor: "#1565c0",
                          color: "white",
                          fontWeight: 900,
                          cursor:
                            !savingActivePlayers && draftBluePlayerIds.length === 2
                              ? "pointer"
                              : "not-allowed",
                          opacity:
                            !savingActivePlayers && draftBluePlayerIds.length === 2
                              ? 1
                              : 0.45,
                        }}
                      >
                        {savingActivePlayers ? "保存中..." : "✓ 青チームの2人を決定"}
                      </button>
                    ) : (
                      <StatusBox text="青チームリーダーの決定待ち" />
                    )}
                  </div>
                </div>
              </section>
            )}

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
                <MatchupDisplay
                  redPicks={characterPicks.filter(
                    (pick) =>
                      pick.is_ready &&
                      pick.team === "red" &&
                      activePlayerIds.has(pick.player_id)
                  )}
                  bluePicks={characterPicks.filter(
                    (pick) =>
                      pick.is_ready &&
                      pick.team === "blue" &&
                      activePlayerIds.has(pick.player_id)
                  )}
                />
              )}

            {!gameFinished &&
              matchStatus === "picking" &&
              activePlayers.length === 4 && (
                <section
                  style={{
                    marginTop: 24,
                    padding: 16,
                    borderRadius: 16,
                    border: "2px solid #6a1b9a",
                    backgroundColor: "#fbf5fd",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                    }}
                  >
                    🎮 キャラ選択 {readyActivePlayerCount}/4人完了
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: remainingActivePlayerCount === 0 ? "#188038" : "#666",
                      fontWeight: 900,
                    }}
                  >
                    {remainingActivePlayerCount > 0
                      ? `あと${remainingActivePlayerCount}人の選択待ち`
                      : "全員の選択が完了しました"}
                  </div>
                </section>
              )}

            {!gameFinished &&
              amActivePlayer &&
              myPick &&
              (matchStatus === "picking" || matchStatus === "in_match") && (
                <MyCharacterCard
                  pick={myPick}
                  inMatch={matchStatus === "in_match"}
                  onReselect={resetMyCharacterPick}
                  changing={savingPick}
                />
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
                    amActivePlayer &&
                    !myPick &&
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
                    amActivePlayer &&
                    !myPick &&
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

                  {!amActivePlayer ? (
                    <StatusBox text="この試合は待機です。対戦者4人のキャラ選択をお待ちください" />
                  ) : myPick ? (
                    <StatusBox text="✓ キャラ選択完了。使用キャラは上の『今回あなたが使用するキャラ』に表示されています" />
                  ) : selectedCharacterId ? (
                    <>
                      {(() => {
                        const character =
                          getCharacter(
                            selectedCharacterId
                          );

                        return (
                          <>
                            <div
                              style={{
                                textAlign:
                                  "center",
                                fontSize:
                                  15,
                                fontWeight:
                                  900,
                                color:
                                  "#6a1b9a",
                                marginBottom:
                                  10,
                              }}
                            >
                              現在選択中
                            </div>

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
                                  }}
                                />
                              ) : (
                                "?"
                              )}
                            </div>

                            <div
                              style={{
                                marginTop:
                                  8,
                                textAlign:
                                  "center",
                                fontSize:
                                  20,
                                fontWeight:
                                  1000,
                              }}
                            >
                              {character?.name ??
                                selectedCharacterId}
                            </div>

                            <div
                              style={{
                                marginTop:
                                  10,
                                padding:
                                  "10px 12px",
                                borderRadius:
                                  10,
                                backgroundColor:
                                  "#f3e5f5",
                                color:
                                  "#5e356b",
                                textAlign:
                                  "center",
                                fontSize:
                                  14,
                                fontWeight:
                                  800,
                                lineHeight:
                                  1.6,
                              }}
                            >
                              確定前なら、ビンゴカードの別のキャラを押して何度でも選び直せます
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
                                fontSize:
                                  16,
                                cursor:
                                  savingPick
                                    ? "not-allowed"
                                    : "pointer",
                                opacity:
                                  savingPick
                                    ? 0.55
                                    : 1,
                              }}
                            >
                              {savingPick
                                ? "確定中..."
                                : "✓ このキャラで確定"}
                            </button>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <StatusBox text="自分のチームのカードからキャラを選択してください" />
                  )}
                </section>
              )}

            {!gameFinished &&
              allPlayersReady &&
              matchStatus === "picking" && (
                <section
                  style={{
                    marginTop: 24,
                    padding: "22px 18px",
                    borderRadius: 18,
                    background:
                      "linear-gradient(135deg, #111 0%, #2b2b2b 55%, #4a0d0d 100%)",
                    border: "3px solid #d32f2f",
                    boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
                    textAlign: "center",
                    color: "white",
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      marginBottom: 12,
                    }}
                  >
                    ✓ 対戦者4人のキャラが確定しました
                  </div>

                  {amHost ? (
                    <>
                      <button
                        type="button"
                        onClick={startMatch}
                        style={{
                          width: "100%",
                          padding: "18px 14px",
                          border: "3px solid white",
                          borderRadius: 12,
                          background:
                            "linear-gradient(180deg, #e53935 0%, #9b1111 100%)",
                          color: "white",
                          fontSize: "clamp(26px, 6vw, 46px)",
                          lineHeight: 1,
                          letterSpacing: 2,
                          fontWeight: 1000,
                          fontStyle: "italic",
                          cursor: "pointer",
                          textShadow: "0 3px 0 rgba(0,0,0,0.45)",
                          boxShadow: "0 8px 0 #5b0808, 0 12px 24px rgba(0,0,0,0.35)",
                        }}
                      >
                        READY TO FIGHT!
                      </button>
                      <div
                        style={{
                          marginTop: 14,
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#eee",
                        }}
                      >
                        押すまでは各プレイヤーが確定キャラを変更できます
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: "rgba(255,255,255,0.10)",
                        fontWeight: 900,
                      }}
                    >
                      ホストの「READY TO FIGHT!」を待っています
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#ddd",
                        }}
                      >
                        試合開始までは自分の確定キャラを変更できます
                      </div>
                    </div>
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

            {amHost && boardData && !gameFinished &&
              (matchStatus === "picking" || matchStatus === "selecting_players") &&
              characterPicks.length === 0 && matchResults.length > 0 && (
                <section style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
                  <button
                    type="button"
                    onClick={undoLastMatchResult}
                    disabled={undoingResult || registeringResult}
                    style={{ width: "100%", padding: 13, borderRadius: 10, border: "1px solid #b71c1c", background: "#fff", color: "#b71c1c", fontWeight: 800, cursor: "pointer" }}
                  >
                    {undoingResult ? "取り消し中..." : "↩ 直前の試合の勝敗登録を取り消す（ホスト専用）"}
                  </button>
                </section>
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

function PlayerSelector({
  title,
  players,
  selectedIds,
  onToggle,
  accentColor,
  canEdit,
}: {
  title: string;
  players: Player[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
  accentColor: string;
  canEdit: boolean;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: `2px solid ${accentColor}`,
        backgroundColor: "white",
      }}
    >
      <div
        style={{
          marginBottom: 10,
          textAlign: "center",
          fontWeight: 1000,
          color: accentColor,
        }}
      >
        {title}（{selectedIds.length}/2）
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {players.map((player) => {
          const selected = selectedIds.includes(player.id);
          const disabled = !canEdit || (!selected && selectedIds.length >= 2);

          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onToggle(player.id)}
              disabled={disabled}
              style={{
                padding: "12px 10px",
                borderRadius: 10,
                border: selected
                  ? `3px solid ${accentColor}`
                  : "1px solid #ccc",
                backgroundColor: selected ? "#f5f5f5" : "white",
                fontWeight: 900,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.45 : 1,
              }}
            >
              {selected ? "✓ " : ""}
              {player.player_name}
              {player.is_host ? " 👑" : ""}
              {player.is_leader ? " ⭐" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeamMembers({
  title,
  players,
  readyPlayerIds,
  activePlayerIds,
  matchStatus,
  myPlayerId,
  borderColor,
  backgroundColor,
  titleColor,
}: {
  title: string;
  players: Player[];
  readyPlayerIds: Set<string>;
  activePlayerIds: Set<string>;
  matchStatus: MatchStatus;
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

            <span
              className="team-member-status"
              style={{
                padding: "5px 9px",
                borderRadius: 999,
                backgroundColor:
                  matchStatus === "selecting_players"
                    ? "#f1f1f1"
                    : !activePlayerIds.has(player.id)
                      ? "#eeeeee"
                      : readyPlayerIds.has(player.id)
                        ? "#e6f4ea"
                        : "#fff3e0",
                color:
                  matchStatus === "selecting_players"
                    ? "#666"
                    : !activePlayerIds.has(player.id)
                      ? "#777"
                      : readyPlayerIds.has(player.id)
                        ? "#137333"
                        : "#b06000",
                border:
                  matchStatus === "selecting_players"
                    ? "1px solid #ddd"
                    : !activePlayerIds.has(player.id)
                      ? "1px solid #d5d5d5"
                      : readyPlayerIds.has(player.id)
                        ? "1px solid #a8dab5"
                        : "1px solid #ffcc80",
              }}
            >
              {matchStatus === "selecting_players"
                ? "対戦者選択中"
                : !activePlayerIds.has(player.id)
                  ? "待機"
                  : readyPlayerIds.has(player.id)
                    ? "✓ 選択済み"
                    : "⚠ 未選択"}
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

function MatchupDisplay({
  redPicks,
  bluePicks,
}: {
  redPicks: CharacterPick[];
  bluePicks: CharacterPick[];
}) {
  function PickIcons({
    picks,
    accentColor,
  }: {
    picks: CharacterPick[];
    accentColor: string;
  }) {
    return (
      <div
        className="matchup-pick-icons"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        {picks.slice(0, 2).map((pick, index) => {
          const character = getCharacter(pick.character_id);

          return (
            <div
              key={pick.id}
              className="matchup-pick-pair"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {index > 0 && (
                <span
                  className="matchup-ampersand"
                  style={{
                    fontSize: "clamp(20px, 4vw, 32px)",
                    fontWeight: 1000,
                    color: "#333",
                  }}
                >
                  ＆
                </span>
              )}

              <div
                title={character?.name ?? pick.character_id}
                className="matchup-character-icon"
                style={{
                  width: "clamp(66px, 12vw, 110px)",
                  aspectRatio: "1 / 1",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 16,
                  backgroundColor: "white",
                  border: `4px solid ${accentColor}`,
                  overflow: "hidden",
                  boxShadow: "0 6px 14px rgba(0,0,0,0.16)",
                }}
              >
                {character ? (
                  <img
                    src={character.image}
                    alt={character.name}
                    style={{
                      width: "92%",
                      height: "92%",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <span style={{ fontWeight: 1000 }}>?</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section
      className="matchup-display"
      style={{
        marginTop: 26,
        padding: "22px 14px 26px",
        borderRadius: 18,
        textAlign: "center",
        background:
          "linear-gradient(135deg, #fff1d6 0%, #ffe6e6 50%, #eee7ff 100%)",
        border: "3px solid #ff7a00",
        boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
      }}
    >
      <div
        className="matchup-title"
        style={{
          fontSize: "clamp(30px, 7vw, 54px)",
          fontWeight: 1000,
          lineHeight: 1.1,
        }}
      >
        🔥 試合開始！！ 🔥
      </div>

      <div
        className="matchup-grid"
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "center",
          gap: "clamp(8px, 2vw, 20px)",
        }}
      >
        <div className="matchup-team">
          <div
            className="matchup-team-label"
            style={{
              marginBottom: 10,
              color: "#c62828",
              fontWeight: 1000,
              fontSize: "clamp(14px, 3vw, 20px)",
            }}
          >
            🔴 RED
          </div>
          <PickIcons picks={redPicks} accentColor="#d32f2f" />
        </div>

        <div
          className="matchup-vs"
          style={{
            fontSize: "clamp(28px, 6vw, 52px)",
            fontWeight: 1000,
            fontStyle: "italic",
            color: "#222",
            textShadow: "0 2px 0 rgba(255,255,255,0.8)",
          }}
        >
          VS
        </div>

        <div className="matchup-team">
          <div
            className="matchup-team-label"
            style={{
              marginBottom: 10,
              color: "#1565c0",
              fontWeight: 1000,
              fontSize: "clamp(14px, 3vw, 20px)",
            }}
          >
            BLUE 🔵
          </div>
          <PickIcons picks={bluePicks} accentColor="#1565c0" />
        </div>
      </div>
    </section>
  );
}

function MyCharacterCard({
  pick,
  inMatch,
  onReselect,
  changing,
}: {
  pick: CharacterPick;
  inMatch: boolean;
  onReselect: () => void;
  changing: boolean;
}) {
  const character = getCharacter(pick.character_id);
  const accentColor = pick.team === "red" ? "#d32f2f" : "#1565c0";
  const backgroundColor = pick.team === "red" ? "#fff5f5" : "#f3f7ff";

  return (
    <section
      style={{
        marginTop: 24,
        padding: 18,
        borderRadius: 18,
        border: `3px solid ${accentColor}`,
        backgroundColor,
        textAlign: "center",
        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 1000,
          color: accentColor,
        }}
      >
        {inMatch ? "🎮 今回あなたが使用するキャラ" : "🔒 あなたの確定キャラ"}
      </div>

      <div
        style={{
          width: 150,
          margin: "12px auto 0",
          aspectRatio: "1 / 1",
          display: "grid",
          placeItems: "center",
          borderRadius: 16,
          backgroundColor: "white",
          border: `2px solid ${accentColor}`,
        }}
      >
        {character ? (
          <img
            src={character.image}
            alt={character.name}
            style={{
              width: "92%",
              height: "92%",
              objectFit: "contain",
            }}
          />
        ) : (
          "?"
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 22,
          fontWeight: 1000,
        }}
      >
        {character?.name ?? pick.character_id}
      </div>

      {!inMatch && (
        <>
          <div
            style={{
              marginTop: 6,
              color: "#666",
              fontWeight: 800,
            }}
          >
            READY TO FIGHT! が押されるまでは変更できます
          </div>

          <button
            type="button"
            onClick={onReselect}
            disabled={changing}
            style={{
              marginTop: 12,
              padding: "11px 18px",
              borderRadius: 10,
              border: `2px solid ${accentColor}`,
              backgroundColor: "white",
              color: accentColor,
              fontWeight: 900,
              cursor: changing ? "not-allowed" : "pointer",
              opacity: changing ? 0.55 : 1,
            }}
          >
            {changing ? "変更準備中..." : "↩ キャラを選び直す"}
          </button>
        </>
      )}
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
