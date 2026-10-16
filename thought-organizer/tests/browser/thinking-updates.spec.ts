import { test, expect, Page } from "@playwright/test";
const headers = {
  Origin: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
};
async function openQuestionTool(page: Page) {
  if (!(await page.locator(".current-question").isVisible())) {
    await page
      .getByRole("button", { name: "更多操作：梳理", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "完整追问工具", exact: true })
      .click();
  }
  await expect(page.locator(".current-question")).toBeVisible();
}
async function signup(page: Page) {
  const r = await page.request.post("/api/auth/register", {
    headers,
    data: {
      email: `r4-${Date.now()}-${Math.random()}@test.example`,
      password: "test-only-password-123",
    },
  });
  expect(r.ok()).toBeTruthy();
  await page.goto("/");
}
async function start(
  page: Page,
  text = "我想做收费小工具，因为大家应该都有这个需求。",
) {
  await page.getByLabel("写下想法", { exact: true }).fill(text);
  await page.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(
    page
      .locator(".organized-space")
      .or(page.locator(".current-question"))
      .or(page.locator(".notice.error[role=alert]")),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .isVisible()
  )
    await openQuestionTool(page);
  await expect(page.locator(".current-question h2")).toContainText(
    "你最希望得到什么",
  );
}
async function scene(page: Page, label: string) {
  await page
    .getByRole("button", { name: "更多操作：梳理", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "调整引导", exact: true }).click();
  await page.getByText("换一个适合这件事的引导", { exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "调整引导", exact: true }),
  ).toContainText("当前为");
  await page.keyboard.press("Escape");
}
async function choose(page: Page, assessment: string) {
  await page
    .getByRole("button", { name: "更多操作：梳理", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "调整引导", exact: true }).click();
  await page.getByText("这条回答怎样看（可选）", { exact: true }).click();
  await page.getByLabel("回答的情况", { exact: true }).selectOption(assessment);
  await page.keyboard.press("Escape");
}
async function selectRef(page: Page, label: string, title: string) {
  await page.getByLabel(label, { exact: true }).fill(title);
  await page
    .getByRole("group", { name: label + "搜索结果", exact: true })
    .getByRole("button")
    .filter({ hasText: title })
    .click();
}
test("换策略不循环且保留回答，切场景暂存恢复，外部未知转确认方法可无方法结束", async ({
  page,
}) => {
  await signup(page);
  await start(page);
  await page
    .getByLabel("你的回答", { exact: true })
    .fill("还没有提交，但不能丢失的思考。");
  const seen = new Set<string>();
  await page.getByText("想不出来？", { exact: true }).click();
  for (let i = 0; i < 9; i++) {
    await page.getByRole("button", { name: "换个问法", exact: true }).click();
    await expect(page.locator(".question-caption")).toBeVisible();
    await expect(page.getByLabel("你的回答", { exact: true })).toBeEnabled();
    const question = await page.locator(".current-question h2").innerText();
    expect(seen.has(question)).toBeFalsy();
    seen.add(question);
    await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
      "还没有提交，但不能丢失的思考。",
    );
  }
  await expect(
    page.getByRole("button", { name: "换个问法", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .or(
        page.getByRole("heading", {
          name: "有什么问题，你想理清楚？",
          exact: true,
        }),
      ),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .isVisible()
  )
    await openQuestionTool(page);
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "还没有提交，但不能丢失的思考。",
  );
  await scene(page, "小项目是否值得做");
  await expect(page.locator(".current-question h2")).toHaveText(
    "谁会在什么情况下需要这个小工具？",
  );
  await page
    .getByRole("button", { name: "更多操作：梳理", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "调整引导", exact: true }).click();
  await page.getByText("暂存的回答", { exact: true }).click();
  await expect(page.locator(".parked-answers")).toContainText(
    "还没有提交，但不能丢失的思考。",
  );
  await page.keyboard.press("Escape");
  await page.getByText("想不出来？", { exact: true }).click();
  await page.getByRole("button", { name: "我缺少信息", exact: true }).click();
  await expect(page.locator(".current-question h2")).toHaveText(
    "可以向谁了解，或用什么方式确认这条信息？",
  );
  await expect(page.getByLabel("目前的线索")).toContainText("未知");
  await page.getByRole("button", { name: "暂时不知道", exact: true }).click();
  await expect(page.locator(".current-question h2")).toContainText(
    "看看目前理清了什么",
  );
  const rows = await (await page.request.get("/api/entities")).json();
  expect(rows).toHaveLength(1);
  const guide = await (
    await page.request.get("/api/guidance/" + rows[0].id)
  ).json();
  expect(guide.data.answers.map((a: { status: string }) => a.status)).toEqual([
    "unknown",
    "unknown",
  ]);
  expect(
    guide.data.agenda.every((n: { status: string }) => n.status !== "clear"),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "data/r4-guidance-mobile.png",
    fullPage: true,
  });
});
test("从推测到访谈结果再更新原判断，依据历史回接，重复保存不重复记录", async ({
  page,
}) => {
  test.setTimeout(60000);
  await signup(page);
  await start(page);
  await scene(page, "小项目是否值得做");
  await page
    .getByLabel("你的回答", { exact: true })
    .fill("大家应该愿意用这个收费小工具");
  await choose(page, "inferred");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".current-question h2")).toHaveText(
    "可以向谁了解，或用什么方式确认这条信息？",
  );
  await page.getByLabel("你的回答", { exact: true }).fill("访谈三位潜在使用者");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page
    .getByRole("button", { name: "查看成果", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "确认整理结果", exact: true }).click();
  await page
    .getByRole("dialog", { name: "预览并确认整理结果" })
    .getByRole("button", { name: "确认保存", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let rows = await (await page.request.get("/api/entities")).json();
  const j = rows.find((e: { kind: string }) => e.kind === "card"),
    task = rows.find((e: { kind: string }) => e.kind === "task");
  expect(j.data.type).toBe("假设");
  await page
    .getByRole("button", { name: "我做完这一步了", exact: true })
    .click();
  const result = page.getByRole("dialog", {
    name: "我做完这一步了",
    exact: true,
  });
  await selectRef(page, "记录哪一步的结果", task.data.title);
  await result
    .getByLabel("实际发生了什么？", { exact: true })
    .fill("访谈了三位实际使用者");
  await result
    .getByText("获得的信息、影响与原先判断条件", { exact: true })
    .click();
  await result
    .getByLabel("获得了什么信息？", { exact: true })
    .fill("三位都说现有免费办法已经够用");
  await result
    .getByLabel("你认为对原判断有什么影响？", { exact: true })
    .fill("付费需求可能比设想的弱");
  await selectRef(page, "哪些判断需要重新核对", j.data.title);
  await result
    .getByRole("button", { name: "保存", exact: true })
    .evaluate((e: HTMLButtonElement) => {
      e.click();
      e.click();
    });
  await expect(result).toHaveCount(0);
  rows = await (await page.request.get("/api/entities")).json();
  expect(rows.find((e: { id: string }) => e.id === j.id).data.content).toBe(
    j.data.content,
  );
  expect(
    rows.find((e: { id: string }) => e.id === j.id).data.verification,
  ).toBe("未核实");
  expect(
    rows.filter((e: { kind: string }) => e.kind === "validation"),
  ).toHaveLength(0);
  expect(
    rows.filter((e: { kind: string }) => e.kind === "evidence"),
  ).toHaveLength(1);
  await page.locator(".living-judgments > summary").click();
  await expect(page.locator(".living-judgments")).toContainText(
    "完成行动本身不证明假设成立",
  );
  await page
    .locator(".living-judgments")
    .getByRole("button", { name: "需要调整", exact: true })
    .click();
  await page
    .locator(".living-judgments")
    .getByRole("button", { name: "修改这条看法", exact: true })
    .click();
  const change = page.getByRole("dialog", {
    name: "我改变想法了",
    exact: true,
  });
  await change
    .getByRole("textbox", { name: "我现在怎么想", exact: true })
    .fill("暂缓收费工具，先寻找现有办法还解决不了的问题");
  await change
    .getByRole("textbox", { name: "为什么这样想（可留空）", exact: true })
    .fill("实际访谈发现大家已有够用的免费办法");
  await change.getByText("条件、不确定与依据", { exact: true }).click();
  await change
    .getByRole("textbox", { name: "什么条件会影响判断", exact: true })
    .fill("出现重复而未解决的实际需求时再评估");
  await change.getByRole("button", { name: "保存", exact: true }).click();
  await expect(change).toHaveCount(0);
  await expect(page.locator(".living-judgments")).toContainText("暂缓收费工具");
  await page
    .locator(".living-judgments")
    .getByRole("button", { name: "看法变化", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "这条看法的变化" }),
  ).toContainText("大家应该愿意用这个收费小工具");
  await expect(page.getByRole("dialog")).toContainText("实际访谈发现");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "我有新信息", exact: true }).click();
  const info = page.getByRole("dialog", { name: "我有新信息", exact: true });
  await info
    .getByLabel("新信息", { exact: true })
    .fill("另一类使用者提出了尚未解决的需求");
  await selectRef(page, "与哪些看法有关", j.data.title);
  await info.getByLabel("这条信息与看法的关系").selectOption("supports");
  await info.getByRole("button", { name: "保存", exact: true }).click();
  await expect(info).toHaveCount(0);
  await expect(page.locator(".living-judgments")).toContainText("加入了新材料");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "data/r4-updates-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .or(
        page.getByRole("heading", {
          name: "有什么问题，你想理清楚？",
          exact: true,
        }),
      ),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .isVisible()
  )
    await openQuestionTool(page);
  await page.getByRole("button", { name: "查看成果", exact: true }).click();
  await page.locator(".living-judgments > summary").click();
  await expect(page.locator(".living-judgments")).toContainText("暂缓收费工具");
  await expect(page.locator(".living-judgments")).toContainText("加入了新材料");
});
test("三种场景无AI可选、保存失败保留更新草稿、冲突不覆盖其他版本", async ({
  page,
}) => {
  await signup(page);
  await start(page, "我想决定周末怎么安排");
  await scene(page, "在几个选项间决定");
  await expect(page.locator(".current-question h2")).toHaveText(
    "你目前在考虑哪些选择？",
  );
  await page.getByLabel("你的回答", { exact: true }).fill("参加活动或在家休息");
  await choose(page, "clear");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".current-question h2")).toHaveText(
    "比较这些选择时，你最不愿意牺牲的是什么？",
  );
  await scene(page, "理解一次结果或失败");
  await expect(page.locator(".current-question h2")).toHaveText(
    "在结果发生之前，你原本期待什么？",
  );
  await page.getByRole("button", { name: "查看成果", exact: true }).click();
  await page.getByRole("button", { name: "我改变想法了", exact: true }).click();
  const form = page.getByRole("dialog", { name: "我改变想法了", exact: true });
  await form
    .getByRole("textbox", { name: "我现在怎么想", exact: true })
    .fill("这段看法保存失败也不能丢");
  await page.route("**/api/guidance/*/updates?compact=1", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form.locator("[role=alert]")).toContainText("草稿仍保留");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .or(
        page.getByRole("heading", {
          name: "有什么问题，你想理清楚？",
          exact: true,
        }),
      ),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .isVisible()
  )
    await openQuestionTool(page);
  await page.getByRole("button", { name: "查看成果", exact: true }).click();
  await page.getByRole("button", { name: "我改变想法了", exact: true }).click();
  await expect(
    form.getByRole("textbox", { name: "我现在怎么想", exact: true }),
  ).toHaveValue("这段看法保存失败也不能丢");
  await page.unroute("**/api/guidance/*/updates?compact=1");
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.locator(".living-judgments > summary").click();
  await expect(page.locator(".living-judgments")).toContainText(
    "这段看法保存失败也不能丢",
  );
  const judgments = await (await page.request.get("/api/entities")).json();
  const judgment = judgments.find((e: { kind: string }) => e.kind === "review");
  await page
    .locator(".living-judgments")
    .getByRole("button", { name: "修改这条看法", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "我现在怎么想", exact: true })
    .fill("我正在编辑的新看法");
  const concurrent = await page.request.patch("/api/entities/" + judgment.id, {
    headers,
    data: {
      version: judgment.version,
      topic: judgment.topic,
      data: { ...judgment.data, judgment: "另一个窗口已保存的看法" },
    },
  });
  expect(concurrent.ok()).toBeTruthy();
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form.locator("[role=alert]")).toBeVisible();
  expect(
    (await (await page.request.get("/api/entities/" + judgment.id)).json()).data
      .judgment,
  ).toBe("另一个窗口已保存的看法");
  await expect(
    form.getByRole("textbox", { name: "我现在怎么想", exact: true }),
  ).toHaveValue("我正在编辑的新看法");
  await form
    .getByRole("button", { name: "载入最新记录核对", exact: true })
    .click();
  await expect(form).toContainText("另一个窗口已保存的看法");
  await form
    .getByRole("button", { name: "已核对，保留我的输入", exact: true })
    .click();
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
