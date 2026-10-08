"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
const TEAM_BINGO_MAX_PLAYERS = 8;
const ALL_BATTLE_MAX_PLAYERS = 2;
const SAVED_PLAYER_NAME_KEY = "teamBingoPlayerName";
const HIDE_ROOM_NOTICE_KEY = "teamBingoHideRoomNoticeV1";
type GameMode = "team-bingo" | "all-battle";
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
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreateNotice, setShowCreateNotice] = useState(false);
  const [skipCreateNotice, setSkipCreateNotice] = useState(false);
  const [gameMode, setGameMode] =
    useState<GameMode>("team-bingo");
  useEffect(() => {
    const savedName = localStorage.getItem(SAVED_PLAYER_NAME_KEY);
    if (savedName) setPlayerName(savedName);
  }, []);
  const busy = isCreating || isJoining;
  function getDbGameMode() {
    return gameMode === "team-bingo"
      ? "team_bingo"
      : "all_battle";
  }
  function getRoomPath(code: string) {
    return gameMode === "team-bingo"
      ? `/room/${code}`
      : `/battle/${code}`;
  }
  function savePlayerIdentity(playerId: string, code: string, dbGameMode: string) {
    localStorage.setItem(SAVED_PLAYER_NAME_KEY, playerName.trim());
    sessionStorage.setItem("playerId", playerId);
    sessionStorage.setItem("roomCode", code);
    sessionStorage.setItem("gameMode", dbGameMode);
    localStorage.setItem("playerId", playerId);
    localStorage.setItem("roomCode", code);
    localStorage.setItem("gameMode", dbGameMode);
  }
  function handleCreateRoomClick() {
    if (busy) return;
    if (!playerName.trim()) {
      alert("プレイヤー名を入力してください。");
      return;
    }
    if (gameMode === "team-bingo" && localStorage.getItem(HIDE_ROOM_NOTICE_KEY) !== "true") {
      setSkipCreateNotice(false);
      setShowCreateNotice(true);
      return;
    }
    void createRoom();
  }

  function confirmCreateRoom() {
    if (skipCreateNotice) {
      localStorage.setItem(HIDE_ROOM_NOTICE_KEY, "true");
    }
    setShowCreateNotice(false);
    void createRoom();
  }

  async function createRoom() {
    if (busy) return;
    const normalizedPlayerName =
      playerName.trim();
    if (!normalizedPlayerName) {
      alert("プレイヤー名を入力してください。");
      return;
    }
    setIsCreating(true);
    try {
      for (
        let attempt = 0;
        attempt < 5;
        attempt += 1
      ) {
        const newCode =
          generateRoomCode();
        const { error: roomError } =
          await supabase
            .from("rooms")
            .insert({
              room_code: newCode,
              status: "waiting",
              game_mode:
                getDbGameMode(),
            });
        if (roomError) {
          if (
            roomError.code === "23505"
          ) {
            continue;
          }
          console.error(roomError);
          alert(
            "部屋の作成に失敗しました。"
          );
          return;
        }
        const {
          data: hostPlayer,
          error: playerError,
        } = await supabase
          .from("player")
          .insert({
            room_code: newCode,
            player_name:
              normalizedPlayerName,
            team: null,
            is_host: true,
          })
          .select("id")
          .single();
        if (
          playerError ||
          !hostPlayer
        ) {
          console.error(playerError);
          alert(
            "ホストの登録に失敗しました。"
          );
          return;
        }
        savePlayerIdentity(hostPlayer.id, newCode, getDbGameMode());
        router.push(
          getRoomPath(newCode)
        );
        return;
      }
      alert(
        "ルームコードの生成に失敗しました。"
      );
    } finally {
      setIsCreating(false);
    }
  }
  async function handleJoinRoom() {
    if (busy) return;
    const normalizedRoomCode =
      roomCode.trim().toUpperCase();
    const normalizedPlayerName =
      playerName.trim();
    if (!normalizedPlayerName) {
      alert(
        "プレイヤー名を入力してください。"
      );
      return;
    }
    if (
      normalizedRoomCode.length !== 6
    ) {
      alert(
        "6文字のルームコードを入力してください。"
      );
      return;
    }
    setIsJoining(true);
    try {
      const {
        data: room,
        error: roomError,
      } = await supabase
        .from("rooms")
        .select(
          "id, room_code, status, game_mode"
        )
        .eq(
          "room_code",
          normalizedRoomCode
        )
        .maybeSingle();
      if (
        roomError ||
        !room
      ) {
        alert(
          "そのルームは存在しません。"
        );
        return;
      }
      const expectedMode =
        getDbGameMode();
      if (
        room.game_mode !== expectedMode
      ) {
        alert(
          gameMode === "team-bingo"
            ? "このルームは全員乱闘用です。"
            : "このルームはチームビンゴ用です。"
        );
        return;
      }
      // 同じ端末にこのルームのプレイヤー情報が残っている場合は、
      // 新規プレイヤーを作らず既存プレイヤーとして復帰する。
      const storedPlayerId = localStorage.getItem("playerId");
      const storedRoomCode = localStorage.getItem("roomCode");
      const storedGameMode = localStorage.getItem("gameMode");
      if (
        storedPlayerId &&
        storedRoomCode === normalizedRoomCode &&
        storedGameMode === expectedMode
      ) {
        const { data: existingPlayer, error: existingPlayerError } =
          await supabase
            .from("player")
            .select("id, player_name")
            .eq("id", storedPlayerId)
            .eq("room_code", normalizedRoomCode)
            .maybeSingle();
        if (
          !existingPlayerError &&
          existingPlayer &&
          existingPlayer.player_name === normalizedPlayerName
        ) {
          savePlayerIdentity(
            existingPlayer.id,
            normalizedRoomCode,
            expectedMode
          );
          if (gameMode === "team-bingo") {
            if (room.status === "team_setup") {
              router.push(`/room/${normalizedRoomCode}/teams`);
            } else if (room.status === "teams_ready") {
              router.push(`/room/${normalizedRoomCode}/game`);
            } else {
              router.push(`/room/${normalizedRoomCode}`);
            }
          } else {
            router.push(
              room.status === "waiting"
                ? `/battle/${normalizedRoomCode}`
                : `/battle/${normalizedRoomCode}/game`
            );
          }
          return;
        }
        // localStorageだけ古い場合は破棄して通常の新規参加へ進む。
        localStorage.removeItem("playerId");
        localStorage.removeItem("roomCode");
        localStorage.removeItem("gameMode");
      }
      if (
        room.status !== "waiting"
      ) {
        alert(
          "このルームは現在参加できません。"
        );
        return;
      }
      const {
        count,
        error: countError,
      } = await supabase
        .from("player")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_code",
          normalizedRoomCode
        );
      if (countError) {
        console.error(countError);
        alert(
          "参加人数の確認に失敗しました。"
        );
        return;
      }
      const maxPlayers =
        gameMode === "team-bingo"
          ? TEAM_BINGO_MAX_PLAYERS
          : ALL_BATTLE_MAX_PLAYERS;
      if (
        (count ?? 0) >= maxPlayers
      ) {
        alert(
          gameMode === "team-bingo"
            ? "この部屋は満員です（8 / 8）"
            : "この部屋は満員です（2 / 2）"
        );
        return;
      }
      const {
        data: joinedPlayer,
        error: playerError,
      } = await supabase
        .from("player")
        .insert({
          room_code:
            normalizedRoomCode,
          player_name:
            normalizedPlayerName,
          team: null,
          is_host: false,
        })
        .select("id")
        .single();
      if (
        playerError ||
        !joinedPlayer
      ) {
        console.error(playerError);
        alert(
          "部屋への参加に失敗しました。"
        );
        return;
      }
      savePlayerIdentity(joinedPlayer.id, normalizedRoomCode, expectedMode);
      router.push(
        getRoomPath(
          normalizedRoomCode
        )
      );
    } finally {
      setIsJoining(false);
    }
  }
  function selectMode(
    mode: GameMode
  ) {
    setGameMode(mode);
    setMenuOpen(false);
    setRoomCode("");
    setShowJoinForm(false);
  }
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
          position: "relative",
          width: "100%",
          maxWidth: 560,
          padding: "32px 30px",
          borderRadius: 22,
          backgroundColor: "white",
          boxShadow:
            "0 12px 32px rgba(0,0,0,0.12)",
        }}
      >
        <button
          type="button"
          onClick={() =>
            setMenuOpen(
              (current) => !current
            )
          }
          aria-label="メニュー"
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 46,
            height: 46,
            border:
              "1px solid #ddd",
            borderRadius: 12,
            backgroundColor: "white",
            fontSize: 25,
            fontWeight: 900,
            cursor: "pointer",
            zIndex: 20,
          }}
        >
          ☰
        </button>
        {menuOpen && (
          <>
            <div
              onClick={() =>
                setMenuOpen(false)
              }
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor:
                  "rgba(0,0,0,0.25)",
                zIndex: 10,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 72,
                right: 18,
                width: 260,
                padding: 14,
                borderRadius: 16,
                backgroundColor:
                  "white",
                boxShadow:
                  "0 12px 30px rgba(0,0,0,0.22)",
                zIndex: 30,
              }}
            >
              <div
                style={{
                  padding:
                    "8px 8px 12px",
                  fontWeight: 1000,
                  fontSize: 17,
                }}
              >
                ゲームモード
              </div>
              <button
                type="button"
                onClick={() =>
                  selectMode(
                    "team-bingo"
                  )
                }
                style={{
                  width: "100%",
                  padding:
                    "14px 12px",
                  border:
                    gameMode ===
                    "team-bingo"
                      ? "3px solid #6a1b9a"
                      : "1px solid #ddd",
                  borderRadius: 11,
                  backgroundColor:
                    gameMode ===
                    "team-bingo"
                      ? "#f5eaff"
                      : "white",
                  color: "#4a126d",
                  fontWeight: 900,
                  fontSize: 16,
                  textAlign: "left",
                }}
              >
                🎲 チームビンゴ
              </button>
              <button
                type="button"
                onClick={() =>
                  selectMode(
                    "all-battle"
                  )
                }
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding:
                    "14px 12px",
                  border:
                    gameMode ===
                    "all-battle"
                      ? "3px solid #e65100"
                      : "1px solid #ddd",
                  borderRadius: 11,
                  backgroundColor:
                    gameMode ===
                    "all-battle"
                      ? "#fff0e6"
                      : "white",
                  color: "#bf360c",
                  fontWeight: 900,
                  fontSize: 16,
                  textAlign: "left",
                }}
              >
                ⚔️ 全員乱闘
              </button>
              <div style={{ height: 1, backgroundColor: "#eee", margin: "14px 0" }} />
              <button
                type="button"
                onClick={() => {
                    window.open("/stream", "_blank", "noopener,noreferrer");
                    setMenuOpen(false);
                  }}
                style={{
                  width: "100%",
                  padding: "13px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 11,
                  backgroundColor: "white",
                  color: "#333",
                  fontWeight: 900,
                  fontSize: 16,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                📺 配信者用ページ
              </button>
              <button
                type="button"
                onClick={() => router.push("/help")}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "13px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 11,
                  backgroundColor: "white",
                  color: "#333",
                  fontWeight: 900,
                  fontSize: 16,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                ❓ ヘルプ・使い方
              </button>
            </div>
          </>
        )}
        <div
          style={{
            textAlign: "center",
            marginBottom: 30,
            paddingTop: 44,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize:
                "clamp(24px, 6vw, 42px)",
              whiteSpace: "nowrap",
              letterSpacing:
                "-0.03em",
            }}
          >
            ななほしのビンゴツール
          </h1>
          <div
            style={{
              marginTop: 6,
              color:
                gameMode ===
                "team-bingo"
                  ? "#6a1b9a"
                  : "#e65100",
              fontWeight: 900,
              fontSize: 18,
            }}
          >
            ONLINE
          </div>
          <div
            style={{
              marginTop: 8,
              color: "#666",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {gameMode ===
            "team-bingo"
              ? "4〜8人対応・奇数人数OK"
              : "2人専用・1 VS 1"}
          </div>
        </div>
        <label
          style={{
            display: "grid",
            gap: 7,
            fontWeight: 900,
          }}
        >
          プレイヤー名
          <input
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              localStorage.setItem(SAVED_PLAYER_NAME_KEY, e.target.value);
            }}
            placeholder="名前を入力"
            maxLength={20}
            style={{
              width: "100%",
              boxSizing:
                "border-box",
              padding:
                "14px 15px",
              border:
                "1px solid #bbb",
              borderRadius: 10,
              fontSize: 17,
            }}
          />
        </label>
        <div
          style={{
            marginTop: 28,
            display: "grid",
            gap: 14,
          }}
        >
          <button
            type="button"
            onClick={handleCreateRoomClick}
            disabled={busy}
            style={{
              width: "100%",
              padding:
                "17px 20px",
              border: "none",
              borderRadius: 12,
              backgroundColor:
                gameMode ===
                "team-bingo"
                  ? "#6a1b9a"
                  : "#e65100",
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              opacity:
                busy ? 0.65 : 1,
            }}
          >
            {isCreating
              ? "部屋を作成中..."
              : gameMode ===
                  "team-bingo"
                ? "🎲 部屋を作る"
                : "⚔️ 全員乱闘の部屋を作る"}
          </button>
          <button
            type="button"
            onClick={() =>
              setShowJoinForm(
                (current) =>
                  !current
              )
            }
            disabled={busy}
            style={{
              width: "100%",
              padding:
                "17px 20px",
              border: "none",
              borderRadius: 12,
              backgroundColor:
                "#1565d8",
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              opacity:
                busy ? 0.65 : 1,
            }}
          >
            🔑 部屋に参加する
          </button>
        </div>
        {showJoinForm && (
          <div
            style={{
              marginTop: 20,
              padding: 18,
              borderRadius: 14,
              backgroundColor:
                "#f3f7ff",
              border:
                "2px solid #c7d9f7",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: 7,
                fontWeight: 900,
              }}
            >
              ルームコード
              <input
                value={roomCode}
                onChange={(e) =>
                  setRoomCode(
                    e.target.value
                      .toUpperCase()
                      .replace(
                        /[^A-Z0-9]/g,
                        ""
                      )
                      .slice(0, 6)
                  )
                }
                placeholder="例：ABCD12"
                maxLength={6}
                style={{
                  width: "100%",
                  boxSizing:
                    "border-box",
                  padding:
                    "14px 15px",
                  border:
                    "1px solid #aaa",
                  borderRadius: 10,
                  fontSize: 17,
                  letterSpacing: 1,
                  backgroundColor:
                    "white",
                }}
              />
            </label>
            <button
              type="button"
              onClick={
                handleJoinRoom
              }
              disabled={busy}
              style={{
                width: "100%",
                marginTop: 14,
                padding:
                  "15px 20px",
                border: "none",
                borderRadius: 12,
                backgroundColor:
                  "#0d47a1",
                color: "white",
                fontSize: 18,
                fontWeight: 900,
                opacity:
                  busy ? 0.65 : 1,
              }}
            >
              {isJoining
                ? "参加中..."
                : "🔑 この部屋に参加する"}
            </button>
          </div>
        )}
        {gameMode ===
          "all-battle" && (
          <div
            style={{
              marginTop: 22,
              padding: 14,
              borderRadius: 12,
              backgroundColor:
                "#fff3e0",
              color: "#bf360c",
              fontWeight: 800,
              lineHeight: 1.7,
              textAlign: "center",
            }}
          >
            ⚔️ ランダムキャラで1 VS 1
            <br />
            1勝につき1ポイント
            <br />
            使用キャラは以降の抽選から除外
          </div>
        )}
        {showCreateNotice && (
          <div
            role="presentation"
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.58)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="room-notice-title"
              style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box", background: "white", borderRadius: 18, padding: 24, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}
            >
              <h2 id="room-notice-title" style={{ margin: "0 0 16px", fontSize: 22 }}>📢 ルーム作成前のお願い</h2>
              <p style={{ lineHeight: 1.7 }}>チームビンゴを円滑に進行するため、以下の点にご協力ください。</p>
              <div style={{ background: "#f6f2fb", padding: 16, borderRadius: 12, lineHeight: 1.8 }}>
                <p style={{ marginTop: 0 }}><strong>① チームリーダーの設定</strong></p>
                <p>ホストの方は、ご自身以外のプレイヤーを各チームのリーダーに設定してください。</p>
                <p><strong>② 勝敗登録について</strong></p>
                <p style={{ marginBottom: 0 }}>勝敗登録は、<strong>勝利したチームのリーダー</strong>が行ってください。</p>
              </div>
              <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>※ スマホ版では、自分の所属チームが上に表示される仕様です。</p>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: "18px 0" }}>
                <input type="checkbox" checked={skipCreateNotice} onChange={(e) => setSkipCreateNotice(e.target.checked)} style={{ width: 18, height: 18 }} />
                次回以降、この注意事項を表示しない
              </label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setShowCreateNotice(false); setSkipCreateNotice(false); }} disabled={busy} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid #ccc", background: "white", cursor: "pointer", fontWeight: 700 }}>キャンセル</button>
                <button type="button" onClick={confirmCreateRoom} disabled={busy} style={{ padding: "12px 16px", borderRadius: 10, border: "none", background: "#6a1b9a", color: "white", cursor: "pointer", fontWeight: 800 }}>確認して部屋を作成</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
