"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

const MAX_PLAYERS = 8;

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < 6; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

export default function Home() {
  const router = useRouter();

  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  async function createRoom() {
    if (isCreating || isJoining) return;

    const normalizedPlayerName = playerName.trim();

    if (!normalizedPlayerName) {
      alert("プレイヤー名を入力してください。");
      return;
    }

    setIsCreating(true);

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const newCode = generateRoomCode();

        const { error: roomError } = await supabase.from("rooms").insert({
          room_code: newCode,
          status: "waiting",
        });

        if (roomError) {
          if (roomError.code === "23505") continue;
          console.error(roomError);
          alert("部屋の作成に失敗しました。");
          return;
        }

        const { data: hostPlayer, error: playerError } = await supabase
          .from("player")
          .insert({
            room_code: newCode,
            player_name: normalizedPlayerName,
            team: null,
            is_host: true,
          })
          .select("id")
          .single();

        if (playerError || !hostPlayer) {
          console.error(playerError);
          alert("ホストの登録に失敗しました。");
          return;
        }
sessionStorage.setItem("playerId", hostPlayer.id);
sessionStorage.setItem("roomCode", newCode);
        
        router.push(`/room/${newCode}`);
        return;
      }

      alert("ルームコードの生成に失敗しました。");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoinRoom() {
    if (isJoining || isCreating) return;

    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const normalizedPlayerName = playerName.trim();

    if (normalizedRoomCode.length !== 6) {
      alert("6文字のルームコードを入力してください。");
      return;
    }

    if (!normalizedPlayerName) {
      alert("プレイヤー名を入力してください。");
      return;
    }

    setIsJoining(true);

    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, room_code, status")
        .eq("room_code", normalizedRoomCode)
        .maybeSingle();

      if (roomError || !room) {
        alert("そのルームは存在しません。");
        return;
      }

      if (room.status !== "waiting") {
        alert("このルームは現在参加できません。");
        return;
      }

      const { count, error: countError } = await supabase
        .from("player")
        .select("id", { count: "exact", head: true })
        .eq("room_code", normalizedRoomCode);

      if (countError) {
        console.error(countError);
        alert("参加人数の確認に失敗しました。");
        return;
      }

      if ((count ?? 0) >= MAX_PLAYERS) {
        alert("この部屋は満員です（8 / 8）");
        return;
      }

      const { data: joinedPlayer, error: playerError } = await supabase
        .from("player")
        .insert({
          room_code: normalizedRoomCode,
          player_name: normalizedPlayerName,
          team: null,
          is_host: false,
        })
        .select("id")
        .single();

      if (playerError || !joinedPlayer) {
        console.error(playerError);
        alert("部屋への参加に失敗しました。");
        return;
      }
sessionStorage.setItem("playerId", joinedPlayer.id);
sessionStorage.setItem("roomCode", normalizedRoomCode);
     
      router.push(`/room/${normalizedRoomCode}`);
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)", color: "#222" }}>
      <section style={{ width: "100%", maxWidth: 520, padding: 28, borderRadius: 20, backgroundColor: "white", boxShadow: "0 12px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 6vw, 42px)" }}>ななほしのビンゴツール</h1>
          <div style={{ marginTop: 6, color: "#6a1b9a", fontWeight: 900, fontSize: 18 }}>ONLINE</div>
          <div style={{ marginTop: 8, color: "#666", fontSize: 14 }}>4〜8人対応・奇数人数OK</div>
        </div>

        <label style={{ display: "grid", gap: 6, fontWeight: 800, marginBottom: 16 }}>
          プレイヤー名
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="名前を入力" maxLength={20}
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #bbb", borderRadius: 10, fontSize: 17 }} />
        </label>

        <button type="button" onClick={createRoom} disabled={isCreating || isJoining}
          style={{ width: "100%", padding: "16px 20px", border: "none", borderRadius: 12, backgroundColor: "#6a1b9a", color: "white", fontSize: 18, fontWeight: 900, opacity: isCreating || isJoining ? 0.65 : 1 }}>
          {isCreating ? "部屋を作成中..." : "🎲 部屋を作る"}
        </button>

        <div style={{ textAlign: "center", margin: "24px 0", color: "#777" }}>または</div>

        <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
          ルームコード
          <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="例：ABCD12" maxLength={6}
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #bbb", borderRadius: 10, fontSize: 17 }} />
        </label>

        <button type="button" onClick={handleJoinRoom} disabled={isJoining || isCreating}
          style={{ width: "100%", marginTop: 16, padding: "15px 20px", border: "none", borderRadius: 12, backgroundColor: "#1565d8", color: "white", fontSize: 18, fontWeight: 900, opacity: isJoining || isCreating ? 0.65 : 1 }}>
          {isJoining ? "参加中..." : "🔑 部屋に参加する"}
        </button>
      </section>
    </main>
  );
}