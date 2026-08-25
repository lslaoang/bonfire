import WebSocket from "ws";
const ws = new WebSocket("wss://bonfire-relay.onrender.com?room=main");
ws.on("open", () => ws.send(JSON.stringify({ t:"join", nick:"remote-friend", voice:true })));
ws.on("message", (d) => { const m = JSON.parse(d);
  if (m.t === "presence") console.log("roster:", m.users.map(u=>`${u.name}${u.voice?"(voice)":""}`).join(", "));
  if (m.t === "message")  console.log("msg:", (m.system?"[sys] ":"") + m.text); });
setInterval(() => ws.send(JSON.stringify({t:"say", text:"waving from another machine"})), 7000);
setTimeout(() => process.exit(0), 120000);
