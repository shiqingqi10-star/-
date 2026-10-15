import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "thinking-r4-")),
  "test.sqlite",
);
process.env.DEEPSEEK_API_KEY = "";
const g = await import("../lib/guidance");
const svc = await import("../lib/service");
const updates = await import("../lib/thinking-updates");
const { run, one, closeDatabase } = await import("../lib/db");
function user() {
  const id = randomUUID();
  run(
    "INSERT INTO users(id,email,password,created_at) VALUES(?,?,?,?)",
    id,
    id + "@test.example",
    "test-only",
    new Date().toISOString(),
  );
  return id;
}
function fixture() {
  const owner = user(),
    root = g.startGuide(owner, {
      content: "我想做收费小工具，因为大家应该都有这个需求。",
      token: randomUUID(),
      organize: true,
    });
  return { owner, root };
}
function mutate(owner: string, root: string, b: Record<string, unknown>) {
  return g.mutateGuide(owner, root, {
    version: g.getGuide(owner, root).version,
    ...b,
  });
}
function answer(
  owner: string,
  root: string,
  text: string,
  assessment = "unspecified",
  status = "answered",
) {
  return mutate(owner, root, {
    action: "answer",
    questionId: g.getGuide(owner, root).data.current!.id,
    text,
    assessment,
    status,
  });
}
function save(owner: string, root: string, b: Record<string, unknown>) {
  return updates.updateThinking(owner, root, {
    version: g.getGuide(owner, root).version,
    token: randomUUID(),
    ...b,
  });
}
test("九种策略不循环、保持目的和问题身份、暂停与切场景草稿不丢", () => {
  const { owner, root } = fixture();
  let s = g.getGuide(owner, root.id);
  const id = s.data.current!.id,
    purpose = s.data.current!.purpose,
    seen = new Set<string>();
  for (let i = 0; i < 9; i++) {
    s = mutate(owner, root.id, {
      action: "reframe",
      reason: i === 0 ? "abstract" : "direct",
    });
    assert.equal(s.data.current!.id, id);
    assert.equal(s.data.current!.purpose, purpose);
    assert(!seen.has(s.data.current!.text));
    seen.add(s.data.current!.text);
  }
  assert.equal(s.data.current!.strategies.length, 9);
  assert.throws(
    () => mutate(owner, root.id, { action: "reframe" }),
    /都已尝试/,
  );
  s = mutate(owner, root.id, {
    action: "scenario",
    scenario: "project",
    draft: "还没有提交的完整回答",
  });
  assert.equal(s.data.parked[0].draft, "还没有提交的完整回答");
  s = mutate(owner, root.id, {
    action: "resume",
    questionId: id,
    draft: "新场景的回答也保留",
  });
  assert.equal(s.data.draft, "还没有提交的完整回答");
  assert(s.data.parked.some((p) => p.draft === "新场景的回答也保留"));
  closeDatabase();
  assert.equal(g.getGuide(owner, root.id).data.current!.strategies.length, 9);
});
test("三个场景由明确回答状态分支，未知不是解决，依赖等待，阶段收束不强制行动", () => {
  for (const scenario of ["decision", "project", "reflection"]) {
    const { owner, root } = fixture();
    mutate(owner, root.id, { action: "scenario", scenario });
    const first = g.getGuide(owner, root.id).data.current!;
    let s = answer(owner, root.id, "暂时只是推测", "inferred");
    assert(s.data.current!.itemKey.startsWith("verify:"));
    assert.equal(s.data.current!.sourceAnswerIds[0], s.data.answers[0].id);
    assert.equal(s.data.agenda[0].status, "unclear");
    assert.equal(s.data.current!.direction, "next");
    answer(owner, root.id, "先询问一个相关的人", "clear");
    s = g.getGuide(owner, root.id);
    assert(
      !s.data.agenda.some(
        (a) => a.key === first.itemKey && a.status === "clear",
      ),
    );
    const fresh = fixture();
    mutate(fresh.owner, fresh.root.id, { action: "scenario", scenario });
    s = answer(
      fresh.owner,
      fresh.root.id,
      "我明确选择这条信息作为当前回答",
      "clear",
    );
    assert(s.data.current);
    assert(s.data.current!.itemKey !== first.itemKey);
    assert.equal(s.data.current!.sourceAnswerIds[0], s.data.answers[0].id);
    mutate(fresh.owner, fresh.root.id, { action: "pause", draft: "" });
    assert(g.getGuide(fresh.owner, fresh.root.id).data.paused);
  }
  const { owner, root } = fixture();
  mutate(owner, root.id, { action: "scenario", scenario: "reflection" });
  answer(owner, root.id, "预期能完成两次访谈", "clear");
  answer(owner, root.id, "实际只完成一次", "observed");
  answer(owner, root.id, "不想现在解释原因", "unwilling", "skipped");
  const s = g.getGuide(owner, root.id);
  assert(s.data.answers.some((a) => a.status === "skipped"));
  assert(!svc.list(owner).some((e) => e.kind === "task"));
});
test("完整闭环：推测→确认方法→行动结果→材料与判断更新，来源和历史可追溯", () => {
  const { owner, root } = fixture();
  let s = answer(owner, root.id, "人们应该愿意为节省时间付费", "inferred");
  const source = s.data.answers[0].id;
  answer(
    owner,
    root.id,
    "访谈三位潜在使用者，了解目前办法与实际付费意愿",
    "clear",
  );
  const j = svc.createThinkingItem(
    owner,
    root.id,
    svc.get(owner, root.id).version,
    "card",
    {
      title: "需求可能值得做",
      content: "愿意付费的需求可能存在",
      type: "假设",
      source: "用户陈述",
      verification: "未核实",
      sourceRefs: [root.id],
    },
  );
  const task = svc.createThinkingItem(
    owner,
    root.id,
    svc.get(owner, root.id).version,
    "task",
    {
      title: "访谈潜在使用者",
      type: "验证任务",
      status: "待开始",
      hypothesisRefs: [j.id],
      criterion: "如果现有方式已经足够，就调整方向",
      information: "明确需求",
    },
  );
  const body = {
    action: "result",
    version: g.getGuide(owner, root.id).version,
    token: randomUUID(),
    taskId: task.id,
    taskVersion: task.version,
    happened: "访谈了三位使用者",
    information: "三位都说现有免费办法已经够用",
    influence: "付费需求比原先设想的弱",
    targets: [j.id],
  };
  const recorded = updates.updateThinking(owner, root.id, body);
  updates.updateThinking(owner, root.id, body);
  assert.equal(svc.get(owner, task.id).data.status, "已完成");
  assert.equal(svc.get(owner, j.id).data.content, "愿意付费的需求可能存在");
  assert.equal(svc.get(owner, j.id).data.verification, "未核实");
  assert.equal(
    svc.list(owner).filter((e) => e.kind === "validation").length,
    0,
  );
  assert.equal(svc.list(owner).filter((e) => e.kind === "evidence").length, 1);
  assert(
    recorded.session.data.impacts.some(
      (i) => i.entityId === j.id && i.status === "pending",
    ),
  );
  assert(
    recorded.session.data.updates[0].before.some(
      (b) => b.text === "愿意付费的需求可能存在",
    ),
  );
  const changed = save(owner, root.id, {
    action: "judgment",
    entityId: j.id,
    entityVersion: svc.get(owner, j.id).version,
    text: "暂缓收费工具，先确认是否存在现有方法无法解决的问题",
    why: "三位访谈对象已有足够的免费办法",
    uncertain: "其他人群可能不同",
    conditions: "出现重复且未解决的实际需求时再评估",
    evidenceRefs: recorded.session.data.updates[0].evidenceRefs,
  });
  assert.equal(svc.get(owner, j.id).data.type, "假设");
  assert.equal(svc.get(owner, j.id).data.verification, "未核实");
  assert(
    svc
      .history(owner, j.id)
      .some((h) => h.snapshot.data.content === "愿意付费的需求可能存在"),
  );
  assert.equal(
    changed.session.data.judgments.find((meta) => meta.entityId === j.id)?.why,
    "三位访谈对象已有足够的免费办法",
  );
  assert(changed.session.data.impacts.every((i) => i.resolved));
  assert.equal(g.getGuide(owner, root.id).data.answers[0].id, source);
  const backup = svc.exportData(owner),
    other = user(),
    imported = svc.importData(other, backup),
    restored = g.getGuide(other, imported.ids[root.id]);
  assert.equal(restored.data.updates.length, 2);
  assert.equal(restored.data.judgments[0].entityId, imported.ids[j.id]);
  assert.equal(restored.data.updates[0].taskId, imported.ids[task.id]);
  assert.equal(restored.data.updates[1].before[0].entityId, imported.ids[j.id]);
  assert(svc.markdown(owner).includes("三位都说现有免费办法已经够用"));
  closeDatabase();
  assert.equal(
    g.getGuide(owner, root.id).data.judgments[0].conditions,
    "出现重复且未解决的实际需求时再评估",
  );
});
test("新信息支持/反对与核对均需用户确认，版本冲突和跨用户写入原子拒绝", () => {
  const { owner, root } = fixture();
  const j = svc.createThinkingItem(
    owner,
    root.id,
    svc.get(owner, root.id).version,
    "review",
    {
      title: "当前倾向",
      judgment: "先尝试小范围",
      reason: "已有兴趣反馈",
      evidenceRefs: [],
      cost: "旧成本信息不丢",
    },
  );
  const info = save(owner, root.id, {
    action: "information",
    text: "有参与者提出时间冲突",
    evidenceType: "访谈或反馈",
    targets: [j.id],
    stance: "opposes",
  });
  assert.equal(svc.get(owner, j.id).data.judgment, "先尝试小范围");
  assert.equal(svc.get(owner, j.id).data.reason, "已有兴趣反馈");
  const impact = info.session.data.impacts[0];
  save(owner, root.id, {
    action: "check",
    impactId: impact.id,
    status: "still",
    comment: "可以调整活动时间，原倾向仍适用",
  });
  assert(!g.getGuide(owner, root.id).data.judgments[0].needsReview);
  const other = fixture(),
    before = svc.list(owner).length;
  assert.throws(() =>
    save(owner, root.id, {
      action: "information",
      text: "不应保存",
      targets: [other.root.id],
      stance: "related",
    }),
  );
  assert.equal(svc.list(owner).length, before);
  assert.throws(
    () =>
      save(owner, root.id, {
        action: "judgment",
        entityId: j.id,
        entityVersion: 1,
        text: "过期编辑",
      }),
    /新版本/,
  );
  assert.equal(svc.get(owner, j.id).data.cost, "旧成本信息不丢");
  save(owner, root.id, {
    action: "judgment",
    entityId: j.id,
    entityVersion: svc.get(owner, j.id).version,
    text: "改为较短的活动",
  });
  assert.equal(svc.get(owner, j.id).data.cost, "旧成本信息不丢");
  assert.deepEqual(
    svc.get(owner, j.id).data.evidenceRefs,
    info.session.data.updates[0].evidenceRefs,
  );
});
test("AI追问关联实际回答和策略、请求失败留快照、旧分析和忽略候选保护", async () => {
  const { owner, root } = fixture();
  answer(owner, root.id, "只是按自己的体验推测大家会需要", "inferred");
  let s = g.getGuide(owner, root.id);
  process.env.DEEPSEEK_API_KEY = "test-only-not-real";
  try {
    const fetcher: typeof fetch = async (_url, opts) => {
      const input = JSON.parse(
        JSON.parse(String(opts?.body)).messages[1].content,
      );
      assert.equal(input.answers.at(-1).assessment, "inferred");
      assert(input.current.sourceAnswerIds.includes(s.data.answers[0].id));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assessment: {
                  answerId: s.data.answers[0].id,
                  status: "inferred",
                  reason: "需要实际了解",
                },
                question: {
                  text: "先向哪类潜在使用者了解这个需求？",
                  direction: "next",
                  purpose: "确认对象",
                  sourceAnswerIds: [s.data.answers[0].id],
                  hint: "考虑实际遇到问题的人",
                  rephrase: "",
                },
                candidates: [],
              }),
            },
          },
        ],
      });
    };
    const result = await g.generateGuide(
      owner,
      root.id,
      { version: s.version },
      fetcher,
    );
    assert(
      result.session.data.current!.sourceAnswerIds.includes(
        s.data.answers[0].id,
      ),
    );
    assert(result.session.requests!.some((r) => r.state === "success"));
    s = result.session;
    const failer: typeof fetch = async () => {
      throw new DOMException("test", "TimeoutError");
    };
    await assert.rejects(
      g.generateGuide(
        owner,
        root.id,
        { version: s.version, intent: "reframe" },
        failer,
      ),
      /超时/,
    );
    assert(
      g
        .getGuide(owner, root.id)
        .requests!.some(
          (r) =>
            r.state === "error" && JSON.parse(r.snapshot).answers.length === 1,
        ),
    );
    assert.equal(
      g.getGuide(owner, root.id).data.answers[0].text,
      "只是按自己的体验推测大家会需要",
    );
  } finally {
    process.env.DEEPSEEK_API_KEY = "";
  }
  mutate(owner, root.id, { action: "prepare" });
  s = g.getGuide(owner, root.id);
  const c = s.data.candidates[0];
  mutate(owner, root.id, { action: "ignoreCandidate", id: c.id });
  mutate(owner, root.id, { action: "prepare" });
  assert.equal(
    g
      .getGuide(owner, root.id)
      .data.candidates.filter((c) => c.status === "pending").length,
    0,
  );
  assert.equal(
    one<{ integrity_check: string }>("PRAGMA integrity_check")!.integrity_check,
    "ok",
  );
});

test("AI守卫拒绝把声明为推测的回答写成事实、范围外关联和未明确前置条件", async () => {
  process.env.DEEPSEEK_API_KEY = "test-only-not-real";
  try {
    for (const variant of ["fact", "outside", "dependency"]) {
      const { owner, root } = fixture();
      answer(owner, root.id, "只是根据自己的经历推测需求", "inferred");
      const s = g.getGuide(owner, root.id),
        id = s.data.answers[0].id;
      const fetcher: typeof fetch = async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  question: {
                    text: "先怎样确认这个需求？",
                    direction: "next",
                    hint: "",
                    rephrase: "",
                    sourceAnswerIds: [id],
                    ...(variant === "outside"
                      ? { targetId: "another-private-record" }
                      : {}),
                    ...(variant === "dependency"
                      ? { prerequisites: [s.data.agenda[0].key] }
                      : {}),
                  },
                  candidates:
                    variant === "fact"
                      ? [
                          {
                            direction: "basis",
                            kind: "card",
                            cardType: "事实或观察",
                            text: "大家都有付费需求",
                            answerIds: [id],
                          },
                        ]
                      : [],
                }),
              },
            },
          ],
        });
      await assert.rejects(
        g.generateGuide(owner, root.id, { version: s.version }, fetcher),
        variant === "fact"
          ? /写成了事实/
          : variant === "outside"
            ? /范围外/
            : /前置|尚未明确/,
      );
      assert.equal(g.getGuide(owner, root.id).data.candidates.length, 0);
      assert.equal(svc.list(owner).length, 1);
    }
  } finally {
    process.env.DEEPSEEK_API_KEY = "";
  }
});
