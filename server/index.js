import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

const distPath = path.resolve(__dirname, "../client/dist");
console.log("distPath =", distPath);

const app = express();

// まず疎通確認用（ここが返ればHTTPは生きてる）
app.get("/health", (_, res) => res.status(200).send("ok"));

// 静的ファイル配信
app.use(express.static(distPath));

// SPA用：それ以外は index.html を返す（Express 5でも安全な正規表現）
app.get(/.*/, (_, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const server = http.createServer(app);

// WS は /ws
const wss = new WebSocketServer({ server, path: "/ws" });

/** ===== まりもゲーム ロジック ===== */
const Actions = [
  "CHARGE",
  "GUARD_CHARGE",
  "BEAM",
  "GUARD",
  "BEAM_GUARD",
  "BIG_BEAM",
  "TRAP",
  "SEAL",
];

function cost(a) {
  switch (a) {
    case "BEAM": return 1;
    case "BEAM_GUARD": return 2;
    case "BIG_BEAM": return 4;
    case "TRAP": return 1;
    case "SEAL": return 1;
    default: return 0;
  }
}

// SEALは通常ビームを防ぐ（強ビームは防げない）
function isGuardAction(a) {
  return a === "GUARD" || a === "BEAM_GUARD" || a === "GUARD_CHARGE" || a === "SEAL";
}

function judge(a0, a1) {
  if (a0 === "BIG_BEAM" && a1 !== "BEAM_GUARD") return 0;
  if (a1 === "BIG_BEAM" && a0 !== "BEAM_GUARD") return 1;

  const normalDefenders = ["GUARD", "BEAM_GUARD", "GUARD_CHARGE", "SEAL"];
  if (a0 === "BEAM" && !normalDefenders.includes(a1)) return 0;
  if (a1 === "BEAM" && !normalDefenders.includes(a0)) return 1;

  return null;
}

function newPlayer() {
  return {
    energy: 0,
    trapForcedGuard: false,
    usedGuardCharge: false,
    bannedActions: new Set(),
  };
}

const room = {
  players: [null, null], // { ws }
  state: { turn: 1, p: [newPlayer(), newPlayer()] },
  pending: [null, null],
  logs: [],
};

function addLog(text) {
  room.logs.unshift(`Turn ${room.state.turn}: ${text}`);
  if (room.logs.length > 12) room.logs.pop();
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const pl of room.players) {
    if (pl?.ws?.readyState === 1) pl.ws.send(msg);
  }
}

function resetMatch() {
  room.state.turn = 1;
  room.state.p = [newPlayer(), newPlayer()];
  room.pending = [null, null];
  room.logs = [];
}

function canSelect(i, a) {
  const p = room.state.p[i];
  if (a !== "BIG_BEAM" && p.bannedActions.has(a)) return false;
  if (p.trapForcedGuard && !isGuardAction(a)) return false;
  if (a === "GUARD_CHARGE" && p.usedGuardCharge) return false;
  if (p.energy < cost(a)) return false;
  return true;
}

function resolveTurn(a0, a1) {
  const p0 = room.state.p[0];
  const p1 = room.state.p[1];

  addLog(`P1=${a0} / P2=${a1}`);

  const w = judge(a0, a1);
  if (w !== null) {
    addLog(`P${w + 1} WIN!`);
    return { winner: w };
  }

  if (p0.trapForcedGuard && isGuardAction(a0)) p0.trapForcedGuard = false;
  if (p1.trapForcedGuard && isGuardAction(a1)) p1.trapForcedGuard = false;

  if (a0 === "CHARGE") p0.energy += 1;
  else if (a0 === "GUARD_CHARGE") { p0.energy += 1; p0.usedGuardCharge = true; }
  else p0.energy -= cost(a0);

  if (a1 === "CHARGE") p1.energy += 1;
  else if (a1 === "GUARD_CHARGE") { p1.energy += 1; p1.usedGuardCharge = true; }
  else p1.energy -= cost(a1);

  if (a0 === "TRAP") p1.trapForcedGuard = true;
  if (a1 === "TRAP") p0.trapForcedGuard = true;

  if (a0 === "SEAL" && a1 !== "BIG_BEAM") { p1.bannedActions.add(a1); addLog(`P1 sealed ${a1}`); }
  if (a1 === "SEAL" && a0 !== "BIG_BEAM") { p0.bannedActions.add(a0); addLog(`P2 sealed ${a0}`); }

  room.state.turn += 1;
  return { winner: null };
}

function snapshot() {
  return {
    turn: room.state.turn,
    p: room.state.p.map((pl) => ({
      energy: pl.energy,
      trapForcedGuard: pl.trapForcedGuard,
      usedGuardCharge: pl.usedGuardCharge,
      bannedActions: [...pl.bannedActions],
    })),
  };
}

function startTurn() {
  broadcast({ type: "TURN_START", state: snapshot(), logs: room.logs });
}

wss.on("connection", (ws) => {
  let slot = room.players[0] ? 1 : 0;

  if (room.players[slot]) {
    send(ws, { type: "ERROR", message: "Room full" });
    ws.close();
    return;
  }

  room.players[slot] = { ws };
  send(ws, { type: "WELCOME", playerIndex: slot });

  if (room.players[0] && room.players[1]) {
    resetMatch();
    broadcast({ type: "MATCH_START" });
    startTurn();
  }

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "ACTION") {
      if (!Actions.includes(msg.action)) return send(ws, { type: "ERROR", message: "Unknown action" });
      if (!canSelect(slot, msg.action)) return send(ws, { type: "ERROR", message: "Action not allowed" });

      room.pending[slot] = msg.action;

      if (room.pending[0] && room.pending[1]) {
        const res = resolveTurn(room.pending[0], room.pending[1]);

        broadcast({ type: "TURN_RESULT", state: snapshot(), logs: room.logs });

        room.pending = [null, null];

        if (res.winner !== null) {
          resetMatch();
          broadcast({ type: "MATCH_START" });
        }
        startTurn();
      }
    }
  });

  ws.on("close", () => {
    room.players[slot] = null;
    resetMatch();
    broadcast({ type: "INFO", message: "相手が切断しました。待機中…" });
  });
});

server.listen(PORT, () => {
  console.log(`Listening on :${PORT}`);
});
