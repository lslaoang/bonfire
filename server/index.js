/* Bonfire relay — presence, chat and voice flags for one or more rooms.
 *
 * Deliberately dumb. It owns the roster and broadcasts it whole: a room is
 * at most a few dozen people, so diffing is premature. Nothing is persisted
 * and there is no backfill, so a restart simply empties every circle — which
 * is the same thing that happens when everyone walks away from a real fire.
 */
import { createServer } from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const rooms = new Map();          // roomId -> Map(userId -> { id, name, voice, ws })

let seq = 0;
const uid = () => (++seq).toString(36) + Date.now().toString(36);

const http = createServer((req, res) => {
  // Plain GET is the host's health probe.
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("bonfire relay ok\n");
});

const wss = new WebSocketServer({ server: http });

const broadcast = (room, payload) => {
  const data = JSON.stringify(payload);
  for (const u of room.values()) if (u.ws.readyState === 1) u.ws.send(data);
};
const presence = (room) => broadcast(room, {
  t: "presence",
  users: [...room.values()].map(({ id, name, voice }) => ({ id, name, voice }))
});
const notice = (room, userId, text) =>
  broadcast(room, { t: "message", id: "s" + uid(), userId, system: true, text });

wss.on("connection", (ws, req) => {
  const roomId = new URL(req.url, "http://relay").searchParams.get("room") || "main";
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId);

  const me = { id: uid(), name: null, voice: false, ws };
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ t: "welcome", id: me.id }));

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === "join") {
      const name = String(m.nick || "").slice(0, 18).trim() || "wanderer";
      const rejoining = room.has(me.id);       // a reconnect, not a new arrival
      me.name = name;
      me.voice = !!m.voice;
      room.set(me.id, me);
      presence(room);
      if (!rejoining) notice(room, me.id, `${name} joined the circle`);
      return;
    }

    if (!me.name) return;                      // must join before saying anything

    if (m.t === "say") {
      const text = String(m.text || "").slice(0, 180).trim();
      if (text) broadcast(room, { t: "message", id: "m" + uid(), userId: me.id, text });
    } else if (m.t === "voice") {
      me.voice = !!m.on;
      presence(room);
      broadcast(room, { t: "voice", userId: me.id, on: me.voice });
    }
  });

  ws.on("close", () => {
    if (!room.delete(me.id)) return;
    presence(room);
    if (me.name) notice(room, me.id, `${me.name} slipped into the dark`);
    if (!room.size) rooms.delete(roomId);
  });
});

/* Most hosts and proxies drop an idle WebSocket after ~60s. Ping under that,
   and terminate anything that stops ponging so the roster stays honest. */
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

http.listen(PORT, () => console.log(`bonfire relay listening on :${PORT}`));
