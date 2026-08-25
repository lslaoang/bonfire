/* Bonfire relay — presence, chat and voice flags for one or more rooms.
 *
 * Deliberately dumb. It owns the roster and broadcasts it whole: a room is
 * at most a few dozen people, so diffing is premature. Nothing is persisted
 * and there is no backfill, so a restart simply empties every circle — which
 * is the same thing that happens when everyone walks away from a real fire.
 *
 * It also routes WebRTC signalling between pairs of peers, but never carries
 * voice audio: that goes directly peer to peer.
 */
import { createServer } from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const rooms = new Map();          // roomId -> { keyHash, users: Map(userId -> user) }

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
  for (const u of room.users.values()) if (u.ws.readyState === 1) u.ws.send(data);
};
const presence = (room) => broadcast(room, {
  t: "presence",
  users: [...room.users.values()].map(({ id, name, voice }) => ({ id, name, voice }))
});
const notice = (room, userId, text) =>
  broadcast(room, { t: "message", id: "s" + uid(), userId, system: true, text });

wss.on("connection", (ws) => {
  // The room is chosen in the join message, not the connection URL, so one
  // warm socket can serve any circle — and the relay can be woken before the
  // visitor has decided which fire they are walking up to.
  let roomId = null;

  let room = null;                  // set once the client presents a valid key
  const me = { id: uid(), name: null, voice: false, ws };
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ t: "welcome", id: me.id }));

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === "join") {
      const name = String(m.nick || "").slice(0, 18).trim() || "wanderer";
      const wanted = String(m.room || "main").slice(0, 80);
      if (roomId && roomId !== wanted) leave();   // moving between circles
      roomId = wanted;
      // The key never reaches us: the page sends only a SHA-256 digest, and
      // we compare digests. Whoever opens a circle sets its key; everyone
      // after must present the same one.
      const keyHash = m.keyHash ? String(m.keyHash).slice(0, 64) : null;

      if (!rooms.has(roomId)) rooms.set(roomId, { keyHash, users: new Map() });
      room = rooms.get(roomId);

      if (room.keyHash !== keyHash) {
        ws.send(JSON.stringify({ t: "denied", reason: "key" }));
        return;                                // not admitted, not in the roster
      }

      const rejoining = room.users.has(me.id); // a reconnect, not a new arrival
      me.name = name;
      me.voice = !!m.voice;
      room.users.set(me.id, me);
      presence(room);
      if (!rejoining) notice(room, me.id, `${name} joined the circle`);
      return;
    }

    if (!room) return;                          // nothing before a successful join

    if (!me.name) return;                      // must join before saying anything

    if (m.t === "signal") {
      // WebRTC signalling: opaque to us, routed to exactly one recipient.
      // The relay never sees or carries the audio itself.
      const target = room.users.get(m.to);
      if (target && target.ws.readyState === 1) {
        target.ws.send(JSON.stringify({ t: "signal", from: me.id, data: m.data }));
      }
      return;
    }

    if (m.t === "bye") {
      // A closing page tells us directly. Proxies do not always forward a
      // client's close frame promptly, so without this the departed sit at
      // the fire until the ping sweep notices they are gone.
      leave();
      try { ws.close(); } catch {}
    } else if (m.t === "say") {
      const text = String(m.text || "").slice(0, 180).trim();
      if (text) broadcast(room, { t: "message", id: "m" + uid(), userId: me.id, text });
    } else if (m.t === "voice") {
      me.voice = !!m.on;
      presence(room);
      broadcast(room, { t: "voice", userId: me.id, on: me.voice });
    }
  });

  function leave() {
    if (!room) return;
    const left = room.users.delete(me.id);
    if (left) {
      presence(room);
      if (me.name) notice(room, me.id, `${me.name} slipped into the dark`);
      if (!room.users.size) rooms.delete(roomId);  // an empty circle forgets its key
    }
    room = null;                                   // no stale room after leaving
  }

  ws.on("close", leave);
  ws.on("error", leave);
});

/* Most hosts and proxies drop an idle WebSocket after ~60s. Ping under that,
   and terminate anything that stops ponging so the roster stays honest. */
const SWEEP_MS = 10000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }   // fires the close handler
    ws.isAlive = false;
    ws.ping();
  }
}, SWEEP_MS);

http.listen(PORT, () => console.log(`bonfire relay listening on :${PORT}`));
