import express from "express";
import http from "http";
import path from "path";
import WebSocket from "ws";
import { openDb } from "./db";
import { seedFamiliar } from "./seed";
import { buildRouter } from "./api";
import { GameRoom } from "./game";
import { baseUrl } from "./net";

const PORT = Number(process.env.PORT || 3000);

const db = openDb();
seedFamiliar(db);

const rooms = new Map<string, GameRoom>();

/* ------------------------- websocket ------------------------------ */

type Role = "admin" | "player1" | "player2" | "public";
interface Client {
  ws: WebSocket;
  code: string | null;
  role: Role | null;
  player: 0 | 1 | null;
}

const clients = new Set<Client>();

function broadcast(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  for (const c of clients) {
    if (c.code !== code || c.ws.readyState !== WebSocket.OPEN) continue;
    const includeAnswers = c.role === "admin";
    c.ws.send(JSON.stringify({ type: "state", state: room.snapshot(includeAnswers) }));
  }
}

function sendState(c: Client): void {
  const room = c.code ? rooms.get(c.code) : undefined;
  if (!room || c.ws.readyState !== WebSocket.OPEN) return;
  c.ws.send(JSON.stringify({ type: "state", state: room.snapshot(c.role === "admin") }));
}

/* --------------------------- express ------------------------------ */

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", buildRouter({ db, rooms, broadcast }));

const PUBLIC = path.join(__dirname, "..", "public");
app.use("/static", express.static(path.join(PUBLIC, "static")));

app.get("/", (_req, res) => res.redirect("/admin"));
app.get("/admin", (_req, res) => res.sendFile(path.join(PUBLIC, "admin.html")));
app.get("/juego/:code/jugador1", (req, res) => {
  if (!rooms.has(req.params.code.toUpperCase())) return res.status(404).send("Partida no encontrada.");
  res.sendFile(path.join(PUBLIC, "player.html"));
});
app.get("/juego/:code/jugador2", (req, res) => {
  if (!rooms.has(req.params.code.toUpperCase())) return res.status(404).send("Partida no encontrada.");
  res.sendFile(path.join(PUBLIC, "player.html"));
});
app.get("/juego/:code/publico", (req, res) => {
  if (!rooms.has(req.params.code.toUpperCase())) return res.status(404).send("Partida no encontrada.");
  res.sendFile(path.join(PUBLIC, "publico.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const client: Client = { ws, code: null, role: null, player: null };
  clients.add(client);

  ws.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    try {
      if (msg.type === "join") {
        const code = String(msg.code ?? "").toUpperCase();
        const role = msg.role as Role;
        if (!rooms.has(code)) throw new Error("Partida no encontrada.");
        if (!["admin", "player1", "player2", "public"].includes(role)) throw new Error("Rol inválido.");
        client.code = code;
        client.role = role;
        client.player = role === "player1" ? 0 : role === "player2" ? 1 : null;
        sendState(client);
      } else if (msg.type === "judge") {
        // solo el moderador juzga
        if (!client.code || client.role !== "admin") throw new Error("Solo el moderador puede juzgar.");
        const room = rooms.get(client.code)!;
        const result = msg.result as "correct" | "wrong" | "pass";
        if (!["correct", "wrong", "pass"].includes(result)) throw new Error("Resultado inválido.");
        room.judge(result);
      } else if (msg.type === "resume") {
        // lo confirma el moderador o el jugador al que le toca; el otro solo mira
        if (!client.code) throw new Error("Sin partida.");
        const room = rooms.get(client.code)!;
        const isAdmin = client.role === "admin";
        const isTurnPlayer =
          (client.role === "player1" && room.activePlayer === 0) ||
          (client.role === "player2" && room.activePlayer === 1);
        if (!isAdmin && !isTurnPlayer) throw new Error("Solo el moderador o el jugador en turno puede reanudar.");
        room.resume();
      } else if (msg.type === "start") {
        if (!client.code || client.role !== "admin") throw new Error("Solo el moderador puede iniciar.");
        rooms.get(client.code)!.start();
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", error: (e as Error).message }));
    }
  });

  ws.on("close", () => clients.delete(client));
});

server.listen(PORT, () => {
  console.log(`[rosco-server] escuchando en ${baseUrl()} (también http://localhost:${PORT})`);
});
