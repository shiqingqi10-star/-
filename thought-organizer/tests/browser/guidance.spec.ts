import { test, expect, Page } from "@playwright/test";
const headers = {
  Origin: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
};
const sample = "我想参加周末的活动，但怕占用时间，又担心错过认识新朋友的机会。";
async function signup(page: Page) {
  const r = await page.request.post("/api/auth/register", {
    headers,
    data: {
      email: `guide-${Date.now()}-${Math.random()}@test.example`,
      password: "test-safe-password-123",
    },
  });
  expect(r.ok()).toBeTruthy();
  await page.goto("/");
}
async function respond(page: Page, text: string, button = "继续") {
  await page.getByLabel("你的回答", { exact: true }).fill(text);
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue("");
}
async function start(page: Page) {
  await page.getByLabel("写下想法", { exact: true }).fill(sample);
  await page.getByRole("button", { name: "开始梳理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "你最希望得到什么？", exact: true }),
  ).toBeVisible();
}
test("两页真实核心场景、候选预览确认、暂停恢复和改答核对，桌面与手机截图", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page);
  await expect(
    page.getByRole("heading", { name: "有什么问题，你想理清楚？" }),
  ).toBeVisible();
  await expect(page.locator(".continue-section")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "data/guidance-r3-home-desktop.png",
    fullPage: true,
  });
  await start(page);
  await expect(page.getByRole("group", { name: "思考阶段" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "开启AI追问", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "配置说明", exact: true }).click();
  const help = page.getByRole("dialog", { name: "AI配置说明", exact: true });
  await expect(help).toContainText("管理员");
  await expect(help).not.toContainText(/DEEPSEEK|\.env|环境变量|\/workspace/);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "data/guidance-r3-question-desktop.png",
    fullPage: true,
  });
  await respond(page, "我想认识有共同兴趣的新朋友");
  await expect(
    page.getByRole("heading", { name: "最让你犹豫的具体是什么？" }),
  ).toBeVisible();
  await respond(page, "担心活动占用整个周末，影响休息");
  await expect(
    page.getByRole("heading", { name: "什么信息让你产生这个判断？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "哪个信息弄清楚后，你会更容易决定？" }),
  ).toBeVisible();
  await page.getByLabel("你的回答", { exact: true }).fill("不知道活动参加人群");
  await page.getByRole("button", { name: "暂时不知道", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "现在可以做的最小一步是什么？" }),
  ).toBeVisible();
  await page
    .getByLabel("你的回答", { exact: true })
    .fill("向组织者了解人群和活动时长");
  await page.getByRole("button", { name: "先到这里", exact: true }).click();
  await expect(page.locator(".guided-heading")).toContainText("草稿已保存");
  const pausedRoot = (
    await (await page.request.get("/api/entities")).json()
  )[0];
  const pausedSession = await (
    await page.request.get("/api/guidance/" + pausedRoot.id)
  ).json();
  expect(pausedSession.data.paused).toBe(true);
  await page.reload();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "向组织者了解人群和活动时长",
  );
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "想先看看目前理清了什么吗？" }),
  ).toBeVisible();
  const entities = await (await page.request.get("/api/entities")).json();
  expect(entities).toHaveLength(1);
  expect(entities[0].data.content).toBe(sample);
  await page
    .getByRole("button", { name: "看看目前理清了什么", exact: true })
    .first()
    .click();
  await expect(page.locator(".guided-results")).toContainText(
    "不知道活动参加人群",
  );
  await page.getByRole("button", { name: "确认整理结果", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "预览并确认整理结果" });
  await expect(preview).toBeVisible();
  expect(await (await page.request.get("/api/entities")).json()).toHaveLength(
    1,
  );
  await preview
    .getByLabel("成果内容 1", { exact: true })
    .fill("想认识有共同兴趣的朋友");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "确认整理结果", exact: true }),
  ).toBeFocused();
  expect(await (await page.request.get("/api/entities")).json()).toHaveLength(
    1,
  );
  await page.getByRole("button", { name: "确认整理结果", exact: true }).click();
  await preview
    .getByLabel("成果内容 1", { exact: true })
    .fill("想认识有共同兴趣的朋友");
  await preview.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(preview).toHaveCount(0);
  const formal = await (await page.request.get("/api/entities")).json();
  expect(formal).toHaveLength(5);
  expect(
    formal.some(
      (e: { kind: string; data: { type?: string } }) =>
        e.kind === "task" && e.data.type === "普通任务",
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "确认整理结果", exact: true }).click();
  await expect(preview).toContainText("没有可确认的新内容");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "data/guidance-r3-results-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "data/guidance-r3-results-mobile.png",
    fullPage: true,
  });
  await page.getByText("前面的回答 · 5 条", { exact: true }).click();
  await page
    .locator(".answer-history article")
    .first()
    .getByRole("button", { name: "修改回答", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "修改前面的回答" });
  await edit
    .getByLabel("修改回答内容")
    .fill("优先认识同行，而不是尽量多认识人");
  await edit.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.locator(".answer-history")).toContainText("请核对这一条");
  await expect(page.locator(".guided-results")).toContainText(
    "原判断保留，没有自动改写",
  );
  const after = await (await page.request.get("/api/entities")).json();
  expect(after.filter((e: { kind: string }) => e.kind !== "record")).toEqual(
    formal.filter((e: { kind: string }) => e.kind !== "record"),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "返回我的思考", exact: true }).click();
  await page
    .getByRole("button", { name: entities[0].data.title, exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guided-results > details")).not.toHaveAttribute(
    "open",
    "",
  );
  await page
    .getByRole("button", { name: "看看目前理清了什么", exact: true })
    .first()
    .click();
  await expect(page.locator(".guided-results")).toContainText("优先认识同行");
  expect(errors).toEqual([]);
});
test("重复点击和失败重试不会重复创建，HTML错误保留草稿，手机当前问题不溢出", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("写下想法", { exact: true }).fill(sample);
  await page.route("**/api/guidance", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "<html>internal sqlite error</html>",
    }),
  );
  await page.getByRole("button", { name: "开始梳理", exact: true }).click();
  await expect(page.locator(".notice.error[role=alert]")).toContainText(
    "服务暂时繁忙",
  );
  await expect(page.getByLabel("写下想法", { exact: true })).toHaveValue(
    sample,
  );
  await expect(page.getByRole("heading", { name: "梳理这个问题" })).toHaveCount(
    0,
  );
  await page.unroute("**/api/guidance");
  await page
    .getByRole("button", { name: "开始梳理", exact: true })
    .evaluate((e: HTMLButtonElement) => {
      e.click();
      e.click();
    });
  await expect(
    page.getByRole("heading", { name: "你最希望得到什么？" }),
  ).toBeVisible();
  expect(await (await page.request.get("/api/entities")).json()).toHaveLength(
    1,
  );
  const root = (await (await page.request.get("/api/entities")).json())[0];
  await page.getByLabel("你的回答", { exact: true }).fill("希望有更清楚的选择");
  await page.route(`**/api/guidance/${root.id}`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({ status: 500, body: "" });
    else await route.continue();
  });
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".notice.error[role=alert]")).toContainText(
    "HTTP 500",
  );
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "希望有更清楚的选择",
  );
  await page.reload();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "希望有更清楚的选择",
  );
  await page.unroute(`**/api/guidance/${root.id}`);
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "最让你犹豫的具体是什么？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "给我一点提示", exact: true }).click();
  await expect(page.locator(".question-hint")).toContainText("预设思考角度");
  await page.getByRole("button", { name: "换个问法", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /关于「让你犹豫的具体情况」/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expect(page.locator(".guided-results > details")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.screenshot({
    path: "data/guidance-r3-question-mobile.png",
    fullPage: true,
  });
});
test("明确开启AI后仍在当前页，失败保留回答并可切回基础；实际范围不含无关思考", async ({
  page,
}) => {
  await signup(page);
  await page.request.post("/api/entities", {
    headers,
    data: {
      kind: "record",
      topic: null,
      data: { title: "无关私人思考", content: "这段不可以默认发送" },
    },
  });
  await start(page);
  const me = await (await page.request.get("/api/me")).json();
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { ...me, aiConfigured: true } }),
  );
  await page.getByRole("button", { name: "刷新内容", exact: true }).click();
  await page.route("**/api/guidance/*/ai", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "测试AI超时，请使用基础引导" },
    }),
  );
  await page.getByRole("button", { name: "开启AI追问", exact: true }).click();
  await expect(page.locator(".notice.error[role=alert]")).toContainText(
    "测试AI超时",
  );
  await expect(
    page.getByRole("heading", { name: "你最希望得到什么？" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await respond(page, "想结识新朋友");
  await page.getByText("本次AI输入范围", { exact: true }).click();
  await expect(page.locator(".scope-disclosure")).not.toContainText(
    "这段不可以默认发送",
  );
  await expect(page.locator(".scope-disclosure")).toContainText("想结识新朋友");
});
