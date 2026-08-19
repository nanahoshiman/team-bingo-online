"use client";

import { characters } from "@/lib/characters";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Player = {
  id: string;
  player_name: string;
  is_host: boolean;
};

export default function BattleLobbyPage() {
  const params = useParams();
  const router = useRouter();

  const roomCode = String(params.roomCode ?? "").toUpperCase();

  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const me =
    players.find((player) => player.id === myPlayerId) ?? null;

  const isHost = me?.is_host ?? false;

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player")
      .select("id, player_name, is_host")
      .eq("room_code", roomCode)
      .order("is_host", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setPlayers(data ?? []);
  }

 useEffect(() => {
  const storedPlayerId =
    sessionStorage.getItem("playerId");

  setMyPlayerId(storedPlayerId);

  async function initialize() {
    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select(
          "room_code, status, game_mode"
        )
        .eq("room_code", roomCode)
        .maybeSingle();

    if (roomError || !room) {
      console.error(
        "全員乱闘ルーム取得エラー:",
        roomError
      );

      alert("部屋が見つかりません。");
      return;
    }

    if (
      room.game_mode !== "all_battle"
    ) {
      alert(
        "この部屋は全員乱闘用ではありません。"
      );

      router.push("/");
      return;
    }

    // すでにゲーム開始済みなら、
    // ロビーを経由せずゲーム画面へ移動
    if (room.status === "playing") {
      router.push(
        `/battle/${roomCode}/game`
      );
      return;
    }

    await loadPlayers();
    setIsLoading(false);
  }

  void initialize();

  // プレイヤー参加・退出の監視
  const playerChannel = supabase
    .channel(
      `battle-lobby-players-${roomCode}`
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

  // ホストがゲーム開始したかを監視
  const roomChannel = supabase
    .channel(
      `battle-lobby-room-${roomCode}`
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: `room_code=eq.${roomCode}`,
      },
      (payload) => {
        const nextRoom = payload.new as {
          status?: string;
          game_mode?: string;
        };

        if (
          nextRoom.status === "playing" &&
          nextRoom.game_mode ===
            "all_battle"
        ) {
          router.push(
            `/battle/${roomCode}/game`
          );
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(
      playerChannel
    );

    void supabase.removeChannel(
      roomChannel
    );
  };
}, [roomCode, router]);

  async function startGame() {
  if (!isHost || isStarting) return;

  if (players.length !== 2) {
    alert("2人揃ってからゲームを開始してください。");
    return;
  }

  if (characters.length < 2) {
    alert("抽選できるキャラクターが足りません。");
    return;
  }

  setIsStarting(true);

  try {
    const shuffled = [...characters].sort(
      () => Math.random() - 0.5
    );

    const player1Character = shuffled[0].id;
    const player2Character = shuffled[1].id;

    const player1 = players[0];
    const player2 = players[1];

    const { error: battleError } = await supabase
      .from("battle_games")
      .upsert(
        {
          room_code: roomCode,

          player1_id: player1.id,
          player2_id: player2.id,

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
        },
        {
          onConflict: "room_code",
        }
      );

    if (battleError) {
      console.error(
        "全員乱闘ゲーム作成エラー:",
        battleError
      );

      alert(
        "ゲームデータの作成に失敗しました。"
      );
      return;
    }

    const { error: roomError } = await supabase
      .from("rooms")
      .update({
        status: "playing",
      })
      .eq("room_code", roomCode)
      .eq("game_mode", "all_battle");

    if (roomError) {
      console.error(
        "全員乱闘開始状態更新エラー:",
        roomError
      );

      alert("ゲームの開始に失敗しました。");
      return;
    }

    router.push(`/battle/${roomCode}/game`);
  } finally {
    setIsStarting(false);
  }
}
   
  if (isLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "linear-gradient(180deg, #fff8f2 0%, #f4f4f6 100%)",
          fontWeight: 900,
        }}
      >
        読み込み中...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        background:
          "linear-gradient(180deg, #fff8f2 0%, #f4f4f6 100%)",
        color: "#222",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 620,
          boxSizing: "border-box",
          margin: "0 auto",
          padding: "28px 24px",
          borderRadius: 22,
          backgroundColor: "white",
          boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ textAlign: "center" }}>
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
              fontSize: "clamp(28px, 8vw, 42px)",
            }}
          >
            ⚔️ 全員乱闘
          </h1>

          <div
            style={{
              marginTop: 8,
              color: "#666",
              fontWeight: 800,
            }}
          >
            2人専用・1 VS 1
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            padding: 18,
            borderRadius: 16,
            backgroundColor: "#fff3e0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#777",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            ルームコード
          </div>

          <div
            style={{
              marginTop: 3,
              color: "#bf360c",
              fontSize: "clamp(30px, 10vw, 44px)",
              fontWeight: 1000,
              letterSpacing: 4,
            }}
          >
            {roomCode}
          </div>

          <div
            style={{
              marginTop: 4,
              color: "#777",
              fontSize: 13,
            }}
          >
            対戦相手にこのコードを共有
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <div
            style={{
              marginBottom: 12,
              fontSize: 18,
              fontWeight: 1000,
            }}
          >
            プレイヤー
            <span
              style={{
                marginLeft: 8,
                color: "#777",
                fontSize: 14,
              }}
            >
              {players.length} / 2
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {[0, 1].map((index) => {
              const player = players[index];

              if (!player) {
                return (
                  <div
                    key={index}
                    style={{
                      minHeight: 72,
                      display: "grid",
                      placeItems: "center",
                      border: "2px dashed #ccc",
                      borderRadius: 14,
                      color: "#999",
                      fontWeight: 900,
                    }}
                  >
                    対戦相手を待っています...
                  </div>
                );
              }

              return (
                <div
                  key={player.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "16px 18px",
                    border:
                      player.id === myPlayerId
                        ? "3px solid #e65100"
                        : "2px solid #ddd",
                    borderRadius: 14,
                    backgroundColor:
                      player.id === myPlayerId
                        ? "#fff3e0"
                        : "#fafafa",
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                      fontSize: 18,
                      fontWeight: 1000,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {player.player_name}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {player.is_host && (
                      <span
                        style={{
                          padding: "5px 8px",
                          borderRadius: 999,
                          backgroundColor: "#6a1b9a",
                          color: "white",
                          fontSize: 12,
                          fontWeight: 1000,
                        }}
                      >
                        HOST
                      </span>
                    )}

                    {player.id === myPlayerId && (
                      <span
                        style={{
                          padding: "5px 8px",
                          borderRadius: 999,
                          backgroundColor: "#e65100",
                          color: "white",
                          fontSize: 12,
                          fontWeight: 1000,
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={startGame}
            disabled={players.length !== 2 || isStarting}
            style={{
              width: "100%",
              marginTop: 28,
              padding: "17px 20px",
              border: "none",
              borderRadius: 13,
              backgroundColor:
                players.length === 2 ? "#e65100" : "#bbb",
              color: "white",
              fontSize: 18,
              fontWeight: 1000,
              cursor:
                players.length === 2 && !isStarting
                  ? "pointer"
                  : "default",
              opacity: isStarting ? 0.7 : 1,
            }}
          >
            {isStarting
              ? "ゲーム開始中..."
              : players.length === 2
                ? "⚔️ ゲーム開始"
                : "対戦相手を待っています"}
          </button>
        ) : (
          <div
            style={{
              marginTop: 28,
              padding: 16,
              borderRadius: 13,
              backgroundColor: "#f3f3f3",
              textAlign: "center",
              color: "#666",
              fontWeight: 900,
            }}
          >
            ホストのゲーム開始を待っています
          </div>
        )}
      </section>
    </main>
  );
}