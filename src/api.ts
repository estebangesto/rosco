import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import QRCode from "qrcode";
import {
  listThemes, createTheme, renameTheme, deleteTheme,
  listDefinitions, replaceBank, letterStates, setLetterEnabled,
  DefinitionInput,
} from "./db";
import { GameRoom, makeCode, LETTERS } from "./game";
import { requestBaseUrl } from "./net";

export interface ApiContext {
  db: Database.Database;
  rooms: Map<string, GameRoom>;
  broadcast: (code: string) => void;
}

const CONTAIN_OK = new Set(["J", "Ñ", "Q", "Y", "Z"]);

function gameLinks(code: string, base: string) {
  return {
    admin: `${base}/admin#juego=${code}`,
    jugador1: `${base}/juego/${code}/jugador1`,
    jugador2: `${base}/juego/${code}/jugador2`,
    publico: `${base}/juego/${code}/publico`,
  };
}

async function withQr(code: string, base: string) {
  const links = gameLinks(code, base);
  const qr: Record<string, string> = {};
  for (const [k, v] of Object.entries(links)) {
    qr[k] = await QRCode.toDataURL(v, { width: 240, margin: 1 });
  }
  return { code, baseUrl: base, links, qr };
}

/** Valida la dirección del servidor cargada en la pantalla de partida:
    http(s)://host[:puerto], sin ruta. */
function sanitizeBaseUrl(raw: unknown): string {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!s) throw new Error("La dirección no puede estar vacía.");
  if (!/^https?:\/\/[^/\s]+$/i.test(s)) {
    throw new Error("Dirección inválida: usá el formato http(s)://IP-o-dominio[:puerto].");
  }
  return s;
}

export function buildRouter(ctx: ApiContext): Router {
  const r = Router();
  const { db, rooms, broadcast } = ctx;

  const getRoom = (code: string): GameRoom => {
    const room = rooms.get(code.toUpperCase());
    if (!room) throw Object.assign(new Error("Partida no encontrada."), { status: 404 });
    return room;
  };

  /* ------------------------------ salud --------------------------- */
  r.get("/health", (_req, res) => res.json({ ok: true }));
  r.get("/info", (req, res) => res.json({ baseUrl: requestBaseUrl(req.get("host"), req.protocol) }));

  /* ----------------------------- temáticas ------------------------ */
  r.get("/themes", (_req, res) => res.json(listThemes(db)));

  r.post("/themes", (req, res) => {
    try {
      res.status(201).json(createTheme(db, String(req.body?.name ?? "")));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.put("/themes/:id", (req, res) => {
    try {
      renameTheme(db, Number(req.params.id), String(req.body?.name ?? ""));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.delete("/themes/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      const used = (db.prepare("SELECT COUNT(*) AS n FROM games WHERE theme_id = ?").get(id) as { n: number }).n;
      if (used > 0) throw new Error("La temática tiene partidas registradas y no se puede eliminar.");
      deleteTheme(db, id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  /* ---------------------------- definiciones ---------------------- */
  r.get("/themes/:id/definitions", (req, res) => {
    const letter = typeof req.query.letter === "string" ? req.query.letter : undefined;
    res.json(listDefinitions(db, Number(req.params.id), letter));
  });

  /** Guardar a nivel de todo el listado: reemplaza el banco completo. */
  r.put("/themes/:id/bank", (req, res) => {
    try {
      const raw = Array.isArray(req.body?.definitions) ? req.body.definitions : [];
      const defs: DefinitionInput[] = raw.map((d: Record<string, unknown>) => ({
        letter: String(d.letter ?? "").toUpperCase(),
        word: String(d.word ?? ""),
        definition: String(d.definition ?? ""),
        // "Contiene" solo vale para J, Ñ, Q, Y y Z; el resto cae a "Empieza"
        hint_type: (d.hint_type === "C" && CONTAIN_OK.has(String(d.letter ?? "").toUpperCase())) ? "C" : "E",
        alt: Array.isArray(d.alt) ? (d.alt as unknown[]).filter((s): s is string => typeof s === "string") : [],
        active: d.active === 0 ? 0 : 1,
        enabled: d.enabled === 0 ? 0 : 1,
        uses: Number(d.uses ?? 0),
      }));
      const count = replaceBank(db, Number(req.params.id), defs);
      res.json({ ok: true, count });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  /* ------------------------------ letras -------------------------- */
  r.get("/themes/:id/letters", (req, res) => {
    res.json(letterStates(db, Number(req.params.id), LETTERS));
  });

  r.put("/themes/:id/letters/:letter", (req, res) => {
    try {
      const letter = String(req.params.letter).toUpperCase();
      if (!LETTERS.includes(letter)) throw new Error("Letra inválida.");
      setLetterEnabled(db, Number(req.params.id), letter, req.body?.enabled !== false);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  /* ------------------------------ partidas ------------------------ */
  r.get("/games", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT g.code, g.status, g.created_at, t.name AS theme,
                json_extract(g.config, '$.playerNames') AS players
         FROM games g JOIN themes t ON t.id = g.theme_id
         ORDER BY g.id DESC LIMIT 20`
      )
      .all();
    res.json(rows);
  });

  r.post("/games", async (req, res) => {
    try {
      const themeId = Number(req.body?.themeId);
      const names = req.body?.playerNames;
      const minutes = Math.min(10, Math.max(1, Math.floor(Number(req.body?.minutes ?? 3))));
      if (!themeId || !Array.isArray(names) || !names[0]?.trim() || !names[1]?.trim()) {
        throw new Error("Se requieren temática y los dos nombres de jugadores.");
      }
      const theme = db.prepare("SELECT id, name FROM themes WHERE id = ?").get(themeId) as
        | { id: number; name: string }
        | undefined;
      if (!theme) throw new Error("Temática no encontrada.");

      let code = "";
      for (let i = 0; i < 10; i++) {
        code = makeCode();
        if (!rooms.has(code) && !(db.prepare("SELECT id FROM games WHERE code = ?").get(code))) break;
      }
      const config = { playerNames: [names[0].trim(), names[1].trim()] as [string, string], minutes, themeId };
      const baseUrl = req.body?.baseUrl != null && String(req.body.baseUrl).trim() !== ""
        ? sanitizeBaseUrl(req.body.baseUrl)
        : requestBaseUrl(req.get("host"), req.protocol);
      db.prepare("INSERT INTO games (code, theme_id, config, status, base_url) VALUES (?, ?, ?, 'lobby', ?)").run(
        code, themeId, JSON.stringify(config), baseUrl
      );
      const room = new GameRoom(code, { ...config, themeName: theme.name });
      room.onChange = () => broadcast(code);
      room.deal(db); // sortea las definiciones (incrementa usos)
      rooms.set(code, room);
      res.status(201).json(await withQr(code, baseUrl));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.get("/games/:code", async (req, res) => {
    try {
      const room = getRoom(req.params.code);
      const row = db.prepare(
        "SELECT g.code, g.status, g.base_url AS baseUrl, t.name AS theme, g.config FROM games g JOIN themes t ON t.id = g.theme_id WHERE g.code = ?"
      ).get(room.code) as { code: string; status: string; baseUrl: string | null; theme: string; config: string } | undefined;
      const base = row?.baseUrl || requestBaseUrl(req.get("host"), req.protocol);
      res.json({ ...(await withQr(room.code, base)), theme: row?.theme, config: row ? JSON.parse(row.config) : null });
    } catch (e) {
      res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message });
    }
  });

  /** Cambia la dirección del servidor de una partida y regenera links/QR. */
  r.put("/games/:code/base-url", async (req, res) => {
    try {
      const room = getRoom(req.params.code);
      const baseUrl = sanitizeBaseUrl(req.body?.baseUrl);
      db.prepare("UPDATE games SET base_url = ? WHERE code = ?").run(baseUrl, room.code);
      res.json(await withQr(room.code, baseUrl));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  /* ------------------------- acciones de juego -------------------- */
  // (también disponibles por WebSocket; el REST sirve de respaldo simple)

  r.post("/games/:code/start", (req, res) => {
    try {
      const room = getRoom(req.params.code);
      room.start();
      db.prepare("UPDATE games SET status = 'playing' WHERE code = ?").run(room.code);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.post("/games/:code/judge", (req, res) => {
    try {
      const room = getRoom(req.params.code);
      const result = req.body?.result;
      if (!["correct", "wrong", "pass"].includes(result)) throw new Error("Resultado inválido.");
      room.judge(result);
      if (room.status === "finished") db.prepare("UPDATE games SET status = 'finished' WHERE code = ?").run(room.code);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.post("/games/:code/resume", (req, res) => {
    try {
      getRoom(req.params.code).resume();
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  /* ------------------------- errores ------------------------------ */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  r.use((err: Error, _req: Request, res: Response, _next: unknown) => {
    res.status(500).json({ error: (err as Error).message });
  });

  return r;
}
