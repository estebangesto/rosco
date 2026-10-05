import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/* ------------------------------------------------------------------ */
/* Esquema                                                            */
/* ------------------------------------------------------------------ */
/* themes:      temáticas del juego (cada una con su propia base).     */
/* definitions: banco de definiciones por temática.                    */
/*   - active:  flag a nivel de definición (el gestor la activa o      */
/*              desactiva). Las inactivas nunca entran en un juego.     */
/*   - enabled: flag a nivel de LETRA, desnormalizado en cada fila de   */
/*              esa letra dentro de la temática. Deshabilitar una      */
/*              letra conserva sus definiciones pero las excluye del    */
/*              juego. Se actualiza en transacción al togglear la letra.*/
/*   - uses:    contador interno de usos (cuántas veces se sorteó).     */
/* games:       partidas creadas (el estado vivo de la partida está en  */
/*              memoria; acá queda el registro con su configuración).  */
/* ------------------------------------------------------------------ */

export interface Theme {
  id: number;
  name: string;
}

export interface DefinitionRow {
  id: number;
  theme_id: number;
  letter: string;
  word: string;
  definition: string;
  hint_type: "E" | "C";
  alt: string[];
  active: number;
  enabled: number;
  uses: number;
}

export interface GameRow {
  id: number;
  code: string;
  theme_id: number;
  config: string;
  status: string;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

export function openDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "rosco.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      letter TEXT NOT NULL,
      word TEXT NOT NULL,
      definition TEXT NOT NULL,
      hint_type TEXT NOT NULL CHECK (hint_type IN ('E','C')),
      alt TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      uses INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_def_theme_letter ON definitions(theme_id, letter);
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      theme_id INTEGER NOT NULL REFERENCES themes(id),
      config TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby',
      base_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // migración: partidas creadas antes de la columna base_url
  const gcols = db.prepare("PRAGMA table_info(games)").all() as { name: string }[];
  if (!gcols.some((c) => c.name === "base_url")) {
    db.exec("ALTER TABLE games ADD COLUMN base_url TEXT");
  }
  return db;
}

/* ------------------------- temáticas ------------------------------ */

export function listThemes(db: Database.Database): (Theme & { definitions: number })[] {
  return db
    .prepare(
      `SELECT t.id, t.name, COUNT(d.id) AS definitions
       FROM themes t LEFT JOIN definitions d ON d.theme_id = t.id
       GROUP BY t.id ORDER BY t.id`
    )
    .all() as (Theme & { definitions: number })[];
}

export function createTheme(db: Database.Database, name: string): Theme {
  const clean = name.trim();
  if (!clean) throw new Error("El nombre de la temática no puede estar vacío.");
  const info = db.prepare("INSERT INTO themes (name) VALUES (?)").run(clean);
  return { id: Number(info.lastInsertRowid), name: clean };
}

export function renameTheme(db: Database.Database, id: number, name: string): void {
  const clean = name.trim();
  if (!clean) throw new Error("El nombre de la temática no puede estar vacío.");
  const info = db.prepare("UPDATE themes SET name = ? WHERE id = ?").run(clean, id);
  if (info.changes === 0) throw new Error("Temática no encontrada.");
}

export function deleteTheme(db: Database.Database, id: number): void {
  const info = db.prepare("DELETE FROM themes WHERE id = ?").run(id);
  if (info.changes === 0) throw new Error("Temática no encontrada.");
}

/* ------------------------ definiciones ---------------------------- */

/** Mapea una fila cruda de SQLite a DefinitionRow (parsea alt como JSON). */
function mapRow(r: Record<string, unknown>): DefinitionRow {
  let alt: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(r.alt ?? "[]"));
    if (Array.isArray(parsed)) alt = parsed.filter((s): s is string => typeof s === "string");
  } catch {
    alt = [];
  }
  return {
    id: Number(r.id),
    theme_id: Number(r.theme_id),
    letter: String(r.letter),
    word: String(r.word),
    definition: String(r.definition),
    hint_type: r.hint_type === "C" ? "C" : "E",
    alt,
    active: Number(r.active),
    enabled: Number(r.enabled),
    uses: Number(r.uses),
  };
}

export function listDefinitions(
  db: Database.Database,
  themeId: number,
  letter?: string
): DefinitionRow[] {
  const rows = (
    letter
      ? db.prepare("SELECT * FROM definitions WHERE theme_id = ? AND letter = ? ORDER BY id").all(themeId, letter)
      : db.prepare("SELECT * FROM definitions WHERE theme_id = ? ORDER BY letter, id").all(themeId)
  ) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export interface DefinitionInput {
  letter: string;
  word: string;
  definition: string;
  hint_type: "E" | "C";
  alt?: string[];
  active?: number;
  enabled?: number;
  uses?: number;
}

/** Reemplaza el banco completo de una temática (operación del botón Guardar). */
export function replaceBank(
  db: Database.Database,
  themeId: number,
  defs: DefinitionInput[]
): number {
  const exists = db.prepare("SELECT id FROM themes WHERE id = ?").get(themeId);
  if (!exists) throw new Error("Temática no encontrada.");
  const insert = db.prepare(
    `INSERT INTO definitions (theme_id, letter, word, definition, hint_type, alt, active, enabled, uses)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((rows: DefinitionInput[]) => {
    db.prepare("DELETE FROM definitions WHERE theme_id = ?").run(themeId);
    for (const d of rows) {
      if (!d.letter || !d.word?.trim() || !d.definition?.trim()) continue;
      const alt = Array.isArray(d.alt) ? d.alt.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : [];
      insert.run(
        themeId,
        d.letter,
        d.word.trim(),
        d.definition.trim(),
        d.hint_type === "C" ? "C" : "E",
        JSON.stringify(alt),
        d.active === 0 ? 0 : 1,
        d.enabled === 0 ? 0 : 1,
        Math.max(0, Math.floor(d.uses ?? 0))
      );
    }
  });
  tx(defs);
  return (db.prepare("SELECT COUNT(*) AS n FROM definitions WHERE theme_id = ?").get(themeId) as { n: number }).n;
}

/** Habilita/deshabilita una letra dentro de una temática (conserva definiciones). */
export function setLetterEnabled(
  db: Database.Database,
  themeId: number,
  letter: string,
  enabled: boolean
): void {
  db.prepare("UPDATE definitions SET enabled = ? WHERE theme_id = ? AND letter = ?").run(
    enabled ? 1 : 0,
    themeId,
    letter
  );
}

/** Estado de cada letra: habilitada (según sus filas; default true) y conteos. */
export function letterStates(
  db: Database.Database,
  themeId: number,
  letters: string[]
): { letter: string; enabled: boolean; total: number; active: number }[] {
  const rows = db
    .prepare(
      `SELECT letter,
              MIN(enabled) AS enabled,
              COUNT(*) AS total,
              SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active
       FROM definitions WHERE theme_id = ? GROUP BY letter`
    )
    .all(themeId) as { letter: string; enabled: number; total: number; active: number }[];
  const byLetter = new Map(rows.map((r) => [r.letter, r]));
  return letters.map((L) => {
    const r = byLetter.get(L);
    return {
      letter: L,
      enabled: r ? r.enabled === 1 : true,
      total: r ? r.total : 0,
      active: r ? r.active : 0,
    };
  });
}

/** Incrementa el contador de usos de una definición. */
export function bumpUses(db: Database.Database, id: number): void {
  db.prepare("UPDATE definitions SET uses = uses + 1 WHERE id = ?").run(id);
}
