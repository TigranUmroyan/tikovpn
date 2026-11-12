const WebSocket = require("ws");
const { WebSocketServer } = WebSocket;
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
const players = new Map();
const bullets = [];
let nextId = 1;

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcast(data, except) {
  const raw = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(raw);
  }
}
function snapshot() {
  const out = {};
  for (const [id, p] of players) out[id] = p;
  return out;
}
wss.on("connection", ws => {
  const id = String(nextId++);
  ws.playerId = id;
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "join") {
      const nick = String(msg.nick || "Player").replace(/[<>]/g, "").slice(0, 18) || "Player";
      players.set(id, { id, nick, x: 1200 + Math.random()*100, y: 950 + Math.random()*100, angle: 0, car: false });
      send(ws, { type: "welcome", id, players: snapshot() });
      broadcast({ type: "notice", text: nick + " вошёл в игру" }, ws);
      return;
    }
    const p = players.get(id);
    if (!p) return;
    if (msg.type === "move") {
      p.x = clamp(msg.x, 0, 2400); p.y = clamp(msg.y, 0, 1900);
      p.angle = Number(msg.angle) || 0; p.car = !!msg.car;
    } else if (msg.type === "chat") {
      const text = String(msg.text || "").replace(/[<>]/g, "").trim().slice(0, 100);
      if (text) broadcast({ type: "chat", nick: p.nick, text });
    } else if (msg.type === "shoot") {
      const b = msg.bullet || {};
      if (Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.dx) && Number.isFinite(b.dy))
        bullets.push({ x: clamp(b.x,0,2400), y: clamp(b.y,0,1900), dx: clamp(b.dx,-600,600), dy: clamp(b.dy,-600,600), life: 1.2 });
    } else if (msg.type === "car") p.car = !!msg.car;
  });
  ws.on("close", () => {
    const p = players.get(id);
    if (p) broadcast({ type: "notice", text: p.nick + " вышел из игры" });
    players.delete(id);
  });
});
function clamp(n, min, max) { n = Number(n); return Number.isFinite(n) ? Math.max(min, Math.min(max,n)) : min; }
setInterval(() => {
  for (let i=bullets.length-1;i>=0;i--) { bullets[i].x += bullets[i].dx*.05; bullets[i].y += bullets[i].dy*.05; bullets[i].life -= .05; if (bullets[i].life<=0) bullets.splice(i,1); }
  broadcast({ type: "state", players: snapshot(), bullets });
}, 50);
console.log("SA-MP Mobile Web prototype listening on port " + (process.env.PORT || 8080));
