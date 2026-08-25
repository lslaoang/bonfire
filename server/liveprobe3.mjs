import WebSocket from "ws";
const URL = "wss://bonfire-relay.onrender.com?room=stale";
const t0 = Date.now();
const at = () => ((Date.now()-t0)/1000).toFixed(1)+"s";
const mk = (tag) => new Promise((res) => {
  const ws = new WebSocket(URL);
  ws.on("message", (d) => { const m = JSON.parse(d);
    if (m.t === "presence") console.log(`${at()} ${tag} sees: ${m.users.map(u=>u.name).join(",")||"(empty)"}`);
    if (m.t === "message" && m.system) console.log(`${at()} ${tag} <- [sys] ${m.text}`); });
  ws.on("open", () => res({ ws, send:(o)=>ws.send(JSON.stringify(o)) }));
});
const wait = (ms)=>new Promise(r=>setTimeout(r,ms));
const a = await mk("A"); a.send({t:"join", nick:"ash"});   await wait(500);
const b = await mk("B"); b.send({t:"join", nick:"rowan"}); await wait(800);
console.log(`${at()} --- closing B, watching for cleanup ---`);
b.ws.close();
await wait(100000);
process.exit(0);
