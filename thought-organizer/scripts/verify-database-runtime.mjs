import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const directory = mkdtempSync(join(tmpdir(), "thought-runtime-db-"));
const databasePath = join(directory, "test.sqlite");
const basePort = Number(process.env.DATABASE_TEST_PORT || 3300);
const origins = [0, 1].map((i) => "http://127.0.0.1:" + (basePort + i));
const servers = [];
let lock;
let diagnostic = "";
const password = "runtime-test-only-password";
async function start(index) {
  try {
    await fetch(origins[index]);
    throw new Error("测试端口已占用");
  } catch (e) {
    if (e.message.includes("已占用")) throw e;
  }
  const child = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(basePort + index),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        DATABASE_BUSY_TIMEOUT_MS: "300",
        APP_ORIGIN: origins[index],
        DEEPSEEK_API_KEY: "",
        NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next",
      },
    },
  );
  servers.push(child);
  child.stdout.on("data", () => {});
  child.stderr.on("data", (chunk) => {
    diagnostic += chunk;
  });
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error("生产测试服务启动失败");
    try {
      if ((await fetch(origins[index])).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("生产测试服务启动超时");
}
async function hold(duration = 0) {
  const child = spawn(
    process.execPath,
    [resolve("scripts/lib/lock-holder.mjs"), databasePath, String(duration)],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  const exited = once(child, "exit");
  await Promise.race([
    once(child, "message"),
    exited.then(() => {
      throw new Error("持锁进程未就绪");
    }),
  ]);
  lock = { child, exited };
}
async function release() {
  if (lock?.child.connected) lock.child.send("release");
  await lock?.exited;
  lock = undefined;
}
async function auth(index, action, email) {
  const response = await fetch(origins[index] + "/api/auth/" + action, {
    method: "POST",
    headers: { Origin: origins[index], "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  const body = await response.json();
  assert(
    !/ERR_SQLITE|PRAGMA|test\.sqlite|SQLITE_ERROR/.test(JSON.stringify(body)),
  );
  return { response, body };
}
try {
  await hold();
  await start(0);
  for (const action of ["register", "login"]) {
    const result = await auth(0, action, "initial-lock@test.example");
    assert.equal(result.response.status, 503);
    assert.match(result.body.error, /数据库暂时繁忙/);
    assert.equal(result.response.headers.get("retry-after"), "2");
  }
  await release();
  const registered = await auth(0, "register", "initial-lock@test.example");
  assert.equal(registered.response.status, 200);
  assert(registered.response.headers.get("set-cookie")?.includes("HttpOnly"));
  assert.equal(
    (await auth(0, "login", "initial-lock@test.example")).response.status,
    200,
  );
  await start(1);
  assert.equal(
    (await auth(1, "login", "initial-lock@test.example")).response.status,
    200,
  );
  const concurrent = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      auth(i % 2, "register", `concurrent-${i}@test.example`),
    ),
  );
  assert(concurrent.every((r) => r.response.status === 200));
  const logins = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      auth((i + 1) % 2, "login", `concurrent-${i}@test.example`),
    ),
  );
  assert(logins.every((r) => r.response.status === 200));
  const duplicate = await Promise.all([
    auth(0, "register", "same-email@test.example"),
    auth(1, "register", "same-email@test.example"),
  ]);
  assert.deepEqual(duplicate.map((r) => r.response.status).sort(), [200, 400]);
  await hold();
  assert.equal(
    (await auth(0, "register", "locked-register@test.example")).response.status,
    503,
  );
  assert.equal(
    (await auth(1, "login", "initial-lock@test.example")).response.status,
    503,
  );
  await release();
  assert.equal(
    (await auth(0, "register", "locked-register@test.example")).response.status,
    200,
  );
  await hold(100);
  assert.equal(
    (await auth(1, "login", "initial-lock@test.example")).response.status,
    200,
  );
  await release();
  const check = new DatabaseSync(databasePath, { readOnly: true });
  try {
    assert.equal(
      check.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.equal(check.prepare("SELECT count(*) n FROM lock_probe").get().n, 3);
    assert.equal(
      check
        .prepare("SELECT count(*) n FROM users WHERE email=?")
        .get("same-email@test.example").n,
      1,
    );
  } finally {
    check.close();
  }
  assert(
    diagnostic.includes('"category":"database"') &&
      diagnostic.includes('"sqliteErrcode":5'),
  );
  assert(!diagnostic.includes(password));
  console.log(
    "PASS: production registration/login, initial WAL contention, persistent locks return safe JSON 503, retry after release, two-process concurrent auth, duplicate email, data integrity and sanitized diagnostics",
  );
} finally {
  await release();
  for (const child of servers)
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
      await exited;
      clearTimeout(timer);
    }
  rmSync(directory, { recursive: true, force: true });
}
