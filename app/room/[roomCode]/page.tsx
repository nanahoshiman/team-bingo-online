"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

type Player = {
  id: string;
  player_name: string;
  is_host: boolean;
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = String(params.roomCode ?? "").toUpperCase();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player")
      .select("id, player_name, is_host")
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("プレイヤー取得エラー:", error);
      setLoading(false);
      return;
    }

    setPlayers(data ?? []);
    setLoading(false);
  }

  async function startTeamSetup() {
    if (isStarting) return;

    setIsStarting(true);

    const { error } = await supabase
      .from("rooms")
      .update({ status: "team_setup" })
      .eq("room_code", roomCode);

    if (error) {
      console.error("ルーム状態更新エラー:", error);
      alert("チーム分け画面への移動に失敗しました。");
      setIsStarting(false);
      return;
    }

    router.push(`/room/${roomCode}/teams`);
  }

  useEffect(() => {
    if (!roomCode) return;

    setMyPlayerId(sessionStorage.getItem("playerId"));
    loadPlayers();

    const playerChannel = supabase
      .channel(`players-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player",
          filter: `room_code=eq.${roomCode}`,
        },
        () => {
          loadPlayers();
        }
      )
      .subscribe();

    const roomChannel = supabase
      .channel(`room-status-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const newStatus = String(payload.new.status ?? "");

          if (newStatus === "team_setup" || newStatus === "teams_ready") {
            router.push(`/room/${roomCode}/teams`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomCode, router]);

  const playerCount = players.length;
  const isFull = playerCount >= MAX_PLAYERS;
  const canStart =
    playerCount >= MIN_PLAYERS && playerCount <= MAX_PLAYERS;

  const myPlayer = useMemo(
    () => players.find((player) => player.id === myPlayerId) ?? null,
    [players, myPlayerId]
  );

  const amHost = myPlayer?.is_host === true;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background:
          "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)",
        color: "#222",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 560,
          padding: 28,
          borderRadius: 20,
          backgroundColor: "white",
          boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(28px, 6vw, 40px)",
            }}
          >
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
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 14,
            backgroundColor: "#f7effa",
            border: "2px solid #6a1b9a",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              color: "#666",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            ルームコード
          </div>

          <div
            style={{
              marginTop: 4,
              color: "#6a1b9a",
              fontSize: 34,
              fontWeight: 1000,
              letterSpacing: "0.12em",
            }}
          >
            {roomCode}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>参加者</h2>

          <div
            style={{
              padding: "7px 11px",
              borderRadius: 999,
              backgroundColor: isFull ? "#ffe8e8" : "#f0e8f5",
              color: isFull ? "#c62828" : "#6a1b9a",
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            {playerCount} / {MAX_PLAYERS}人
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "#777",
            }}
          >
            読み込み中...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {players.map((player, index) => {
              const isMe = player.id === myPlayerId;

              return (
                <div
                  key={player.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "13px 15px",
                    border: isMe
                      ? "2px solid #6a1b9a"
                      : "1px solid #ddd",
                    borderRadius: 12,
                    backgroundColor: isMe ? "#fbf5fd" : "#fafafa",
                    fontWeight: 800,
                  }}
                >
                  <span>
                    {index + 1}. {player.player_name}
                    {isMe ? "（あなた）" : ""}
                  </span>

                  {player.is_host && (
                    <span
                      style={{
                        color: "#d28b00",
                        fontSize: 14,
                      }}
                    >
                      👑 ホスト
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!canStart && (
          <div
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#fff6df",
              color: "#8a5a00",
              textAlign: "center",
              fontWeight: 800,
            }}
          >
            ゲーム開始まであと{" "}
            {Math.max(0, MIN_PLAYERS - playerCount)}人必要です
          </div>
        )}

        {isFull && (
          <div
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#ffe8e8",
              color: "#c62828",
              textAlign: "center",
              fontWeight: 900,
            }}
          >
            この部屋は満員です（8 / 8）
          </div>
        )}

        {amHost ? (
          <button
            type="button"
            disabled={!canStart || isStarting}
            onClick={startTeamSetup}
            style={{
              width: "100%",
              marginTop: 22,
              padding: "15px 20px",
              border: "none",
              borderRadius: 12,
              backgroundColor: "#6a1b9a",
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              cursor:
                canStart && !isStarting ? "pointer" : "not-allowed",
              opacity: canStart && !isStarting ? 1 : 0.45,
              boxShadow:
                canStart && !isStarting
                  ? "0 6px 16px rgba(106,27,154,0.25)"
                  : "none",
            }}
          >
            {isStarting ? "移動中..." : "🎲 チーム分けへ進む"}
          </button>
        ) : (
          <div
            style={{
              marginTop: 22,
              padding: 14,
              borderRadius: 12,
              backgroundColor: "#f5f5f5",
              textAlign: "center",
              color: "#666",
              fontWeight: 700,
            }}
          >
            ホストがゲームを開始するまでお待ちください
          </div>
        )}
      </section>
    </main>
  );
}
