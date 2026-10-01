"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StreamLauncherPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");

  const normalized = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const ready = normalized.length === 6;

  function openStream() {
    if (!ready) return;
    router.push(`/room/${normalized}/stream`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8f3ff 0%, #ffffff 55%)",
        padding: "28px 16px",
        boxSizing: "border-box",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(100%, 620px)",
          margin: "40px auto",
          background: "white",
          border: "1px solid #e3d8ec",
          borderRadius: 22,
          padding: "28px",
          boxSizing: "border-box",
          boxShadow: "0 14px 40px rgba(72, 30, 95, 0.10)",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{ border: "none", background: "transparent", padding: 0, color: "#6a1b9a", fontWeight: 900, cursor: "pointer" }}
        >
          ← トップへ戻る
        </button>

        <div style={{ textAlign: "center", marginTop: 26 }}>
          <div style={{ fontSize: 44 }}>📺</div>
          <h1 style={{ margin: "8px 0 4px", fontSize: "clamp(26px, 6vw, 38px)" }}>配信者用ページ</h1>
          <div style={{ color: "#6a1b9a", fontWeight: 1000, letterSpacing: 1 }}>TEAM BINGO ONLINE</div>
          <p style={{ color: "#666", lineHeight: 1.7, marginTop: 14 }}>
            ルームコードを入力すると、その部屋専用のOBS配信画面を開けます。
          </p>
        </div>

        <label style={{ display: "grid", gap: 8, marginTop: 30, fontWeight: 900 }}>
          ルームコード
          <input
            value={roomCode}
            onChange={(e) =>
              setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") openStream();
            }}
            placeholder="例：SBDV3N"
            maxLength={6}
            autoCapitalize="characters"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "16px",
              border: "2px solid #cdb5dc",
              borderRadius: 12,
              fontSize: 22,
              fontWeight: 900,
              textAlign: "center",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          />
        </label>

        <button
          type="button"
          onClick={openStream}
          disabled={!ready}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "17px 20px",
            border: "none",
            borderRadius: 12,
            background: "#6a1b9a",
            color: "white",
            fontSize: 18,
            fontWeight: 1000,
            cursor: ready ? "pointer" : "default",
            opacity: ready ? 1 : 0.45,
          }}
        >
          📺 この部屋の配信画面を開く
        </button>

        {ready && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 12,
              background: "#f6f0fa",
              border: "1px solid #dfcde9",
              lineHeight: 1.7,
            }}
          >
            <div style={{ fontWeight: 1000, color: "#4a126d" }}>OBSブラウザソース用</div>
            <div style={{ marginTop: 5, fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", color: "#555" }}>
              /room/{normalized}/stream
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#777" }}>OBSでは幅1920・高さ1080で使用します。</div>
          </div>
        )}
      </section>
    </main>
  );
}
