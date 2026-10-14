import "./config";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
export const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/thoughts.sqlite",
);
export function isDatabaseBusy(error: unknown): boolean {
  if (error instanceof DatabaseUnavailableError) return error.busy;
  const e = error as { code?: string; errcode?: number } | null;
  return (
    e?.code === "ERR_SQLITE_ERROR" &&
    typeof e.errcode === "number" &&
    [5, 6].includes(e.errcode & 255)
  );
}
export class DatabaseUnavailableError extends Error {
  constructor(
    public readonly busy: boolean,
    public readonly stage: string,
    cause: unknown,
  ) {
    super(
      busy
        ? "数据库暂时繁忙，请稍后重试。若持续出现，请确认没有重复运行的应用或未结束的数据库事务。"
        : "数据服务暂时不可用，请查看服务器诊断日志。",
      { cause },
    );
    this.name = "DatabaseUnavailableError";
  }
}
export function databaseDiagnostic(error: unknown) {
  const cause = error instanceof DatabaseUnavailableError ? error.cause : error;
  const e = cause as { code?: string; errcode?: number } | null;
  return {
    stage: error instanceof DatabaseUnavailableError ? error.stage : "request",
    sqliteCode: e?.code === "ERR_SQLITE_ERROR" ? e.code : undefined,
    sqliteErrcode: typeof e?.errcode === "number" ? e.errcode : undefined,
  };
}
type Connection = { database: DatabaseSync; depth: number };
// Survives module re-evaluation in Next development, scoped by absolute path.
const globalState = globalThis as typeof globalThis & {
  __thoughtDatabaseConnectionsV2?: Map<string, Connection>;
};
const connections = (globalState.__thoughtDatabaseConnectionsV2 ??= new Map());
function busyTimeout() {
  const value = Number(process.env.DATABASE_BUSY_TIMEOUT_MS || 5000);
  return Number.isInteger(value) && value >= 1 && value <= 30000 ? value : 5000;
}
// SQLite's journal-mode lock upgrade can return BUSY immediately even with
// a busy handler installed. Retry only this startup operation, within a bound.
function journalModeRetry<T>(fn: () => T, timeout: number): T {
  const deadline = Date.now() + timeout;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      return fn();
    } catch (e) {
      const remaining = deadline - Date.now();
      if (!isDatabaseBusy(e) || remaining <= 0) throw e;
      Atomics.wait(sleeper, 0, 0, Math.min(25, remaining));
    }
  }
}
export function getDatabase(): DatabaseSync {
  const cached = connections.get(databasePath);
  if (cached?.database.isOpen) return cached.database;
  connections.delete(databasePath);
  let opened: DatabaseSync | undefined,
    stage = "open";
  try {
    mkdirSync(dirname(databasePath), { recursive: true });
    opened = new DatabaseSync(databasePath);
    chmodSync(databasePath, 0o600);
    // Install the busy handler before any operation that can acquire a lock.
    stage = "busy-timeout";
    opened.exec(`PRAGMA busy_timeout=${busyTimeout()}`);
    opened.exec("PRAGMA foreign_keys=ON");
    stage = "journal-mode";
    const mode = opened.prepare("PRAGMA journal_mode").get()?.journal_mode;
    // Existing WAL databases do not need another mode switch on every reload.
    if (String(mode).toLowerCase() !== "wal") {
      const database = opened;
      const result = journalModeRetry(
        () => database.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode,
        busyTimeout(),
      );
      if (String(result).toLowerCase() !== "wal")
        throw new Error("WAL initialization failed");
    }
    stage = "migration-check";
    const exists = opened
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      )
      .get();
    const version = exists
      ? Number(
          opened
            .prepare("SELECT max(version) version FROM schema_migrations")
            .get()?.version || 0,
        )
      : 0;
    if (version > 1) throw new Error("Unsupported database schema version");
    if (version < 1) {
      stage = "migration";
      opened.exec("BEGIN IMMEDIATE");
      try {
        opened.exec(readFileSync(resolve("lib/migration.sql"), "utf8"));
        opened.exec("COMMIT");
      } catch (e) {
        try {
          opened.exec("ROLLBACK");
        } catch {}
        throw e;
      }
    }
    connections.set(databasePath, { database: opened, depth: 0 });
    return opened;
  } catch (e) {
    try {
      opened?.close();
    } catch {}
    // Never cache a half-initialized connection; the next request may retry.
    throw new DatabaseUnavailableError(isDatabaseBusy(e), stage, e);
  }
}
export function closeDatabase() {
  const cached = connections.get(databasePath);
  if (!cached) return;
  if (cached.depth) throw new Error("Cannot close an active transaction");
  try {
    if (cached.database.isOpen) cached.database.close();
  } finally {
    connections.delete(databasePath);
  }
}
// Lazy facade keeps module import failures inside the API's try/catch.
// Node's native backup API must use getDatabase() to obtain the real handle.
export const db = {
  prepare(sql: string) {
    return getDatabase().prepare(sql);
  },
  exec(sql: string) {
    return getDatabase().exec(sql);
  },
  close: closeDatabase,
};
export function one<T>(
  sql: string,
  ...args: (string | number | null)[]
): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}
export function all<T>(sql: string, ...args: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}
export function run(sql: string, ...args: (string | number | null)[]) {
  return db.prepare(sql).run(...args);
}
function syncResult<T>(fn: () => T): T {
  const result = fn();
  if (result && typeof (result as { then?: unknown }).then === "function")
    throw new Error("Database transactions must be synchronous");
  return result;
}
export function transaction<T>(fn: () => T): T {
  const database = getDatabase(),
    connection = connections.get(databasePath)!;
  if (connection.depth) return syncResult(fn);
  database.exec("BEGIN IMMEDIATE");
  connection.depth++;
  try {
    const result = syncResult(fn);
    database.exec("COMMIT");
    return result;
  } catch (e) {
    try {
      database.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        JSON.stringify({
          category: "database",
          ...databaseDiagnostic(rollbackError),
          stage: "rollback",
        }),
      );
      connections.delete(databasePath);
      try {
        database.close();
      } catch {}
    }
    throw e;
  } finally {
    connection.depth--;
  }
}
export function metric(owner: string, event: string) {
  run(
    "INSERT INTO metrics(owner,event,created_at) VALUES(?,?,?)",
    owner,
    event,
    new Date().toISOString(),
  );
}
