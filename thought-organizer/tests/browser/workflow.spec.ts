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
async function topicPage(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: title, exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
async function tab(page: Page, label: string) {
  await page
    .getByRole("group", { name: "主题内容", exact: true })
    .getByRole("button", { name: label, exact: true })
    .click();
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
    .getByRole("button", { name, exact: true })
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
    page.getByRole("heading", { name: "首页", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("快速记录", { exact: true })
    .fill("先保存一个不需要分类的原始想法。");
  await expect(
    page.getByText("本地草稿 · 尚未保存", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("快速记录", { exact: true })).toHaveValue(
    "先保存一个不需要分类的原始想法。",
  );
  await page.getByRole("button", { name: "保存想法" }).click();
  await expect(page.getByRole("status")).toContainText("已保存到收集箱");
  await page.reload();
  await page.getByRole("button", { name: "收集箱", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "先保存一个不需要分类的原始想法。",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码（至少10位）").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "收集箱", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "先保存一个不需要分类的原始想法。",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("主题记忆、五个标签、原文版本、卡片关系及关联跳转", async ({ page }) => {
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
    page.getByRole("button", { name: "证据与验证", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "主题内容" }).getByRole("button"),
  ).toHaveCount(5);
  await tab(page, "思路整理");
  await page.getByRole("button", { name: "有人愿意帮忙", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("导师可能愿意提供方向");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "访谈想法", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "原始想法", exact: true }).first(),
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
  await page.getByRole("button", { name: "逻辑图", exact: true }).click();
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
  await page.getByRole("button", { name: "验证", exact: true }).click();
  await expect
    .poll(async () => (await get(page.request, t.id)).data.lastPosition)
    .toBe("validation");
  await page.reload();
  await page
    .getByRole("button", { name: "学习一个新领域", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "证据与验证", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "验证", exact: true }),
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
  await editor.getByText("关联内容", { exact: true }).click();
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
  await page.getByRole("button", { name: "新建待思考问题" }).click();
  await page.getByLabel("问题 *").fill("用户在哪些条件下愿意付费？");
  await save(page);
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByLabel("名称 *").fill("访谈三位用户");
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
  await page.getByRole("button", { name: "新建重要事件" }).click();
  await page.getByLabel("名称 *").fill("访谈会议");
  await page.getByLabel("日期或时间").fill("2026-10-20T10:00");
  await save(page);
  await editRow(page, "访谈会议");
  await page.getByLabel("名称 *").fill("周二访谈会议");
  await save(page);
  await tab(page, "证据与验证");
  await page.getByRole("button", { name: "新建证据" }).click();
  await page.getByLabel("标题 *").fill("三人访谈反馈");
  await page.getByLabel("实际回答").fill("只有一位愿意付费");
  await save(page);
  await page.getByRole("button", { name: "验证", exact: true }).click();
  await page.getByRole("button", { name: "新建验证结果" }).click();
  await page.getByLabel("验证名称 *").fill("访谈验证");
  await page.getByLabel("待验证假设 *", { exact: true }).fill("目标假设");
  await page
    .getByRole("group", { name: "待验证假设 *搜索结果" })
    .getByRole("button", { name: /目标假设/ })
    .click();
  await page.getByLabel("实际结果").fill("样本有限，暂时无法下结论");
  await save(page);
  await tab(page, "判断与复盘");
  await page.getByRole("button", { name: "新建复盘" }).click();
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
  await expect(drawer.getByText("选中的假设", { exact: true })).toBeVisible();
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
    page.getByRole("heading", { name: "首页", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "data/visual-home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "查看完整列表", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "今日关注", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "哪些用户现在就遇到了这个问题？",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await page
    .getByRole("button", {
      name: "把零散的想法整理成可以验证的方向",
      exact: true,
    })
    .click();
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
  await page.getByRole("button", { name: "逻辑图", exact: true }).click();
  const graph = page.getByRole("region", { name: "可滚动逻辑图" });
  expect(
    await graph.evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await mobileNav(page, "首页");
  await page.screenshot({
    path: "data/visual-home-mobile.png",
    fullPage: true,
  });
  await mobileNav(page, "我的主题");
  await page.getByRole("button", { name: "新建主题", exact: true }).click();
  await expect(page.getByLabel("名称 *")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "新建主题", exact: true }),
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
  await page.getByRole("button", { name: "验证", exact: true }).click();
  await page.getByRole("button", { name: "新建验证结果" }).click();
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
