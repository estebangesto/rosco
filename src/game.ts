import Database from "better-sqlite3";
import { bumpUses } from "./db";

/* ------------------------------------------------------------------ */
/* Motor del juego. El servidor es la fuente de verdad del estado de   */
/* la partida (turno, letra actual, juicios) y del temporizador: el    */
/* reloj corre en el servidor para evitar el drift de la versión       */
/* estática (donde el timer se degradaba si la pestaña perdía foco).   */
/* ------------------------------------------------------------------ */

export const LETTERS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split(""); // 27: abecedario completo con Ñ

export type LetterStatus = "pending" | "current" | "correct" | "wrong" | "passed";
export type GameStatus = "lobby" | "playing" | "paused" | "finished";
export type JudgeResult = "correct" | "wrong" | "pass";

export interface Clue {
  letter: string;
  hint: string;
  definition: string;
  answer: string;
  alt: string[];
}

interface PlayerLetter {
  letter: string;
  defId: number;
  clue: Clue;
  status: LetterStatus;
}

export interface PlayerState {
  name: string;
  timeMs: number;
  letters: PlayerLetter[];
  pos: number;
  correct: number;
  wrong: number;
  done: boolean;
}

export interface GameConfig {
  playerNames: [string, string];
  minutes: number; // 1..10 por jugador
  themeId: number;
  themeName: string;
}

function hintText(letter: string, hintType: "E" | "C"): string {
  return hintType === "C" ? `Contiene la ${letter}` : `Empieza con ${letter}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class GameRoom {
  code: string;
  config: GameConfig;
  status: GameStatus = "lobby";
  activePlayer: 0 | 1 = 0;
  players: [PlayerState, PlayerState];
  pausedReason: string | null = null;
  winner: 0 | 1 | null = null;
  onChange: () => void = () => void 0;
  private timer: NodeJS.Timeout | null = null;
  private lastTick = 0;

  constructor(code: string, config: GameConfig) {
    this.code = code;
    this.config = config;
    const mk = (name: string): PlayerState => ({
      name,
      timeMs: config.minutes * 60 * 1000,
      letters: [],
      pos: 0,
      correct: 0,
      wrong: 0,
      done: false,
    });
    this.players = [mk(config.playerNames[0]), mk(config.playerNames[1])];
  }

  /* ------------------------- armado -------------------------------- */

  /** Sortea las definiciones de la partida según las reglas:
      - solo letras habilitadas, con >= 2 definiciones activas;
      - se priorizan las de menor contador de usos (empate: azar);
      - los dos jugadores reciben definiciones distintas entre sí;
      - ninguna se repite para el mismo jugador.
      Persiste el incremento de usos en la base. */
  deal(db: Database.Database): void {
    for (const p of [0, 1] as const) {
      const pl = this.players[p];
      pl.letters = [];
      for (const L of LETTERS) {
        const cands = db
          .prepare(
            `SELECT * FROM definitions
             WHERE theme_id = ? AND letter = ? AND active = 1 AND enabled = 1
             ORDER BY uses ASC, id ASC`
          )
          .all(this.config.themeId, L) as Record<string, unknown>[];
        if (cands.length < 2) continue; // criterio de control: <2 definiciones -> fuera
        // mezcla con desempate por usos: ordena por usos y baraja los empatados
        const byUses = new Map<number, Record<string, unknown>[]>();
        for (const c of cands) {
          const u = Number(c.uses);
          if (!byUses.has(u)) byUses.set(u, []);
          byUses.get(u)!.push(c);
        }
        const ordered: Record<string, unknown>[] = [];
        for (const u of [...byUses.keys()].sort((a, b) => a - b)) {
          ordered.push(...shuffle(byUses.get(u)!));
          if (ordered.length >= 2) break;
        }
        const pick = ordered[p];
        let alt: string[] = [];
        try {
          const parsed: unknown = JSON.parse(String(pick.alt ?? "[]"));
          if (Array.isArray(parsed)) alt = parsed.filter((s): s is string => typeof s === "string");
        } catch { alt = []; }
        const hintType = pick.hint_type === "C" ? "C" : "E";
        pl.letters.push({
          letter: L,
          defId: Number(pick.id),
          clue: {
            letter: L,
            hint: hintText(L, hintType),
            definition: String(pick.definition),
            answer: String(pick.word),
            alt,
          },
          status: "pending",
        });
        bumpUses(db, Number(pick.id));
      }
      if (pl.letters.length === 0) {
        throw new Error(`La temática no tiene letras jugables (se necesitan >= 2 definiciones activas por letra).`);
      }
      pl.pos = 0;
      pl.letters[0].status = "current";
    }
  }

  start(): void {
    if (this.status !== "lobby") throw new Error("La partida ya comenzó.");
    this.status = "playing";
    this.activePlayer = 0;
    this.startClock();
    this.onChange();
  }

  /* ------------------------- reloj --------------------------------- */

  private startClock(): void {
    this.stopClock();
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 500);
  }

  private stopClock(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.status !== "playing") return;
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const pl = this.players[this.activePlayer];
    pl.timeMs -= dt;
    if (pl.timeMs <= 0) {
      pl.timeMs = 0;
      this.onTimeout();
    }
    this.onChange();
  }

  private onTimeout(): void {
    const pl = this.players[this.activePlayer];
    pl.done = true;
    const other = (1 - this.activePlayer) as 0 | 1;
    if (this.playable(other)) {
      this.activePlayer = other;
      this.status = "paused";
      this.pausedReason = `Se terminó el tiempo de ${pl.name}.`;
    } else {
      this.finish();
      return;
    }
    this.onChange();
  }

  destroy(): void {
    this.stopClock();
  }

  /* ------------------------- turnos -------------------------------- */

  private inPlay(pl: PlayerState): boolean {
    return pl.letters.some((l) => l.status === "pending" || l.status === "passed" || l.status === "current");
  }

  private playable(p: 0 | 1): boolean {
    const pl = this.players[p];
    return !pl.done && pl.timeMs > 0 && this.inPlay(pl);
  }

  /** Avanza el puntero a la próxima letra en juego. Al completar la
      vuelta, las pasadas (amarillas) vuelven a pendientes. */
  private advance(pl: PlayerState): boolean {
    const n = pl.letters.length;
    let wrapped = false;
    for (let step = 1; step <= n; step++) {
      const i = (pl.pos + step) % n;
      if (i <= pl.pos && !wrapped) {
        wrapped = true;
        for (const l of pl.letters) if (l.status === "passed") l.status = "pending";
      }
      const st = pl.letters[i].status;
      if (st === "pending" || st === "passed") {
        pl.pos = i;
        pl.letters[i].status = "current";
        return true;
      }
    }
    return false;
  }

  /** El moderador juzga la letra actual del jugador en turno. */
  judge(result: JudgeResult): void {
    if (this.status !== "playing") throw new Error("La partida no está en juego.");
    const p = this.activePlayer;
    const pl = this.players[p];
    const cur = pl.letters[pl.pos];
    if (!cur || cur.status !== "current") throw new Error("No hay letra actual para juzgar.");

    if (result === "correct") {
      cur.status = "correct";
      pl.correct++;
    } else if (result === "wrong") {
      cur.status = "wrong";
      pl.wrong++;
    } else {
      cur.status = "passed";
    }

    const stillHas = this.advance(pl);
    if (!stillHas) pl.done = true;

    if (result === "correct" && !pl.done && pl.timeMs > 0) {
      // sigue el mismo jugador
      this.onChange();
      return;
    }
    // errar o pasar cede el turno (con pausa y confirmación)
    const other = (1 - p) as 0 | 1;
    if (this.playable(other)) {
      this.activePlayer = other;
      this.status = "paused";
      this.pausedReason =
        result === "wrong"
          ? `${pl.name} erró. Turno de ${this.players[other].name}.`
          : `${pl.name} pasó. Turno de ${this.players[other].name}.`;
    } else if (!pl.done && pl.timeMs > 0) {
      // queda un solo jugador activo: no sigue el reloj, vuelve a espera
      // listo para continuar (igual que cuando retorna el turno)
      this.status = "paused";
      this.pausedReason =
        result === "wrong"
          ? `${pl.name} erró. Turno en espera, listo para continuar.`
          : `${pl.name} pasó la palabra. Turno en espera, listo para continuar.`;
    } else {
      this.finish();
      return;
    }
    this.onChange();
  }

  /** Pausa excepcional solicitada por el moderador (el reloj se detiene con el estado). */
  pause(reason = "Pausa solicitada por el moderador."): void {
    if (this.status !== "playing") throw new Error("Solo se puede pausar durante el juego.");
    this.status = "paused";
    this.pausedReason = reason;
    this.onChange();
  }

  /** Reanuda el turno pausado (lo confirma el moderador o el jugador al que le toca). */
  resume(): void {
    if (this.status !== "paused") throw new Error("No hay pausa que reanudar.");
    if (!this.playable(this.activePlayer)) {
      // el jugador en turno ya no puede jugar: buscar al otro o terminar
      const other = (1 - this.activePlayer) as 0 | 1;
      if (this.playable(other)) {
        this.activePlayer = other;
      } else {
        this.finish();
        return;
      }
    }
    this.status = "playing";
    this.pausedReason = null;
    this.lastTick = Date.now();
    this.onChange();
  }

  private finish(): void {
    this.status = "finished";
    this.pausedReason = null;
    this.stopClock();
    const [a, b] = this.players;
    if (a.correct !== b.correct) this.winner = a.correct > b.correct ? 0 : 1;
    else if (a.wrong !== b.wrong) this.winner = a.wrong < b.wrong ? 0 : 1;
    else if (a.timeMs !== b.timeMs) this.winner = a.timeMs > b.timeMs ? 0 : 1;
    else this.winner = null;
    this.onChange();
  }

  /* ------------------------ snapshot ------------------------------- */

  /** Detalle de cierre: definiciones y respuestas de ambos jugadores.
      Solo se expone cuando la partida terminó. */
  private finalPayload(): SnapshotFinal {
    return {
      winner: this.winner,
      players: [0, 1].map((p) => {
        const pl = this.players[p as 0 | 1];
        return {
          name: pl.name,
          correct: pl.correct,
          wrong: pl.wrong,
          timeSec: Math.ceil(pl.timeMs / 1000),
          letters: pl.letters.map((l) => ({
            letter: l.letter,
            status: l.status,
            definition: l.clue.definition,
            answer: l.clue.answer,
          })),
        };
      }) as [SnapshotFinalPlayer, SnapshotFinalPlayer],
    };
  }

  snapshot(includeAnswers: boolean): Snapshot {
    const players = [0, 1].map((p) => {
      const pl = this.players[p as 0 | 1];
      const cur = pl.letters[pl.pos];
      const current =
        cur && (cur.status === "current") && (this.status === "playing" || this.status === "paused")
          ? {
              letter: cur.clue.letter,
              hint: cur.clue.hint,
              definition: cur.clue.definition,
              ...(includeAnswers ? { answer: cur.clue.answer, alt: cur.clue.alt } : {}),
            }
          : null;
      return {
        name: pl.name,
        timeSec: Math.ceil(pl.timeMs / 1000),
        correct: pl.correct,
        wrong: pl.wrong,
        done: pl.done,
        isActive: p === this.activePlayer && this.status !== "finished",
        letters: pl.letters.map((l) => ({ letter: l.letter, status: l.status })),
        current,
      };
    }) as [SnapshotPlayer, SnapshotPlayer];
    return {
      code: this.code,
      status: this.status,
      theme: this.config.themeName,
      activePlayer: this.activePlayer,
      pausedReason: this.pausedReason,
      winner: this.winner,
      players,
      ...(this.status === "finished" ? { final: this.finalPayload() } : {}),
    };
  }
}

export interface SnapshotLetter {
  letter: string;
  status: LetterStatus;
}

export interface SnapshotPlayer {
  name: string;
  timeSec: number;
  correct: number;
  wrong: number;
  done: boolean;
  isActive: boolean;
  letters: SnapshotLetter[];
  current: {
    letter: string;
    hint: string;
    definition: string;
    answer?: string;
    alt?: string[];
  } | null;
}

export interface Snapshot {
  code: string;
  status: GameStatus;
  theme: string;
  activePlayer: 0 | 1;
  pausedReason: string | null;
  winner: 0 | 1 | null;
  players: [SnapshotPlayer, SnapshotPlayer];
  final?: SnapshotFinal;
}

export interface SnapshotFinalLetter {
  letter: string;
  status: LetterStatus;
  definition: string;
  answer: string;
}

export interface SnapshotFinalPlayer {
  name: string;
  correct: number;
  wrong: number;
  timeSec: number;
  letters: SnapshotFinalLetter[];
}

export interface SnapshotFinal {
  winner: 0 | 1 | null;
  players: [SnapshotFinalPlayer, SnapshotFinalPlayer];
}

export function makeCode(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += abc[Math.floor(Math.random() * abc.length)];
  return code;
}
