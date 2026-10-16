import { Page, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
// Offline provider fixture around the real persistence service. The production app
// has no testing endpoint or mock fallback, and its test-server key remains empty.
export async function verifyOutlineFlow(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "返回我的思考", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "返回记录入口", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "返回记录入口", exact: true })
      .click();
  const me = await (await page.request.get("/api/me")).json();
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { ...me, aiConfigured: true } }),
  );
  await page.getByRole("button", { name: "刷新内容", exact: true }).click();
  await expect(page.locator(".quick-ai-note")).toContainText("会使用AI");
  const meta = JSON.parse(
    readFileSync(process.env.PLAYWRIGHT_TEST_DB_META!, "utf8"),
  ) as { directory: string; database: string };
  expect(basename(meta.directory).startsWith("thought-ui-")).toBeTruthy();
  expect(dirname(resolve(meta.database))).toBe(resolve(meta.directory));
  process.env.DATABASE_PATH = meta.database;
  process.env.DEEPSEEK_API_KEY = "offline-browser-provider-only";
  const g = await import("../../lib/guidance");
  const o = await import("../../lib/outline");
  const db = await import("../../lib/db");
  const { compactGuide } = await import("../../lib/guide-records");
  let calls = 0;
  const seenInputs: unknown[] = [];
  await page.route("**/api/guidance/*/outline?compact=1", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    calls++;
    const body = route.request().postDataJSON();
    const id = new URL(route.request().url()).pathname.split("/")[3];
    const s = g.getGuide(me.id, id);
    let output: unknown;
    if (body.intent === "initial")
      output = {
        changes: [
          ["goal", "认识新朋友"],
          ["concern", "担心影响作业安排"],
          ["condition", "需要权衡活动收益与作业时间"],
          ["unknown", "活动时间和作业安排还待补充"],
        ].map(([category, text]) => ({
          targetId: null,
          category,
          text,
          reason: "根据这段原文暂作理解",
          sources: [{ kind: "entity", id }],
        })),
        question: null,
      };
    else if (body.intent === "question")
      output = {
        changes: [],
        question: {
          text: "周末作业至少需要留出多少时间？",
          direction: "basis",
          hint: "可以按已有作业安排估计，不知道就如实留下。",
          explanation: "先确认影响是否参加活动的重要时间条件。",
        },
      };
    else
      output = {
        changes: [
          {
            targetId: body.focusId,
            category: "concern",
            text: "先保留两小时完成作业，再核对活动时间。",
            reason: "补充了作业所需时间，其他理解保持。",
            sources: [
              { kind: "answer", id: s.data.answers.at(-1)!.id },
              { kind: "entity", id },
            ],
          },
        ],
        question: null,
      };
    const result = await o.generateOutline(
      me.id,
      id,
      body,
      async (_url, opts) => {
        seenInputs.push(
          JSON.parse(JSON.parse(String(opts?.body)).messages[1].content),
        );
        return Response.json({
          choices: [{ message: { content: JSON.stringify(output) } }],
          usage: { total_tokens: 20 },
        });
      },
    );
    await route.fulfill({
      json: { ...result, session: compactGuide(result.session) },
    });
  });
  try {
    await page
      .getByLabel("写下想法", { exact: true })
      .fill("我想参加周末活动，但怕影响作业，又怕错过认识新朋友的机会。");
    await page
      .getByRole("button", { name: "开始整理", exact: true })
      .evaluate((b: HTMLButtonElement) => {
        b.click();
        b.click();
      });
    await expect(
      page.getByRole("heading", { name: "我的思考", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".outline-note")).toHaveCount(4);
    await expect(page.locator(".current-question")).toHaveCount(0);
    expect(calls).toBe(1);
    const rows = await (await page.request.get("/api/entities")).json();
    const root = rows.find(
      (r: { data: { content?: string } }) =>
        r.data.content ===
        "我想参加周末活动，但怕影响作业，又怕错过认识新朋友的机会。",
    );
    expect(root).toBeTruthy();
    const state = await (
      await page.request.get("/api/guidance/" + root.id)
    ).json();
    expect(state.data.answers).toHaveLength(0);
    expect(
      state.data.outline.entries.every(
        (e: { targetId: string | null }) => !e.targetId,
      ),
    ).toBeTruthy();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: "data/r6-initial-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "data/r6-initial-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "使用范围", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "使用范围", exact: true }),
    ).toContainText("实际发送");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "使用范围", exact: true }),
    ).toBeFocused();
    await page
      .locator(".outline-note")
      .first()
      .getByRole("button", { name: "查看原话与依据", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "原话与依据", exact: true }),
    ).toContainText(root.data.content);
    await page.keyboard.press("Escape");
    expect(calls).toBe(1);
    const goal = page.locator(".outline-note").filter({ hasText: "想获得的" });
    await goal
      .getByRole("button", { name: "修改理解：认识新朋友", exact: true })
      .click();
    const edit = page.getByRole("dialog", { name: "修改理解", exact: true });
    await edit
      .getByLabel("整理内容", { exact: true })
      .fill("希望结识有共同兴趣的人");
    await page.screenshot({
      path: "data/r6-local-edit-desktop.png",
      fullPage: true,
    });
    await edit.getByRole("button", { name: "保存", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await expect(goal).toContainText("我修改的AI理解");
    await expect(
      page.locator(".outline-note").filter({ hasText: "担心影响作业安排" }),
    ).toBeVisible();
    expect(calls).toBe(1);
    const concern = page
      .locator(".outline-note")
      .filter({ hasText: "担心影响作业安排" });
    await concern
      .getByRole("button", { name: "继续想这一点", exact: true })
      .click();
    await expect(page.locator(".current-question h2")).toHaveText(
      "周末作业至少需要留出多少时间？",
    );
    expect(calls).toBe(2);
    await page
      .getByLabel("你的回答", { exact: true })
      .fill("至少需要留出两小时完成作业");
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.getByLabel("待核对的局部更新")).toContainText(
      "先保留两小时",
    );
    await expect(page.locator(".current-question")).toHaveCount(0);
    expect(calls).toBe(3);
    await expect(
      page.locator(".outline-note").filter({ hasText: "担心影响作业安排" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "核对、编辑并接受", exact: true })
      .click();
    const change = page.getByRole("dialog", {
      name: "核对这条更新",
      exact: true,
    });
    await change
      .getByLabel("候选更新内容")
      .fill("先留出两小时写作业，再决定参加多久。");
    await change
      .getByRole("button", { name: "确认这条更新", exact: true })
      .click();
    await expect(change).toHaveCount(0);
    await expect(goal).toContainText("希望结识有共同兴趣的人");
    await expect(page.getByLabel("当前整理成果")).toContainText(
      "先留出两小时写作业",
    );
    await page.getByRole("button", { name: "补充信息", exact: true }).click();
    const information = page.getByRole("dialog", {
      name: "补充信息",
      exact: true,
    });
    await information
      .getByLabel("整理内容", { exact: true })
      .fill("活动地点离学校不远，具体时长仍需向组织者了解。");
    await information
      .getByLabel("保存后让AI提出相关更新", { exact: true })
      .uncheck();
    await information
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await expect(information).toHaveCount(0);
    expect(calls).toBe(3);
    await page
      .getByRole("button", { name: "更多操作：梳理", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "比较选择", exact: true }).click();
    const compare = page.getByRole("dialog", { name: "比较选择", exact: true });
    await compare.getByLabel("比较选择1").fill("参加周末活动");
    await compare.getByLabel("比较选择2").fill("留在学校完成作业");
    await compare.getByLabel("比较方面1").fill("时间安排");
    await compare
      .locator(".comparison-cell textarea")
      .first()
      .fill("活动时长仍需确认");
    await compare
      .getByRole("button", { name: "保存比较", exact: true })
      .click();
    await expect(compare).toHaveCount(0);
    expect(calls).toBe(3);
    // Confirming a draft creates a formal record only after the explicit preview.
    const note = page
      .locator(".outline-note")
      .filter({ hasText: "先留出两小时写作业" });
    await note.getByRole("button", { name: /更多操作：整理/ }).click();
    await page
      .getByRole("menuitem", { name: "预览并确认记录", exact: true })
      .click();
    const preview = page.getByRole("dialog", {
      name: "预览并确认记录",
      exact: true,
    });
    await preview.getByLabel("确认记录类型").selectOption("review");
    await preview
      .getByRole("button", { name: "确认保存", exact: true })
      .evaluate((b: HTMLButtonElement) => {
        b.click();
        b.click();
      });
    await expect(preview).toHaveCount(0);
    const after = await (await page.request.get("/api/entities")).json();
    expect(
      after.filter((e: { kind: string }) => e.kind === "review"),
    ).toHaveLength(1);
    await page.getByRole("button", { name: "先到这里", exact: true }).click();
    await expect(page.locator(".organized-heading")).toContainText(
      "可以下次直接继续",
    );
    const saved = await (
      await page.request.get("/api/guidance/" + root.id)
    ).json();
    await page.reload();
    await expect(page.getByLabel("当前整理成果")).toContainText(
      "希望结识有共同兴趣的人",
    );
    await expect(page.locator(".comparison-summary")).toContainText(
      "参加周末活动",
    );
    await expect(page.locator(".current-question")).toHaveCount(0);
    expect(calls).toBe(3);
    const reopened = await (
      await page.request.get("/api/guidance/" + root.id)
    ).json();
    expect(reopened.version).toBe(saved.version);
    expect(reopened.data.outline.entries).toEqual(saved.data.outline.entries);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: "data/r6-return-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "data/r6-return-mobile.png",
      fullPage: true,
    });
    expect(seenInputs).toHaveLength(3);
  } finally {
    db.closeDatabase();
    process.env.DEEPSEEK_API_KEY = "";
    await page.unroute("**/api/guidance/*/outline?compact=1");
  }
}
