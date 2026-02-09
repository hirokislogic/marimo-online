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

  // ★新アクション
  "ELMARICK",
  "LIFE_UP",
  "DOMAIN",
];


function cost(a) {
  switch (a) {
    case "BEAM": return 1;
    case "BEAM_GUARD": return 2;
    case "BIG_BEAM": return 4;
    case "TRAP": return 1;
    case "SEAL": return 1;

    // ★新アクション
    case "ELMARICK": return 4;
    case "LIFE_UP": return 3;
    case "DOMAIN": return 3;

    default: return 0;
  }
}


function isGuardAction(a) {
  return a === "GUARD" || a === "BEAM_GUARD" || a === "GUARD_CHARGE" || a === "SEAL";
}

function newPlayer() {
  return {
    energy: 0,
    life: 1,              // ★追加
    alive: true,           // 表示用（判定は life>0）
    trapForcedGuard: false,
    usedGuardCharge: false,
    bannedActions: new Set(),
    domainTurns: 0,        // ★追加（坐殺博徒）
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
    players: room.players.map((slot, i) => slot ? ({
  index: i,
  connected: true,
  name: slot.name,
  alive: slot.state.life > 0,
  energy: slot.state.energy,

  // ★追加
  life: slot.state.life,
  domainTurns: slot.state.domainTurns,

  trapForcedGuard: slot.state.trapForcedGuard,
  usedGuardCharge: slot.state.usedGuardCharge,
  bannedActions: [...slot.state.bannedActions],
  }) : null)

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
    .filter(({ slot }) => slot && slot.state.life > 0)
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
  const alive = livingIndices(room); // ← ここは life>0 で生存判定になってる前提
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

  // --- helpers ---
  const isAlive = (idx) => {
    const s = room.players[idx]?.state;
    return !!s && s.life > 0;
  };

  const damageMap = new Map(); // idx -> totalDamage

  const addDamage = (idx, amount) => {
    if (!isAlive(idx)) return;
    damageMap.set(idx, (damageMap.get(idx) ?? 0) + amount);
  };

  const applyDamages = () => {
    for (const [i, dmg] of damageMap.entries()) {
      const p = room.players[i]?.state;
      if (!p || p.life <= 0) continue;
      p.life -= dmg;
      if (p.life < 0) p.life = 0;
      p.alive = p.life > 0;
      roomLog(room, `P${i + 1} took ${dmg} dmg (life=${p.life})`);
    }
    damageMap.clear();
  };

  const isDefending = (idx) => {
    if (!isAlive(idx)) return false;
    const pick = chosen.get(idx);
    if (!pick) return false;
    return isGuardAction(pick.action); // GUARD / BEAM_GUARD / GUARD_CHARGE / SEAL
  };

  // エルマリックを防げるガード（SEALは防げない）
  const isGuardForElmarick = (a) => a === "GUARD" || a === "BEAM_GUARD" || a === "GUARD_CHARGE";

  // 当事者間相殺：def が attacker に BIG_BEAM を撃ってたら、def は attacker の ELMARICK を無効化
  const elmarickCancelledFor = (def, attacker) => {
    const defPick = chosen.get(def);
    const attPick = chosen.get(attacker);
    if (!defPick || !attPick) return false;
    if (attPick.action !== "ELMARICK") return false;
    return defPick.action === "BIG_BEAM" && defPick.target === attacker;
  };

  // 1) trap forced check (self lose if not guard)
  for (const i of alive) {
    const p = room.players[i].state;
    const { action } = chosen.get(i);
    if (p.trapForcedGuard && !isGuardAction(action)) {
      p.life = 0;
      p.alive = false;
      roomLog(room, `P${i + 1} lost by TRAP (didn't guard)`);
    }
  }

  // recompute alive after trap loses
  const alive2 = livingIndices(room);

  // 2) attacks (directional + ELMARICK)
  // 2-A) ELMARICK clash check
  const elUsers = alive2.filter((i) => chosen.get(i)?.action === "ELMARICK");
  const elClash = elUsers.length >= 2;

  if (elClash) {
    roomLog(room, `ELMARICK clash! (${elUsers.map((i) => `P${i + 1}`).join(", ")})`);
    // 効果は発動しない／出した人は「0から再始動」
    for (const i of elUsers) {
      room.players[i].state.energy = 0;
    }
  }

  // 2-B) BEAM / BIG_BEAM
  for (const attacker of alive2) {
    const pick = chosen.get(attacker);
    if (!pick) continue;

    const { action, target } = pick;

    if (action === "BEAM") {
      const def = chosen.get(target);
      if (!def) continue;
      const defended = isDefending(target); // SEAL含む
      if (!defended) addDamage(target, 1);
    }

    if (action === "BIG_BEAM") {
      const def = chosen.get(target);
      if (!def) continue;

      // BIG_BEAM clash only when mutual targeting with BIG_BEAM
      const mutualClash = def.action === "BIG_BEAM" && def.target === attacker;
      if (mutualClash) {
        roomLog(room, `BIG_BEAM clash between P${attacker + 1} and P${target + 1}`);
        continue;
      }

      // only BEAM_GUARD blocks BIG_BEAM
      if (def.action !== "BEAM_GUARD") addDamage(target, 3);
    }
  }

  // 2-C) ELMARICK single user (no clash)
  if (!elClash && elUsers.length === 1) {
    const attacker = elUsers[0];

    for (const def of alive2) {
      if (def === attacker) continue;

      // 当事者間相殺（defがattackerへ強ビーム撃ってたらdefだけ無効）
      if (elmarickCancelledFor(def, attacker)) {
        roomLog(room, `P${def + 1} cancelled ELMARICK from P${attacker + 1} (BIG_BEAM vs attacker)`);
        continue;
      }

      const defPick = chosen.get(def);
      const defended = defPick ? isGuardForElmarick(defPick.action) : false;

      if (defended) {
        roomLog(room, `P${def + 1} guarded ELMARICK`);
        // ノーマルガードのみエネルギー0
        if (defPick.action === "GUARD") {
          room.players[def].state.energy = 0;
          roomLog(room, `P${def + 1} energy set to 0 (normal guard vs ELMARICK)`);
        }
        // BEAM_GUARD / GUARD_CHARGE はゼロ化しない
      } else {
        addDamage(def, 1);
      }
    }
  }

  // apply damage and recompute alive
  applyDamages();
  const alive3 = livingIndices(room);

  // 3) effects (SEAL / TRAP / LIFE_UP / DOMAIN) applied by alive attackers only
  for (const attacker of alive3) {
    const pick = chosen.get(attacker);
    if (!pick) continue;

    const { action, target } = pick;

    if (action === "TRAP") {
      if (isAlive(target)) {
        room.players[target].state.trapForcedGuard = true;
        roomLog(room, `P${attacker + 1} trapped P${target + 1}`);
      }
    }

    if (action === "SEAL") {
      const targetPick = chosen.get(target);
      if (targetPick && targetPick.action !== "BIG_BEAM") {
        room.players[target].state.bannedActions.add(targetPick.action);
        roomLog(room, `P${attacker + 1} sealed P${target + 1}'s ${targetPick.action}`);
      }
    }

    if (action === "LIFE_UP") {
      const p = room.players[attacker].state;
      p.life += 1;
      p.alive = p.life > 0;
      roomLog(room, `P${attacker + 1} LIFE_UP (life=${p.life})`);
    }

    if (action === "DOMAIN") {
      const p = room.players[attacker].state;
      p.domainTurns = 4;
      roomLog(room, `P${attacker + 1} DOMAIN started (4 turns)`);
    }
  }

  // 4) energy update + trap clear + domain tick (survivors only)
  for (const i of alive3) {
    const p = room.players[i].state;
    const { action } = chosen.get(i);

    // trap cleared if guarded this turn
    if (p.trapForcedGuard && isGuardAction(action)) p.trapForcedGuard = false;

    // energy update
    if (action === "CHARGE") {
      let gain = 1;

      if (p.domainTurns > 0) {
        const r = Math.random() * 100;

        if (r < 1) {
          roomLog(room, `P${i + 1} JACKPOT! Instant win!`);
          endMatchToLobby(room, `P${i + 1} WIN! (坐殺博徒 JACKPOT)`);
          return;
        } else if (r < 1 + 9) {
          gain = 3;
          roomLog(room, `P${i + 1} DOMAIN result = +3`);
        } else if (r < 1 + 9 + 30) {
          gain = 2;
          roomLog(room, `P${i + 1} DOMAIN result = +2`);
        } else {
          gain = 1;
          roomLog(room, `P${i + 1} DOMAIN result = +1`);
        }
      }

      p.energy += gain;
    } else if (action === "GUARD_CHARGE") {
      p.energy += 1;
      p.usedGuardCharge = true;
    } else {
      // ELMARICK clash の場合は「0から再始動」優先（ここでは減らさない）
      if (!(elClash && action === "ELMARICK")) {
        p.energy -= cost(action);
      }
    }

    // domain turn tick (turn-based, not charge-count)
    if (p.domainTurns > 0) p.domainTurns -= 1;

    // ensure non-negative (好みで。マイナス許容なら削ってOK)
    if (p.energy < 0) p.energy = 0;

    // sync alive flag
    p.alive = p.life > 0;
  }

  // clash後、ELMARICK使用者は確実に0（念押し）
  if (elClash) {
    for (const i of elUsers) {
      if (room.players[i]?.state && room.players[i].state.life > 0) {
        room.players[i].state.energy = 0;
      }
    }
  }

  room.turn += 1;
  room.pending = [null, null, null, null];

  // 5) win check (life-based)
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
  // ここで接続を紐づけてるなら（あなたの既存があれば残す）
  // conns.add(ws) 等がある場合はそのまま

  ws.on("message", (raw) => {
    // ★ここにログを入れたいなら、この1行だけでOK（括弧崩れない）
    // console.log("WS IN:", raw.toString());

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ---- ここから下は、あなたの既存の message ハンドラ本文をそのまま残す ----
    // 重要：この中で return してOK

    // （例）あなたの既存ロジック：
    // if (msg.type === "PING") ...
    // if (msg.type === "CREATE_ROOM") ...
    // if (msg.type === "JOIN_ROOM") ...

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

    room.players[index] = null;
    room.pending[index] = null;

    if (room.hostIndex === index) {
      const next = room.players.findIndex(Boolean);
      room.hostIndex = next === -1 ? null : next;
    }

    broadcast(room, { type: "ROOM_STATE", state: snapshot(room) });

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

console.log("### DISTPATH ###", distPath);

