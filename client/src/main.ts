const app = document.querySelector<HTMLDivElement>("#app")!;

type Action =
  | "CHARGE"
  | "GUARD_CHARGE"
  | "BEAM"
  | "GUARD"
  | "BEAM_GUARD"
  | "BIG_BEAM"
  | "TRAP"
  | "SEAL";

type PlayerState = {
  energy: number;
  trapForcedGuard: boolean;
  usedGuardCharge: boolean;
  bannedActions: Action[];
};

type GameState = {
  turn: number;
  p: PlayerState[];
};

const actions: Action[] = [
  "CHARGE",
  "GUARD_CHARGE",
  "BEAM",
  "GUARD",
  "BEAM_GUARD",
  "BIG_BEAM",
  "TRAP",
  "SEAL",
];

let myIndex: 0 | 1 | null = null;
let connected = false;
let state: GameState | null = null;
let logs: string[] = [];
let selected: Action | null = null;
let infoMsg = "接続中…";

// ★ サーバに接続
const wsProto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${wsProto}://${location.host}/ws`);

ws.onopen = () => {
  connected = true;
  infoMsg = "接続済み。相手待ち…";
  render();
};

ws.onclose = () => {
  connected = false;
  infoMsg = "切断されました。サーバを確認してね。";
  render();
};

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "WELCOME") {
    myIndex = msg.playerIndex;
    infoMsg = `あなたは P${myIndex + 1}。相手待ち…`;
  }

  if (msg.type === "MATCH_START") {
    selected = null;
    infoMsg = "試合開始！";
  }

  if (msg.type === "TURN_START") {
    state = msg.state;
    logs = msg.logs ?? logs;
    selected = null;
  }

  if (msg.type === "TURN_RESULT") {
    state = msg.state;
    logs = msg.logs ?? logs;
    selected = null;
  }

  if (msg.type === "INFO") {
    infoMsg = msg.message;
  }

  if (msg.type === "ERROR") {
    infoMsg = `エラー: ${msg.message}`;
  }

  render();
};

function cost(a: Action): number {
  switch (a) {
    case "BEAM": return 1;
    case "BEAM_GUARD": return 2;
    case "BIG_BEAM": return 4;
    case "TRAP": return 1;
    case "SEAL": return 1;
    default: return 0;
  }
}

function label(a: Action): string {
  switch (a) {
    case "CHARGE": return "チャージ +1";
    case "GUARD_CHARGE": return "ガード付きチャージ +1（1回）";
    case "BEAM": return "ビーム -1";
    case "GUARD": return "ガード 0";
    case "BEAM_GUARD": return "ビームガード -2";
    case "BIG_BEAM": return "強ビーム -4（封印無効）";
    case "TRAP": return "罠 -1";
    case "SEAL": return "封印 -1（ビーム防ぐ）";
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 「出せない」は赤にする（封印/コスト不足/罠強制/ガードチャージ消費済み）
function canSelect(me: PlayerState, a: Action): boolean {
  // 封印（強ビームは無視）
  if (a !== "BIG_BEAM" && me.bannedActions.includes(a)) return false;

  // 罠強制：防御系のみ（SEALも防御扱い）
  const guardOK: Action[] = ["GUARD", "BEAM_GUARD", "GUARD_CHARGE", "SEAL"];
  if (me.trapForcedGuard && !guardOK.includes(a)) return false;

  // ガード付きチャージは1回
  if (a === "GUARD_CHARGE" && me.usedGuardCharge) return false;

  // コスト不足
  if (me.energy < cost(a)) return false;

  return true;
}

function sendAction() {
  if (window.matchMedia("(max-width: 520px)").matches) {
  const ok = confirm(`この行動で送信する？\n\n${selected}`);
  if (!ok) return;
  }
  if (selected === null) {
    infoMsg = "行動を選んでね";
    return render();
  }
  ws.send(JSON.stringify({ type: "ACTION", action: selected }));
  infoMsg = "送信した！相手待ち…";
  render();
}

function renderPlayerCard(p: PlayerState, name: string, accent: string) {
  return `
    <div style="border:2px solid ${accent}; padding:12px; background:#f9f9f9; border-radius:12px;">
      <h3 style="margin:0 0 8px 0;">${name}</h3>
      <div>エネルギー: <b>${p.energy}</b></div>
      <div>罠強制中: <b>${p.trapForcedGuard ? "YES" : "NO"}</b></div>
      <div>使用禁止: <b>${p.bannedActions.filter(a => a !== "BIG_BEAM").join(", ") || "なし"}</b></div>
      <div>ガードチャージ使用済み: <b>${p.usedGuardCharge ? "YES" : "NO"}</b></div>
    </div>
  `;
}

function render() {
  const me = myIndex !== null && state ? state.p[myIndex] : null;
  const enemy = myIndex !== null && state ? state.p[myIndex === 0 ? 1 : 0] : null;

  app.innerHTML = `
     <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      button { -webkit-tap-highlight-color: transparent; }
      .container { padding: 14px; max-width: 900px; margin: 0 auto; }
      .top { display: grid; gap: 10px; }
      .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .actionBtn { padding: 14px; border-radius: 14px; font-size: 16px; }
      .sendRow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .sendBtn { padding: 12px 16px; font-size: 18px; border-radius: 14px; }

      /* ✅ スマホ最適化 */
      @media (max-width: 520px) {
        .container { padding: 12px; }
        .cards { grid-template-columns: 1fr; }           /* YOU/ENEMY 縦並び */
        .actions { grid-template-columns: 1fr; }         /* ボタン1列（誤タップ減） */
        .actionBtn { width: 100%; font-size: 18px; padding: 16px; }
        .sendRow { position: sticky; bottom: 10px; background: rgba(255,255,255,0.92);
                   padding: 10px; border-radius: 16px; border: 1px solid #eee;
                   backdrop-filter: blur(6px); }
        .sendBtn { flex: 1; width: 100%; font-size: 20px; padding: 14px 16px; }
      }
     </style>

    <div class="container" style="font-family:system-ui;">
      <h2 style="margin:0 0 8px 0;">まりもゲーム（オンライン）</h2>
      <div style="opacity:0.75;">${escapeHtml(infoMsg)}</div>
      <div style="margin-top:6px;">接続: <b>${connected ? "OK" : "NO"}</b> / あなた: <b>${myIndex !== null ? `P${myIndex + 1}` : "-"}</b> / Turn: <b>${state?.turn ?? "-"}</b></div>

      <hr/>

      <div class="cards">
        ${me ? renderPlayerCard(me, "YOU", "#3af") : `<div style="opacity:0.6;">状態待ち…</div>`}
        ${enemy ? renderPlayerCard(enemy, "ENEMY", "#fa3") : `<div style="opacity:0.6;">相手待ち…</div>`}
      </div>

      <hr/>

      <div style="border:1px solid #ddd; padding:12px; border-radius:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b>あなたの行動</b>
          <span style="opacity:0.6; font-size:12px;">選んで「送信」</span>
        </div>

        <div class="actions" style="margin-top:10px;">

          ${
            me
              ? actions
                  .map((a) => {
                    const disabled = !canSelect(me, a);
                    const red = disabled;

                    const selectedStyle =
                      selected === a
                        ? "outline:3px solid #000; transform: translateY(-1px);"
                        : "";

                    const bigStyle =
                      a === "BIG_BEAM"
                        ? "font-weight:bold; border:2px solid red;"
                        : "border:1px solid #ccc;";

                    return `
                      <button
                        class="actionBtn"
                        ${disabled ? "disabled" : ""}
                        onclick="pick('${a}')"
                        style="
                          padding:10px;
                          border-radius:10px;
                          ${bigStyle}
                          ${red ? "background:#ffdddd; color:#a00000;" : "background:#fff;"}
                          ${selectedStyle}
                          cursor:${disabled ? "not-allowed" : "pointer"};
                        "
                      >
                        ${label(a)}
                      </button>
                    `;
                  })
                  .join("")
              : `<div style="opacity:0.6;">状態が届くまで待ってね</div>`
          }
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
          <button onclick="send()" style="padding:10px 14px; font-size:16px; border-radius:10px;">
            送信
          </button>
          <div>
            選択:
            <b style="color:${selected ? "#d00" : "#000"}; font-size:18px;">
              ${selected ?? "-"}
            </b>
          </div>
        </div>
      </div>

      <hr/>

      <div style="
        border:1px solid #ddd;
        border-radius:12px;
        padding:12px;
        background:#fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      ">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b>ログ</b>
          <span style="opacity:0.6; font-size:12px;">最新が上</span>
        </div>

        <div style="
          margin-top:10px;
          max-height:180px;
          overflow:auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.5;
        ">
          ${logs.length === 0 ? `<div style="opacity:0.6;">まだログはありません</div>` : ""}
          ${logs
            .map(
              (l: string, idx: number) => `
                <div style="
                  padding:6px 8px;
                  border-radius:8px;
                  background:${idx % 2 === 0 ? "#f7f7f7" : "#ffffff"};
                  border:1px solid ${idx === 0 ? "#ffd4d4" : "transparent"};
                ">
                  ${escapeHtml(l)}
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

// HTML から呼ぶ
(window as any).pick = (a: Action) => {
  selected = a;
  render();
};
(window as any).send = () => sendAction();

render();
