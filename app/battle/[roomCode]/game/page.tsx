"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { characters } from "@/lib/characters";

type Player = {
  id: string;
  player_name: string;
  is_host: boolean;
};

type BattleGame = {
  room_code: string;
  player1_id: string;
  player2_id: string;
  player1_score: number;
  player2_score: number;
  current_player1_character: string | null;
  current_player2_character: string | null;
  used_character_ids: string[];
  battle_status: string;
  winner_player_id: string | null;
};

export default function BattleGamePage() {
  const params = useParams();
  const router = useRouter();

  const roomCode = String(
    params.roomCode ?? ""
  ).toUpperCase();

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [battleGame, setBattleGame] =
    useState<BattleGame | null>(null);

  const [myPlayerId, setMyPlayerId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [
    isSubmittingResult,
    setIsSubmittingResult,
  ] = useState(false);

  const [isRestarting, setIsRestarting] =
    useState(false);

  const [isRoulette, setIsRoulette] =
    useState(false);

  const [
    displayedPlayer1CharacterId,
    setDisplayedPlayer1CharacterId,
  ] = useState<string | null>(null);

  const [
    displayedPlayer2CharacterId,
    setDisplayedPlayer2CharacterId,
  ] = useState<string | null>(null);

  const [revealPulse, setRevealPulse] =
    useState(false);

  const rouletteRunRef = useRef(0);
  const lastAnimatedKeyRef =
    useRef<string | null>(null);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player")
      .select("id, player_name, is_host")
      .eq("room_code", roomCode)
      .order("is_host", {
        ascending: false,
      });

    if (error) {
      console.error(
        "プレイヤー取得エラー:",
        error
      );
      return;
    }

    setPlayers(data ?? []);
  }

  async function loadBattleGame() {
    const { data, error } = await supabase
      .from("battle_games")
      .select(
        `
        room_code,
        player1_id,
        player2_id,
        player1_score,
        player2_score,
        current_player1_character,
        current_player2_character,
        used_character_ids,
        battle_status,
        winner_player_id
        `
      )
      .eq("room_code", roomCode)
      .maybeSingle();

    if (error) {
      console.error(
        "全員乱闘ゲーム取得エラー:",
        error
      );
      return;
    }

    setBattleGame(
      data as BattleGame | null
    );
  }

  useEffect(() => {
    setMyPlayerId(
      sessionStorage.getItem("playerId")
    );

    Promise.all([
      loadPlayers(),
      loadBattleGame(),
    ]).finally(() => {
      setLoading(false);
    });

    const battleChannel = supabase
      .channel(`battle-game-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "battle_games",
          filter: `room_code=eq.${roomCode}`,
        },
        () => {
          void loadBattleGame();
        }
      )
      .subscribe();

    const playerChannel = supabase
      .channel(
        `battle-game-players-${roomCode}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player",
          filter: `room_code=eq.${roomCode}`,
        },
        () => {
          void loadPlayers();
        }
      )
      .subscribe();

    return () => {
      rouletteRunRef.current += 1;

      void supabase.removeChannel(
        battleChannel
      );

      void supabase.removeChannel(
        playerChannel
      );
    };
  }, [roomCode]);

  useEffect(() => {
    if (!battleGame) return;

    const finalPlayer1 =
      battleGame.current_player1_character;

    const finalPlayer2 =
      battleGame.current_player2_character;

    if (!finalPlayer1 || !finalPlayer2) {
      return;
    }

    const animationKey = [
      battleGame.battle_status,
      finalPlayer1,
      finalPlayer2,
    ].join(":");

    if (
      lastAnimatedKeyRef.current ===
      animationKey
    ) {
      return;
    }

    lastAnimatedKeyRef.current =
      animationKey;

    if (
      battleGame.battle_status ===
      "finished"
    ) {
      rouletteRunRef.current += 1;
      setIsRoulette(false);

      setDisplayedPlayer1CharacterId(
        finalPlayer1
      );

      setDisplayedPlayer2CharacterId(
        finalPlayer2
      );

      return;
    }

    const runId =
      rouletteRunRef.current + 1;

    rouletteRunRef.current = runId;

    async function runRoulette() {
      setIsRoulette(true);
      setRevealPulse(false);

      const delays = [
        55, 55, 55, 55, 55, 55, 55, 55,
        70, 85, 100, 120, 145, 180, 220,
        280,
      ];

      for (
        let index = 0;
        index < delays.length;
        index += 1
      ) {
        if (
          rouletteRunRef.current !== runId
        ) {
          return;
        }

        let player1Index =
          Math.floor(
            Math.random() *
              characters.length
          );

        let player2Index =
          Math.floor(
            Math.random() *
              characters.length
          );

        if (
          characters.length > 1 &&
          player1Index === player2Index
        ) {
          player2Index =
            (player2Index + 1) %
            characters.length;
        }

        setDisplayedPlayer1CharacterId(
          characters[player1Index].id
        );

        setDisplayedPlayer2CharacterId(
          characters[player2Index].id
        );

        await new Promise<void>(
          (resolve) => {
            window.setTimeout(
              resolve,
              delays[index]
            );
          }
        );
      }

      if (
        rouletteRunRef.current !== runId
      ) {
        return;
      }

      setDisplayedPlayer1CharacterId(
        finalPlayer1
      );

      setDisplayedPlayer2CharacterId(
        finalPlayer2
      );

      setIsRoulette(false);
      setRevealPulse(true);

      window.setTimeout(() => {
        if (
          rouletteRunRef.current === runId
        ) {
          setRevealPulse(false);
        }
      }, 450);
    }

    void runRoulette();
  }, [
    battleGame?.current_player1_character,
    battleGame?.current_player2_character,
    battleGame?.battle_status,
  ]);

  async function registerWinner(
    winner: "player1" | "player2"
  ) {
    if (
      !battleGame ||
      isSubmittingResult ||
      isRoulette ||
      battleGame.battle_status === "finished"
    ) {
      return;
    }

    setIsSubmittingResult(true);

    try {
      const nextPlayer1Score =
        battleGame.player1_score +
        (winner === "player1" ? 1 : 0);

      const nextPlayer2Score =
        battleGame.player2_score +
        (winner === "player2" ? 1 : 0);

      const usedIds =
        battleGame.used_character_ids ?? [];

      const remainingCharacters =
        characters.filter(
          (character) =>
            !usedIds.includes(character.id)
        );

      const remainingMatches = Math.floor(
        remainingCharacters.length / 2
      );

      const scoreDifference = Math.abs(
        nextPlayer1Score -
          nextPlayer2Score
      );

      const gameIsDecided =
        scoreDifference > remainingMatches;

      if (gameIsDecided) {
        const winnerPlayerId =
          nextPlayer1Score >
          nextPlayer2Score
            ? battleGame.player1_id
            : battleGame.player2_id;

        const { error } = await supabase
          .from("battle_games")
          .update({
            player1_score:
              nextPlayer1Score,
            player2_score:
              nextPlayer2Score,
            battle_status: "finished",
            winner_player_id:
              winnerPlayerId,
          })
          .eq("room_code", roomCode);

        if (error) {
          console.error(
            "ゲーム終了処理エラー:",
            error
          );

          alert(
            "ゲーム終了処理に失敗しました。"
          );

          return;
        }

        await loadBattleGame();
        return;
      }

      if (
        remainingCharacters.length < 2
      ) {
        if (
          nextPlayer1Score !==
          nextPlayer2Score
        ) {
          const winnerPlayerId =
            nextPlayer1Score >
            nextPlayer2Score
              ? battleGame.player1_id
              : battleGame.player2_id;

          const { error } =
            await supabase
              .from("battle_games")
              .update({
                player1_score:
                  nextPlayer1Score,
                player2_score:
                  nextPlayer2Score,
                battle_status:
                  "finished",
                winner_player_id:
                  winnerPlayerId,
              })
              .eq(
                "room_code",
                roomCode
              );

          if (error) {
            console.error(
              "最終試合終了処理エラー:",
              error
            );

            alert(
              "ゲーム終了処理に失敗しました。"
            );

            return;
          }

          await loadBattleGame();
          return;
        }

        alert(
          "使用可能キャラを使い切りましたが、スコアが同点です。"
        );

        return;
      }

      const shuffled = [
        ...remainingCharacters,
      ].sort(
        () => Math.random() - 0.5
      );

      const nextPlayer1Character =
        shuffled[0].id;

      const nextPlayer2Character =
        shuffled[1].id;

      const nextUsedIds = [
        ...usedIds,
        nextPlayer1Character,
        nextPlayer2Character,
      ];

      const { error } = await supabase
        .from("battle_games")
        .update({
          player1_score:
            nextPlayer1Score,

          player2_score:
            nextPlayer2Score,

          current_player1_character:
            nextPlayer1Character,

          current_player2_character:
            nextPlayer2Character,

          used_character_ids:
            nextUsedIds,
        })
        .eq("room_code", roomCode);

      if (error) {
        console.error(
          "勝敗登録エラー:",
          error
        );

        alert(
          "勝敗の登録に失敗しました。"
        );

        return;
      }

      await loadBattleGame();
    } finally {
      setIsSubmittingResult(false);
    }
  }

  async function restartGame() {
    if (
      !battleGame ||
      isRestarting ||
      characters.length < 2
    ) {
      return;
    }

    setIsRestarting(true);

    try {
      const shuffled = [
        ...characters,
      ].sort(
        () => Math.random() - 0.5
      );

      const player1Character =
        shuffled[0].id;

      const player2Character =
        shuffled[1].id;

      const { error } = await supabase
        .from("battle_games")
        .update({
          player1_score: 0,
          player2_score: 0,

          current_player1_character:
            player1Character,

          current_player2_character:
            player2Character,

          used_character_ids: [
            player1Character,
            player2Character,
          ],

          battle_status: "playing",
          winner_player_id: null,
        })
        .eq("room_code", roomCode);

      if (error) {
        console.error(
          "再戦開始エラー:",
          error
        );

        alert(
          "再戦の開始に失敗しました。"
        );

        return;
      }

      await loadBattleGame();
    } finally {
      setIsRestarting(false);
    }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
        }}
      >
        読み込み中...
      </main>
    );
  }

  if (!battleGame) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
        }}
      >
        ゲームデータが見つかりません。
      </main>
    );
  }

  const player1 =
    players.find(
      (player) =>
        player.id ===
        battleGame.player1_id
    ) ?? null;

  const player2 =
    players.find(
      (player) =>
        player.id ===
        battleGame.player2_id
    ) ?? null;

  const player1Character =
    characters.find(
      (character) =>
        character.id ===
        displayedPlayer1CharacterId
    ) ?? null;

  const player2Character =
    characters.find(
      (character) =>
        character.id ===
        displayedPlayer2CharacterId
    ) ?? null;

  const mySide =
    myPlayerId ===
    battleGame.player1_id
      ? "player1"
      : myPlayerId ===
          battleGame.player2_id
        ? "player2"
        : null;

  const isHost =
    players.find(
      (player) =>
        player.id === myPlayerId
    )?.is_host ?? false;

  const isFinished =
    battleGame.battle_status ===
    "finished";

  const winnerPlayer =
    battleGame.winner_player_id ===
    battleGame.player1_id
      ? player1
      : battleGame.winner_player_id ===
          battleGame.player2_id
        ? player2
        : null;

  const remainingCharactersCount =
    characters.filter(
      (character) =>
        !(
          battleGame.used_character_ids ?? []
        ).includes(character.id)
    ).length;

  const remainingMatchesAfterCurrent =
    Math.floor(
      remainingCharactersCount / 2
    );

  const player1WouldClinch =
    battleGame.battle_status !== "finished" &&
    battleGame.player1_score + 1 >
      battleGame.player2_score &&
    battleGame.player1_score +
      1 -
      battleGame.player2_score >
      remainingMatchesAfterCurrent;

  const player2WouldClinch =
    battleGame.battle_status !== "finished" &&
    battleGame.player2_score + 1 >
      battleGame.player1_score &&
    battleGame.player2_score +
      1 -
      battleGame.player1_score >
      remainingMatchesAfterCurrent;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        background:
          "linear-gradient(180deg, #fff7f0 0%, #f3f4f7 100%)",
        color: "#222",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          padding: 24,
          boxSizing: "border-box",
          borderRadius: 22,
          backgroundColor: "white",
          boxShadow:
            "0 12px 32px rgba(0,0,0,0.12)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {isRoulette && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 50,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              backgroundColor:
                "rgba(20,20,25,0.14)",
            }}
          >
            <div
              style={{
                padding:
                  "10px 18px",
                borderRadius: 999,
                backgroundColor:
                  "rgba(20,20,25,0.88)",
                color: "white",
                fontSize:
                  "clamp(18px, 5vw, 28px)",
                fontWeight: 1000,
                letterSpacing: 2,
                boxShadow:
                  "0 8px 20px rgba(0,0,0,0.25)",
              }}
            >
              ⚡ NEXT BATTLE ⚡
            </div>
          </div>
        )}

        <div
          style={{
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#e65100",
              fontSize: 14,
              fontWeight: 1000,
              letterSpacing: 2,
            }}
          >
            ALL BATTLE
          </div>

          <h1
            style={{
              margin: "6px 0 0",
              fontSize:
                "clamp(28px, 8vw, 42px)",
            }}
          >
            ⚔️ 全員乱闘
          </h1>

          <div
            style={{
              marginTop: 6,
              color: "#777",
              fontWeight: 800,
            }}
          >
            ROOM {roomCode}
          </div>
        </div>

        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          <BattlePlayerCard
            label="PLAYER 1"
            playerName={
              player1?.player_name ??
              "PLAYER 1"
            }
            characterName={
              player1Character?.name ??
              "?"
            }
            characterImage={
              player1Character?.image ??
              null
            }
            score={
              battleGame.player1_score
            }
            isMe={
              mySide === "player1"
            }
            isRoulette={isRoulette}
            revealPulse={revealPulse}
            isReach={player1WouldClinch}
          />

          <BattlePlayerCard
            label="PLAYER 2"
            playerName={
              player2?.player_name ??
              "PLAYER 2"
            }
            characterName={
              player2Character?.name ??
              "?"
            }
            characterImage={
              player2Character?.image ??
              null
            }
            score={
              battleGame.player2_score
            }
            isMe={
              mySide === "player2"
            }
            isRoulette={isRoulette}
            revealPulse={revealPulse}
            isReach={player2WouldClinch}
          />
        </div>

        <div
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize:
              "clamp(42px, 12vw, 74px)",
            fontWeight: 1000,
            letterSpacing: 4,
          }}
        >
          {battleGame.player1_score}
          <span
            style={{
              margin: "0 18px",
              color: "#999",
            }}
          >
            -
          </span>
          {battleGame.player2_score}
        </div>

        {isFinished ? (
          <div
            style={{
              marginTop: 24,
              padding: "28px 18px",
              borderRadius: 20,
              background:
                "linear-gradient(135deg, #fff8d9 0%, #fff1cc 50%, #ffe7b3 100%)",
              border:
                "4px solid #f9a825",
              textAlign: "center",
              boxShadow:
                "0 10px 26px rgba(249,168,37,0.20)",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 1000,
                color: "#8a5a00",
                letterSpacing: 1,
              }}
            >
              🏆 勝敗確定
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize:
                  "clamp(34px, 10vw, 58px)",
                fontWeight: 1000,
                lineHeight: 1.2,
                overflowWrap:
                  "anywhere",
              }}
            >
              {winnerPlayer?.player_name ??
                "WINNER"}
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize:
                  "clamp(26px, 7vw, 42px)",
                fontWeight: 1000,
                color: "#e65100",
              }}
            >
              WIN!
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize:
                  "clamp(34px, 9vw, 54px)",
                fontWeight: 1000,
                letterSpacing: 3,
              }}
            >
              {battleGame.player1_score}
              <span
                style={{
                  margin: "0 14px",
                  color: "#999",
                }}
              >
                -
              </span>
              {battleGame.player2_score}
            </div>

            <div
              style={{
                marginTop: 12,
                color: "#666",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              逆転不可能になったため試合終了
            </div>

            <div
              style={{
                marginTop: 22,
                display: "grid",
                gap: 12,
              }}
            >
              {isHost ? (
                <button
                  type="button"
                  onClick={() =>
                    void restartGame()
                  }
                  disabled={
                    isRestarting
                  }
                  style={{
                    width: "100%",
                    padding:
                      "16px 14px",
                    border: "none",
                    borderRadius: 13,
                    backgroundColor:
                      "#e65100",
                    color: "white",
                    fontSize: 17,
                    fontWeight: 1000,
                    opacity:
                      isRestarting
                        ? 0.65
                        : 1,
                    cursor:
                      isRestarting
                        ? "default"
                        : "pointer",
                  }}
                >
                  {isRestarting
                    ? "再戦準備中..."
                    : "🔄 もう一度遊ぶ"}
                </button>
              ) : (
                <div
                  style={{
                    padding:
                      "13px 12px",
                    borderRadius: 12,
                    backgroundColor:
                      "rgba(255,255,255,0.70)",
                    color: "#666",
                    fontWeight: 900,
                  }}
                >
                  ホストが再戦を選ぶと自動で始まります
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  router.push("/")
                }
                style={{
                  width: "100%",
                  padding:
                    "15px 14px",
                  border:
                    "2px solid #bbb",
                  borderRadius: 13,
                  backgroundColor:
                    "white",
                  color: "#444",
                  fontSize: 16,
                  fontWeight: 1000,
                  cursor: "pointer",
                }}
              >
                🏠 トップに戻る
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                marginTop: 24,
                padding: "22px 14px",
                borderRadius: 18,
                textAlign: "center",
                background:
                  "linear-gradient(135deg, #fff1d6 0%, #ffe5e5 50%, #eee7ff 100%)",
                border:
                  "3px solid #ff7a00",
                fontSize:
                  "clamp(28px, 7vw, 50px)",
                fontWeight: 1000,
              }}
            >
              {isRoulette
                ? "🎰 キャラ抽選中..."
                : "🔥 試合開始！！ 🔥"}
            </div>

            {isHost && (
              <div
                style={{
                  marginTop: 24,
                  padding: 18,
                  borderRadius: 16,
                  backgroundColor:
                    "#f5f5f5",
                  border:
                    "2px solid #ddd",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    marginBottom: 14,
                    fontWeight: 1000,
                    fontSize: 18,
                  }}
                >
                  🏆 勝者を選択
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      void registerWinner(
                        "player1"
                      )
                    }
                    disabled={
                      isSubmittingResult ||
                      isRoulette
                    }
                    style={{
                      padding:
                        "16px 10px",
                      border: "none",
                      borderRadius: 12,
                      backgroundColor:
                        "#e65100",
                      color: "white",
                      fontSize: 16,
                      fontWeight: 1000,
                      cursor:
                        isSubmittingResult ||
                        isRoulette
                          ? "default"
                          : "pointer",
                      opacity:
                        isSubmittingResult ||
                        isRoulette
                          ? 0.55
                          : 1,
                    }}
                  >
                    🏆{" "}
                    {player1?.player_name ??
                      "PLAYER 1"}{" "}
                    勝利
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void registerWinner(
                        "player2"
                      )
                    }
                    disabled={
                      isSubmittingResult ||
                      isRoulette
                    }
                    style={{
                      padding:
                        "16px 10px",
                      border: "none",
                      borderRadius: 12,
                      backgroundColor:
                        "#1565d8",
                      color: "white",
                      fontSize: 16,
                      fontWeight: 1000,
                      cursor:
                        isSubmittingResult ||
                        isRoulette
                          ? "default"
                          : "pointer",
                      opacity:
                        isSubmittingResult ||
                        isRoulette
                          ? 0.55
                          : 1,
                    }}
                  >
                    🏆{" "}
                    {player2?.player_name ??
                      "PLAYER 2"}{" "}
                    勝利
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function BattlePlayerCard({
  label,
  playerName,
  characterName,
  characterImage,
  score,
  isMe,
  isRoulette,
  revealPulse,
  isReach,
}: {
  label: string;
  playerName: string;
  characterName: string;
  characterImage: string | null;
  score: number;
  isMe: boolean;
  isRoulette: boolean;
  revealPulse: boolean;
  isReach: boolean;
}) {
  return (
    <section
      style={{
        padding: 18,
        borderRadius: 18,
        border: isMe
          ? "4px solid #e65100"
          : "2px solid #ddd",
        backgroundColor: isMe
          ? "#fff3e0"
          : "#fafafa",
        textAlign: "center",
        transform: revealPulse
          ? "scale(1.035)"
          : "scale(1)",
        transition:
          "transform 180ms ease, box-shadow 180ms ease",
        boxShadow: revealPulse
          ? "0 0 0 4px rgba(255,152,0,0.20), 0 10px 24px rgba(0,0,0,0.16)"
          : "none",
      }}
    >
      <div
        style={{
          color: "#777",
          fontSize: 13,
          fontWeight: 1000,
          letterSpacing: 1,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 1000,
          overflowWrap: "anywhere",
        }}
      >
        {playerName}
      </div>

      {isReach && !isRoulette && (
        <div
          style={{
            marginTop: 8,
            display: "inline-block",
            padding: "6px 12px",
            borderRadius: 999,
            backgroundColor: "#d32f2f",
            color: "white",
            fontSize: 14,
            fontWeight: 1000,
            letterSpacing: 1,
            boxShadow:
              "0 4px 12px rgba(211,47,47,0.25)",
          }}
        >
          🔥 リーチ
        </div>
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 220,
          margin: "18px auto 0",
          aspectRatio: "1 / 1",
          display: "grid",
          placeItems: "center",
          borderRadius: 16,
          backgroundColor: "white",
          border:
            isRoulette
              ? "3px solid #ff9800"
              : "2px solid #ddd",
          overflow: "hidden",
        }}
      >
        {characterImage ? (
          <img
            src={characterImage}
            alt={characterName}
            style={{
              width: "90%",
              height: "90%",
              objectFit: "contain",
              transform: isRoulette
                ? "scale(1.08)"
                : "scale(1)",
              transition:
                "transform 70ms linear",
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 48,
              fontWeight: 1000,
            }}
          >
            ?
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 18,
          fontWeight: 1000,
        }}
      >
        {isRoulette
          ? "抽選中..."
          : characterName}
      </div>

      <div
        style={{
          marginTop: 8,
          color: "#e65100",
          fontSize: 18,
          fontWeight: 1000,
        }}
      >
        {score} POINT
      </div>

      {isMe && (
        <div
          style={{
            marginTop: 10,
            display: "inline-block",
            padding: "5px 10px",
            borderRadius: 999,
            backgroundColor: "#e65100",
            color: "white",
            fontSize: 12,
            fontWeight: 1000,
          }}
        >
          YOU
        </div>
      )}
    </section>
  );
}
