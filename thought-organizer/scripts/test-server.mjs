import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
const port = new URL(origin).port || "3100";
const directory = mkdtempSync(join(tmpdir(), "thought-ui-"));
const production = process.env.BROWSER_TEST_MODE === "production";
const metadata = process.env.PLAYWRIGHT_TEST_DB_META;
if (metadata) {
  if (!metadata.startsWith(join(tmpdir(), "thought-playwright-")))
    throw Error("测试元数据路径必须在临时目录");
  writeFileSync(
    metadata,
    JSON.stringify({ directory, database: join(directory, "test.sqlite") }),
    { mode: 0o600 },
  );
}
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    production ? "start" : "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    detached: false,
    env: {
      ...process.env,
      DATABASE_PATH: join(directory, "test.sqlite"),
      APP_ORIGIN: origin,
      DEEPSEEK_API_KEY: "",
      NEXT_DIST_DIR: production
        ? process.env.NEXT_DIST_DIR || ".next"
        : ".next-ui",
    },
  },
);
function stop() {
  if (metadata)
    try {
      unlinkSync(metadata);
    } catch {}
  try {
    child.kill("SIGTERM");
  } catch {}
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("exit", stop);
child.on("exit", (code) => process.exit(code || 0));
