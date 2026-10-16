import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "guide-focus-")),
  "test.sqlite",
);
process.env.DEEPSEEK_API_KEY = "";
const g = await import("../lib/guidance");
const db = await import("../lib/db");
const svc = await import("../lib/service");
const records = await import("../lib/guide-records");
const exp = await import("../lib/guide-experience");
const { guideSchema, questionSchema } = await import("../lib/guidance-schema");
function fixture() {
  const user = randomUUID();
  db.run(
    "INSERT INTO users(id,email,password,created_at) VALUES(?,?,?,?)",
    user,
    user + "@test.example",
    "test-only",
    new Date().toISOString(),
  );
  const root = g.startGuide(user, {
    content: "我在考虑今天买不买这件衣服。",
    token: randomUUID(),
    organize: true,
  });
  return { user, root };
}
function command(user: string, root: string, body: Record<string, unknown>) {
  return g.mutateGuide(user, root, {
    version: g.getGuide(user, root).version,
    ...body,
  });
}
function answer(
  user: string,
  root: string,
  detail: string,
  selected: string[] = [],
) {
  return command(user, root, {
    action: "answer",
    questionId: g.getGuide(user, root).data.current!.id,
    text: detail,
    status: "answered",
    response: { detail, selected },
  });
}
function purchase() {
  const f = fixture();
  command(f.user, f.root.id, {
    action: "scenario",
    scenario: "purchase",
    draft: "",
  });
  answer(f.user, f.root.id, "想更亮眼、更快乐。");
  answer(f.user, f.root.id, "舞会。");
  return f;
}
test("购买引导从偏好和场景推进到真实机会、适用性、代价和当前倾向，允许阶段收束", () => {
  const { user, root } = purchase();
  let s = g.getGuide(user, root.id);
  assert.equal(s.data.current!.itemKey, "opportunity");
  assert.equal(s.data.current!.input.kind, "single");
  assert.equal(s.data.current!.input.options.at(-1)!.id, "other");
  assert.equal(s.data.answers.length, 2);
  assert.deepEqual(
    exp.guideClues(s, []).map((c) => c.text),
    ["想更亮眼、更快乐。", "舞会。"],
  );
  s = answer(user, root.id, "下周六有明确安排", ["yes"]);
  assert.equal(s.data.current!.itemKey, "fit");
  s = answer(user, root.id, "已核对着装要求", ["yes"]);
  assert.equal(s.data.current!.itemKey, "budget");
  s = answer(user, root.id, "在这月可支配范围内", ["yes"]);
  assert.equal(s.data.current!.input.kind, "compare");
  s = answer(user, root.id, "还想再比一下价格", ["wait"]);
  assert.equal(s.data.current, null);
  assert(s.data.closure);
  assert(!/彻底|100%|已解决/.test(s.data.closure.message));
  assert.equal(s.data.answers.at(-1)!.response!.detail, "还想再比一下价格");
  assert.equal(svc.list(user).length, 1);
  const f = purchase();
  s = answer(f.user, f.root.id, "目前只是想象", ["no"]);
  assert.equal(s.data.current!.itemKey, "tradeoff");
  s = answer(f.user, f.root.id, "我愿意为喜欢本身付出一点预算");
  assert.equal(s.data.current!.itemKey, "budget");
  const u = purchase();
  s = answer(u.user, u.root.id, "还不知道最近是否有舞会", ["uncertain"]);
  assert.equal(s.data.answers.at(-1)!.status, "unknown");
  assert.equal(s.data.current, null);
  assert.equal(s.data.closure!.reason, "external");
  assert(exp.guideClues(s, []).some((c) => c.nature.startsWith("未知")));
});
test("选择与补充、暂停、换问法、切引导及重启保留草稿，非法选项不写入", () => {
  const { user, root } = purchase();
  let s = g.getGuide(user, root.id);
  const response = { selected: ["yes"], detail: "下周六，但时间还没核对" };
  s = command(user, root.id, {
    action: "pause",
    draft: response.detail,
    response,
  });
  db.closeDatabase();
  s = g.getGuide(user, root.id);
  assert.deepEqual(s.data.draftResponse, response);
  s = command(user, root.id, {
    action: "reframe",
    reason: "direct",
  });
  assert.equal(s.data.current!.input.kind, "single");
  assert.deepEqual(s.data.draftResponse, response);
  const question = s.data.current!;
  s = command(user, root.id, {
    action: "scenario",
    scenario: "general",
    draft: response.detail,
    response,
  });
  assert.deepEqual(s.data.parked.at(-1)!.response, response);
  s = command(user, root.id, {
    action: "resume",
    questionId: question.id,
    draft: "",
  });
  assert.deepEqual(s.data.draftResponse, response);
  const before = s.version;
  assert.throws(
    () => answer(user, root.id, "仍保留", ["invalid"]),
    /选项已变化/,
  );
  assert.equal(g.getGuide(user, root.id).version, before);
  s = answer(user, root.id, response.detail, response.selected);
  assert.equal(
    s.data.answers.at(-1)!.text,
    "选择：有，已经有明确安排\n" + response.detail,
  );
  assert.equal(s.data.draftResponse, null);
  const a = s.data.answers.at(-1)!;
  command(user, root.id, {
    action: "editAnswer",
    answerId: a.id,
    text: "",
    status: "answered",
    response: { selected: ["possible"], detail: "安排变了" },
  });
  assert(
    g
      .guideHistory(user, root.id)
      .some((h) => h.data.answers.some((x) => x.text.includes("下周六"))),
  );
  const target = fixture();
  const imported = svc.importData(target.user, svc.exportData(user));
  assert.deepEqual(
    g.getGuide(target.user, imported.ids[root.id]).data.answers.at(-1)!
      .response,
    { selected: ["possible"], detail: "安排变了" },
  );
});
test("多选、中性出口和自由表达不预选、不丢补充，未知与跳过分别保留", () => {
  const q = questionSchema.parse({
    id: "q",
    direction: "concern",
    text: "你主要关注哪些因素？",
    hint: "",
    rephrase: "",
    review: false,
    mode: "basic",
    input: exp.usableAnswerFormat({
      kind: "multiple",
      options: [
        { id: "time", label: "时间" },
        { id: "cost", label: "代价" },
      ],
    }),
  });
  const r = { selected: ["time", "cost"], detail: "还关注自己的体验" };
  assert.equal(exp.validateResponse(q, r), null);
  assert.equal(exp.composeResponse(q, r), "选择：时间、代价\n还关注自己的体验");
  assert(
    exp.validateResponse(q, { selected: ["time", "uncertain"], detail: "" }),
  );
  assert.equal(
    exp.composeResponse(q, { selected: [], detail: "自己的表述" }),
    "自己的表述",
  );
  assert.equal(
    exp.usableAnswerFormat({
      kind: "single",
      options: [
        { id: "same", label: "甲" },
        { id: "same", label: "乙" },
      ],
    }).kind,
    "text",
  );
  const f = fixture();
  let s = command(f.user, f.root.id, {
    action: "answer",
    questionId: g.getGuide(f.user, f.root.id).data.current!.id,
    text: "",
    status: "skipped",
    response: { selected: [], detail: "" },
  });
  s = command(f.user, f.root.id, {
    action: "answer",
    questionId: s.data.current!.id,
    text: "",
    status: "unknown",
    response: { selected: [], detail: "" },
  });
  assert.deepEqual(
    s.data.answers.map((a) => a.status),
    ["skipped", "unknown"],
  );
});
test("修改理解不改原话或已确认记录，预览后幂等采纳，旧回答变化提示核对", () => {
  const { user, root } = purchase();
  let s = g.getGuide(user, root.id);
  const raw = s.data.answers[0],
    other = s.data.answers[1];
  s = command(user, root.id, {
    action: "correctUnderstanding",
    key: raw.id,
    text: "更重视自己开心，而不是得到他人认可",
    answerIds: [raw.id],
  });
  assert.equal(s.data.answers[0].text, raw.text);
  assert.equal(s.data.understandings.length, 1);
  assert(exp.guideClues(s, []).some((c) => c.text.includes("自己开心")));
  s = command(user, root.id, { action: "prepare" });
  assert.equal(
    s.data.candidates.filter(
      (c) => !c.stale && c.status === "pending" && c.answerIds.includes(raw.id),
    ).length,
    1,
  );
  assert(
    s.data.candidates.some(
      (c) => c.answerIds.includes(other.id) && !c.answerIds.includes(raw.id),
    ),
  );
  const c = s.data.candidates.find((c) => c.editedByUser)!;
  const input = {
    action: "confirm",
    version: s.version,
    candidates: [
      { id: c.id, text: c.text, kind: c.kind, cardType: c.cardType },
    ],
  };
  g.mutateGuide(user, root.id, input);
  g.mutateGuide(user, root.id, input);
  assert.equal(svc.list(user).length, 2);
  s = command(user, root.id, {
    action: "editAnswer",
    answerId: raw.id,
    text: "更重视舒适",
    status: "answered",
  });
  assert(s.data.candidates.find((x) => x.id === c.id)!.stale);
  assert(s.data.answers[1].review);
  assert(s.data.understandings[0].review);
  assert.equal(exp.guideAnchor(root, s, []).corrections.length, 0);
  assert.equal(
    svc.list(user).find((e) => e.kind === "card")!.data.content,
    c.text,
  );
  assert(
    g
      .guideHistory(user, root.id)
      .some((h) => h.data.answers[0].text === raw.text),
  );
});
test("运行记录合并同一次快照与返回，按需读取且有用户隔离；只读不会新建快照或版本", () => {
  const { user, root } = purchase();
  let s = g.getGuide(user, root.id);
  const snapshot = JSON.stringify({
    entities: [root],
    answers: s.data.answers,
  });
  const now = new Date().toISOString();
  s.data.runs.push({
    id: "same-call",
    createdAt: now,
    snapshot,
    result: "{}",
    stale: false,
  });
  db.run(
    "UPDATE guidance_sessions SET data=? WHERE id=?",
    JSON.stringify(s.data),
    s.id,
  );
  db.run(
    "INSERT INTO guidance_requests(id,owner,session_id,snapshot,state,base_version,result,created_at) VALUES(?,?,?,?,?,?,?,?)",
    "same-call",
    user,
    s.id,
    snapshot,
    "success",
    s.version,
    "{}",
    now,
  );
  const before = g.getGuide(user, root.id);
  const listing = records.guideRunRecords(user, root.id, null, null);
  assert("records" in listing);
  assert.equal(listing.records!.length, 1);
  assert(!("snapshot" in listing.records![0]));
  const detail = records.guideRunRecords(user, root.id, "same-call", null);
  assert("snapshot" in detail);
  assert.equal(detail.snapshot.answers.length, 2);
  const c = records.compactGuide(before);
  assert.equal(c.requests, undefined);
  assert.equal(c.data.runs[0].snapshot, "");
  assert.equal(records.guideInputScope(user, root.id).latestRunId, "same-call");
  for (let i = 0; i < 3; i++) {
    records.guideRunRecords(user, root.id, null, null);
    records.guideInputScope(user, root.id);
  }
  assert.deepEqual(g.getGuide(user, root.id), before);
  const other = fixture();
  assert.throws(() =>
    records.guideRunRecords(other.user, root.id, "same-call", null),
  );
  for (let i = 0; i < 12; i++)
    db.run(
      "INSERT INTO guidance_requests(id,owner,session_id,snapshot,state,base_version,result,created_at) VALUES(?,?,?,?,?,?,?,?)",
      "extra-" + i,
      user,
      s.id,
      snapshot,
      "error",
      s.version,
      "测试失败",
      now + i,
    );
  const p = records.guideRunRecords(user, root.id, null, null);
  assert("records" in p);
  assert.equal(p.records!.length, 10);
  assert(p.nextCursor);
  const p2 = records.guideRunRecords(user, root.id, null, p.nextCursor);
  assert("records" in p2);
  assert.equal(p2.records!.length, 3);
  assert.equal(
    records.compactGuide(g.getGuide(user, root.id)).lastRequest!.state,
    "error",
  );
});
test("AI请求携带最初问题、已明确目标及用户修正；返回选项为候选，不替用户选择", async () => {
  const { user, root } = purchase();
  let s = g.getGuide(user, root.id);
  s = command(user, root.id, {
    action: "correctUnderstanding",
    key: s.data.answers[0].id,
    text: "快乐本身也值得投入",
    answerIds: [s.data.answers[0].id],
  });
  const last = s.data.answers.at(-1)!;
  process.env.DEEPSEEK_API_KEY = "offline-test-only";
  let calls = 0;
  try {
    const result = await g.generateGuide(
      user,
      root.id,
      { version: s.version, mode: "整理思路" },
      async (_url, opts) => {
        calls++;
        const input = JSON.parse(
          JSON.parse(String(opts?.body)).messages[1].content,
        );
        assert.equal(input.anchor.original, root.data.content);
        assert.equal(input.anchor.goals[0].text, "想更亮眼、更快乐。");
        assert.equal(input.anchor.corrections[0].text, "快乐本身也值得投入");
        assert.equal(input.answers.length, 2);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  question: {
                    text: "近期有确定的穿着机会吗？",
                    hint: "可以回想已有安排",
                    rephrase: "",
                    direction: "basis",
                    purpose: "确认实际安排",
                    sourceAnswerIds: [last.id],
                    explanation: "把想到的场景与实际安排分开，再考虑购买。",
                    input: {
                      kind: "single",
                      options: [
                        { id: "yes", label: "有明确安排" },
                        { id: "no", label: "暂时没有" },
                      ],
                    },
                  },
                  candidates: [],
                }),
              },
            },
          ],
          usage: { total_tokens: 10 },
        });
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.session.data.current!.input.kind, "single");
    assert.equal(result.session.data.draftResponse, null);
    assert.equal(
      result.session.data.candidates.filter((c) => c.source === "ai").length,
      0,
    );
    assert.equal(result.session.data.runs.length, 1);
    records.guideRunRecords(user, root.id, null, null);
    assert.equal(calls, 1);
  } finally {
    process.env.DEEPSEEK_API_KEY = "";
  }
});
test("旧会话缺少新增字段仍可读取，当前问题和原文不被重写", () => {
  const f = fixture();
  const s = g.getGuide(f.user, f.root.id);
  const legacy = JSON.parse(JSON.stringify(s.data));
  delete legacy.draftResponse;
  delete legacy.closure;
  delete legacy.understandings;
  delete legacy.current.input;
  delete legacy.current.explanation;
  delete legacy.current.understanding;
  const parsed = guideSchema.parse(legacy);
  assert.equal(parsed.current!.text, s.data.current!.text);
  assert.deepEqual(parsed.current!.input, { kind: "text", options: [] });
  assert.deepEqual(parsed.understandings, []);
  assert.equal(parsed.draftResponse, null);
});

test("切回基础时选项与主问对应，草稿保存；原文理解修正不捏造问答或正式成果", () => {
  const { user, root } = purchase();
  let s = g.getGuide(user, root.id);
  s = command(user, root.id, {
    action: "basic",
    draft: "下周安排",
    response: { selected: ["yes"], detail: "下周安排" },
  });
  assert.equal(s.data.current!.text, "近期有确定的使用机会吗？");
  assert.equal(s.data.current!.input.kind, "single");
  assert.deepEqual(s.data.draftResponse, {
    selected: ["yes"],
    detail: "下周安排",
  });
  const f = fixture();
  s = command(f.user, f.root.id, {
    action: "correctUnderstanding",
    key: "understanding:original",
    text: "我关心自己的快乐，不是旁人的评价",
    answerIds: [],
  });
  assert.equal(s.data.answers.length, 0);
  assert.equal(s.data.candidates.length, 0);
  assert.equal(svc.list(f.user).length, 1);
  assert.equal(
    exp.guideAnchor(f.root, s, []).corrections[0].text,
    "我关心自己的快乐，不是旁人的评价",
  );
});
