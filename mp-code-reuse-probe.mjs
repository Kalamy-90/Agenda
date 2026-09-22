import WebSocket from "ws";

const hostUrl = process.argv[2] ?? "ws://127.0.0.1:3101/v6/multiplayer/host";
const joinUrl = process.argv[3] ?? "ws://127.0.0.1:3102/v6/multiplayer/join";

function connect(url) {
  const ws = new WebSocket(url);
  const messages = [];
  const waiters = [];
  ws.on("message", raw => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (const waiter of [...waiters]) waiter(message);
  });
  const next = (predicate, label) => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), 15000);
      const waiter = message => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        resolve(message);
      };
      waiters.push(waiter);
    });
  };
  const opened = new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, opened, next };
}

const host = connect(hostUrl);
await host.opened;
host.ws.send(JSON.stringify({ type: "createInvite", key: "reuse-probe", nickname: "host" }));
const created = await host.next(message => message.type === "createInvite", "createInvite");
const inviteCode = created.inviteCode;

const failedJoin = connect(joinUrl);
await failedJoin.opened;
failedJoin.ws.send(JSON.stringify({ inviteCode }));
await failedJoin.next(message => message.type === "declineJoin", "declineJoin");
failedJoin.ws.close();

const join = connect(joinUrl);
await join.opened;
join.ws.send(JSON.stringify({
  inviteCode,
  offer: "fake-offer-after-failure",
  mods: [],
  isModsVanillaCompatible: true,
  nickname: "join",
  countryCode: null,
  carStyle: "diag",
}));
const joinInvite = await host.next(message => message.type === "joinInvite", "joinInvite after failed attempt");

join.ws.send(JSON.stringify({
  version: "0.6.3",
  candidate: { candidate: "candidate:probe 1 udp 1 192.0.2.1 9999 typ host", sdpMid: "0", sdpMLineIndex: 0 },
}));
const relayedCandidate = await host.next(
  message => message.type === "iceCandidate" && message.session === joinInvite.session,
  "relayed candidate without type",
);

const result = {
  inviteCode,
  reusedAfterFailedJoin: true,
  candidateRelayed: Boolean(relayedCandidate.candidate),
  candidate: relayedCandidate.candidate,
};
console.log(JSON.stringify(result));
host.ws.close();
join.ws.close();
