import "./config";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
export const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/thoughts.sqlite",
);
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
chmodSync(databasePath, 0o600);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
db.exec(readFileSync(resolve("lib/migration.sql"), "utf8"));
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
let depth = 0;
export function transaction<T>(fn: () => T): T {
  if (depth) return fn();
  db.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const x = fn();
    db.exec("COMMIT");
    return x;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
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
