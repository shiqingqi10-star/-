import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "guide-test-")),
  "test.sqlite",
);
process.env.DEEPSEEK_API_KEY = "";
const g = await import("../lib/guidance");
const service = await import("../lib/service");
const { run, one, closeDatabase } = await import("../lib/db");
function owner() {
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
const user = owner(),
  other = owner();
const content =
  "我想参加周末的活动，但怕占用时间，又担心错过认识新朋友的机会。";
function command(root: string, action: Record<string, unknown>) {
  return g.mutateGuide(user, root, {
    version: g.getGuide(user, root).version,
    ...action,
  });
}
function answer(root: string, text: string, status = "answered") {
  const s = g.getGuide(user, root);
  return command(root, {
    action: "answer",
    questionId: s.data.current!.id,
    text,
    status,
  });
}
test("两页基础流程持久化、未知和跳过分开、候选确认幂等并保留来源", () => {
  const token = randomUUID(),
    root = g.startGuide(user, { content, token, organize: true });
  assert.equal(
    g.startGuide(user, { content, token, organize: true }).id,
    root.id,
  );
  assert.equal(root.data.content, content);
  assert.throws(() => g.getGuide(other, root.id));
  answer(root.id, "我想认识新朋友");
  answer(root.id, "担心活动占用周末的时间");
  answer(root.id, "", "skipped");
  answer(root.id, "不知道活动参加人群", "unknown");
  let s = answer(root.id, "向组织者了解人群和活动时长");
  assert.equal(s.data.current, null);
  assert.equal(s.data.answers[2].status, "skipped");
  assert.equal(s.data.answers[3].status, "unknown");
  command(root.id, { action: "prepare" });
  s = g.getGuide(user, root.id);
  assert.equal(s.data.candidates.length, 4);
  assert.equal(service.list(user).filter((e) => e.kind !== "record").length, 0);
  const selected = s.data.candidates.map((c) => ({
    id: c.id,
    text: c.text,
    kind: c.kind,
    cardType: c.cardType,
  }));
  const request = {
    action: "confirm",
    version: s.version,
    candidates: selected,
  };
  g.mutateGuide(user, root.id, request);
  g.mutateGuide(user, root.id, request);
  const formal = service.list(user).filter((e) => e.id !== root.id);
  assert.equal(formal.length, 4);
  assert(formal.every((e) => e.topic === null));
  assert(
    formal
      .filter((e) => e.kind === "card")
      .every(
        (e) => e.data.verification === "未核实" && e.data.source === "用户陈述",
      ),
  );
  assert(
    formal.some(
      (e) => e.kind === "question" && String(e.data.missing).includes("人群"),
    ),
  );
  assert(formal.some((e) => e.kind === "task" && e.data.type === "普通任务"));
  const snapshot = g.getGuide(user, root.id);
  closeDatabase();
  assert.deepEqual(g.getGuide(user, root.id), snapshot);
  const a = snapshot.data.answers[0];
  command(root.id, {
    action: "editAnswer",
    answerId: a.id,
    text: "希望结识有共同兴趣的人",
    status: "answered",
  });
  const changed = g.getGuide(user, root.id);
  assert(changed.data.answers.slice(1).every((a) => a.review));
  assert(changed.data.candidates.every((c) => c.stale));
  assert.deepEqual(
    service.list(user).filter((e) => e.id !== root.id),
    formal,
  );
  assert(
    g
      .guideHistory(user, root.id)
      .some((h) => h.data.answers[0]?.text === "我想认识新朋友"),
  );
  for (const a of changed.data.answers.filter((a) => a.review))
    command(root.id, { action: "acknowledge", answerId: a.id });
  command(root.id, { action: "prepare" });
  assert(
    g
      .getGuide(user, root.id)
      .data.candidates.some((c) => c.status === "pending" && !c.stale),
  );
  const backup = service.exportData(user),
    target = owner(),
    imported = service.importData(target, backup);
  assert.equal(
    g.getGuide(target, imported.ids[root.id]).data.answers[0].text,
    "希望结识有共同兴趣的人",
  );
});
test("失败、冲突、暂停草稿、同一问题重复请求与旧主题不覆盖", () => {
  const topic = service.create(
    user,
    "topic",
    { title: "旧主题", goal: "保留原目标", status: "探索中" },
    null,
  );
  const old = service.create(
    user,
    "card",
    { content: "原有观点", type: "观点或推断" },
    topic.id,
  );
  let s = g.initializeGuide(user, topic.id);
  assert.deepEqual(service.get(user, old.id), old);
  assert.deepEqual(service.get(user, topic.id), topic);
  assert.throws(() =>
    command(topic.id, {
      action: "answer",
      questionId: s.data.current!.id,
      text: "",
      status: "answered",
    }),
  );
  const request = {
    action: "answer",
    version: s.version,
    questionId: s.data.current!.id,
    text: "保留已有思考",
    status: "answered",
  };
  g.mutateGuide(user, topic.id, request);
  g.mutateGuide(user, topic.id, request);
  assert.equal(g.getGuide(user, topic.id).data.answers.length, 1);
  assert.throws(() =>
    g.mutateGuide(user, topic.id, {
      action: "direction",
      version: s.version,
      direction: "next",
    }),
  );
  s = command(topic.id, { action: "pause", draft: "还没写完的回答" });
  command(topic.id, { action: "prepare" });
  assert.equal(g.getGuide(user, topic.id).data.paused, true);
  closeDatabase();
  assert.equal(g.getGuide(user, topic.id).data.draft, "还没写完的回答");
  assert.equal(s.data.paused, true);
});
test("无钥匙不调用模型；AI失败不丢问答，真实接口契约保留快照、单问和来源", async () => {
  const root = g.startGuide(user, {
    content,
    token: randomUUID(),
    organize: true,
  });
  answer(root.id, "希望认识新朋友");
  let s = g.getGuide(user, root.id);
  let called = false;
  const mock: typeof fetch = async () => {
    called = true;
    return new Response("error", { status: 500 });
  };
  await assert.rejects(
    g.generateGuide(user, root.id, { version: s.version }, mock),
    /AI尚未配置/,
  );
  assert.equal(called, false);
  process.env.DEEPSEEK_API_KEY = "test-only-not-a-real-key";
  try {
    await assert.rejects(
      g.generateGuide(user, root.id, { version: s.version }, mock),
      /AI服务错误/,
    );
    assert.equal(
      g.getGuide(user, root.id).data.answers[0].text,
      "希望认识新朋友",
    );
    const fetcher: typeof fetch = async (_url, options) => {
      const input = JSON.parse(
        JSON.parse(String(options?.body)).messages[1].content,
      );
      assert(input.entities.every((e: { id: string }) => e.id === root.id));
      assert.equal(input.answers.length, 1);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                question: {
                  text: "你愿意为认识朋友留出多长时间？",
                  direction: "concern",
                  hint: "想一想周末其他安排",
                  rephrase: "这个周末可以留多少时间给活动？",
                },
                candidates: [
                  {
                    direction: "goal",
                    text: "希望认识新朋友",
                    kind: "card",
                    cardType: "观点或推断",
                    answerIds: [s.data.answers[0].id],
                  },
                ],
              }),
            },
          },
        ],
        usage: { total_tokens: 50 },
      });
    };
    const result = await g.generateGuide(
      user,
      root.id,
      { version: s.version },
      fetcher,
    );
    assert.equal(result.session.data.current?.mode, "ai");
    assert.equal(result.session.data.candidates[0].source, "ai");
    assert.equal(
      service
        .list(user)
        .filter(
          (e) =>
            e.id !== root.id &&
            ((e.data.sourceRefs as string[]) || []).includes(root.id),
        ).length,
      0,
    );
    assert.equal(result.session.data.runs.length, 1);
    s = result.session;
    command(root.id, {
      action: "editAnswer",
      answerId: s.data.answers[0].id,
      text: "更希望认识同行",
      status: "answered",
    });
    s = g.getGuide(user, root.id);
    assert(s.data.current?.review);
    assert(s.data.runs[0].stale);
    assert(
      one<{ count: number }>(
        "SELECT count(*) count FROM calls WHERE owner=?",
        user,
      )!.count >= 2,
    );
  } finally {
    process.env.DEEPSEEK_API_KEY = "";
  }
});
test("AI并发期间修改内容不覆盖新状态；多个追问、无效来源和超时被拒绝", async () => {
  const id = owner(),
    root = g.startGuide(id, { content, token: randomUUID(), organize: true });
  process.env.DEEPSEEK_API_KEY = "test-only-not-a-real-key";
  try {
    let release: ((response: Response) => void) | undefined;
    const pending: typeof fetch = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const before = g.getGuide(id, root.id),
      generating = g.generateGuide(
        id,
        root.id,
        { version: before.version },
        pending,
      );
    await new Promise((resolve) => setImmediate(resolve));
    g.mutateGuide(id, root.id, {
      version: before.version,
      action: "answer",
      questionId: before.data.current!.id,
      text: "已经补充了目标",
      status: "answered",
    });
    release!(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                question: {
                  text: "原来的目标是什么？",
                  direction: "goal",
                  hint: "",
                  rephrase: "你原先想得到什么？",
                },
                candidates: [],
              }),
            },
          },
        ],
      }),
    );
    const result = await generating;
    assert(result.stale);
    assert.equal(result.session.data.current!.direction, "concern");
    assert.equal(result.session.data.answers[0].text, "已经补充了目标");
    assert(result.session.data.runs[0].stale);
    const invalid: typeof fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: {
                  text: "你的目标是什么？你担心什么？",
                  direction: "goal",
                  hint: "",
                  rephrase: "",
                },
                candidates: [],
              }),
            },
          },
        ],
      });
    await assert.rejects(
      g.generateGuide(
        id,
        root.id,
        { version: result.session.version },
        invalid,
      ),
      /重复或多个问题/,
    );
    const isolated = owner(),
      another = g.startGuide(isolated, {
        content,
        token: randomUUID(),
        organize: true,
      });
    const badSource: typeof fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: null,
                candidates: [
                  {
                    direction: "goal",
                    text: "不能采纳的推断",
                    kind: "card",
                    cardType: "观点或推断",
                    answerIds: ["not-an-input-answer"],
                  },
                ],
              }),
            },
          },
        ],
      });
    await assert.rejects(
      g.generateGuide(
        isolated,
        another.id,
        { version: g.getGuide(isolated, another.id).version },
        badSource,
      ),
      /来源不正确/,
    );
    assert.equal(service.list(isolated).length, 1);
    const timeout: typeof fetch = async () => {
      throw new DOMException("test-only", "TimeoutError");
    };
    await assert.rejects(
      g.generateGuide(
        id,
        root.id,
        { version: result.session.version },
        timeout,
      ),
      /超时/,
    );
    assert.equal(g.getGuide(id, root.id).data.answers.length, 1);
  } finally {
    process.env.DEEPSEEK_API_KEY = "";
  }
});
