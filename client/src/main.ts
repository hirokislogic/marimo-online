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

type PlayerView = {
  index: number;
  connected: boolean;
  name: string | null;
  alive: boolean;
  energy: number;
  trapForcedGuard: boolean;
  usedGuardCharge: boolean;
  bannedActions: Action[];
};

type RoomState = {
  code: string;
  status: "lobby" | "playing";
  hostIndex: number | null;
  turn: number;
  logs: string[];
  players: PlayerView[];
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

function needsTarget(a: Action): boolean {
  return a === "BEAM" || a === "BIG_BEAM" || a === "TRAP" || a === "SEAL";
}

function isGuardAction(a: Action): boolean {
  return a === "GUARD" || a === "BEAM_GUARD" || a === "GUARD_CHARGE" || a === "SEAL";
}

function label(a: Action): string {
  switch (a) {
    case "CHARGE": return "チャージ +1";
    case "GUARD_CHARGE": return "ガード付きチャージ +1（1回）";
    case "BEAM": return "ビーム -1（要ターゲット）";
    case "GUARD": return "ガード 0";
    case "BEAM_GUARD": return "ビームガード -2";
    case "BIG_BEAM": return "強ビーム -4（要ターゲット）";
    case "TRAP": return "罠 -1（要ターゲット）";
    case "SEAL": return "封印 -1（要ターゲット／そのターン防御）";
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

let room: RoomState | null = null;
let me: number | null = null;
let info = "接続中…";

let selected: Action | null = null;
let selectedTarget: number | null = null;

let myName = localStorage.getItem("marimo_name") ?? "player";
let joinCode = "";

const wsProto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${wsProto}://${location.host}/ws`);

ws.onopen = () => { info = "接続済み"; render(); };
ws.onclose = () => { info = "切断されました"; render(); };
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "WELCOME") {
    me = msg.youIndex;
    joinCode = msg.code ?? joinCode;
    info = `入室：${msg.code} / あなたは P${me + 1}`;
  }
  if (msg.type === "ROOM_STATE") room = msg.state;
  if (msg.type === "ERROR") info = `エラー: ${msg.message}`;

  render();
};

function send(obj: any) {
  ws.send(JSON.stringify(obj));
}

function meView(): PlayerView | null {
  if (!room || me === null) return null;
  return room.players[me] ?? null;
}

function validTargets(): number[] {
  if (!room || me === null) return [];
  return room.players
    .filter((p) => p.connected && p.alive && p.index !== me)
    .map((p) => p.index);
}

/** UI側で「押せない理由」を出す（最終判定はサーバ） */
function canSelectAction(a: Action): { ok: boolean; reason?: string } {
  const m = meView();
  if (!m) return { ok: false, reason: "状態未取得" };
  if (room?.status === "playing" && !m.alive) return { ok: false, reason: "死亡中" };

  // 封印（強ビームは貫通）
  if (a !== "BIG_BEAM" && m.bannedActions.includes(a)) return { ok: false, reason: "封印中" };

  // 罠：防御しか選べない
  if (m.trapForcedGuard && !isGuardAction(a)) return { ok: false, reason: "罠：防御必須" };

  // ガードチャージは1試合1回
  if (a === "GUARD_CHARGE" && m.usedGuardCharge) return { ok: false, reason: "1回使用済み" };

  // コスト不足
  if (m.energy < cost(a)) return { ok: false, reason: "コスト不足" };

  return { ok: true };
}

function createRoom() {
  localStorage.setItem("marimo_name", myName);
  send({ type: "CREATE_ROOM", name: myName });
}
function joinRoom() {
  localStorage.setItem("marimo_name", myName);
  send({ type: "JOIN_ROOM", code: joinCode, name: myName });
}
function startMatch() {
  send({ type: "START" });
}

function pickAction(a: Action) {
  selected = a;
  if (!needsTarget(a)) selectedTarget = null;
  render();
}
function pickTarget(t: number) {
  selectedTarget = t;
  render();
}

function submitAction() {
  if (!room || me === null) return;

  if (!selected) {
    info = "行動を選んでね";
    return render();
  }

  // UI側の軽いバリデーション
  const check = canSelectAction(selected);
  if (!check.ok) {
    info = `この行動は選べない：${check.reason ?? ""}`;
    return render();
  }

  if (needsTarget(selected) && selectedTarget === null) {
    info = "ターゲットを選んでね";
    return render();
  }

  send({ type: "ACTION", action: selected, target: selectedTarget });
  info = "送信した！";

  selected = null;
  selectedTarget = null;
  render();
}

function playerCard(p: PlayerView) {
  const isMe = me !== null && p.index === me;
  const host = room?.hostIndex === p.index;

  const badges = [
    host ? `<span class="badge">HOST</span>` : "",
    isMe ? `<span class="badge blue">YOU</span>` : "",
    !p.connected ? `<span class="badge gray">OFF</span>` : "",
    p.connected && !p.alive ? `<span class="badge red">DEAD</span>` : "",
    p.trapForcedGuard ? `<span class="badge amber">TRAP!</span>` : "",
  ].filter(Boolean).join(" ");

  const sealed = (p.bannedActions ?? []).filter(a => a !== "BIG_BEAM");
  const sealedText = sealed.length ? sealed.join(", ") : "なし";

  return `
    <div class="card ${isMe ? "me" : ""}">
      <div class="row">
        <div class="title">P${p.index + 1}</div>
        <div class="badges">${badges}</div>
      </div>
      <div class="sub">${escapeHtml(p.name ?? "player")}</div>
      <div class="stats">
        <div>エネルギー <b>${p.energy}</b></div>
        <div>封印 <b>${escapeHtml(sealedText)}</b></div>
        <div>ガードチャージ <b>${p.usedGuardCharge ? "使用済み" : "未使用"}</b></div>
      </div>
    </div>
  `;
}

function render() {
  const m = meView();
  const targets = validTargets();

  const header = room
    ? `ルーム <b>${room.code}</b> ／ 状態 <b>${room.status}</b> ／ Turn <b>${room.turn}</b> ／ あなた <b>${me !== null ? "P" + (me + 1) : "-"}</b>`
    : `まだ入室してないよ`;

  const showActionPanel = room && room.status === "playing";

  app.innerHTML = `
  <style>
    *{box-sizing:border-box;}
    :root{
      --bd:#e7e7e7;
      --tx:#111;
      --mut:#666;
      --bg:#ffffff;
      --card:#fff;
      --shadow:0 8px 24px rgba(0,0,0,.08);
      --r:18px;
    }
    body{margin:0;background:#fafafa;color:var(--tx);}
    .wrap{max-width:980px;margin:0 auto;padding:14px;font-family:system-ui,-apple-system,Segoe UI,Roboto;}
    .top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;}
    .h1{font-size:20px;font-weight:800;margin:0;}
    .meta{opacity:.8}
    .bar{margin-top:10px;border:1px solid var(--bd);border-radius:var(--r);background:var(--bg);padding:12px;box-shadow:var(--shadow)}
    .row{display:flex;gap:10px;align-items:center;justify-content:space-between}
    .sub{opacity:.75;margin-top:6px;font-size:13px}
    input{padding:10px 12px;border-radius:14px;border:1px solid var(--bd);min-width:160px;font-size:14px}
    .btn{padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:#fff;font-weight:700;cursor:pointer}
    .btn:hover{transform:translateY(-1px)}
    .btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
    .grid{display:grid;gap:12px;margin-top:12px}
    .players{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .card{border:1px solid var(--bd);border-radius:var(--r);background:var(--card);padding:12px;box-shadow:var(--shadow)}
    .card.me{outline:3px solid #c7f3ff}
    .title{font-size:16px;font-weight:900}
    .badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .badge{font-size:11px;padding:4px 8px;border-radius:999px;border:1px solid var(--bd);background:#f6f6f6}
    .badge.blue{background:#e7f6ff;border-color:#b7e6ff}
    .badge.red{background:#ffe8e8;border-color:#ffb8b8}
    .badge.gray{background:#f0f0f0;border-color:#ddd}
    .badge.amber{background:#fff3d6;border-color:#ffd38a}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;font-size:13px;opacity:.9}
    .panel{border:1px solid var(--bd);border-radius:var(--r);background:#fff;padding:12px;box-shadow:var(--shadow)}
    .actions{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}
    .aBtn{
      padding:14px;border-radius:18px;border:1px solid var(--bd);
      background:#fff;font-size:15px;font-weight:800;text-align:left;
    }
    .aBtn small{display:block;font-weight:600;opacity:.75;margin-top:3px}
    .aBtn.pick{outline:3px solid #111}
    .aBtn.danger{background:#ffe7e7;border-color:#ffbdbd;color:#9a0000}
    .targets{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
    .tBtn{padding:12px 14px;border-radius:999px;border:1px solid var(--bd);background:#fff;font-weight:900}
    .tBtn.pick{outline:3px solid #111}
    .sticky{
      position:sticky;bottom:10px;margin-top:12px;
      border:1px solid var(--bd);border-radius:var(--r);background:rgba(255,255,255,.92);
      backdrop-filter:blur(6px);box-shadow:var(--shadow);padding:10px;
      display:flex;gap:10px;align-items:center;flex-wrap:wrap;
    }
    .big{font-size:18px}
    .logs{max-height:220px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;margin-top:10px}
    .log{padding:8px 10px;border-radius:14px;background:#f7f7f7;margin-bottom:8px}
    .mut{opacity:.7}
    @media (max-width:520px){
      .players{grid-template-columns:1fr;}
      .actions{grid-template-columns:1fr;}
      .aBtn{font-size:16px;padding:16px}
      .btn{padding:14px 16px}
      input{min-width:140px}
      .stats{grid-template-columns:1fr}
    }
  </style>

  <div class="wrap">
    <div class="top">
      <div>
        <h2 class="h1">まりもゲーム（4人/ルーム制/指向性）</h2>
        <div class="meta">${escapeHtml(info)}</div>
        <div class="sub">${header}</div>
      </div>
    </div>

    <div class="bar">
      <div class="row" style="flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input value="${escapeHtml(myName)}" placeholder="名前" oninput="setName(this.value)" />
          <button class="btn" onclick="createRoom()">ルーム作成</button>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input value="${escapeHtml(joinCode)}" placeholder="コード" oninput="setCode(this.value)" />
          <button class="btn" onclick="joinRoom()">参加</button>
          ${
            room && me !== null && room.hostIndex === me
              ? `<button class="btn" onclick="startMatch()">Start（HOST）</button>`
              : ``
          }
        </div>
      </div>
      <div class="sub">
        友達に <b>ルームコード</b> を送って参加してもらってね（最大4人）
      </div>
    </div>

    ${room ? `
      <div class="grid">
        <div>
          <div style="font-weight:900;margin-bottom:8px;">プレイヤー</div>
          <div class="players">
            ${room.players.map(playerCard).join("")}
          </div>
        </div>

        ${showActionPanel ? `
          <div class="panel">
            <div style="font-weight:900;">行動</div>
            <div class="mut" style="margin-top:6px;">
              ※ BEAM / BIG_BEAM / TRAP / SEAL はターゲットが必要
            </div>

            <div class="actions">
              ${
                actions.map((a) => {
                  const check = canSelectAction(a);
                  const disabled = !check.ok;
                  const picked = selected === a;
                  const danger = disabled; // 封印/コスト不足/罠など全部赤

                  const hint = disabled ? (check.reason ?? "") : "";
                  return `
                    <button
                      class="aBtn ${picked ? "pick" : ""} ${danger ? "danger" : ""}"
                      ${disabled ? "disabled" : ""}
                      onclick="pickAction('${a}')"
                      title="${escapeHtml(hint)}"
                    >
                      ${escapeHtml(label(a))}
                      <small>cost: ${cost(a)} ${hint ? `／ ${escapeHtml(hint)}` : ""}</small>
                    </button>
                  `;
                }).join("")
              }
            </div>

            ${
              selected && needsTarget(selected)
                ? `
                  <div style="margin-top:12px;font-weight:900;">ターゲット</div>
                  <div class="targets">
                    ${
                      targets.length
                        ? targets.map((t) => `
                            <button class="tBtn ${selectedTarget===t ? "pick":""}" onclick="pickTarget(${t})">
                              P${t+1}
                            </button>
                          `).join("")
                        : `<div class="mut">ターゲットがいません（相手がいない/全滅）</div>`
                    }
                  </div>
                `
                : ``
            }

            <div class="sticky">
              <button class="btn big" onclick="submitAction()">送信</button>
              <div class="big">
                選択: <b>${selected ?? "-"}</b>
                ${
                  selected && needsTarget(selected)
                    ? ` → <b>${selectedTarget !== null ? "P"+(selectedTarget+1) : "-"}</b>`
                    : ``
                }
              </div>
            </div>
          </div>
        ` : ``}

        <div class="panel">
          <div style="font-weight:900;">ログ</div>
          <div class="logs">
            ${
              room.logs.length
                ? room.logs.map((l) => `<div class="log">${escapeHtml(l)}</div>`).join("")
                : `<div class="mut" style="margin-top:10px;">ログなし</div>`
            }
          </div>
        </div>
      </div>
    ` : `
      <div class="panel" style="margin-top:12px;">
        <div style="font-weight:900;">まずはルーム作成か参加</div>
        <div class="mut" style="margin-top:8px;">
          ルーム作成 → 出たコードを友達に送る → みんなが参加 → HOSTがStart
        </div>
      </div>
    `}
  </div>
  `;
}

// Bind to window
(window as any).setName = (v: string) => { myName = v; render(); };
(window as any).setCode = (v: string) => {
  joinCode = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  render();
};

(window as any).createRoom = () => createRoom();
(window as any).joinRoom = () => joinRoom();
(window as any).startMatch = () => startMatch();

(window as any).pickAction = (a: Action) => pickAction(a);
(window as any).pickTarget = (t: number) => pickTarget(t);
(window as any).submitAction = () => submitAction();

render();
