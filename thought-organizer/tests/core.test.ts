import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "thought-test-")),
  "test.sqlite",
);
const service = await import("../lib/service");
const auth = await import("../lib/auth");
const ai = await import("../lib/ai");
const { db, run, one } = await import("../lib/db");
const { cycleWarnings, dateInZone } = await import("../lib/schema");
test("AI用量按账号时区统计今日与月度，同时保留滚动额度", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-01T01:00:00Z"),
  });
  const id = user();
  for (const [timestamp, state] of [
    ["2026-09-30T17:00:00Z", "success"],
    ["2026-09-29T17:00:00Z", "error"],
    ["2026-10-01T00:00:00Z", "success"],
  ])
    run(
      "INSERT INTO calls(id,owner,state,created_at) VALUES(?,?,?,?)",
      randomUUID(),
      id,
      state,
      Date.parse(timestamp),
    );
  const usage = auth.usage(id, "Asia/Shanghai");
  assert.equal(usage.todayUsed, 2);
  assert.equal(usage.monthUsed, 2);
  assert.equal(usage.rollingDayUsed, 2);
  assert.equal(usage.rollingMonthUsed, 3);
});
function user() {
  const id = randomUUID();
  run(
    "INSERT INTO users(id,email,password,created_at) VALUES(?,?,?,?)",
    id,
    id + "@test.example",
    auth.passwordHash("long-safe-password"),
    new Date().toISOString(),
  );
  return id;
}
const owner = user(),
  other = user();
const topic = service.create(
  owner,
  "topic",
  { title: "测试主题", goal: "验证真实持久化", status: "探索中" },
  null,
);
const record = service.create(
  owner,
  "record",
  { content: "如果用户愿意尝试，方案可能可行。" },
  topic.id,
);
const a = service.create(
  owner,
  "card",
  { content: "用户愿意尝试", type: "假设", sourceRefs: [record.id] },
  topic.id,
);
const b = service.create(
  owner,
  "card",
  { content: "方案可能可行", type: "结论", sourceRefs: [record.id] },
  topic.id,
);
const relation = service.create(
  owner,
  "relation",
  { from: [a.id], to: [b.id], type: "推导", reason: "依赖用户意愿" },
  topic.id,
);
test("密码哈希与认证归属", () => {
  const hash = auth.passwordHash("long-safe-password");
  assert(auth.verifyPassword("long-safe-password", hash));
  assert(!auth.verifyPassword("wrong", hash));
  assert.throws(() => service.get(other, a.id));
  assert.throws(() => service.update(other, a.id, 1, a.data, topic.id));
  assert.throws(() =>
    service.create(
      other,
      "card",
      { content: "偷取", sourceRefs: [record.id] },
      null,
    ),
  );
  assert.throws(() =>
    service.create(
      other,
      "task",
      { title: "窃取", questionRefs: [a.id] },
      null,
    ),
  );
});
test("原文历史与并发冲突保护", () => {
  const next = service.update(
    owner,
    record.id,
    1,
    { content: "如果用户愿意尝试，方案也许可行。" },
    topic.id,
  );
  assert.equal(next.version, 2);
  assert.equal(
    service.history(owner, record.id)[0].snapshot.data.content,
    record.data.content,
  );
  assert.throws(() =>
    service.update(owner, record.id, 1, { content: "旧窗口覆盖" }, topic.id),
  );
  assert.equal(service.get(owner, record.id).data.content, next.data.content);
});
test("状态与内容版本分别处理，任务完成不改变结论", () => {
  const task = service.create(
    owner,
    "task",
    {
      title: "访谈",
      type: "验证任务",
      status: "待开始",
      hypothesisRefs: [a.id],
    },
    topic.id,
  );
  const changed = service.update(
    owner,
    task.id,
    1,
    { ...task.data, status: "已完成" },
    topic.id,
  );
  assert.equal(changed.contentVersion, task.contentVersion);
  assert.equal(service.get(owner, a.id).data.type, "假设");
  assert.equal(changed.data.result, undefined);
  const e = service.create(
    owner,
    "event",
    {
      title: "访谈日",
      date: "2026-10-12T10:00",
      taskRefs: [task.id],
      status: "准备中",
    },
    topic.id,
  );
  assert.equal(e.data.date, "2026-10-12T10:00");
  assert.equal(changed.data.due, undefined);
});
test("证据、验证和复盘多对多关联", () => {
  const evidence = service.create(
    owner,
    "evidence",
    {
      title: "用户访谈",
      type: "访谈或反馈",
      answer: "愿意尝试",
      supports: [a.id, b.id],
      status: "待核实",
    },
    topic.id,
  );
  const validation = service.create(
    owner,
    "validation",
    {
      title: "访谈验证",
      hypothesisRefs: [a.id],
      evidenceRefs: [evidence.id],
      actual: "只有两人愿意",
      direction: "无结论",
    },
    topic.id,
  );
  const review = service.create(
    owner,
    "review",
    {
      title: "阶段复盘",
      judgment: "继续探索",
      change: "降低信心",
      changeReason: "样本不足",
      evidenceRefs: [evidence.id],
    },
    topic.id,
  );
  assert.equal(validation.data.direction, "无结论");
  assert.equal(service.get(owner, review.id).data.changeReason, "样本不足");
  assert.throws(() =>
    service.create(
      other,
      "review",
      { title: "关联别人", evidenceRefs: [evidence.id] },
      null,
    ),
  );
});
test("软删除保留关联并可恢复", () => {
  const old = service.get(owner, b.id);
  const removed = service.softDelete(owner, b.id, old.version);
  assert.throws(() => service.get(owner, b.id));
  assert(service.impact(owner, b.id).some((x) => x.source === relation.id));
  assert(service.get(owner, relation.id));
  const restored = service.softDelete(owner, b.id, removed.version, true);
  assert.equal(restored.deletedAt, null);
});
test("多前提、跨分组与环路提示", () => {
  service.create(
    owner,
    "relation",
    { from: [b.id], to: [a.id], type: "支持" },
    topic.id,
  );
  assert(cycleWarnings(service.list(owner)));
  assert.equal(service.get(owner, relation.id).data.type, "推导");
});
test("拆分合并保留来源并重写关联", () => {
  const old = service.get(owner, a.id);
  const parts = service.transform(owner, [a.id], { [a.id]: old.version }, [
    "用户表示愿意",
    "实际使用意愿待测",
  ]);
  const r = service.get(owner, relation.id);
  assert.deepEqual(
    r.data.from,
    parts.map((x) => x.id),
  );
  assert(
    parts.every((x) => (x.data.sourceRefs as string[]).includes(record.id)),
  );
  const merged = service.transform(
    owner,
    parts.map((x) => x.id),
    Object.fromEntries(parts.map((x) => [x.id, x.version])),
    null,
  );
  assert.equal(merged.length, 1);
  assert.deepEqual(service.get(owner, relation.id).data.from, [merged[0].id]);
  assert(service.history(owner, relation.id).length >= 2);
});
test("JSON导入编号冲突重映射，不覆盖其他账号，引用错误事务回滚", () => {
  const exported = service.exportData(owner);
  const target = user();
  const restored = service.importData(target, exported);
  assert.equal(restored.imported, exported.entities.length);
  assert.notEqual(restored.ids[topic.id], topic.id);
  assert(service.get(owner, topic.id));
  assert.throws(() => service.get(target, topic.id));
  const before = service.list(target, true).length;
  const bad = {
    ...exported,
    entities: [
      ...exported.entities,
      {
        ...exported.entities.find((e) => e.kind === "card")!,
        id: "new-bad",
        data: { content: "bad", sourceRefs: ["outside"] },
      },
    ],
  };
  assert.throws(() => service.importData(target, bad));
  assert.equal(service.list(target, true).length, before);
});
test("配置为空不会发送请求", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  let sent = false;
  await assert.rejects(
    ai.provider([record], "整理思路", "", async () => {
      sent = true;
      return new Response();
    }),
  );
  assert.equal(sent, false);
});
const good = {
  understanding: "用户在探索方案",
  clarifications: [],
  cards: [],
  relations: [],
  issues: [],
  next: [],
};
test("模拟提供器验证JSON、引用、原句、截断、空输出和超时", async () => {
  process.env.DEEPSEEK_API_KEY = "test-only-not-a-real-key";
  const fetcher =
    (content: string, finish_reason = "stop") =>
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content }, finish_reason }],
          usage: { total_tokens: 12 },
        }),
      );
  const out = await ai.provider(
    [record],
    "检查推导",
    "",
    fetcher(JSON.stringify(good)),
  );
  assert.equal(out.tokens, 12);
  await assert.rejects(
    ai.provider([record], "检查推导", "", fetcher("bad-json")),
  );
  await assert.rejects(ai.provider([record], "检查推导", "", fetcher("")));
  await assert.rejects(
    ai.provider(
      [record],
      "检查推导",
      "",
      fetcher(JSON.stringify(good), "length"),
    ),
  );
  await assert.rejects(
    ai.provider([record], "检查推导", "", async () => {
      throw new DOMException("timeout", "TimeoutError");
    }),
  );
  assert.throws(() =>
    ai.validateOutput(
      {
        ...good,
        relations: [
          { from: ["unknown"], to: ["missing"], type: "支持", reason: "bad" },
        ],
      },
      [record],
    ),
  );
  assert.throws(() =>
    ai.validateOutput(
      {
        ...good,
        issues: [
          {
            title: "疑点",
            refs: [record.id],
            quote: "不存在的原句",
            type: "信息不足",
            reason: "不足",
            missing: "样本",
            alternative: "其他原因",
            validation: "访谈",
            impact: "当前关键",
            impactReason: "影响决策",
          },
        ],
      },
      [record],
    ),
  );
  delete process.env.DEEPSEEK_API_KEY;
});
test("建议重复转换、旧分析保护与操作状态不误过期", () => {
  const current = service.get(owner, record.id);
  const id = randomUUID(),
    sid = randomUUID();
  run(
    "INSERT INTO analyses VALUES(?,?,?,?,?,?,?)",
    id,
    owner,
    topic.id,
    "检查推导",
    JSON.stringify([current]),
    JSON.stringify(good),
    new Date().toISOString(),
  );
  run(
    "INSERT INTO suggestions(id,analysis_id,owner,kind,data) VALUES(?,?,?,?,?)",
    sid,
    id,
    owner,
    "question",
    JSON.stringify({
      title: "该如何验证？",
      refs: [current.id],
      action: "访谈",
      information: "意愿",
      criterion: "",
    }),
  );
  const first = ai.applySuggestion(owner, sid, { action: "accept" }),
    again = ai.applySuggestion(owner, sid, { action: "accept" });
  assert.equal((first as { id: string }).id, (again as { id: string }).id);
  const sid2 = randomUUID();
  run(
    "INSERT INTO suggestions(id,analysis_id,owner,kind,data) VALUES(?,?,?,?,?)",
    sid2,
    id,
    owner,
    "question",
    JSON.stringify({
      title: "新问题",
      refs: [current.id],
      action: "",
      information: "",
      criterion: "",
    }),
  );
  const changed = service.update(
    owner,
    current.id,
    current.version,
    { ...current.data, today: true },
    current.topic,
  );
  assert(!ai.analysisList(owner, topic.id).find((x) => x.id === id)!.stale);
  service.update(
    owner,
    changed.id,
    changed.version,
    { ...changed.data, content: "更新输入" },
    changed.topic,
  );
  assert(ai.analysisList(owner, topic.id).find((x) => x.id === id)!.stale);
  assert.throws(() => ai.applySuggestion(owner, sid2, { action: "accept" }));
  assert.throws(() => ai.applySuggestion(other, sid, { action: "accept" }));
});
test("额度持久化并按账号限制", async () => {
  process.env.DEEPSEEK_API_KEY = "test-only";
  process.env.AI_DAILY_LIMIT = "1";
  run(
    "INSERT INTO calls(id,owner,state,created_at) VALUES(?,?,?,?)",
    randomUUID(),
    owner,
    "success",
    Date.now(),
  );
  await assert.rejects(
    ai.analyze(owner, { topic: topic.id, ids: [record.id], mode: "检查推导" }),
    /额度/,
  );
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.AI_DAILY_LIMIT;
});
test("同来源写保护、时区及等待信息校验", () => {
  assert.throws(() =>
    auth.sameOrigin(
      new Request("http://localhost:3000/api/entities", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  auth.sameOrigin(
    new Request("http://localhost:3000/api/entities", {
      headers: { origin: "http://localhost:3000" },
    }),
  );
  assert.equal(
    dateInZone(new Date("2026-10-11T17:00:00Z"), "Asia/Shanghai"),
    "2026-10-12",
  );
  assert.throws(() =>
    service.create(
      owner,
      "question",
      { title: "在等什么", status: "等待信息" },
      null,
    ),
  );
});
test("服务端数据库备份恢复完整性", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "thought-backup-")),
    "restored.sqlite",
  );
  await backup(db, path);
  const restored = new DatabaseSync(path, { readOnly: true });
  assert.equal(
    restored.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  assert.equal(
    restored.prepare("SELECT count(*) n FROM entities").get()?.n,
    one<{ n: number }>("SELECT count(*) n FROM entities")!.n,
  );
  assert.equal(
    restored.prepare("SELECT data FROM entities WHERE id=?").get(record.id)
      ?.data,
    JSON.stringify(service.get(owner, record.id).data),
  );
  restored.close();
});
test("整体撤销拆分恢复原卡片和关系，后续编辑阻止静默覆盖", () => {
  const c = service.create(
    owner,
    "card",
    { content: "一段\n\n另一段", type: "假设" },
    topic.id,
  );
  const r = service.create(
    owner,
    "relation",
    { from: [c.id], to: [b.id], type: "支持" },
    topic.id,
  );
  const parts = service.transform(owner, [c.id], { [c.id]: c.version }, [
    "一段",
    "另一段",
  ]);
  const op = service.operations(owner)[0];
  service.undoOperation(owner, op.id);
  assert.equal(service.get(owner, c.id).data.content, c.data.content);
  assert.deepEqual(service.get(owner, r.id).data.from, [c.id]);
  assert(parts.every((x) => Boolean(service.get(owner, x.id, true).deletedAt)));
  const again = service.get(owner, c.id);
  const newParts = service.transform(owner, [c.id], { [c.id]: again.version }, [
    "甲",
    "乙",
  ]);
  const next = service.operations(owner).find((x) => !x.undone)!;
  service.update(
    owner,
    newParts[0].id,
    newParts[0].version,
    { ...newParts[0].data, content: "后续修改" },
    topic.id,
  );
  assert.throws(() => service.undoOperation(owner, next.id));
});

test("独立原文无需主题可关联全部类型；创建与关联原子保存，冲突不留孤立对象，导出恢复兼容", () => {
  const id = user();
  const content =
    "  我想参加周末的活动，但怕占用时间，又担心错过认识新朋友的机会。\n原文的换行也保留。  ";
  let root = service.create(id, "record", { content, status: "未整理" }, null);
  const card = service.createThinkingItem(id, root.id, root.version, "card", {
    content: "认识新朋友",
    type: "假设",
    sourceRefs: [root.id],
  });
  root = service.get(id, root.id);
  const q = service.createThinkingItem(id, root.id, root.version, "question", {
    title: "活动安排和参加人群是什么？",
    refs: [card.id],
  });
  root = service.get(id, root.id);
  const task = service.createThinkingItem(id, root.id, root.version, "task", {
    title: "先向组织者了解情况。",
    questionRefs: [q.id],
  });
  root = service.get(id, root.id);
  const evidence = service.createThinkingItem(
    id,
    root.id,
    root.version,
    "evidence",
    {
      title: "组织者反馈",
      type: "个人推断",
      supports: [card.id],
      status: "待核实",
    },
  );
  root = service.get(id, root.id);
  service.createThinkingItem(id, root.id, root.version, "review", {
    title: "当前判断",
    judgment: "了解安排后再决定",
    changeReason: "时间仍不确定",
  });
  root = service.get(id, root.id);
  service.createThinkingItem(id, root.id, root.version, "event", {
    title: "活动",
    date: "2026-10-17T10:00",
  });
  root = service.get(id, root.id);
  service.createThinkingItem(id, root.id, root.version, "validation", {
    title: "核对时间",
    hypothesisRefs: [card.id],
    taskRefs: [task.id],
    evidenceRefs: [evidence.id],
    direction: "无结论",
  });
  root = service.get(id, root.id);
  assert.equal(root.topic, null);
  assert.equal(root.data.content, content);
  assert.equal((root.data.refs as string[]).length, 7);
  const before = service.list(id).length;
  assert.throws(
    () =>
      service.createThinkingItem(id, root.id, 1, "event", {
        title: "不会留下孤立事件",
      }),
    /冲突/,
  );
  assert.equal(service.list(id).length, before);
  assert.throws(
    () =>
      service.createThinkingItem(other, root.id, root.version, "task", {
        title: "其他账号",
      }),
    /无权访问/,
  );
  const backup = service.exportData(id),
    restoredUser = user();
  const restored = service.importData(restoredUser, backup);
  const restoredRoot = service.get(restoredUser, restored.ids[root.id]);
  assert.equal(restoredRoot.data.content, content);
  assert.equal((restoredRoot.data.refs as string[]).length, 7);
  assert(service.history(restoredUser, restoredRoot.id).length >= 7);
});
test("删除关联内容后仍可编辑原文及位置，不丢已有引用；新建无效引用仍被拒绝", () => {
  const id = user();
  let root = service.create(id, "record", { content: "已有原文" }, null);
  const item = service.createThinkingItem(id, root.id, root.version, "task", {
    title: "待办",
  });
  root = service.get(id, root.id);
  service.softDelete(id, item.id, item.version);
  root = service.update(
    id,
    root.id,
    root.version,
    { ...root.data, content: "补充后的原文", lastPosition: "review" },
    null,
  );
  assert.deepEqual(root.data.refs, [item.id]);
  assert.equal(root.data.lastPosition, "review");
  assert.throws(() =>
    service.create(id, "record", { content: "新原文", refs: [item.id] }, null),
  );
});
test("独立思考连续采纳不误过期，保留AI来源、幂等与真实修改过期保护", () => {
  const id = user();
  let root = service.create(id, "record", { content: "我想认识新朋友" }, null);
  const analysisId = randomUUID();
  run(
    "INSERT INTO analyses VALUES(?,?,?,?,?,?,?)",
    analysisId,
    id,
    null,
    "整理思路",
    JSON.stringify([root]),
    JSON.stringify(good),
    new Date().toISOString(),
  );
  const suggestions = [1, 2, 3].map((n) => {
    const sid = randomUUID();
    run(
      "INSERT INTO suggestions(id,analysis_id,owner,kind,data) VALUES(?,?,?,?,?)",
      sid,
      analysisId,
      id,
      "card",
      JSON.stringify({
        title: `观点${n}`,
        content: `认识新朋友${n}`,
        type: "观点或推断",
        sourceRefs: [root.id],
        localId: `draft${n}`,
      }),
    );
    return sid;
  });
  const first = ai.applySuggestion(id, suggestions[0], {
    action: "accept",
    recordId: root.id,
    recordVersion: root.version,
    data: {
      content: "修改后的建议",
      type: "观点或推断",
      source: "用户陈述",
      sourceRefs: [root.id],
    },
  }) as import("../lib/schema").Entity;
  assert.equal(first.data.source, "AI推断");
  root = service.get(id, root.id);
  assert(!ai.analysisList(id, null)[0].stale);
  ai.applySuggestion(id, suggestions[1], {
    action: "accept",
    recordId: root.id,
    recordVersion: root.version,
  });
  assert(!ai.analysisList(id, null)[0].stale);
  assert.equal(
    (
      ai.applySuggestion(id, suggestions[0], { action: "accept" }) as {
        id: string;
      }
    ).id,
    first.id,
  );
  root = service.get(id, root.id);
  service.update(
    id,
    root.id,
    root.version,
    { ...root.data, content: "我的想法变了" },
    null,
  );
  assert(ai.analysisList(id, null)[0].stale);
  assert.throws(
    () => ai.applySuggestion(id, suggestions[2], { action: "accept" }),
    /旧分析/,
  );
});
test("独立分析必须明确选取；实际输入不包含无关记录或另一账号，使用离线提供器", async (t) => {
  const id = user(),
    root = service.create(id, "record", { content: "这次的独立思考" }, null);
  const unrelated = service.create(
    id,
    "record",
    { content: "另一段不能默认发送的私人内容" },
    null,
  );
  process.env.DEEPSEEK_API_KEY = "test-only-not-real";
  let requestText = "";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      requestText = String(options.body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify(good) },
              finish_reason: "stop",
            },
          ],
          usage: { total_tokens: 1 },
        }),
      );
    },
  );
  try {
    await assert.rejects(
      ai.analyze(id, { topic: null, ids: [], mode: "整理思路" }),
      /请选择独立思考/,
    );
    assert.equal(requestText, "");
    const analysis = await ai.analyze(id, {
      topic: null,
      ids: [root.id],
      mode: "整理思路",
    });
    assert(analysis);
    assert(requestText.includes(root.id));
    assert(
      !requestText.includes(unrelated.id) &&
        !requestText.includes(String(unrelated.data.content)),
    );
  } finally {
    delete process.env.DEEPSEEK_API_KEY;
  }
});
