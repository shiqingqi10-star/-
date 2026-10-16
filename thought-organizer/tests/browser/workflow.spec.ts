import { test, expect, Page, APIRequestContext } from "@playwright/test";
import { Entity, Kind } from "../../lib/schema";
const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
const headers = { Origin: origin };
const password = "safe-test-password-123";
async function account(page: Page) {
  const email =
    "ui-" +
    Date.now() +
    "-" +
    Math.random().toString(16).slice(2) +
    "@test.example";
  const r = await page.request.post("/api/auth/register", {
    headers,
    data: { email, password },
  });
  expect(r.ok()).toBeTruthy();
  return email;
}
async function create(
  request: APIRequestContext,
  kind: Kind,
  data: Record<string, unknown>,
  topic: string | null = null,
): Promise<Entity> {
  const r = await request.post("/api/entities", {
    headers,
    data: { kind, data, topic },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function get(request: APIRequestContext, id: string): Promise<Entity> {
  const r = await request.get("/api/entities/" + id);
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function advancedPage(page: Page) {
  await expect(
    page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .or(page.getByRole("group", { name: "思考阶段", exact: true })),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "梳理这个问题", exact: true })
      .isVisible()
  ) {
    await page.getByRole("button", { name: "更多操作：梳理" }).click();
    await page
      .getByRole("menuitem", { name: "高级编辑与完整整理", exact: true })
      .click();
  }
}
async function topicPage(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: title, exact: true }).first().click();
  await advancedPage(page);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
async function tab(page: Page, label: string) {
  await advancedPage(page);
  const stage =
    label === "原始想法"
      ? "写下来"
      : ["思路整理", "证据与验证"].includes(label)
        ? "理清楚"
        : "往前走";
  await page
    .getByRole("group", { name: "思考阶段", exact: true })
    .getByRole("button", { name: stage, exact: true })
    .click();
  if (label === "证据与验证")
    await page
      .getByRole("button", { name: "我有哪些依据", exact: true })
      .first()
      .click();
  if (label === "思路整理")
    await page.getByRole("button", { name: "分清观点", exact: true }).click();
  if (label === "问题与行动")
    await page.getByRole("button", { name: "还没想清楚", exact: true }).click();
  if (label === "判断与复盘") {
    if (
      !(await page
        .locator(".next-more")
        .evaluate((e: HTMLDetailsElement) => e.open))
    )
      await page.getByText("依据、确认与判断", { exact: true }).click();
    await page
      .getByRole("button", { name: "我现在怎么看", exact: true })
      .click();
  }
}
async function validationTab(page: Page) {
  await tab(page, "问题与行动");
  if (
    !(await page
      .locator(".next-more")
      .evaluate((e: HTMLDetailsElement) => e.open))
  )
    await page.getByText("依据、确认与判断", { exact: true }).click();
  await page.getByRole("button", { name: "验证结果", exact: true }).click();
}
async function editRow(page: Page, name: string) {
  await page
    .getByRole("button", { name: "更多操作：" + name, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function mobileNav(page: Page, name: string) {
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("dialog", { name: "导航" })
    .getByRole("button", {
      name: name === "全部思考" ? "我的思考" : name,
      exact: true,
    })
    .click();
  if (name === "全部思考")
    await page
      .getByRole("button", { name: "查看全部思考", exact: true })
      .click();
}

test("快速记录、草稿、真实保存和刷新恢复，退出后重新登录", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  const email = "login-" + Date.now() + "@test.example";
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码（至少10位）").fill(password);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(
    page.getByRole("heading", {
      name: "有什么问题，你想理清楚？",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("写下想法", { exact: true })
    .fill("先保存一个不需要分类的原始想法。");
  await expect(
    page.getByText("本地草稿 · 尚未保存", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("写下想法", { exact: true })).toHaveValue(
    "先保存一个不需要分类的原始想法。",
  );
  await page.getByRole("button", { name: "先存着" }).click();
  await expect(page.locator(".save-status")).toContainText("已保存到未整理");
  await page.reload();
  await page.getByRole("button", { name: "查看全部思考", exact: true }).click();
  await page.getByRole("button", { name: "未整理", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "先保存一个不需要分类的原始想法",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码（至少10位）").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "查看全部思考", exact: true }).click();
  await page.getByRole("button", { name: "未整理", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "先保存一个不需要分类的原始想法",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("高级整理位置、原有阶段、原文版本、卡片关系及关联跳转", async ({
  page,
}) => {
  await account(page);
  const t = await create(page.request, "topic", {
    title: "学习一个新领域",
    goal: "弄清最重要的基础",
    lastPosition: "evidence",
  });
  const r = await create(
    page.request,
    "record",
    { content: "先采访熟悉这个领域的人。", title: "访谈想法" },
    t.id,
  );
  const card = await create(
    page.request,
    "card",
    {
      title: "有人愿意帮忙",
      content: "导师可能愿意提供方向",
      type: "假设",
      sourceRefs: [r.id],
    },
    t.id,
  );
  const conclusion = await create(
    page.request,
    "card",
    {
      title: "先做一次访谈",
      content: "一次访谈可能降低学习成本",
      type: "结论",
    },
    t.id,
  );
  await create(
    page.request,
    "relation",
    {
      from: [card.id],
      to: [conclusion.id],
      type: "支持",
      reason: "需要验证导师意愿",
    },
    t.id,
  );
  await topicPage(page, "学习一个新领域");
  await expect(
    page.getByRole("button", { name: "理清楚", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "思考阶段" }).getByRole("button"),
  ).toHaveCount(3);
  await tab(page, "思路整理");
  await page.getByRole("button", { name: "有人愿意帮忙", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("导师可能愿意提供方向");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "访谈想法", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "写下来", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toContainText(
    "先采访熟悉这个领域的人。",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByLabel("原文 *").fill("先采访两位熟悉这个领域的人。");
  await save(page);
  await tab(page, "思路整理");
  await page
    .getByRole("button", { name: "看看它们怎么连接", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "思路逻辑图", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "查看关系：支持，需要验证导师意愿" })
    .press("Enter");
  await expect(page.getByRole("dialog")).toContainText("需要验证导师意愿");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await tab(page, "证据与验证");
  await validationTab(page);
  await expect
    .poll(async () => (await get(page.request, t.id)).data.lastPosition)
    .toBe("validation");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "往前走", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "验证结果", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const history = await page.request.get("/api/entities/" + r.id + "/history");
  expect((await history.json())[0].snapshot.data.content).toBe(
    "先采访熟悉这个领域的人。",
  );
});

test("可见字段编辑不会丢失折叠字段，搜索关联不用Ctrl，多类型保留数据", async ({
  page,
}) => {
  await account(page);
  const t = await create(page.request, "topic", { title: "验证产品想法" });
  const record = await create(
    page.request,
    "record",
    { title: "访谈记录", content: "对方说愿意试用。" },
    t.id,
  );
  const evidence = await create(
    page.request,
    "evidence",
    { title: "已有反馈", type: "访谈或反馈", answer: "愿意试用" },
    t.id,
  );
  const card = await create(
    page.request,
    "card",
    {
      title: "保留信息的假设",
      content: "愿意试用",
      type: "假设",
      details: "这段补充说明必须保留",
      tags: "重要,访谈",
      verification: "有争议",
      group: "用户",
      sourceRefs: [record.id],
    },
    t.id,
  );
  await topicPage(page, "验证产品想法");
  await editRow(page, "保留信息的假设");
  const editor = page.getByRole("dialog");
  await expect(editor.getByLabel("详细说明")).not.toBeVisible();
  await editor.getByLabel("内容 *").fill("愿意试用但暂不付费");
  await editor.getByText("与哪些内容有关", { exact: true }).click();
  await editor.getByLabel("关联证据", { exact: true }).fill("已有反馈");
  await editor
    .getByRole("group", { name: "关联证据搜索结果" })
    .getByRole("button", { name: /已有反馈/ })
    .click();
  await save(page);
  const saved = await get(page.request, card.id);
  expect(saved.data.details).toBe("这段补充说明必须保留");
  expect(saved.data.tags).toBe("重要,访谈");
  expect(saved.data.verification).toBe("有争议");
  expect(saved.data.sourceRefs).toEqual([record.id]);
  expect(saved.data.evidenceRefs).toEqual([evidence.id]);
  await tab(page, "证据与验证");
  await editRow(page, "已有反馈");
  await page.getByLabel("类型", { exact: true }).selectOption("数据或观察");
  await page.getByLabel("数值或观察").fill("两位用户愿意试用");
  await save(page);
  expect((await get(page.request, evidence.id)).data.answer).toBe("愿意试用");
  expect((await get(page.request, evidence.id)).data.observation).toBe(
    "两位用户愿意试用",
  );
});

test("问题、普通与验证任务、事件、证据、验证、复盘均可创建并编辑", async ({
  page,
}) => {
  await account(page);
  const t = await create(page.request, "topic", { title: "推进验证" });
  const h = await create(
    page.request,
    "card",
    { title: "目标假设", content: "用户愿意付费", type: "假设" },
    t.id,
  );
  await topicPage(page, "推进验证");
  await tab(page, "问题与行动");
  await page.getByRole("button", { name: "新建还没想清楚" }).click();
  await page.getByLabel("问题 *").fill("用户在哪些条件下愿意付费？");
  await save(page);
  await page.getByRole("button", { name: "下一步行动", exact: true }).click();
  await page
    .getByRole("button", { name: "新建下一步行动", exact: true })
    .click();
  await page.getByLabel("名称 *").fill("访谈三位用户");
  await page.getByRole("dialog").getByText("补充信息", { exact: true }).click();
  await page.getByLabel("任务类型").selectOption("验证任务");
  await page.getByLabel("具体行动").fill("分别做一次访谈");
  await page.getByLabel("判断条件").fill("记录具体的付费场景");
  await page.getByLabel("待验证假设", { exact: true }).fill("目标假设");
  await page
    .getByRole("group", { name: "待验证假设搜索结果" })
    .getByRole("button", { name: /目标假设/ })
    .click();
  await save(page);
  await page.getByRole("button", { name: "完成或处理：访谈三位用户" }).click();
  await expect(page.getByText("行动已完成，验证结果未记录")).toBeVisible();
  expect((await get(page.request, h.id)).data.type).toBe("假设");
  await page.getByRole("button", { name: "事件", exact: true }).click();
  await page.getByRole("button", { name: "新建事件" }).click();
  await page.getByLabel("名称 *").fill("访谈会议");
  await page.getByLabel("日期或时间").fill("2026-10-20T10:00");
  await save(page);
  await editRow(page, "访谈会议");
  await page.getByLabel("名称 *").fill("周二访谈会议");
  await save(page);
  await tab(page, "证据与验证");
  await page.getByRole("button", { name: "补充依据" }).click();
  await page.getByLabel("标题 *").fill("三人访谈反馈");
  await page.getByLabel("实际回答").fill("只有一位愿意付费");
  await save(page);
  await validationTab(page);
  await page.getByRole("button", { name: "记录验证结果" }).click();
  await page.getByLabel("验证名称 *").fill("访谈验证");
  await page.getByLabel("待验证假设 *", { exact: true }).fill("目标假设");
  await page
    .getByRole("group", { name: "待验证假设 *搜索结果" })
    .getByRole("button", { name: /目标假设/ })
    .click();
  await page.getByLabel("实际结果").fill("样本有限，暂时无法下结论");
  await save(page);
  await tab(page, "判断与复盘");
  await page.getByRole("button", { name: "记录当前判断" }).click();
  await page.getByLabel("标题 *").fill("第一轮复盘");
  await page.getByLabel("当前判断").fill("补充不同群体的访谈");
  await page.getByLabel("修改原因").fill("访谈样本过少");
  await save(page);
  await editRow(page, "第一轮复盘");
  await page.getByLabel("当前判断").fill("先补充五次访谈");
  await save(page);
  await expect(page.getByText("先补充五次访谈").first()).toBeVisible();
  const r = await page.request.get("/api/entities");
  const rows: Entity[] = await r.json();
  for (const kind of [
    "question",
    "task",
    "event",
    "evidence",
    "validation",
    "review",
  ])
    expect(rows.some((e) => e.kind === kind)).toBeTruthy();
});

test("选择模式、准确AI范围、空密钥、菜单和抽屉焦点返回", async ({ page }) => {
  await account(page);
  const t = await create(page.request, "topic", { title: "明确输入范围" });
  const card = await create(
    page.request,
    "card",
    { title: "选中的假设", content: "有需求", type: "假设" },
    t.id,
  );
  await create(
    page.request,
    "card",
    { title: "未选中的结论", content: "值得尝试", type: "结论" },
    t.id,
  );
  await topicPage(page, "明确输入范围");
  await expect(
    page.getByRole("checkbox", { name: "选择选中的假设" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "选择内容", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择选中的假设" }).check();
  await expect(page.getByText("已选择 1 项")).toBeVisible();
  const ai = page.getByRole("button", { name: "AI助手", exact: true });
  await ai.click();
  const drawer = page.getByRole("dialog", { name: "AI助手", exact: true });
  await expect(drawer.getByText("AI尚未配置", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "开始分析" })).toBeDisabled();
  await drawer.getByText("选中内容 · 包含 2 项", { exact: true }).click();
  await expect(
    drawer.getByText("思路卡片 · 选中的假设", { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByText("未选中的结论", { exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(ai).toBeFocused();
  await page.getByRole("button", { name: "退出选择" }).click();
  const menu = page.getByRole("button", { name: "更多操作：选中的假设" });
  await menu.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "编辑", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "置顶", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await editRow(page, "选中的假设");
  await page.getByLabel("内容 *").fill("键盘关闭后的本地草稿");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await editRow(page, "选中的假设");
  await expect(page.getByLabel("内容 *")).toHaveValue("键盘关闭后的本地草稿");
  await page.keyboard.press("Escape");
  const aiResponse = await page.request.post("/api/analyses", {
    headers,
    data: { topic: t.id, ids: [card.id], mode: "整理思路" },
  });
  expect(aiResponse.status()).toBe(503);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "配置说明", exact: true }).click();
  const help = page.getByRole("dialog", { name: "AI配置说明", exact: true });
  await expect(help).toContainText("管理员");
  await expect(help).not.toContainText(/DEEPSEEK|\.env|环境变量|\/workspace/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "配置说明", exact: true }),
  ).toBeFocused();
});

test("搜索定位、历史恢复、回收站、个人导入导出和用户隔离", async ({
  page,
  browser,
}) => {
  await account(page);
  const t = await create(page.request, "topic", { title: "数据恢复测试" });
  const r = await create(
    page.request,
    "record",
    { title: "保留原文", content: "最初的原文" },
    t.id,
  );
  await page.request.patch("/api/entities/" + r.id, {
    headers,
    data: {
      topic: t.id,
      version: r.version,
      data: { ...r.data, content: "修改后的原文" },
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "搜索全部内容", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索全部内容" }).fill("保留原文");
  await page.getByRole("button", { name: "保留原文", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("修改后的原文");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "历史版本", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "历史版本" })).toContainText(
    "最初的原文",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "恢复此版本" })
    .click();
  expect((await get(page.request, r.id)).data.content).toBe("最初的原文");
  await page.getByRole("button", { name: "更多操作：保留原文" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  expect((await get(page.request, r.id)).data.content).toBe("最初的原文");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByText("今日已用", { exact: true })).toBeVisible();
  const exportJSON = await page.request.get("/api/export");
  const body = await exportJSON.json();
  expect(body.schemaVersion).toBe(1);
  const exportMD = await page.request.get("/api/export?format=md");
  expect(await exportMD.text()).toContain("最初的原文");
  await page.getByLabel("恢复个人备份").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(body)),
  });
  await expect(page.getByRole("status")).toContainText("备份已恢复");
  const other = await browser.newContext();
  await account(other.pages()[0] || (await other.newPage()));
  expect((await other.request.get("/api/entities/" + r.id)).status()).toBe(404);
  expect((await other.request.get("/api/admin")).status()).toBe(403);
  await other.close();
});

test("手机导航、弹窗焦点、长标题、逻辑图局部滚动及页面截图", async ({
  page,
}) => {
  await account(page);
  const t = await create(page.request, "topic", {
    title: "把零散的想法整理成可以验证的方向",
    goal: "找到最值得先验证的问题",
    focus: "准备一次小范围访谈",
  });
  for (const [i, type] of ["假设", "观点或推断", "结论"].entries())
    await create(
      page.request,
      "card",
      {
        title: [
          "用户愿意试用，但付费意愿还不确定",
          "先问清楚使用场景，再讨论方案",
          "第一步是访谈，而不是继续完善全部功能",
        ][i],
        content: "这是较长的真实测试正文，完整内容可以点击列表项查看。".repeat(
          12,
        ),
        type,
        today: i === 0,
      },
      t.id,
    );
  await create(
    page.request,
    "question",
    { title: "哪些用户现在就遇到了这个问题？", status: "思考中", today: true },
    t.id,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "有什么问题，你想理清楚？",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "data/visual-home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "今日关注", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "今日关注", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "哪些用户现在就遇到了这个问题？",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我的思考", exact: true }).click();
  await page
    .getByRole("button", {
      name: "把零散的想法整理成可以验证的方向",
      exact: true,
    })
    .click();
  await advancedPage(page);
  await page.screenshot({
    path: "data/visual-topic-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "data/visual-topic-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "看看它们怎么连接", exact: true })
    .click();
  const graph = page.getByRole("region", { name: "可滚动逻辑图" });
  expect(
    await graph.evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await mobileNav(page, "我的思考");
  await page.screenshot({
    path: "data/visual-home-mobile.png",
    fullPage: true,
  });
  await mobileNav(page, "全部思考");
  await page.getByRole("button", { name: "新建一个思考", exact: true }).click();
  await expect(page.getByLabel("名称 *")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "新建一个思考", exact: true }),
  ).toBeFocused();
});

test("编辑冲突保留草稿，必填验证定位，以及跨来源写入保护", async ({
  page,
  request,
}) => {
  await account(page);
  const t = await create(page.request, "topic", { title: "并发与表单验证" });
  const q = await create(
    page.request,
    "question",
    { title: "该等什么信息？", status: "思考中", known: "隐藏信息不能丢失" },
    t.id,
  );
  await topicPage(page, "并发与表单验证");
  await tab(page, "问题与行动");
  await editRow(page, "该等什么信息？");
  await page.getByLabel("问题 *").fill("我的未保存修改");
  await page.request.patch("/api/entities/" + q.id, {
    headers,
    data: {
      topic: t.id,
      version: q.version,
      data: { ...q.data, title: "另一个窗口的修改" },
    },
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "冲突",
  );
  await expect(page.getByLabel("问题 *")).toHaveValue("我的未保存修改");
  expect((await get(page.request, q.id)).data.title).toBe("另一个窗口的修改");
  await page.keyboard.press("Escape");
  await tab(page, "证据与验证");
  await validationTab(page);
  await page.getByRole("button", { name: "记录验证结果" }).click();
  await page.getByLabel("验证名称 *").fill("缺少目标的验证");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByLabel("待验证假设 *", { exact: true })).toBeFocused();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "必填",
  );
  await page.keyboard.press("Escape");
  const r = await request.post("/api/auth/register", {
    headers: { Origin: "https://evil.example" },
    data: { email: "evil@test.example", password },
  });
  expect(r.status()).toBe(403);
});

test("无AI完整手动场景：独立原文、观点、疑问、关联行动、依据、判断及真实思考变化", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await account(page);
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "主要导航" }).getByRole("button"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "有什么问题，你想理清楚？" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "继续上次的思考" }),
  ).toHaveCount(0);
  const original =
    "我想参加周末的活动，但怕占用时间，又担心错过认识新朋友的机会。\n\n  这段空白和补充文字也要完整保存。  ";
  await page.getByLabel("写下想法", { exact: true }).fill(original);
  await page.getByRole("button", { name: "开始梳理", exact: true }).click();
  await advancedPage(page);
  await expect(page.getByRole("group", { name: "思考阶段" })).toBeVisible();
  const rows: Entity[] = await (await page.request.get("/api/entities")).json();
  const root = rows.find((e) => e.kind === "record")!;
  expect(root.data.content).toBe(original);
  expect(root.topic).toBeNull();
  expect(rows.some((e) => e.kind === "topic")).toBe(false);
  await tab(page, "原始想法");
  await expect(
    page.getByRole("button", { name: "点击原文编辑", exact: true }),
  ).toHaveText(original);
  await page.getByRole("button", { name: "开始整理", exact: true }).click();
  await page.getByRole("button", { name: "新建思路卡片", exact: true }).click();
  await page.getByLabel("内容 *").fill("认识新朋友是我想获得的机会");
  await page.getByLabel("类型", { exact: true }).selectOption("观点或推断");
  await save(page);
  await page.getByRole("button", { name: "新建思路卡片", exact: true }).click();
  await page.getByLabel("内容 *").fill("参加活动可能占用过多时间");
  await page.getByLabel("类型", { exact: true }).selectOption("假设");
  await save(page);
  await page
    .getByRole("button", { name: "参加活动可能占用过多时间", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "留下疑问", exact: true })
    .click();
  await page.getByLabel("问题 *").fill("活动安排和参加人群是什么？");
  await save(page);
  await tab(page, "问题与行动");
  await page
    .getByRole("button", { name: "活动安排和参加人群是什么？", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "为这个疑问安排下一步", exact: true })
    .click();
  await page.getByLabel("名称 *").fill("先向组织者了解情况。");
  await save(page);
  await expect(page.locator(".save-status")).toContainText(
    "这个疑问已经有了推进方法",
  );
  await tab(page, "思路整理");
  await page
    .getByRole("button", { name: "参加活动可能占用过多时间", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "补充依据", exact: true })
    .click();
  await page.getByLabel("标题 *").fill("组织者回复：活动约两小时");
  await page
    .getByLabel("实际回答")
    .fill("活动约两小时，参加者主要是附近的年轻人。");
  await save(page);
  await expect(page.locator(".save-status")).toContainText(
    "这个判断有了可追溯的依据",
  );
  await page
    .getByRole("button", { name: "参加活动可能占用过多时间", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "组织者回复：活动约两小时",
  );
  await page.keyboard.press("Escape");
  await tab(page, "判断与复盘");
  await page.getByRole("button", { name: "记录当前判断", exact: true }).click();
  await page.getByLabel("标题 *").fill("周末活动的暂定判断");
  await page
    .getByLabel("当前判断")
    .fill("可以参加前两小时，再根据体验决定是否留下。");
  await page.getByLabel("判断变化").fill("从担心时间，变为先了解后决定。");
  await page
    .getByLabel("修改原因")
    .fill("组织者说明了活动时长。仍需确认到场人群。");
  await save(page);
  await expect(page.locator(".save-status")).toContainText(
    "你留下了改变判断的理由",
  );
  const saved: Entity[] = await (
    await page.request.get("/api/entities")
  ).json();
  expect(saved.find((e) => e.id === root.id)!.data.content).toBe(original);
  const q = saved.find((e) => e.kind === "question")!,
    task = saved.find((e) => e.kind === "task")!;
  expect(task.data.questionRefs).toEqual([q.id]);
  expect(
    saved.find((e) => e.kind === "card" && e.data.type === "假设")!.data
      .verification,
  ).toBe("未核实");
  expect(saved.find((e) => e.kind === "evidence")!.data.status).toBe("待核实");
  expect(saved.filter((e) => e.kind === "topic")).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "往前走", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "周末活动的暂定判断", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "看看我的思考变化", exact: true })
    .click();
  const changes = page.getByRole("dialog", {
    name: "看看我的思考变化",
    exact: true,
  });
  await expect(changes).toContainText("我想参加周末的活动");
  await expect(changes).toContainText("认识新朋友是我想获得的机会");
  await expect(changes).toContainText("活动安排和参加人群是什么？");
  await expect(changes).toContainText("先向组织者了解情况。");
  await expect(changes).toContainText("可以参加前两小时");
  await expect(changes).toContainText("不代表完整还原全部思考过程");
  await expect(
    changes.getByText("正在读取已有版本…", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "data/visual-changes-v2-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "看看我的思考变化" }),
  ).toBeFocused();
  await tab(page, "思路整理");
  await page.screenshot({
    path: "data/visual-thinking-v2-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "data/visual-thinking-v2-mobile.png",
    fullPage: true,
  });
  await mobileNav(page, "设置");
  await expect(
    page.getByText("界面版本：思考空间 · 2026.10.16-r5", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "data/visual-version-r2-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("保存失败保留完整草稿；独立AI范围不泄露无关思考，保存成功前不跳转", async ({
  page,
}) => {
  await account(page);
  await page.goto("/");
  const original = "保存失败也不能丢失的原文。\n完整内容。";
  await page.getByLabel("写下想法", { exact: true }).fill(original);
  await page.route("**/api/guidance", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "测试保存失败，请重试" }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "开始梳理", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "测试保存失败" }),
  ).toBeVisible();
  await expect(page.getByLabel("写下想法", { exact: true })).toHaveValue(
    original,
  );
  await expect(page.getByRole("group", { name: "思考阶段" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("写下想法", { exact: true })).toHaveValue(
    original,
  );
  await page.unroute("**/api/guidance");
  await create(page.request, "record", {
    title: "无关思考",
    content: "这段无关私人内容不能进入分析",
  });
  await page.getByRole("button", { name: "开始梳理", exact: true }).click();
  await advancedPage(page);
  await expect(page.getByRole("group", { name: "思考阶段" })).toBeVisible();
  await page.getByRole("button", { name: "AI助手", exact: true }).click();
  const ai = page.getByRole("dialog", { name: "AI助手", exact: true });
  await expect(ai.getByText("AI尚未配置", { exact: true })).toBeVisible();
  await expect(
    ai.getByRole("button", { name: "开始分析", exact: true }),
  ).toBeDisabled();
  await ai.getByText("当前独立思考 · 包含 1 项", { exact: true }).click();
  await ai.locator(".scope-preview details summary").click();
  await expect(ai).toContainText("保存失败也不能丢失的原文");
  await expect(ai).not.toContainText("这段无关私人内容不能进入分析");
  await expect(
    ai.getByRole("button", { name: "帮我分清这段想法", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "AI助手", exact: true }),
  ).toBeFocused();
  const rootRows: Entity[] = await (
    await page.request.get("/api/entities")
  ).json();
  const root = rootRows.find(
    (e) => e.kind === "record" && e.data.content === original,
  )!;
  for (const title of ["选中的卡片", "不选的卡片"]) {
    const current = await get(page.request, root.id);
    const r = await page.request.post(`/api/thoughts/${root.id}/items`, {
      headers,
      data: {
        kind: "card",
        version: current.version,
        data: {
          title,
          content: title + "的完整正文",
          type: "观点或推断",
          sourceRefs: [root.id],
        },
      },
    });
    expect(r.status()).toBe(201);
  }
  await page.getByRole("button", { name: "刷新内容" }).click();
  await expect(
    page.getByRole("button", { name: "不选的卡片", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "选择内容", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "选择选中的卡片", exact: true })
    .check();
  await page.getByRole("button", { name: "AI助手", exact: true }).click();
  await ai.getByText("选中内容 · 包含 2 项", { exact: true }).click();
  await expect(ai).toContainText("选中的卡片");
  await expect(
    ai.getByText("思路卡片 · 不选的卡片", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("AI历史建议先展示五条，展开不丢内容，过期禁止采纳，预览不会自动写入", async ({
  page,
}) => {
  await account(page);
  const t = await create(page.request, "topic", { title: "AI历史展示测试" });
  const raw = await create(
    page.request,
    "record",
    { content: "这里是实际已有原文" },
    t.id,
  );
  const suggestions = Array.from({ length: 7 }, (_, i) => ({
    id: `test-s${i}`,
    kind: "card",
    data: {
      localId: `draft${i}`,
      title: `历史建议${i + 1}`,
      content: `需要确认的观点${i + 1}`,
      type: "观点或推断",
      sourceRefs: [raw.id],
    },
    status: "pending",
    target: null,
    feedback: "",
  }));
  let stale = false;
  await page.route(`**/api/analyses?topic=${t.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "test-history",
          topic: t.id,
          created_at: raw.createdAt,
          stale,
          snapshot: [raw],
          result: {
            understanding: "这是离线测试用的已存分析展示，不调用真实模型。",
            clarifications: [],
          },
          suggestions,
        },
      ]),
    }),
  );
  await topicPage(page, "AI历史展示测试");
  await page.getByRole("button", { name: "AI助手", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "AI助手", exact: true });
  await expect(drawer.locator(".ai-suggestion")).toHaveCount(5);
  await drawer.getByRole("button", { name: "展开全部 7 条建议" }).click();
  await expect(drawer.locator(".ai-suggestion")).toHaveCount(7);
  await drawer
    .locator(".ai-suggestion")
    .first()
    .getByRole("button", { name: "预览并采纳" })
    .click();
  const preview = page.getByRole("dialog", { name: /采纳预览/ });
  await expect(preview.getByLabel("内容 *")).toHaveValue("需要确认的观点1");
  const rows: Entity[] = await (await page.request.get("/api/entities")).json();
  expect(rows.filter((e) => e.kind === "card")).toHaveLength(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  stale = true;
  await page.getByRole("button", { name: "刷新内容" }).click();
  await expect(page.locator(".save-status")).toContainText("已刷新");
  await page.getByRole("button", { name: "AI助手", exact: true }).click();
  await expect(drawer).toContainText("分析已过期");
  await expect(
    drawer.getByRole("button", { name: "预览并采纳" }).first(),
  ).toBeDisabled();
});

test("原文保存成功但列表刷新失败时仍确认保存并进入真实记录，避免重复创建", async ({
  page,
}) => {
  await account(page);
  await page.goto("/");
  await page
    .getByLabel("写下想法", { exact: true })
    .fill("已经真正保存的原文。");
  await page.route("**/api/entities?trash=1", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "列表暂时无法读取" }),
    }),
  );
  await page.getByRole("button", { name: "开始梳理", exact: true }).click();
  await advancedPage(page);
  await expect(page.getByRole("group", { name: "思考阶段" })).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "想法已保存，但列表暂时无法更新" }),
  ).toBeVisible();
  const rows: Entity[] = await (await page.request.get("/api/entities")).json();
  expect(rows.filter((e) => e.kind === "record")).toHaveLength(1);
  expect(rows[0].data.content).toBe("已经真正保存的原文。");
});

test("登录和注册收到HTML或空响应时显示可读错误，版本在登录前可辨认", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("界面版本：思考空间 · 2026.10.16-r5", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("response-error@test.example");
  await page.getByLabel("密码（至少10位）").fill("test-safe-password-123");
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 500,
      contentType: "text/html",
      body: "<html>internal database is locked</html>",
    }),
  );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTP 500" }),
  ).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue(
    "response-error@test.example",
  );
  await expect(page.locator("body")).not.toContainText(
    "Unexpected end of JSON input",
  );
  await expect(page.locator("body")).not.toContainText("internal database");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.route("**/api/auth/register", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.getByRole("button", { name: "注册并登录", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "服务暂时繁忙" }),
  ).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue(
    "response-error@test.example",
  );
});

test("首页实际只显示最近三项，可继续主题和独立记录且不显示归档内容", async ({
  page,
}) => {
  await account(page);
  await create(page.request, "topic", { title: "较早的主题" });
  for (const title of ["独立思考一", "独立思考二", "独立思考三"])
    await create(page.request, "record", {
      title,
      content: title + "的原文",
      status: "未整理",
    });
  await create(page.request, "record", {
    title: "归档内容",
    content: "不要放在首页",
    archived: true,
  });
  await page.goto("/");
  await expect(page.locator(".recent-thought")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "归档内容", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "主要导航" }).getByRole("button"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "独立思考三", exact: true }).click();
  await advancedPage(page);
  await expect(
    page.getByRole("group", { name: "思考阶段" }).getByRole("button"),
  ).toHaveCount(3);
});
