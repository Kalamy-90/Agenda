import WebSocket from "ws";

const base = "wss://agenda-bpsycsal.manus.space/v6/multiplayer";
function connect(path, name) {
  const ws = new WebSocket(`${base}/${path}`);
  ws.on("open", () => console.log(name, "open"));
  ws.on("close", (code, reason) => console.log(name, "close", code, reason.toString()));
  ws.on("error", error => console.log(name, "error", error.message));
  ws.on("message", raw => console.log(name, "<--", raw.toString()));
  return ws;
}
const host = connect("host", "host");
await new Promise((resolve, reject) => { host.once("open", resolve); host.once("error", reject); });
host.send(JSON.stringify({ type: "createInvite", key: "public-debug", nickname: "host" }));
const inviteCode = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("create timeout")), 15000);
  host.on("message", raw => { const m = JSON.parse(raw); if (m.type === "createInvite") { clearTimeout(timer); resolve(m.inviteCode); } });
});
console.log("inviteCode", inviteCode);
const failed = connect("join", "failed");
await new Promise((resolve, reject) => { failed.once("open", resolve); failed.once("error", reject); });
failed.send(JSON.stringify({ inviteCode }));
await new Promise(r => setTimeout(r, 1000));
failed.close();
await new Promise(r => setTimeout(r, 1000));
const join = connect("join", "join");
await new Promise((resolve, reject) => { join.once("open", resolve); join.once("error", reject); });
join.send(JSON.stringify({ inviteCode, offer: "fake-offer", mods: [], isModsVanillaCompatible: true, nickname: "join", countryCode: null, carStyle: "diag" }));
await new Promise(r => setTimeout(r, 5000));
join.send(JSON.stringify({ version: "0.6.3", candidate: { candidate: "candidate:public 1 udp 1 192.0.2.1 9999 typ host", sdpMid: "0", sdpMLineIndex: 0 } }));
console.log("candidate sent without type");
await new Promise(r => setTimeout(r, 10000));
host.close(); join.close();
