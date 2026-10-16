import { test, expect, Page } from "@playwright/test";
import { verifyOutlineFlow } from "./outline-flow";
const headers = {
  Origin: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
};
const sample = "我想参加周末的活动，但怕占用时间，又担心错过认识新朋友的机会。";
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
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }),
  ).toBeVisible();
  await openQuestionTool(page);
  await expect(
    page.getByRole("heading", { name: "你最希望得到什么？", exact: true }),
  ).toBeVisible();
}
async function focusedCoverage(page: Page) {
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
  await page
    .getByLabel("写下想法", { exact: true })
    .fill("我在思考今天买不买这件衣服。");
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
  await expect(page.locator(".current-question h2")).toHaveText(
    "你最希望得到什么？",
  );
  const selectScene = async (label: string) => {
    await page
      .getByRole("button", { name: "更多操作：梳理", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "调整引导", exact: true }).click();
    await page.getByText("换一个适合这件事的引导", { exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
  };
  await selectScene("考虑一次购买");
  await respond(page, "想更亮眼、更快乐。");
  await respond(page, "我想到的场景是舞会。");
  await expect(page.locator(".current-question h2")).toHaveText(
    "近期有确定的使用机会吗？",
  );
  await expect(page.locator(".answer-options input:checked")).toHaveCount(0);
  await expect(page.getByLabel("目前的线索")).toContainText("想更亮眼、更快乐");
  await expect(page.getByLabel("目前的线索")).toContainText("舞会");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "data/r5-current-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "data/r5-current-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText("已保存的AI输入", { exact: true })).toHaveCount(
    0,
  );
  const all = await (await page.request.get("/api/entities")).json();
  const root = all.find(
    (e: { data: { content?: string } }) =>
      e.data.content === "我在思考今天买不买这件衣服。",
  );
  const before = await (
    await page.request.get("/api/guidance/" + root.id)
  ).json();
  let aiCalls = 0;
  const watch = (req: { url(): string; method(): string }) => {
    if (req.url().includes("/ai") && req.method() === "POST") aiCalls++;
  };
  page.on("request", watch);
  await page.getByRole("button", { name: "使用范围", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "使用范围", exact: true }),
  ).toContainText("尚未因打开此处而发送");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "使用范围", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "更多操作：梳理", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "AI运行记录", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "AI运行记录", exact: true }),
  ).toContainText("还没有AI运行记录");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "前面的回答", exact: true }).click();
  await page.getByLabel("定位回答轮次").selectOption("1");
  await expect(
    page.getByRole("dialog", { name: "前面的回答", exact: true }),
  ).toContainText("舞会");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看成果", exact: true }).click();
  expect(
    (await (await page.request.get("/api/guidance/" + root.id)).json()).version,
  ).toBe(before.version);
  expect(aiCalls).toBe(0);
  page.off("request", watch);
  await page.getByLabel("有，已经有明确安排", { exact: true }).check();
  await page
    .getByLabel("你的回答", { exact: true })
    .fill("下周六有舞会，时长还没核对");
  await page.getByRole("button", { name: "先到这里", exact: true }).click();
  await expect(page.locator(".guided-heading")).toContainText("草稿已保存");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }).or(
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
  await expect(
    page.getByLabel("有，已经有明确安排", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "下周六有舞会，时长还没核对",
  );
  await page.getByText("想不出来？", { exact: true }).click();
  await page.getByRole("button", { name: "换个问法", exact: true }).click();
  await expect(
    page.getByLabel("有，已经有明确安排", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "下周六有舞会，时长还没核对",
  );
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".current-question h2")).toHaveText(
    "它符合那次使用的需要吗？",
  );
  await expect(page.locator(".answer-options input:checked")).toHaveCount(0);
  await page.getByLabel("已有信息表明适合", { exact: true }).check();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".current-question h2")).toHaveText(
    "这次支出在你愿意承担的范围内吗？",
  );
  await page.getByLabel("在我愿意承担的范围内", { exact: true }).check();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".compare-options")).toBeVisible();
  await page.getByLabel("暂缓决定", { exact: true }).check();
  await page.getByLabel("你的回答", { exact: true }).fill("先了解价格再决定");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".stage-closure")).toBeVisible();
  await page.getByRole("button", { name: "查看成果", exact: true }).click();
  await expect(page.locator(".expanded-guide-results")).toContainText(
    "先了解价格再决定",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "data/r5-results-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "data/r5-results-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("目前的线索")
    .getByRole("button", { name: "修改理解", exact: true })
    .first()
    .click();
  const correction = page.getByRole("dialog", {
    name: "修改理解",
    exact: true,
  });
  await correction
    .getByLabel("修改理解内容")
    .fill("更重视自己穿着开心，而不是别人的目光");
  await correction
    .getByRole("button", { name: "保存理解", exact: true })
    .click();
  await expect(correction).toHaveCount(0);
  await expect(page.getByLabel("目前的线索")).toContainText("自己穿着开心");
  const final = await (
    await page.request.get("/api/guidance/" + root.id)
  ).json();
  expect(final.data.answers[0].text).toBe("想更亮眼、更快乐。");
  expect(final.data.answers[2].response).toEqual({
    selected: ["yes"],
    detail: "下周六有舞会，时长还没核对",
  });
  await page.getByRole("button", { name: "返回我的思考", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "返回记录入口", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "返回记录入口", exact: true })
      .click();
  await page
    .getByLabel("写下想法", { exact: true })
    .fill("周末参加活动还是休息？");
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
  await expect(page.locator(".current-question h2")).toHaveText(
    "你最希望得到什么？",
  );
  await selectScene("在几个选项间决定");
  await respond(page, "参加活动或在家休息");
  await expect(
    page.locator(".answer-options input[type=checkbox]"),
  ).toHaveCount(6);
  await page.getByLabel("时间与精力", { exact: true }).check();
  await page.getByLabel("体验与个人偏好", { exact: true }).check();
  await page.getByLabel("你的回答", { exact: true }).fill("也想留一点安静时间");
  await page.getByRole("button", { name: "先到这里", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }).or(
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
  await expect(page.getByLabel("时间与精力", { exact: true })).toBeChecked();
  await expect(
    page.getByLabel("体验与个人偏好", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("你的回答", { exact: true })).toHaveValue(
    "也想留一点安静时间",
  );
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
}

test("两页真实核心场景、候选预览确认、暂停恢复和改答核对，桌面与手机截图", async ({
  page,
}) => {
  test.setTimeout(60000);
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
  await page.getByText("想不出来？", { exact: true }).click();
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
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }).or(
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
    .getByRole("button", { name: "查看成果", exact: true })
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
  await page.getByRole("button", { name: "前面的回答", exact: true }).click();
  await page
    .getByRole("dialog", { name: "前面的回答", exact: true })
    .getByRole("button", { name: "修改回答", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "修改前面的回答" });
  await edit
    .getByLabel("修改回答内容")
    .fill("优先认识同行，而不是尽量多认识人");
  await edit.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await page.getByRole("button", { name: "前面的回答", exact: true }).click();
  await page.getByLabel("定位回答轮次").selectOption("1");
  await expect(
    page.getByRole("dialog", { name: "前面的回答", exact: true }),
  ).toContainText("需要核对");
  await page.keyboard.press("Escape");
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
  await openQuestionTool(page);
  await expect(page.locator(".expanded-guide-results")).toHaveCount(0);
  await page
    .getByRole("button", { name: "查看成果", exact: true })
    .first()
    .click();
  await expect(page.locator(".guided-results")).toContainText("优先认识同行");
  await focusedCoverage(page);
  await verifyOutlineFlow(page);
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
    .getByRole("button", { name: "开始整理", exact: true })
    .evaluate((e: HTMLButtonElement) => {
      e.click();
      e.click();
    });
  await openQuestionTool(page);
  await expect(
    page.getByRole("heading", { name: "你最希望得到什么？" }),
  ).toBeVisible();
  expect(await (await page.request.get("/api/entities")).json()).toHaveLength(
    1,
  );
  const root = (await (await page.request.get("/api/entities")).json())[0];
  await page.getByLabel("你的回答", { exact: true }).fill("希望有更清楚的选择");
  await page.route(`**/api/guidance/${root.id}?compact=1`, async (route) => {
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
  await expect(
    page.getByRole("heading", { name: "梳理这个问题", exact: true }).or(
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
    "希望有更清楚的选择",
  );
  await page.unroute(`**/api/guidance/${root.id}?compact=1`);
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "最让你犹豫的具体是什么？" }),
  ).toBeVisible();
  await page.getByText("想不出来？", { exact: true }).click();
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
  await openQuestionTool(page);
  await expect(page.locator(".expanded-guide-results")).toHaveCount(0);
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
  await page.route("**/api/guidance/*/ai?compact=1", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "测试AI超时，请使用基础引导" },
    }),
  );
  await page.getByRole("button", { name: "开启AI追问", exact: true }).click();
  await expect(page.locator(".notice.error[role=alert]")).toContainText(
    "测试AI超时",
  );
  await openQuestionTool(page);
  await expect(
    page.getByRole("heading", { name: "你最希望得到什么？" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await respond(page, "想结识新朋友");
  await page.getByRole("button", { name: "使用范围", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "使用范围", exact: true }),
  ).not.toContainText("这段不可以默认发送");
  await page
    .getByRole("dialog", { name: "使用范围", exact: true })
    .getByText(/第1轮/)
    .click();
  await expect(
    page.getByRole("dialog", { name: "使用范围", exact: true }),
  ).toContainText("想结识新朋友");
  await page.keyboard.press("Escape");
  const roots = await (await page.request.get("/api/entities")).json();
  const root = roots.find(
    (e: { data: { content: string } }) => e.data.content === sample,
  );
  const saved = await (
    await page.request.get("/api/guidance/" + root.id)
  ).json();
  const next = {
    ...saved,
    version: saved.version + 1,
    data: {
      ...saved.data,
      mode: "ai",
      current: {
        ...saved.data.current,
        mode: "ai",
        text: "这次你想先确认活动的哪一点？",
      },
      runs: [
        ...saved.data.runs,
        {
          id: "test-partial-analysis",
          stale: false,
          createdAt: new Date().toISOString(),
          snapshot: JSON.stringify({
            entities: [root],
            answers: saved.data.answers,
          }),
          result: JSON.stringify({
            candidateWarnings: [
              {
                text: "来源不明的整理建议",
                reason: "来源无法核对，未加入成果。",
              },
            ],
          }),
        },
      ],
    },
  };
  await page.unroute("**/api/guidance/*/ai?compact=1");
  await page.route("**/api/guidance/*/ai?compact=1", (route) =>
    route.fulfill({ json: { session: next, stale: false } }),
  );
  await page.getByRole("button", { name: "开启AI追问", exact: true }).click();
  await expect(page.locator(".current-question h2")).toHaveText(
    "这次你想先确认活动的哪一点？",
  );
  await expect(page.locator(".ai-source-warning")).toContainText("未加入成果");
  await expect(page.locator(".notice.error[role=alert]")).toHaveCount(0);
  await page.getByText("查看未加入的建议", { exact: true }).click();
  await expect(page.locator(".ai-source-warning")).toContainText(
    "来源不明的整理建议",
  );
  expect((await (await page.request.get("/api/entities")).json()).length).toBe(
    roots.length,
  );
});
