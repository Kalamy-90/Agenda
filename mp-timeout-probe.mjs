import WebSocket from "ws";
const base = process.argv[2] ?? "wss://agenda-bpsycsal.manus.space/v6/multiplayer";
const connect = path => {
  const ws = new WebSocket(`${base}/${path}`);
  const messages = [];
  ws.on("message", raw => messages.push(JSON.parse(raw.toString())));
  const open = new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  return { ws, messages, open };
};
const host = connect("host");
await host.open;
host.ws.send(JSON.stringify({ type: "createInvite", key: "timeout-probe", nickname: "host" }));
while (!host.messages.some(m => m.type === "createInvite")) await new Promise(r => setTimeout(r, 100));
const inviteCode = host.messages.find(m => m.type === "createInvite").inviteCode;
const join = connect("join");
await join.open;
join.ws.send(JSON.stringify({ inviteCode, offer: "blocked-offer", mods: [], isModsVanillaCompatible: true, nickname: "join", countryCode: null, carStyle: "diag" }));
const start = Date.now();
while (!join.messages.some(m => m.type === "declineJoin" || m.type === "error")) {
  if (Date.now() - start > 45000) throw new Error("timeout guard did not fire");
  await new Promise(r => setTimeout(r, 200));
}
console.log(JSON.stringify({ elapsedMs: Date.now() - start, joinMessage: join.messages.find(m => m.type === "declineJoin" || m.type === "error"), hostMessages: host.messages.filter(m => m.type === "joinDisconnect") }));
host.ws.close();
join.ws.close();
