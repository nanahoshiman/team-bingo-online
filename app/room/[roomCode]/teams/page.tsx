"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Team = "red" | "blue";

type FixedTeam = Team | null;

type Player = {

  id: string;

  player_name: string;

  is_host: boolean;

  is_leader: boolean;

  team: Team | null;

};

function shuffleArray<T>(items: T[]) {

  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {

    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];

  }

  return result;

}

function makeTeams(players: Player[], fixedTeams: Record<string, FixedTeam>) {

  const fixedRed = players.filter((player) => fixedTeams[player.id] === "red");

  const fixedBlue = players.filter((player) => fixedTeams[player.id] === "blue");

  const unassigned = shuffleArray(

    players.filter((player) => fixedTeams[player.id] == null)

  );

  const low = Math.floor(players.length / 2);

  const high = Math.ceil(players.length / 2);

  const candidates = Array.from(new Set([low, high]))

    .map((redTarget) => ({

      redTarget,

      blueTarget: players.length - redTarget,

    }))

    .filter(

      ({ redTarget, blueTarget }) =>

        fixedRed.length <= redTarget && fixedBlue.length <= blueTarget

    );

  if (candidates.length === 0) {

    throw new Error("固定人数が多すぎて、人数差1以内のチームを作れません。");

  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  const redSlots = chosen.redTarget - fixedRed.length;

  const randomRed = unassigned.slice(0, redSlots);

  const randomBlue = unassigned.slice(redSlots);

  return {

    red: [...fixedRed, ...shuffleArray(randomRed)],

    blue: [...fixedBlue, ...shuffleArray(randomBlue)],

  };

}

export default function TeamSetupPage() {

  const params = useParams();

  const router = useRouter();

  const roomCode = String(params.roomCode ?? "").toUpperCase();

  const [players, setPlayers] = useState<Player[]>([]);

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  const [fixedTeams, setFixedTeams] = useState<Record<string, FixedTeam>>({});

  const [previewRed, setPreviewRed] = useState<Player[]>([]);

  const [previewBlue, setPreviewBlue] = useState<Player[]>([]);

  const [redLeaderId, setRedLeaderId] = useState<string | null>(null);

  const [blueLeaderId, setBlueLeaderId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

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

      .select("id, player_name, is_host, is_leader, team")

      .eq("room_code", roomCode)

      .order("created_at", { ascending: true });

    if (error) {

      console.error("プレイヤー取得エラー:", error);

      setLoading(false);

      return;

    }

    const nextPlayers = (data ?? []) as Player[];

    setPlayers(nextPlayers);

    const savedRed = nextPlayers.filter((player) => player.team === "red");

    const savedBlue = nextPlayers.filter((player) => player.team === "blue");

    if (savedRed.length > 0 || savedBlue.length > 0) {

      setPreviewRed(savedRed);

      setPreviewBlue(savedBlue);

      setRedLeaderId(savedRed.find((player) => player.is_leader)?.id ?? null);

      setBlueLeaderId(savedBlue.find((player) => player.is_leader)?.id ?? null);

    }

    setLoading(false);

  }

  async function checkRoomStatus() {

    const { data, error } = await supabase

      .from("rooms")

      .select("status")

      .eq("room_code", roomCode)

      .maybeSingle();

    if (error) {

      console.error("ルーム状態取得エラー:", error);

      return;

    }

    if (data?.status === "teams_ready") {

      router.push(`/room/${roomCode}/game`);

    }

  }

  async function resyncTeamSetupState() {

    await Promise.all([loadPlayers(), checkRoomStatus()]);

  }

  useEffect(() => {

    if (!roomCode) return;

    setMyPlayerId(getStoredPlayerId());

    loadPlayers();

    checkRoomStatus();

    const playerChannel = supabase

      .channel(`teams-players-${roomCode}`)

      .on(

        "postgres_changes",

        {

          event: "UPDATE",

          schema: "public",

          table: "player",

          filter: `room_code=eq.${roomCode}`,

        },

        () => loadPlayers()

      )

      .subscribe();

    const roomChannel = supabase

      .channel(`teams-room-${roomCode}`)

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

          if (newStatus === "teams_ready") {

            router.push(`/room/${roomCode}/game`);

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

      void resyncTeamSetupState();

    };

    const syncWhenFocused = () => {

      void resyncTeamSetupState();

    };

    window.addEventListener("focus", syncWhenFocused);

    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {

      window.removeEventListener("focus", syncWhenFocused);

      document.removeEventListener("visibilitychange", syncWhenVisible);

    };

  }, [roomCode]);

  const myPlayer = useMemo(

    () => players.find((player) => player.id === myPlayerId) ?? null,

    [players, myPlayerId]

  );

  const amHost = myPlayer?.is_host === true;

  function clearPreviewAndLeaders() {

    setPreviewRed([]);

    setPreviewBlue([]);

    setRedLeaderId(null);

    setBlueLeaderId(null);

  }

  function setFixedTeam(playerId: string, team: FixedTeam) {

    setFixedTeams((current) => ({ ...current, [playerId]: team }));

    clearPreviewAndLeaders();

  }

  function previewTeams() {

    try {

      const result = makeTeams(players, fixedTeams);

      setPreviewRed(result.red);

      setPreviewBlue(result.blue);

      setRedLeaderId(null);

      setBlueLeaderId(null);

    } catch (error) {

      alert(error instanceof Error ? error.message : "チーム分けに失敗しました。");

    }

  }

  async function saveTeams() {

    if (!amHost || saving) return;

    if (previewRed.length + previewBlue.length !== players.length) {

      alert("先にチーム分けを実行してください。");

      return;

    }

    if (!redLeaderId || !blueLeaderId) {

      alert("赤チーム・青チームそれぞれ1人ずつリーダーを選んでください。");

      return;

    }

    if (

      !previewRed.some((player) => player.id === redLeaderId) ||

      !previewBlue.some((player) => player.id === blueLeaderId)

    ) {

      alert("リーダーの選択状態が正しくありません。もう一度選択してください。");

      return;

    }

    setSaving(true);

    try {

      const updates = [

        ...previewRed.map((player) => ({

          id: player.id,

          team: "red" as const,

          is_leader: player.id === redLeaderId,

        })),

        ...previewBlue.map((player) => ({

          id: player.id,

          team: "blue" as const,

          is_leader: player.id === blueLeaderId,

        })),

      ];

      const results = await Promise.all(

        updates.map(({ id, team, is_leader }) =>

          supabase.from("player").update({ team, is_leader }).eq("id", id)

        )

      );

      const failed = results.find((result) => result.error);

      if (failed?.error) {

        console.error("チーム保存エラー:", failed.error);

        alert(

          "チーム・リーダー情報の保存に失敗しました。playerテーブルのUPDATEポリシーを確認してください。"

        );

        return;

      }

      const { error: roomError } = await supabase

        .from("rooms")

        .update({ status: "teams_ready" })

        .eq("room_code", roomCode);

      if (roomError) {

        console.error("ルーム状態更新エラー:", roomError);

        alert("チームは保存できましたが、ルーム状態の更新に失敗しました。");

        return;

      }

      router.push(`/room/${roomCode}/game`);

    } catch (error) {

      console.error("チーム確定中の予期しないエラー:", error);

      alert("チーム確定中に予期しないエラーが発生しました。");

    } finally {

      setSaving(false);

    }

  }

  if (loading) {

    return (

      <main

        style={{

          minHeight: "100vh",

          display: "grid",

          placeItems: "center",

          background: "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)",

        }}

      >

        <div style={{ fontWeight: 900 }}>読み込み中...</div>

      </main>

    );

  }

  return (

    <main

      style={{

        minHeight: "100vh",

        padding: 20,

        background: "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)",

        color: "#222",

      }}

    >

      <div style={{ width: "100%", maxWidth: 920, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: 24 }}>

          <button
              type="button"
              onClick={() => router.push("/")}
              title="ホーム画面に戻る"
              style={{
                display: "block",
                margin: "0 auto 10px",
                padding: 0,
                border: "none",
                background: "transparent",
                color: "#6a1b9a",
                fontSize: 17,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ななほしのビンゴツール
            </button>
            <h1 style={{ margin: 0 }}>チーム分け</h1>

          <div style={{ marginTop: 6, color: "#6a1b9a", fontWeight: 900 }}>

            ROOM {roomCode}

          </div>

        </div>

        {amHost ? (

          <>

            <section

              style={{

                padding: 18,

                borderRadius: 16,

                backgroundColor: "white",

                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",

                marginBottom: 18,

              }}

            >

              <h2 style={{ marginTop: 0, marginBottom: 8 }}>固定するプレイヤー</h2>

              <p style={{ margin: "0 0 16px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>

                固定したい人だけ赤または青を指定してください。全員「未指定」のまま実行すると完全ランダムになります。

              </p>

              <div style={{ display: "grid", gap: 10 }}>

                {players.map((player) => {

                  const fixedTeam = fixedTeams[player.id] ?? null;

                  return (

                    <div

                      key={player.id}

                      style={{

                        display: "grid",

                        gridTemplateColumns: "minmax(120px, 1fr) repeat(3, auto)",

                        alignItems: "center",

                        gap: 8,

                        padding: 12,

                        border: "1px solid #ddd",

                        borderRadius: 12,

                      }}

                    >

                      <strong>

                        {player.player_name}

                        {player.is_host ? " 👑" : ""}

                      </strong>

                      <button

                        type="button"

                        onClick={() => setFixedTeam(player.id, null)}

                        style={{

                          padding: "8px 10px",

                          borderRadius: 8,

                          border: fixedTeam === null ? "2px solid #555" : "1px solid #ccc",

                          backgroundColor: fixedTeam === null ? "#f3f3f3" : "white",

                          fontWeight: 800,

                          cursor: "pointer",

                        }}

                      >

                        未指定

                      </button>

                      <button

                        type="button"

                        onClick={() => setFixedTeam(player.id, "red")}

                        style={{

                          padding: "8px 10px",

                          borderRadius: 8,

                          border: fixedTeam === "red" ? "3px solid #d81b1b" : "1px solid #ccc",

                          backgroundColor: fixedTeam === "red" ? "#ffeaea" : "white",

                          color: "#c62828",

                          fontWeight: 900,

                          cursor: "pointer",

                        }}

                      >

                        🔴 赤固定

                      </button>

                      <button

                        type="button"

                        onClick={() => setFixedTeam(player.id, "blue")}

                        style={{

                          padding: "8px 10px",

                          borderRadius: 8,

                          border: fixedTeam === "blue" ? "3px solid #1565d8" : "1px solid #ccc",

                          backgroundColor: fixedTeam === "blue" ? "#eaf2ff" : "white",

                          color: "#0d47a1",

                          fontWeight: 900,

                          cursor: "pointer",

                        }}

                      >

                        🔵 青固定

                      </button>

                    </div>

                  );

                })}

              </div>

            </section>

            <button

              type="button"

              onClick={previewTeams}

              style={{

                width: "100%",

                padding: "15px 20px",

                border: "none",

                borderRadius: 12,

                backgroundColor: "#6a1b9a",

                color: "white",

                fontSize: 18,

                fontWeight: 900,

                cursor: "pointer",

                marginBottom: 18,

              }}

            >

              🎲 チーム分け実行 / 再抽選

            </button>

          </>

        ) : (

          <div

            style={{

              padding: 16,

              borderRadius: 12,

              backgroundColor: "#f5f5f5",

              textAlign: "center",

              fontWeight: 800,

              marginBottom: 18,

            }}

          >

            ホストがチームを決めています...

          </div>

        )}

        {(previewRed.length > 0 || previewBlue.length > 0) && (

          <>

            <div

              style={{

                display: "grid",

                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",

                gap: 14,

              }}

            >

              <section

                style={{

                  padding: 18,

                  border: "4px solid #d81b1b",

                  borderRadius: 16,

                  backgroundColor: "#fff5f5",

                }}

              >

                <h2 style={{ marginTop: 0, color: "#c62828", textAlign: "center" }}>

                  🔴 赤チーム {previewRed.length}人

                </h2>

                {previewRed.map((player) => {

                  const isFixed = fixedTeams[player.id] === "red";

                  const isLeader = player.id === redLeaderId;

                  return (

                    <div

                      key={player.id}

                      style={{

                        padding: 11,

                        marginTop: 8,

                        borderRadius: 10,

                        backgroundColor: isFixed ? "#ffe2e2" : "white",

                        border: isLeader

                          ? "3px solid #ff9800"

                          : isFixed

                            ? "2px solid #ef5350"

                            : "2px solid transparent",

                        fontWeight: 900,

                      }}

                    >

                      <div>

                        {isLeader ? "⭐ " : ""}

                        {isFixed ? "📌 " : ""}

                        {player.player_name}

                        {isFixed ? " 【固定】" : ""}

                        {player.is_host ? " 👑" : ""}

                      </div>

                      {amHost && (

                        <button

                          type="button"

                          onClick={() => setRedLeaderId(player.id)}

                          style={{

                            width: "100%",

                            marginTop: 8,

                            padding: "8px 10px",

                            borderRadius: 8,

                            border: isLeader ? "2px solid #ff9800" : "1px solid #ccc",

                            backgroundColor: isLeader ? "#fff3e0" : "white",

                            color: "#7a4a00",

                            fontWeight: 900,

                            cursor: "pointer",

                          }}

                        >

                          {isLeader ? "⭐ 赤リーダー選択中" : "この人を赤リーダーにする"}

                        </button>

                      )}

                    </div>

                  );

                })}

              </section>

              <section

                style={{

                  padding: 18,

                  border: "4px solid #1565d8",

                  borderRadius: 16,

                  backgroundColor: "#f4f8ff",

                }}

              >

                <h2 style={{ marginTop: 0, color: "#0d47a1", textAlign: "center" }}>

                  🔵 青チーム {previewBlue.length}人

                </h2>

                {previewBlue.map((player) => {

                  const isFixed = fixedTeams[player.id] === "blue";

                  const isLeader = player.id === blueLeaderId;

                  return (

                    <div

                      key={player.id}

                      style={{

                        padding: 11,

                        marginTop: 8,

                        borderRadius: 10,

                        backgroundColor: isFixed ? "#dceaff" : "white",

                        border: isLeader

                          ? "3px solid #ff9800"

                          : isFixed

                            ? "2px solid #42a5f5"

                            : "2px solid transparent",

                        fontWeight: 900,

                      }}

                    >

                      <div>

                        {isLeader ? "⭐ " : ""}

                        {isFixed ? "📌 " : ""}

                        {player.player_name}

                        {isFixed ? " 【固定】" : ""}

                        {player.is_host ? " 👑" : ""}

                      </div>

                      {amHost && (

                        <button

                          type="button"

                          onClick={() => setBlueLeaderId(player.id)}

                          style={{

                            width: "100%",

                            marginTop: 8,

                            padding: "8px 10px",

                            borderRadius: 8,

                            border: isLeader ? "2px solid #ff9800" : "1px solid #ccc",

                            backgroundColor: isLeader ? "#fff3e0" : "white",

                            color: "#7a4a00",

                            fontWeight: 900,

                            cursor: "pointer",

                          }}

                        >

                          {isLeader ? "⭐ 青リーダー選択中" : "この人を青リーダーにする"}

                        </button>

                      )}

                    </div>

                  );

                })}

              </section>

            </div>

            {amHost && (

              <div

                style={{

                  marginTop: 16,

                  padding: 14,

                  borderRadius: 12,

                  backgroundColor: redLeaderId && blueLeaderId ? "#e8f5e9" : "#fff8e1",

                  color: redLeaderId && blueLeaderId ? "#1b5e20" : "#8a5a00",

                  textAlign: "center",

                  fontWeight: 900,

                }}

              >

                {redLeaderId && blueLeaderId

                  ? "✓ 赤・青のリーダーを選択済み"

                  : "赤・青それぞれ1人ずつリーダーを選んでください"}

              </div>

            )}

          </>

        )}

        {amHost && previewRed.length + previewBlue.length === players.length && (

          <button

            type="button"

            onClick={saveTeams}

            disabled={saving}

            style={{

              width: "100%",

              marginTop: 18,

              padding: "16px 20px",

              border: "none",

              borderRadius: 12,

              backgroundColor: "#188038",

              color: "white",

              fontSize: 18,

              fontWeight: 900,

              cursor: saving ? "not-allowed" : "pointer",

              opacity: saving ? 0.6 : 1,

            }}

          >

            {saving ? "保存中..." : "✓ チーム・リーダーを確定"}

          </button>

        )}

      </div>

    </main>

  );

}
