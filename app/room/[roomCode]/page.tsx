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

  const [isLeaving, setIsLeaving] = useState(false);

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

  function clearStoredIdentity() {

    sessionStorage.removeItem("playerId");

    sessionStorage.removeItem("roomCode");

    sessionStorage.removeItem("gameMode");

    if (localStorage.getItem("roomCode") === roomCode) {

      localStorage.removeItem("playerId");

      localStorage.removeItem("roomCode");

      localStorage.removeItem("gameMode");

    }

  }

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

  async function checkRoomStatus() {

    const { data, error } = await supabase

      .from("rooms")

      .select("status")

      .eq("room_code", roomCode)

      .single();

    if (error) {

      console.error("ルーム状態取得エラー:", error);

      return;

    }

    const status = String(data?.status ?? "");

    if (status === "team_setup" || status === "teams_ready") {

      router.push(`/room/${roomCode}/teams`);

    }

  }

  async function resyncRoomState() {

    await Promise.all([loadPlayers(), checkRoomStatus()]);

  }

  async function leaveRoom() {

    if (!myPlayerId || isLeaving || isStarting) return;

    const confirmed = window.confirm(

      "ルームから退出しますか？\n退出すると参加枠が空き、同じプレイヤーとしての復帰はできなくなります。"

    );

    if (!confirmed) return;

    setIsLeaving(true);

    const leavingPlayer = players.find((player) => player.id === myPlayerId) ?? null;

    const { error: deleteError } = await supabase

      .from("player")

      .delete()

      .eq("id", myPlayerId)

      .eq("room_code", roomCode);

    if (deleteError) {

      console.error("ルーム退出エラー:", deleteError);

      alert("ルームから退出できませんでした。");

      setIsLeaving(false);

      return;

    }

    if (leavingPlayer?.is_host) {

      const { data: remainingPlayers, error: remainingError } = await supabase

        .from("player")

        .select("id")

        .eq("room_code", roomCode)

        .order("created_at", { ascending: true })

        .limit(1);

      if (!remainingError && remainingPlayers && remainingPlayers.length > 0) {

        const { error: hostError } = await supabase

          .from("player")

          .update({ is_host: true })

          .eq("id", remainingPlayers[0].id);

        if (hostError) console.error("ホスト引き継ぎエラー:", hostError);

      }

    }

    clearStoredIdentity();

    router.push("/");

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

    setMyPlayerId(getStoredPlayerId());

    void resyncRoomState();

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

          void loadPlayers();

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

  useEffect(() => {

    if (!roomCode) return;

    const syncWhenVisible = () => {

      if (document.visibilityState !== "visible") return;

      void resyncRoomState();

    };

    const syncWhenFocused = () => {

      void resyncRoomState();

    };

    window.addEventListener("focus", syncWhenFocused);

    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {

      window.removeEventListener("focus", syncWhenFocused);

      document.removeEventListener("visibilitychange", syncWhenVisible);

    };

  }, [roomCode]);

  const playerCount = players.length;

  const isFull = playerCount >= MAX_PLAYERS;

  const canStart = playerCount >= MIN_PLAYERS && playerCount <= MAX_PLAYERS;

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

        background: "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)",

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

          <h1 style={{ margin: 0, fontSize: "clamp(28px, 6vw, 40px)" }}>

            <button type="button" onClick={() => router.push("/")} title="ホーム画面へ戻る" style={{ padding: 0, border: "none", background: "transparent", color: "inherit", font: "inherit", fontWeight: "inherit", cursor: "pointer" }}>ななほしのビンゴツール</button>

          </h1>

          <div style={{ marginTop: 6, color: "#6a1b9a", fontWeight: 900 }}>

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

          <div style={{ color: "#666", fontSize: 14, fontWeight: 800 }}>

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

          <div style={{ padding: 20, textAlign: "center", color: "#777" }}>

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

                    border: isMe ? "2px solid #6a1b9a" : "1px solid #ddd",

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

                    <span style={{ color: "#d28b00", fontSize: 14 }}>

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

            ゲーム開始まであと {Math.max(0, MIN_PLAYERS - playerCount)}人必要です

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

              cursor: canStart && !isStarting ? "pointer" : "not-allowed",

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

        <button

          type="button"

          disabled={!myPlayerId || isLeaving || isStarting}

          onClick={leaveRoom}

          style={{

            width: "100%",

            marginTop: 14,

            padding: "12px 16px",

            border: "1px solid #d32f2f",

            borderRadius: 12,

            backgroundColor: "white",

            color: "#c62828",

            fontSize: 15,

            fontWeight: 900,

            cursor: !myPlayerId || isLeaving || isStarting ? "not-allowed" : "pointer",

            opacity: !myPlayerId || isLeaving || isStarting ? 0.5 : 1,

          }}

        >

          {isLeaving ? "退出中..." : "🚪 ルームから退出"}

        </button>

      </section>

    </main>

  );

}
