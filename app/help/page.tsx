"use client";

import { useRouter } from "next/navigation";

const sections = [
  {
    title: "🎲 チームビンゴの基本",
    body: [
      "ホストがルームを作成し、表示された6文字のルームコードを参加者に共有します。",
      "参加者は「チームビンゴ」を選び、名前とルームコードを入力して参加します。4〜8人で開始できます。",
      "ホストがチーム分けへ進み、赤・青チームを決定します。5〜8人の場合は各チームのリーダーがその試合に出る2人を選びます。",
      "対戦者4人は自分のチームのビンゴカードから使用キャラを選んで確定します。試合開始前なら選び直せます。",
      "4人全員のキャラが決まったら、ホストが「READY TO FIGHT!」を押して対戦開始です。",
      "試合後に勝利チームを登録すると、勝った側の使用キャラのマスを獲得します。先にビンゴを完成させたチームが勝利です。",
    ],
  },
  {
    title: "⚔️ 全員乱闘",
    body: [
      "2人用の1 VS 1モードです。ランダムに選ばれたキャラで対戦します。",
      "1勝につき1ポイント。使用済みキャラは以降の抽選から除外されます。",
    ],
  },
  {
    title: "🔄 更新・復帰・退出",
    body: [
      "画面はリアルタイムで同期され、復帰時・画面を再表示した時にも最新状態を取得します。",
      "表示が合わない時はゲーム画面の「最新状態に更新」を使えます。",
      "ページ更新やタブを閉じただけではルームから退出しません。同じ端末・同じ名前で入り直すと、保存されているプレイヤー情報から復帰できます。",
      "参加枠を空けたい時は「ルームから退出」を使ってください。ホストが退出した場合は残っている参加者へホストが引き継がれます。",
    ],
  },
  {
    title: "📺 OBS配信画面",
    body: [
      "トップ右上の☰から「配信者用ページ」を開き、6文字のルームコードを入力します。",
      "表示されたルーム専用の配信画面をOBSの「ブラウザ」ソースとして追加します。",
      "OBSのブラウザソースは幅1920・高さ1080を推奨します。ブラウザソースをゲーム映像より上に置くと、左上の透明部分からゲーム映像が見えます。",
      "右側に赤・青のビンゴカード、下側に対戦カード・勝敗数・チーム情報が表示され、試合の進行に合わせて更新されます。",
    ],
  },
];

export default function HelpPage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 16px 56px",
        boxSizing: "border-box",
        background: "linear-gradient(180deg, #f8f9fc 0%, #eef1f6 100%)",
        color: "#222",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ width: "min(100%, 760px)", margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            border: "none",
            background: "transparent",
            color: "#6a1b9a",
            fontWeight: 900,
            fontSize: 15,
            cursor: "pointer",
            padding: "6px 0",
          }}
        >
          ← トップへ戻る
        </button>

        <header style={{ textAlign: "center", margin: "22px 0 26px" }}>
          <div style={{ fontSize: 42 }}>❓</div>
          <h1 style={{ margin: "6px 0", fontSize: "clamp(28px, 7vw, 42px)" }}>
            ヘルプ・使い方
          </h1>
          <div style={{ color: "#6a1b9a", fontWeight: 1000 }}>TEAM BINGO ONLINE</div>
          <p style={{ color: "#666", lineHeight: 1.7 }}>
            初めて使う人は、まず「チームビンゴの基本」を上から順番に見ればOKです。
          </p>
        </header>

        <div style={{ display: "grid", gap: 16 }}>
          {sections.map((section) => (
            <section
              key={section.title}
              style={{
                padding: "20px 20px 18px",
                borderRadius: 18,
                backgroundColor: "white",
                border: "1px solid #e2e2e2",
                boxShadow: "0 8px 24px rgba(0,0,0,0.07)",
              }}
            >
              <h2 style={{ margin: "0 0 14px", fontSize: 21 }}>{section.title}</h2>
              <ol style={{ margin: 0, paddingLeft: 24, display: "grid", gap: 10, lineHeight: 1.7 }}>
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <section
          style={{
            marginTop: 18,
            padding: 18,
            borderRadius: 16,
            backgroundColor: "#f7effa",
            border: "2px solid #6a1b9a",
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          <strong>困った時は</strong>
          <br />
          まず「最新状態に更新」またはページの再読み込みを試してください。
          <br />
          正式に抜ける場合だけ「ルームから退出」を使用してください。
        </section>
      </div>
    </main>
  );
}