import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
let generation = 0;
async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "thought-db-test-"));
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  process.env.DATABASE_BUSY_TIMEOUT_MS = "150";
  const databaseModule = await import(
    new URL(`../lib/db.ts?generation=${++generation}`, import.meta.url).href
  );
  t.after(() => {
    databaseModule.closeDatabase();
    rmSync(directory, { recursive: true, force: true });
  });
  return databaseModule as typeof import("../lib/db");
}
const holderSource = `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('CREATE TABLE IF NOT EXISTS preserved(value TEXT);BEGIN IMMEDIATE');db.prepare('INSERT INTO preserved VALUES(?)').run('test-only');process.send('ready');function release(){db.exec('COMMIT');db.close();process.disconnect()}process.on('message',release);if(process.argv[2])setTimeout(release,Number(process.argv[2]));`;
async function holder(path: string, duration?: number) {
  const child = spawn(
    process.execPath,
    ["-e", holderSource, path, duration ? String(duration) : ""],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let diagnostic = "";
  child.stderr?.on("data", (chunk) => {
    diagnostic += chunk;
  });
  const exited = once(child, "exit");
  await Promise.race([
    once(child, "message"),
    exited.then(() => {
      throw new Error("Lock fixture did not start: " + diagnostic);
    }),
  ]);
  return {
    child,
    exited,
    async release() {
      if (child.connected) child.send("release");
      await exited;
    },
  };
}
test("先安装等待时间：另一进程的短暂写锁释放后可切换WAL并完整初始化", async (t) => {
  const m = await fixture(t);
  process.env.DATABASE_BUSY_TIMEOUT_MS = "2000";
  const lock = await holder(m.databasePath, 500);
  t.after(() => {
    if (lock.child.connected) lock.child.send("release");
  });
  const start = Date.now(),
    database = m.getDatabase();
  assert(Date.now() - start >= 200);
  assert.equal(
    database.prepare("PRAGMA journal_mode").get()?.journal_mode,
    "wal",
  );
  assert.equal(database.prepare("PRAGMA busy_timeout").get()?.timeout, 2000);
  assert.equal(database.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  assert.equal(
    m.one<{ value: string }>("SELECT value FROM preserved")!.value,
    "test-only",
  );
  assert.equal(
    m.one<{ version: number }>(
      "SELECT max(version) version FROM schema_migrations",
    )!.version,
    1,
  );
  await lock.exited;
});
test("初始化持锁失败不缓存坏连接，锁释放后同一模块可恢复并复用连接", async (t) => {
  const m = await fixture(t),
    lock = await holder(m.databasePath);
  try {
    assert.throws(
      () => m.getDatabase(),
      (e) => m.isDatabaseBusy(e) && e instanceof m.DatabaseUnavailableError,
    );
  } finally {
    await lock.release();
  }
  const first = m.getDatabase();
  assert.equal(first, m.getDatabase());
  const reload = await import(
    new URL(`../lib/db.ts?generation=${++generation}`, import.meta.url).href
  );
  assert.equal(reload.getDatabase(), first);
  assert.equal(
    m.one<{ value: string }>("SELECT value FROM preserved")!.value,
    "test-only",
  );
});
test("已有WAL数据库读写连接无需重新迁移；事务失败回滚且下一事务可正常执行", async (t) => {
  const m = await fixture(t),
    database = m.getDatabase();
  database.exec("CREATE TABLE probe(value INTEGER)");
  assert.throws(
    () =>
      m.transaction(() => {
        m.run("INSERT INTO probe VALUES(1)");
        throw new Error("expected failure");
      }),
    /expected failure/,
  );
  assert.equal(m.one<{ n: number }>("SELECT count(*) n FROM probe")!.n, 0);
  assert.throws(
    () =>
      m.transaction(() => {
        m.run("INSERT INTO probe VALUES(3)");
        return Promise.resolve(3);
      }),
    /synchronous/,
  );
  m.transaction(() => m.run("INSERT INTO probe VALUES(2)"));
  assert.deepEqual(
    m.all<{ value: number }>("SELECT value FROM probe").map((row) => row.value),
    [2],
  );
  m.closeDatabase();
  assert.equal(database.isOpen, false);
  const next = m.getDatabase();
  assert.notEqual(next, database);
  assert.equal(m.one<{ value: number }>("SELECT value FROM probe")!.value, 2);
});
