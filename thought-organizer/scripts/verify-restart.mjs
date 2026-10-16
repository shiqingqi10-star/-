import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
const directory = mkdtempSync(join(tmpdir(), "thought-restart-"));
const port = process.env.RESTART_TEST_PORT || "3200";
const origin = "http://127.0.0.1:" + port;
const headers = { Origin: origin };
let server, browser;
async function start() {
  // Refuse to connect to an unrelated running application or its database.
  try {
    await fetch(origin);
    throw new Error("测试端口已占用，请设置 RESTART_TEST_PORT");
  } catch (e) {
    if (e.message.includes("已占用")) throw e;
  }
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DATABASE_PATH: join(directory, "test.sqlite"),
        DEEPSEEK_API_KEY: "",
        APP_ORIGIN: origin,
        NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next",
      },
    },
  );
  let log = "";
  server.stdout.on("data", (value) => {
    log += value;
  });
  server.stderr.on("data", (value) => {
    log += value;
  });
  for (let i = 0; i < 200; i++) {
    if (server.exitCode !== null)
      throw new Error("测试服务启动失败：" + log.slice(-1200));
    try {
      const r = await fetch(origin);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("测试服务启动超时");
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 10000);
    await exited;
    clearTimeout(timer);
  }
}
try {
  await start();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const registration = await page.request.post(origin + "/api/auth/register", {
    headers,
    data: {
      email: `restart-${Date.now()}@test.example`,
      password: "restart-test-password-123",
    },
  });
  assert.equal(registration.status(), 200);
  const content = "旧版独立原文。\n  换行和空格保持原样。  ";
  const created = await page.request.post(origin + "/api/entities", {
    headers,
    data: {
      kind: "record",
      topic: null,
      data: {
        title: "旧版独立思考",
        content,
        tags: "旧标签",
        status: "未整理",
      },
    },
  });
  assert.equal(created.status(), 201);
  const root = await created.json();
  await page.goto(origin);
  await page.getByRole("button", { name: "旧版独立思考", exact: true }).click();
  await page
    .getByRole("button", { name: "更多操作：梳理", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "完整追问工具", exact: true })
    .click();
  await page
    .getByLabel("你的回答", { exact: true })
    .fill("保留已有思考，并继续弄清条件");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "最让你犹豫的具体是什么？" }),
  ).toBeVisible();
  const reframeSaved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith("/api/guidance/" + root.id) &&
      r.request().method() === "PATCH" &&
      r.status() === 200,
  );
  await page.getByText("想不出来？", { exact: true }).click();
  await page.getByRole("button", { name: "换个问法", exact: true }).click();
  const reframed = (await (await reframeSaved).json()).data.current.text;
  await expect(page.locator(".current-question h2")).toHaveText(reframed);
  await page
    .getByLabel("你的回答", { exact: true })
    .fill("重启后继续写的回答草稿");
  await page.getByRole("button", { name: "先到这里", exact: true }).click();
  await expect(page.locator(".guided-heading")).toContainText("草稿已保存");
  let guideBefore = await (
    await page.request.get(origin + "/api/guidance/" + root.id)
  ).json();
  await page.getByRole("button", { name: "更多操作：梳理" }).click();
  await page
    .getByRole("menuitem", { name: "高级编辑与完整整理", exact: true })
    .click();
  await page.getByRole("button", { name: "新建思路卡片", exact: true }).click();
  await page.getByLabel("内容 *", { exact: true }).fill("重启后仍能看到的观点");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "往前走", exact: true }).click();
  await expect
    .poll(async () => {
      const r = await page.request.get(origin + "/api/entities/" + root.id);
      return (await r.json()).data.lastPosition;
    })
    .toBe("question");
  let outlineResponse = await page.request.patch(
    origin + "/api/guidance/" + root.id + "/outline",
    {
      headers,
      data: {
        action: "note",
        version: guideBefore.version,
        token: randomUUID(),
        category: "known",
        text: "重启后继续使用的整理草稿",
      },
    },
  );
  assert.equal(outlineResponse.status(), 200);
  guideBefore = await outlineResponse.json();
  outlineResponse = await page.request.patch(
    origin + "/api/guidance/" + root.id + "/outline",
    {
      headers,
      data: {
        action: "comparison",
        version: guideBefore.version,
        comparison: {
          options: [
            { id: "keep", text: "保留现状", sourceIds: [] },
            { id: "learn", text: "继续了解", sourceIds: [] },
          ],
          dimensions: [
            {
              id: "info",
              label: "还需要的信息",
              values: [
                { optionId: "keep", text: "", state: "unknown" },
                { optionId: "learn", text: "先了解关键条件", state: "known" },
              ],
            },
          ],
        },
      },
    },
  );
  assert.equal(outlineResponse.status(), 200);
  guideBefore = await (
    await page.request.get(origin + "/api/guidance/" + root.id)
  ).json();
  const before = await (
    await page.request.get(origin + "/api/entities")
  ).json();
  assert.equal(before.length, 2);
  await stop();
  await start();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "往前走", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const after = await (await page.request.get(origin + "/api/entities")).json();
  assert.deepEqual(after, before);
  const guideAfter = await (
    await page.request.get(origin + "/api/guidance/" + root.id)
  ).json();
  assert.deepEqual(guideAfter, guideBefore);
  await page.getByRole("button", { name: "返回当前追问", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的思考", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("当前整理成果")).toContainText(
    "重启后继续使用的整理草稿",
  );
  await expect(page.locator(".comparison-summary")).toContainText("继续了解");
  await page
    .getByRole("button", { name: "更多操作：梳理", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "完整追问工具", exact: true })
    .click();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "重启后继续写的回答草稿",
  );
  await expect(page.locator(".current-question h2")).toHaveText(reframed);
  assert.equal(guideAfter.data.current.strategies.length, 1);
  await page.getByRole("button", { name: "更多操作：梳理" }).click();
  await page
    .getByRole("menuitem", { name: "高级编辑与完整整理", exact: true })
    .click();
  const savedRoot = after.find((e) => e.id === root.id);
  assert.equal(savedRoot.data.content, content);
  assert.equal(savedRoot.data.tags, "旧标签");
  assert.equal(savedRoot.topic, null);
  assert.equal(savedRoot.data.refs.length, 1);
  await page.getByRole("button", { name: "理清楚", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重启后仍能看到的观点", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(
    page.getByText("界面版本：整理成果 · 2026.10.16-r6", { exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: production restart preserves authentication, complete old records, references, cards, versions, saved question, strategy history, answers, paused draft, saved outline, comparison and advanced location; UI version confirmed",
  );
} finally {
  await browser?.close();
  await stop();
  rmSync(directory, { recursive: true, force: true });
}
