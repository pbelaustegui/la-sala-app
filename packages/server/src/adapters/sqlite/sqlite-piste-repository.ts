import { DatabaseSync } from 'node:sqlite';
import type { BoutRecord, BoutSetup, Piste, PisteRepository, StoredEvent } from '../../application/ports';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS pistes (
    id       TEXT PRIMARY KEY,
    pin      TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bouts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    piste_id TEXT NOT NULL REFERENCES pistes(id) ON DELETE CASCADE,
    setup    TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_current_bout_per_piste ON bouts(piste_id) WHERE archived = 0;
  CREATE TABLE IF NOT EXISTS events (
    bout_id  INTEGER NOT NULL REFERENCES bouts(id) ON DELETE CASCADE,
    seq      INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    payload  TEXT NOT NULL,
    PRIMARY KEY (bout_id, seq),
    UNIQUE (bout_id, event_id)
  );
`;

interface BoutRow {
  id: number;
  setup: string;
}

/** SQLite persistence on Node's built-in `node:sqlite` (synchronous; wrapped in promises by the port). */
export class SqlitePisteRepository implements PisteRepository {
  private constructor(private readonly db: DatabaseSync) {}

  /** Opens (and migrates) a database file, or `:memory:`. */
  static open(path: string): SqlitePisteRepository {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(SCHEMA);
    return new SqlitePisteRepository(db);
  }

  close(): void {
    this.db.close();
  }

  async listPistes(): Promise<readonly Piste[]> {
    return this.db.prepare('SELECT id, pin FROM pistes ORDER BY position').all() as unknown as Piste[];
  }

  async findPiste(id: string): Promise<Piste | null> {
    const row = this.db.prepare('SELECT id, pin FROM pistes WHERE id = ?').get(id);
    return row ? { id: String(row.id), pin: String(row.pin) } : null;
  }

  async replacePistes(pistes: readonly Piste[]): Promise<void> {
    this.transaction(() => {
      this.db.exec('DELETE FROM pistes'); // cascades to bouts and events
      const insert = this.db.prepare('INSERT INTO pistes (id, pin, position) VALUES (?, ?, ?)');
      pistes.forEach((piste, position) => insert.run(piste.id, piste.pin, position));
    });
  }

  async findBout(pisteId: string): Promise<BoutRecord | null> {
    const row = this.db
      .prepare('SELECT id, setup FROM bouts WHERE piste_id = ? AND archived = 0')
      .get(pisteId) as BoutRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  async startBout(pisteId: string, setup: BoutSetup): Promise<void> {
    this.transaction(() => {
      this.db.prepare('UPDATE bouts SET archived = 1 WHERE piste_id = ? AND archived = 0').run(pisteId);
      this.db.prepare('INSERT INTO bouts (piste_id, setup) VALUES (?, ?)').run(pisteId, JSON.stringify(setup));
    });
  }

  async appendEvents(pisteId: string, events: readonly StoredEvent[]): Promise<void> {
    this.transaction(() => {
      const bout = this.db
        .prepare('SELECT id FROM bouts WHERE piste_id = ? AND archived = 0')
        .get(pisteId) as { id: number } | undefined;
      if (!bout) throw new Error(`No current bout on piste ${pisteId}`);
      const last = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE bout_id = ?').get(bout.id) as {
        seq: number;
      };
      const insert = this.db.prepare('INSERT INTO events (bout_id, seq, event_id, payload) VALUES (?, ?, ?, ?)');
      events.forEach((stored, offset) =>
        insert.run(bout.id, last.seq + offset + 1, stored.id, JSON.stringify(stored.event)),
      );
    });
  }

  async listArchivedBouts(pisteId: string): Promise<readonly BoutRecord[]> {
    const rows = this.db
      .prepare('SELECT id, setup FROM bouts WHERE piste_id = ? AND archived = 1 ORDER BY id')
      .all(pisteId) as unknown as BoutRow[];
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: BoutRow): BoutRecord {
    const events = this.db
      .prepare('SELECT event_id, payload FROM events WHERE bout_id = ? ORDER BY seq')
      .all(row.id) as unknown as { event_id: string; payload: string }[];
    return {
      setup: JSON.parse(row.setup) as BoutSetup,
      events: events.map((e) => ({ id: e.event_id, event: JSON.parse(e.payload) })),
    };
  }

  /** Runs `work` atomically: commit on success, roll back and rethrow on any error. */
  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
