import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

console.log("### SERVER VERSION: ROOM-4P-DIRECTIONAL ###");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const distPath = path.resolve(__dirname, "./dist");

const app = express();

// debug (STATICより前に置く)
app.get("/__debug", (_, res) => {
  const indexPath = path.join(distPath, "index.html");
  let exists = false;
  let firstLine = "";
  let has4p = false;

  try {
    exists = fs.existsSync(indexPath);
    if (exists) {
      const html = fs.readFileSync(indexPath, "utf8");
      firstLine = html.split("\n")[0].slice(0, 200);
      has4p = html.includes("4人/ルーム制/指向性") || html.includes("ルーム作成");
    }
  } catch {}

  res.json({
    distPath,
    indexPath,
    indexExists: exists,
    has4pMarker: has4p,
    firstLine,
  });
});

app.get("/health", (_, res) => res.status(200).send("ok"));
app.use(express.static(distPath));
app.get(/.*/, (_, res) => res.sendFile(path.join(distPath, "index.html")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// （この下にあなたの wss.on("connection"... の処理が続く想定）
server.listen(PORT, () => console.log(`Listening on :${PORT}`));


/** ===== Game rules ===== */
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

function isGuardAction(a) {
  return a === "GUARD" || a === "BEAM_GUARD" || a === "GUARD_CHARGE" || a === "SEAL";
}

function newPlayer() {
  return {
    energy: 0,
    alive: true,
    trapForcedGuard: false,
    usedGuardCharge: false,
    bannedActions: new Set(),
  };
}

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const rooms = new Map(); // code -> room

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  for (const slot of room.players) {
    if (slot?.ws?.readyState === 1) slot.ws.send(msg);
  }
}

function snapshot(room) {
  return {
    code: room.code,
    status: room.status, // "lobby" | "playing"
    hostIndex: room.hostIndex,
    turn: room.turn,
    logs: room.logs,
    players: room.players.map((slot, i) => ({
      index: i,
      connected: !!slot,
      name: slot?.name ?? null,
      alive: slot?.state?.alive ?? false,
      energy: slot?.state?.energy ?? 0,
      trapForcedGuard: slot?.state?.trapForcedGuard ?? false,
      usedGuardCharge: slot?.state?.usedGuardCharge ?? false,
      bannedActions: slot?.state ? [...slot.state.bannedActions] : [],
    })),
  };
}

function createRoom() {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();

  const room = {
    code,
    status: "lobby",
    hostIndex: null,
    players: [null, null, null, null], // { ws, id, name, state }
    turn: 1,
    pending: [null, null, null, null], // { action, target }
    logs: [],
  };

  rooms.set(code, room);
  return room;
}

function roomLog(room, text) {
  room.logs.unshift(`Turn ${room.turn}: ${text}`);
  if (room.logs.length > 20) room.logs.pop();
}

function livingIndices(room) {
  return room.players
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot && slot.state.alive)
    .map(({ i }) => i);
}

function resetMatch(room) {
  room.status = "playing";
  room.turn = 1;
  room.logs = [];
  room.pending = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    if (room.players[i]) room.players[i].state = newPlayer();
  }
}

function endMatchToLobby(room, message) {
  room.status = "lobby";
  room.pending = [null, null, null, null];
  roomLog(room, message);
  broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });
}

function needsTarget(a) {
  return a === "BEAM" || a === "BIG_BEAM" || a === "TRAP" || a === "SEAL";
}

function canSelect(room, i, action, target) {
  const slot = room.players[i];
  if (!slot?.state?.alive) return { ok: false, reason: "not alive" };
  const p = slot.state;

  if (!Actions.includes(action)) return { ok: false, reason: "unknown action" };

  // ban (BIG_BEAMは貫通)
  if (action !== "BIG_BEAM" && p.bannedActions.has(action)) return { ok: false, reason: "sealed" };

  // trap forced: must guard
  if (p.trapForcedGuard && !isGuardAction(action)) return { ok: false, reason: "trap forced guard" };

  // guard charge once
  if (action === "GUARD_CHARGE" && p.usedGuardCharge) return { ok: false, reason: "guard charge used" };

  // cost
  if (p.energy < cost(action)) return { ok: false, reason: "not enough energy" };

  // target validation
  if (needsTarget(action)) {
    if (target === null || target === undefined) return { ok: false, reason: "target required" };
    if (target === i) return { ok: false, reason: "cannot target self" };
    const t = room.players[target];
    if (!t || !t.state.alive) return { ok: false, reason: "target not alive" };
  }

  return { ok: true };
}

function resolveTurn(room) {
  // must have all living players' pending
  const alive = livingIndices(room);
  for (const i of alive) {
    if (!room.pending[i]) return; // not ready
  }

  // chosen map
  const chosen = new Map(); // i -> {action,target}
  for (const i of alive) chosen.set(i, room.pending[i]);

  roomLog(
    room,
    alive
      .map((i) => {
        const { action, target } = chosen.get(i);
        return needsTarget(action) ? `P${i + 1}=${action}->P${target + 1}` : `P${i + 1}=${action}`;
      })
      .join(" / ")
  );

  // 1) trap forced check (self lose if not guard)
  for (const i of alive) {
    const p = room.players[i].state;
    const { action } = chosen.get(i);
    if (p.trapForcedGuard && !isGuardAction(action)) {
      p.alive = false;
      roomLog(room, `P${i + 1} lost by TRAP (didn't guard)`);
    }
  }

  // recompute alive after trap kills
  const alive2 = livingIndices(room);

  // helper: is defender guarding this turn?
  const isDefending = (idx) => {
    if (!room.players[idx]?.state?.alive) return false;
    const pick = chosen.get(idx);
    if (!pick) return false;
    return isGuardAction(pick.action);
  };

  // 2) attacks (directional)
  const toKill = new Set();

  for (const attacker of alive2) {
    const pick = chosen.get(attacker);
    if (!pick) continue;

    const { action, target } = pick;

    if (action === "BEAM") {
      const def = chosen.get(target);
      if (!def) continue;
      const defended = isDefending(target); // GUARD/BEAM_GUARD/GUARD_CHARGE/SEAL
      if (!defended) toKill.add(target);
    }

    if (action === "BIG_BEAM") {
      const def = chosen.get(target);
      if (!def) continue;

      // BIG_BEAM clash only when mutual targeting with BIG_BEAM
      const mutualClash =
        def.action === "BIG_BEAM" &&
        def.target === attacker;

      if (mutualClash) {
        roomLog(room, `BIG_BEAM clash between P${attacker + 1} and P${target + 1}`);
        continue;
      }

      // only BEAM_GUARD blocks BIG_BEAM
      if (def.action !== "BEAM_GUARD") toKill.add(target);
    }
  }

  for (const i of toKill) {
    if (room.players[i]?.state?.alive) {
      room.players[i].state.alive = false;
      roomLog(room, `P${i + 1} was hit!`);
    }
  }

  // recompute alive after hits
  const alive3 = livingIndices(room);

  // 3) effects (SEAL / TRAP) applied by alive attackers only
  for (const attacker of alive3) {
    const pick = chosen.get(attacker);
    if (!pick) continue;

    const { action, target } = pick;

    if (action === "TRAP") {
      if (room.players[target]?.state?.alive) {
        room.players[target].state.trapForcedGuard = true;
        roomLog(room, `P${attacker + 1} trapped P${target + 1}`);
      }
    }

    if (action === "SEAL") {
      // SEAL is also defense for attacker (already handled by isGuardAction)
      const targetPick = chosen.get(target);
      if (targetPick && targetPick.action !== "BIG_BEAM") {
        room.players[target].state.bannedActions.add(targetPick.action);
        roomLog(room, `P${attacker + 1} sealed P${target + 1}'s ${targetPick.action}`);
      }
    }
  }

  // 4) energy update + trap clear (survivors only)
  for (const i of alive3) {
    const p = room.players[i].state;
    const { action } = chosen.get(i);

    // trap cleared if guarded this turn
    if (p.trapForcedGuard && isGuardAction(action)) p.trapForcedGuard = false;

    if (action === "CHARGE") p.energy += 1;
    else if (action === "GUARD_CHARGE") {
      p.energy += 1;
      p.usedGuardCharge = true;
    } else {
      p.energy -= cost(action);
    }
  }

  room.turn += 1;
  room.pending = [null, null, null, null];

  // 5) win check
  const aliveFinal = livingIndices(room);
  if (aliveFinal.length === 1) {
    endMatchToLobby(room, `P${aliveFinal[0] + 1} WIN! (match ended)`);
    return;
  }
  if (aliveFinal.length === 0) {
    endMatchToLobby(room, `DRAW! (everyone down)`);
    return;
  }

  broadcast(room, { type: "TURN_RESOLVED", state: snapshot(room) });
}

/** ===== WS protocol =====
 * client -> server:
 *  {type:"CREATE_ROOM", name?}
 *  {type:"JOIN_ROOM", code, name?}
 *  {type:"START"}
 *  {type:"ACTION", action, target?}
 *
 * server -> client:
 *  {type:"WELCOME", youIndex, code}
 *  {type:"ROOM_STATE", state}
 *  {type:"ERROR", message}
 */
function safeName(s) {
  if (typeof s !== "string") return "player";
  const t = s.trim().slice(0, 12);
  return t.length ? t : "player";
}

function findRoomByWs(ws) {
  for (const room of rooms.values()) {
    for (let i = 0; i < 4; i++) {
      if (room.players[i]?.ws === ws) return { room, index: i };
    }
  }
  return null;
}

wss.on("connection", (ws) => {
  send(ws, { type: "INFO", message: "connected" });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "CREATE_ROOM") {
      const room = createRoom();
      const slotIndex = room.players.findIndex((x) => x === null);
      room.players[slotIndex] = {
        ws,
        id: cryptoRandomId(),
        name: safeName(msg.name),
        state: newPlayer(),
      };
      room.hostIndex = slotIndex;

      send(ws, { type: "WELCOME", youIndex: slotIndex, code: room.code });
      broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });
      return;
    }

    if (msg.type === "JOIN_ROOM") {
      const code = String(msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "ERROR", message: "Room not found" });

      // find empty slot
      const slotIndex = room.players.findIndex((x) => x === null);
      if (slotIndex === -1) return send(ws, { type: "ERROR", message: "Room full" });

      room.players[slotIndex] = {
        ws,
        id: cryptoRandomId(),
        name: safeName(msg.name),
        state: room.status === "playing" ? newPlayer() : newPlayer(),
      };

      if (room.hostIndex === null) room.hostIndex = slotIndex;

      send(ws, { type: "WELCOME", youIndex: slotIndex, code: room.code });
      broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });
      return;
    }

    // below: must be in a room
    const found = findRoomByWs(ws);
    if (!found) return send(ws, { type: "ERROR", message: "Not in room" });
    const { room, index } = found;

    if (msg.type === "START") {
      if (room.hostIndex !== index) return send(ws, { type: "ERROR", message: "Only host can start" });
      const connectedCount = room.players.filter(Boolean).length;
      if (connectedCount < 2) return send(ws, { type: "ERROR", message: "Need 2+ players" });

      resetMatch(room);
      roomLog(room, "Match started!");
      broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });
      return;
    }

    if (msg.type === "ACTION") {
      if (room.status !== "playing") return send(ws, { type: "ERROR", message: "Match not started" });

      const action = msg.action;
      const target = (msg.target === 0 || msg.target) ? Number(msg.target) : null;

      const check = canSelect(room, index, action, target);
      if (!check.ok) return send(ws, { type: "ERROR", message: `Action not allowed: ${check.reason}` });

      room.pending[index] = { action, target };
      broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });

      // resolve when all living have submitted
      const alive = livingIndices(room);
      const allReady = alive.every((i) => room.pending[i]);
      if (allReady) {
        resolveTurn(room);
        broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });
      }
      return;
    }
  });

  ws.on("close", () => {
    const found = findRoomByWs(ws);
    if (!found) return;
    const { room, index } = found;

    // mark disconnected slot empty
    room.players[index] = null;
    room.pending[index] = null;

    // move host if needed
    if (room.hostIndex === index) {
      const next = room.players.findIndex(Boolean);
      room.hostIndex = next === -1 ? null : next;
    }

    broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });

    // delete empty rooms
    if (room.players.every((x) => x === null)) {
      rooms.delete(room.code);
    }
  });
});

function cryptoRandomId() {
  // Node 24 ok without import; fallback if missing
  try {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

server.listen(PORT, () => console.log(`Listening on :${PORT}`));

console.log("### DISTPATH ###", distPath);

