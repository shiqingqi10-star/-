import { test, expect } from "@playwright/test";
test("桌面端真实保存、主题、卡片、关系、搜索、回收站与重新登录", async ({
  page,
}) => {
  const email = "browser-" + Date.now() + "@test.example";
  const password = "safe-test-password-123";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码（至少10位）").fill(password);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(
    page.getByRole("heading", { name: "首页", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("快速记录（只需内容）")
    .fill("如果用户愿意尝试，方案可能可行。");
  await page.getByRole("button", { name: "保存到收集箱" }).click();
  await expect(page.getByText("原文已保存到收集箱")).toBeVisible();
  await page
    .getByRole("button", { name: "新建主题", exact: true })
    .first()
    .click();
  await page.getByLabel("名称 *").fill("真实浏览器主题");
  await page.getByLabel("目标", { exact: true }).fill("验证完整手动流程");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .getByRole("button", { name: "真实浏览器主题", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "真实浏览器主题", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("AI未配置：其他功能正常可用。")).toBeVisible();
  await page.getByRole("button", { name: "新增思路卡片", exact: true }).click();
  await page.getByLabel("摘要", { exact: true }).fill("用户意愿");
  await page.getByLabel("内容 *").fill("用户愿意尝试");
  await page.getByLabel("类型", { exact: true }).selectOption("假设");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "新增思路卡片", exact: true }).click();
  await page.getByLabel("摘要", { exact: true }).fill("可行性结论");
  await page.getByLabel("内容 *").fill("方案可能可行");
  await page.getByLabel("类型", { exact: true }).selectOption("结论");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .getByRole("button", { name: "建立多前提关系", exact: true })
    .click();
  await page
    .getByLabel("前提卡片编号（支持多个） *")
    .selectOption({
      label: await page
        .getByLabel("前提卡片编号（支持多个） *")
        .locator("option")
        .filter({ hasText: "用户意愿" })
        .innerText(),
    });
  await page
    .getByLabel("结论卡片编号 *")
    .selectOption({
      label: await page
        .getByLabel("结论卡片编号 *")
        .locator("option")
        .filter({ hasText: "可行性结论" })
        .innerText(),
    });
  await page.getByLabel("为什么这样连接").fill("需要先验证用户意愿");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "逻辑图", exact: true }).click();
  await expect(page.getByRole("img", { name: "思路逻辑图" })).toBeVisible();
  await expect(page.getByText("需要先验证用户意愿").first()).toBeVisible();
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByLabel("按标题、内容、标签、状态、主题搜索").fill("用户意愿");
  await expect(
    page.getByRole("button", { name: "用户意愿", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .locator("article")
    .filter({
      has: page.getByRole("button", { name: "用户意愿", exact: true }),
    })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "恢复", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码（至少10位）").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "真实浏览器主题", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "真实浏览器主题", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("手机布局与同来源API保护", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "思路整理器" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const r = await request.post("/api/auth/register", {
    headers: { Origin: "https://evil.example" },
    data: { email: "evil@test.example", password: "safe-test-password" },
  });
  expect(r.status()).toBe(403);
});
test("真实API完成验证、证据、复盘、账号隔离、备份与手机主题布局", async ({
  page,
  browser,
}) => {
  const headers = { Origin: "http://localhost:3000" };
  const request = page.request;
  await request.post("/api/auth/register", {
    headers,
    data: {
      email: "api-" + Date.now() + "@test.example",
      password: "api-safe-password-123",
    },
  });
  const create = async (
    kind: string,
    data: Record<string, unknown>,
    topic: string | null = null,
  ) => {
    const r = await request.post("/api/entities", {
      headers,
      data: { kind, data, topic },
    });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const topic = await create("topic", {
    title: "验证完整流程",
    goal: "保持当前判断",
    status: "验证中",
  });
  const card = await create(
    "card",
    { content: "用户会付费", type: "假设" },
    topic.id,
  );
  const question = await create(
    "question",
    {
      title: "谁会付费",
      status: "等待信息",
      waitingFor: "访谈反馈",
      refs: [card.id],
    },
    topic.id,
  );
  const task = await create(
    "task",
    {
      title: "访谈三人",
      type: "验证任务",
      status: "待开始",
      questionRefs: [question.id],
      hypothesisRefs: [card.id],
      due: "2026-10-12",
    },
    topic.id,
  );
  await create(
    "event",
    {
      title: "访谈会议",
      taskRefs: [task.id],
      date: "2026-10-13T10:00",
      status: "准备中",
    },
    topic.id,
  );
  const complete = await request.patch("/api/entities/" + task.id, {
    headers,
    data: {
      data: { ...task.data, status: "已完成" },
      topic: topic.id,
      version: task.version,
    },
  });
  expect(complete.ok()).toBeTruthy();
  const stale = await request.patch("/api/entities/" + task.id, {
    headers,
    data: { data: task.data, topic: topic.id, version: task.version },
  });
  expect(stale.status()).toBe(409);
  const evidence = await create(
    "evidence",
    {
      title: "访谈反馈",
      type: "访谈或反馈",
      answer: "只在免费时使用",
      supports: [],
      opposes: [card.id],
      status: "存在冲突",
    },
    topic.id,
  );
  await create(
    "validation",
    {
      title: "付费意愿验证",
      hypothesisRefs: [card.id],
      taskRefs: [task.id],
      evidenceRefs: [evidence.id],
      actual: "三人都只愿免费试用",
      direction: "反对",
      sample: "三名潜在用户",
    },
    topic.id,
  );
  await create(
    "review",
    {
      title: "判断更新",
      judgment: "先验证其他用户",
      change: "降低信心",
      changeReason: "访谈样本不足",
      evidenceRefs: [evidence.id],
    },
    topic.id,
  );
  const other = await browser.newContext();
  await other.request.post("/api/auth/register", {
    headers,
    data: {
      email: "other-" + Date.now() + "@test.example",
      password: "api-safe-password-123",
    },
  });
  expect((await other.request.get("/api/entities/" + card.id)).status()).toBe(
    404,
  );
  expect(
    (
      await other.request.post("/api/entities", {
        headers,
        data: {
          kind: "task",
          topic: null,
          data: { title: "外部引用", hypothesisRefs: [card.id] },
        },
      })
    ).status(),
  ).toBe(404);
  expect((await other.request.get("/api/admin")).status()).toBe(403);
  await other.close();
  expect(
    (
      await request.post("/api/analyses", {
        headers,
        data: { topic: topic.id, ids: [], mode: "检查推导" },
      })
    ).status(),
  ).toBe(503);
  const exported = await request.get("/api/export");
  expect(exported.ok()).toBeTruthy();
  const body = await exported.json();
  expect(body.schemaVersion).toBe(1);
  expect(
    (await request.post("/api/import", { headers, data: body })).ok(),
  ).toBeTruthy();
  const searched = await request.get(
    "/api/search?q=" + encodeURIComponent("判断更新"),
  );
  expect((await searched.json()).length).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "首页", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "验证完整流程", exact: true })
    .first()
    .click();
  await expect(page.getByText("AI未配置：其他功能正常可用。")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "data/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "决策与复盘", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "判断更新", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "data/desktop.png", fullPage: true });
});
