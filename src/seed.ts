import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createTheme, replaceBank, DefinitionInput } from "./db";

/* Banco original del juego El Rosco (versión de una página):
   25 letras (sin K ni W, con Ñ), 293 definiciones.
   Formato fuente: { "A": [{ t: "E"|"C", q, a, alt? }] }
   t: tipo de pista ("E" empieza con, "C" contiene)
   q: definición (pregunta), a: palabra (respuesta), alt: alternativas aceptadas */

interface RawDef {
  t: string;
  q: string;
  a: string;
  alt?: string[];
}

function loadRaw(): Record<string, RawDef[]> {
  const p = path.join(__dirname, "seed", "familiar.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Crea la temática "Familiar" con el banco original si todavía no existe. */
export function seedFamiliar(db: Database.Database): void {
  const existing = db.prepare("SELECT id FROM themes WHERE name = ?").get("Familiar") as
    | { id: number }
    | undefined;
  if (existing) {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM definitions WHERE theme_id = ?").get(existing.id) as { n: number }).n;
    if (n > 0) return; // ya sembrada
  }
  const raw = loadRaw();
  const theme = existing ?? createTheme(db, "Familiar");
  const defs: DefinitionInput[] = [];
  for (const letter of Object.keys(raw)) {
    for (const d of raw[letter]) {
      defs.push({
        letter,
        word: d.a,
        definition: d.q,
        hint_type: d.t === "C" ? "C" : "E",
        alt: Array.isArray(d.alt) ? d.alt : [],
        active: 1,
        enabled: 1,
        uses: 0,
      });
    }
  }
  const count = replaceBank(db, theme.id, defs);
  console.log(`[seed] Temática "Familiar" creada con ${count} definiciones.`);
}
