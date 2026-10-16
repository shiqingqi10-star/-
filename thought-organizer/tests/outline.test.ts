import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "outline-test-")),
  "test.sqlite",
);
process.env.DEEPSEEK_API_KEY = "offline-provider-only";
const db = await import("../lib/db");
const g = await import("../lib/guidance");
const out = await import("../lib/outline");
const svc = await import("../lib/service");
const logs = await import("../lib/guide-records");
const schema = await import("../lib/guidance-schema");
function account() {
  const id = randomUUID();
  db.run(
    "INSERT INTO users(id,email,password,created_at) VALUES(?,?,?,?)",
    id,
    id + "@test.example",
    "test-only",
    new Date().toISOString(),
  );
  return id;
}
function fixture(
  content = "我想参加周末活动，但怕影响作业，又怕错过认识新朋友的机会。",
) {
  const owner = account(),
    token = randomUUID(),
    root = g.startGuide(owner, {
      content,
      token,
      organize: true,
      initial: true,
    });
  return { owner, root, token };
}
type F = ReturnType<typeof fixture>;
function s(f: F) {
  return g.getGuide(f.owner, f.root.id);
}
function patch(f: F, body: Record<string, unknown>) {
  return out.mutateOutline(f.owner, f.root.id, {
    version: s(f).version,
    ...body,
  });
}
function item(
  f: F,
  text: string,
  category = "known",
  sources = [{ kind: "entity", id: f.root.id }],
) {
  return {
    targetId: null,
    category,
    text,
    reason: "根据用户原话暂作整理",
    sources,
  };
}
const provider =
  (value: unknown, inspect?: (v: any) => void): typeof fetch =>
  async (_url, opts) => {
    inspect?.(JSON.parse(JSON.parse(String(opts?.body)).messages[1].content));
    return Response.json({
      choices: [{ message: { content: JSON.stringify(value) } }],
      usage: { total_tokens: 10 },
    });
  };
async function initial(f: F) {
  return out.generateOutline(
    f.owner,
    f.root.id,
    { version: s(f).version, token: f.token, intent: "initial" },
    provider({
      changes: [
        item(f, "认识新朋友", "goal"),
        item(f, "可能影响作业安排", "concern"),
        item(f, "活动时间和作业安排还需补充", "unknown"),
      ],
      question: null,
    }),
  );
}
function note(f: F, text: string) {
  return patch(f, {
    action: "note",
    token: randomUUID(),
    category: "known",
    text,
  });
}
test("原文先保存、零回答即可得到可追溯AI草稿；重试和重新打开不重复分析或创建正式记录", async () => {
  const f = fixture();
  assert.equal(
    svc.get(f.owner, f.root.id).data.content,
    "我想参加周末活动，但怕影响作业，又怕错过认识新朋友的机会。",
  );
  assert.equal(s(f).data.answers.length, 0);
  assert.equal(s(f).data.outline.autoToken, f.token);
  let calls = 0;
  const body = { version: s(f).version, token: f.token, intent: "initial" };
  const fetcher = provider(
    {
      changes: [
        item(f, "想认识新朋友", "goal"),
        item(f, "担心作业安排", "concern"),
      ],
      question: null,
    },
    (input) => {
      calls++;
      assert.equal(input.entities.length, 1);
      assert.equal(input.answers.length, 0);
      assert.equal(input.anchor.original, f.root.data.content);
    },
  );
  const r = await out.generateOutline(f.owner, f.root.id, body, fetcher);
  assert(!r.stale);
  assert.equal(r.session.data.outline.entries.length, 2);
  assert(
    r.session.data.outline.entries.every(
      (e) =>
        e.origin === "ai" &&
        e.aiDerived &&
        !e.targetId &&
        e.sources[0].excerpt === f.root.data.content,
    ),
  );
  assert.equal(svc.list(f.owner).length, 1);
  await out.generateOutline(f.owner, f.root.id, body, fetcher);
  g.initializeGuide(f.owner, f.root.id);
  logs.guideInputScope(f.owner, f.root.id);
  logs.guideRunRecords(f.owner, f.root.id, null, null);
  assert.equal(calls, 1);
  assert.equal(s(f).data.outline.entries.length, 2);
  assert.equal(
    db.one<{ n: number }>(
      "SELECT count(*) n FROM guidance_requests WHERE owner=?",
      f.owner,
    )!.n,
    1,
  );
});
test("输入不足只保存一个必要澄清；回答后的更新是候选差异，不编造整套结构", async () => {
  const f = fixture("怎么办？");
  const r = await out.generateOutline(
    f.owner,
    f.root.id,
    { version: s(f).version, token: f.token, intent: "initial" },
    provider({
      changes: [],
      question: {
        text: "你现在想理清哪件具体的事？",
        direction: "unknown",
        hint: "可以先说发生了什么",
        explanation: "先弄清问题指向",
      },
    }),
  );
  assert.equal(r.session.data.outline.entries.length, 0);
  assert(r.session.data.outline.clarification);
  assert.equal(r.session.data.current!.mode, "ai");
  let state = g.mutateGuide(f.owner, f.root.id, {
    version: s(f).version,
    action: "answer",
    questionId: s(f).data.current!.id,
    text: "想决定周末参加活动还是先完成作业",
    status: "answered",
  });
  const answer = state.data.answers.at(-1)!;
  await out.generateOutline(
    f.owner,
    f.root.id,
    { version: state.version, token: randomUUID(), intent: "update" },
    provider({
      changes: [
        item(f, "参加活动与作业安排之间的选择", "issue", [
          { kind: "answer", id: answer.id },
        ]),
      ],
      question: null,
    }),
  );
  state = s(f);
  assert.equal(state.data.outline.entries.length, 0);
  assert.equal(state.data.outline.changes.length, 1);
  assert.equal(svc.list(f.owner).length, 1);
  patch(f, {
    action: "change",
    id: state.data.outline.changes[0].id,
    decision: "accept",
  });
  assert.equal(s(f).data.outline.entries[0].sources[0].excerpt, answer.text);
});
test("局部编辑保留其他条目、多来源与AI来源；候选需预览确认且重试幂等", async () => {
  const f = fixture();
  await initial(f);
  let state = s(f),
    [goal, concern] = state.data.outline.entries;
  const cmd = {
    action: "note",
    version: state.version,
    id: goal.id,
    entryVersion: goal.version,
    category: goal.category,
    text: "更想结识兴趣相近的人",
    relatedIds: [],
    token: randomUUID(),
  };
  out.mutateOutline(f.owner, f.root.id, cmd);
  out.mutateOutline(f.owner, f.root.id, cmd);
  state = s(f);
  goal = state.data.outline.entries[0];
  assert.deepEqual(state.data.outline.entries[1], concern);
  assert.deepEqual(goal.sources, s(f).data.outline.entries[0].sources);
  assert.equal(goal.origin, "manual");
  assert(goal.aiDerived);
  assert(
    g
      .guideHistory(f.owner, f.root.id)
      .some((v) => v.data.outline.entries[0]?.text === "认识新朋友"),
  );
  const before = structuredClone(state.data.outline.entries);
  await out.generateOutline(
    f.owner,
    f.root.id,
    {
      version: state.version,
      token: randomUUID(),
      intent: "update",
      focusId: goal.id,
    },
    provider({
      changes: [
        {
          ...item(f, "认识兴趣相近的人，同时保留完成作业的时间", "goal", [
            { kind: "entry", id: goal.id },
            { kind: "entity", id: f.root.id },
          ]),
          targetId: goal.id,
        },
      ],
      question: null,
    }),
  );
  state = s(f);
  assert.deepEqual(state.data.outline.entries, before);
  const c = state.data.outline.changes.at(-1)!;
  assert.equal(c.before, goal.text);
  const accept = {
    action: "change",
    version: state.version,
    id: c.id,
    decision: "accept",
    text: "认识兴趣相近的人，先确认时间安排",
  };
  out.mutateOutline(f.owner, f.root.id, accept);
  out.mutateOutline(f.owner, f.root.id, accept);
  assert.equal(s(f).data.outline.entries[0].text, accept.text);
  assert.deepEqual(s(f).data.outline.entries[1], concern);
  assert.equal(svc.list(f.owner).length, 1);
});
test("已确认判断仅在明确接受单条更新后修改；其他字段、关系和其他记录不丢失", async () => {
  const f = fixture();
  await initial(f);
  let e = s(f).data.outline.entries[0];
  patch(f, {
    action: "confirm",
    id: e.id,
    entryVersion: e.version,
    kind: "review",
    text: "先了解活动时间再决定",
  });
  e = s(f).data.outline.entries[0];
  let record = svc.get(f.owner, e.targetId!);
  record = svc.update(
    f.owner,
    record.id,
    record.version,
    { ...record.data, cost: "保留成本说明", reason: "原判断理由" },
    record.topic,
  );
  const others = s(f).data.outline.entries.slice(1);
  await out.generateOutline(
    f.owner,
    f.root.id,
    {
      version: s(f).version,
      token: randomUUID(),
      intent: "update",
      focusId: e.id,
    },
    provider({
      changes: [
        { ...item(f, "确认能按时交作业后再参加", "judgment"), targetId: e.id },
      ],
      question: null,
    }),
  );
  const c = s(f).data.outline.changes.at(-1)!;
  assert.equal(
    svc.get(f.owner, record.id).data.judgment,
    "先了解活动时间再决定",
  );
  assert.throws(
    () =>
      patch(f, {
        action: "change",
        id: c.id,
        decision: "accept",
        recordVersion: 1,
      }),
    /正式记录已有变化/,
  );
  patch(f, {
    action: "change",
    id: c.id,
    decision: "accept",
    recordVersion: record.version,
  });
  assert.equal(svc.get(f.owner, record.id).data.cost, "保留成本说明");
  assert.equal(svc.get(f.owner, record.id).data.reason, "原判断理由");
  assert.equal(
    svc.get(f.owner, record.id).data.judgment,
    "确认能按时交作业后再参加",
  );
  assert.deepEqual(s(f).data.outline.entries.slice(1), others);
  assert(svc.history(f.owner, record.id).length >= 2);
});
test("旧请求和重复请求不覆盖新编辑；同一个初始请求只调用一次提供方", async () => {
  const f = fixture();
  let release!: (v: Response) => void,
    calls = 0;
  const body = { version: s(f).version, token: f.token, intent: "initial" };
  const pending = out.generateOutline(f.owner, f.root.id, body, async () => {
    calls++;
    return await new Promise<Response>((r) => {
      release = r;
    });
  });
  const duplicate = await out.generateOutline(
    f.owner,
    f.root.id,
    body,
    async () => {
      throw Error("不应重复调用");
    },
  );
  assert(duplicate.duplicate);
  assert.equal(calls, 1);
  note(f, "用户在分析期间留下的内容");
  release(
    await provider({
      changes: [item(f, "旧请求中的理解", "goal")],
      question: null,
    })("", {}),
  );
  const result = await pending;
  assert(result.stale);
  assert.deepEqual(
    s(f).data.outline.entries.map((e) => e.text),
    ["用户在分析期间留下的内容"],
  );
  assert.equal(s(f).data.runs.length, 1);
  assert(s(f).data.outline.jobs[0].stale);
});
test("AI失败、非法来源和配额失败均保留原文与草稿；重新打开不自动重试", async () => {
  const f = fixture();
  note(f, "已有手动整理");
  const before = s(f).data.outline.entries;
  await assert.rejects(
    () =>
      out.generateOutline(
        f.owner,
        f.root.id,
        { version: s(f).version, token: randomUUID(), intent: "initial" },
        async () => {
          throw Error("test-only failure");
        },
      ),
    /AI连接失败/,
  );
  assert.deepEqual(s(f).data.outline.entries, before);
  assert.equal(s(f).data.outline.jobs[0].state, "error");
  assert.equal(svc.get(f.owner, f.root.id).data.content, f.root.data.content);
  const other = fixture();
  await assert.rejects(
    () =>
      out.generateOutline(
        f.owner,
        f.root.id,
        { version: s(f).version, token: randomUUID(), intent: "update" },
        provider({
          changes: [
            item(f, "不应进入的内容", "known", [
              { kind: "entity", id: other.root.id },
            ]),
          ],
          question: null,
        }),
      ),
    /来源无法核对/,
  );
  assert.deepEqual(s(f).data.outline.entries, before);
  const quota = fixture();
  const old = process.env.AI_DAILY_LIMIT;
  process.env.AI_DAILY_LIMIT = "0";
  let called = false;
  try {
    await assert.rejects(
      () =>
        out.generateOutline(
          quota.owner,
          quota.root.id,
          { version: s(quota).version, token: quota.token, intent: "initial" },
          async () => {
            called = true;
            throw Error("should not call");
          },
        ),
      /额度已用完/,
    );
    assert(!called);
    assert(s(quota).data.outline.attempted);
    assert.equal(s(quota).data.outline.jobs[0].state, "error");
  } finally {
    if (old === undefined) delete process.env.AI_DAILY_LIMIT;
    else process.env.AI_DAILY_LIMIT = old;
  }
});
test("未知来源不能变成已知判断，按需追问只生成一个问题、不重写成果", async () => {
  const f = fixture();
  await initial(f);
  const e = s(f).data.outline.entries.find((e) => e.category === "unknown")!;
  let focused = patch(f, { action: "focus", id: e.id });
  const before = structuredClone(focused.data.outline.entries);
  const r = await out.generateOutline(
    f.owner,
    f.root.id,
    {
      version: focused.version,
      token: randomUUID(),
      intent: "question",
      focusId: e.id,
    },
    provider(
      {
        changes: [],
        question: {
          text: "可以向谁确认活动的具体时间？",
          direction: "next",
          hint: "先确认最影响安排的信息",
        },
      },
      (input) => {
        assert.equal(input.focusId, e.id);
        assert.equal(input.outline.length, 3);
      },
    ),
  );
  assert.deepEqual(r.session.data.outline.entries, before);
  assert.equal(r.session.data.current!.text, "可以向谁确认活动的具体时间？");
  assert.equal(
    r.session.data.outline.questionRunId,
    r.session.data.outline.jobs.at(-1)!.id,
  );
  focused = s(f);
  await assert.rejects(
    () =>
      out.generateOutline(
        f.owner,
        f.root.id,
        {
          version: focused.version,
          token: randomUUID(),
          intent: "update",
          focusId: e.id,
        },
        provider({
          changes: [
            item(f, "活动时间已经确定", "known", [{ kind: "entry", id: e.id }]),
          ],
          question: null,
        }),
      ),
    /未知信息不能/,
  );
  assert.deepEqual(s(f).data.outline.entries, before);
});
test("比较允许未知及不适用、不评分；保存与重启持久化，格式错误和旧版本不覆盖", () => {
  const f = fixture();
  note(f, "参加活动");
  const first = s(f).data.outline.entries[0];
  const comparison = {
    options: [
      { id: "a", text: "参加活动", sourceIds: [first.id] },
      { id: "b", text: "留在家里", sourceIds: [] },
    ],
    dimensions: [
      {
        id: "time",
        label: "时间安排",
        values: [
          { optionId: "a", text: "还不知道活动时长", state: "unknown" },
          { optionId: "b", text: "可自行安排", state: "known" },
        ],
      },
      {
        id: "people",
        label: "结识新朋友",
        values: [
          { optionId: "a", text: "参加者尚不清楚", state: "unknown" },
          { optionId: "b", text: "不适用于此选择", state: "na" },
        ],
      },
    ],
  };
  patch(f, { action: "comparison", comparison });
  const saved = s(f);
  db.closeDatabase();
  assert.deepEqual(s(f).data.outline.comparison, comparison);
  assert(!JSON.stringify(comparison).includes("score"));
  assert.throws(
    () =>
      patch(f, {
        action: "comparison",
        comparison: {
          ...comparison,
          options: [comparison.options[0], comparison.options[0]],
        },
      }),
    /比较项重复/,
  );
  note(f, "新增的信息");
  assert.throws(
    () =>
      out.mutateOutline(f.owner, f.root.id, {
        version: saved.version,
        action: "comparison",
        comparison,
      }),
    /已变化/,
  );
  assert.deepEqual(s(f).data.outline.comparison, comparison);
});
test("来源变动就近标记需核对；明确核对保留旧版本，导出恢复保持来源且不重放请求", async () => {
  const f = fixture();
  await initial(f);
  let e = s(f).data.outline.entries[0];
  patch(f, {
    action: "confirm",
    id: e.id,
    entryVersion: e.version,
    kind: "card",
    text: e.text,
  });
  const root = svc.get(f.owner, f.root.id);
  svc.update(
    f.owner,
    root.id,
    root.version,
    { ...root.data, content: String(root.data.content) + " 新增了时间限制。" },
    root.topic,
  );
  let state = s(f);
  assert(state.data.outline.entries.every((e) => e.review));
  e = state.data.outline.entries[1];
  patch(f, {
    action: "note",
    id: e.id,
    entryVersion: e.version,
    token: randomUUID(),
    text: e.text,
    category: e.category,
    reviewed: true,
  });
  assert(!s(f).data.outline.entries[1].review);
  assert(
    g
      .guideHistory(f.owner, f.root.id)
      .some(
        (h) =>
          h.data.outline.entries[1]?.sources[0].excerpt === f.root.data.content,
      ),
  );
  const backup = svc.exportData(f.owner),
    owner = account(),
    restored = svc.importData(owner, backup);
  const target = g.getGuide(owner, restored.ids[f.root.id]);
  assert.equal(target.data.outline.entries.length, 3);
  assert.equal(target.data.outline.autoToken, null);
  assert(target.data.outline.entries.every((e) => e.review));
  assert(
    target.data.outline.entries[0].sources.some(
      (src) => src.kind === "entity" && src.id === restored.ids[f.root.id],
    ),
  );
  assert.equal(
    target.data.outline.entries[0].targetId,
    restored.ids[s(f).data.outline.entries[0].targetId!],
  );
  const listing = logs.guideRunRecords(
    owner,
    restored.ids[f.root.id],
    null,
    null,
  );
  assert.equal(listing.total, 1);
});
test("旧会话兼容、账号隔离、无钥匙不调用提供方，手动整理与确认仍可用", async () => {
  const f = fixture(),
    other = fixture();
  const legacy = JSON.parse(JSON.stringify(s(f).data));
  delete legacy.outline;
  assert.deepEqual(schema.guideSchema.parse(legacy).outline.entries, []);
  assert.throws(() =>
    out.mutateOutline(other.owner, f.root.id, {
      version: 1,
      action: "note",
      token: randomUUID(),
      category: "known",
      text: "不应写入",
    }),
  );
  process.env.DEEPSEEK_API_KEY = "";
  let called = false;
  try {
    await assert.rejects(
      () =>
        out.generateOutline(
          f.owner,
          f.root.id,
          { version: s(f).version, token: f.token, intent: "initial" },
          async () => {
            called = true;
            throw Error("must not call");
          },
        ),
      /AI尚未配置/,
    );
    assert(!called);
    note(f, "自己整理的一条理解");
    const e = s(f).data.outline.entries[0],
      body = {
        version: s(f).version,
        action: "confirm",
        id: e.id,
        entryVersion: e.version,
        kind: "card",
        text: e.text,
      };
    out.mutateOutline(f.owner, f.root.id, body);
    out.mutateOutline(f.owner, f.root.id, body);
    assert.equal(svc.list(f.owner).length, 2);
    assert.equal(
      svc.list(f.owner).find((e) => e.kind === "card")!.data.verification,
      "未核实",
    );
  } finally {
    process.env.DEEPSEEK_API_KEY = "offline-provider-only";
  }
});

test("分析期间回收原文不会遗留运行锁；恢复后显示失败状态而不自动重放", async () => {
  const f = fixture();
  let release!: (v: Response) => void;
  const request = out.generateOutline(
    f.owner,
    f.root.id,
    { version: s(f).version, token: f.token, intent: "initial" },
    async () =>
      await new Promise<Response>((r) => {
        release = r;
      }),
  );
  const root = svc.get(f.owner, f.root.id);
  svc.softDelete(f.owner, root.id, root.version);
  release(
    await provider({ changes: [item(f, "过时内容", "known")], question: null })(
      "",
      {},
    ),
  );
  await assert.rejects(() => request);
  assert.equal(
    db.one<{ state: string }>("SELECT state FROM calls WHERE owner=?", f.owner)!
      .state,
    "error",
  );
  const removed = svc.get(f.owner, root.id, true);
  svc.softDelete(f.owner, root.id, removed.version, true);
  assert.equal(s(f).data.outline.jobs[0].state, "error");
  assert.equal(s(f).data.outline.entries.length, 0);
});
