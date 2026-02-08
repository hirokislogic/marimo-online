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

function validTargets(): number[] {
  if (!room || me === null) return [];
  return room.players
    .filter(p => p.connected && p.alive && p.index !== me)
    .map(p => p.index);
}

function submitAction() {
  if (!selected) {
    info = "行動を選んでね";
    return render();
  }
  if (needsTarget(selected) && selectedTarget === null) {
    info = "ターゲットを選んでね";
    return render();
  }
  send({ type: "ACTION", action: selected, target: selectedTarget });
  selected = null;
  selectedTarget = null;
  info = "送信した！";
  render();
}

function render() {
  app.innerHTML = `
  <div style="max-width:900px;margin:0 auto;padding:12px;font-family:sans-serif;">
    <h2>まりもゲーム（4人ルーム制・指向性あり）</h2>
    <div>${info}</div>

    <div style="margin:8px 0;">
      <input value="${myName}" placeholder="名前"
        oninput="setName(this.value)" />
      <button onclick="createRoom()">ルーム作成</button>
      <input value="${joinCode}" placeholder="コード"
        oninput="setCode(this.value)" />
      <button onclick="joinRoom()">参加</button>
      ${
        room && me !== null && room.hostIndex === me
          ? `<button onclick="startMatch()">Start</button>` : ""
      }
    </div>

    ${room ? `
      <div>
        <h3>プレイヤー</h3>
        ${room.players.map(p => `
          <div>
            P${p.index+1} ${p.connected ? "" : "(OFF)"} 
            ${p.alive ? "" : "💀"} 
            E:${p.energy}
          </div>
        `).join("")}
      </div>

      ${room.status === "playing" ? `
        <h3>行動</h3>
        ${actions.map(a => `
          <button onclick="pickAction('${a}')">${label(a)}</button>
        `).join("")}

        ${selected && needsTarget(selected) ? `
          <h4>ターゲット</h4>
          ${validTargets().map(t =>
            `<button onclick="pickTarget(${t})">P${t+1}</button>`
          ).join("")}
        ` : ""}

        <div>
          選択: ${selected ?? "-"} 
          ${selectedTarget !== null ? `→ P${selectedTarget+1}` : ""}
        </div>

        <button onclick="submitAction()">送信</button>
      ` : ""}

      <h3>ログ</h3>
      ${room.logs.map(l => `<div>${l}</div>`).join("")}
    ` : ""}
  </div>
  `;
}

(window as any).setName = (v: string) => myName = v;
(window as any).setCode = (v: string) => joinCode = v.toUpperCase();
(window as any).createRoom = () => send({ type: "CREATE_ROOM", name: myName });
(window as any).joinRoom = () => send({ type: "JOIN_ROOM", code: joinCode, name: myName });
(window as any).startMatch = () => send({ type: "START" });
(window as any).pickAction = (a: Action) => { selected = a; selectedTarget = null; render(); };
(window as any).pickTarget = (t: number) => { selectedTarget = t; render(); };

render();
