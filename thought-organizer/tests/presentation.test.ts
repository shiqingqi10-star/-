import test from "node:test";
import assert from "node:assert/strict";
import { Entity, Kind, kinds, fields, selectScope } from "../lib/schema";
import {
  focusItems,
  recentTopics,
  rememberedKind,
  sectionFor,
  topicSections,
  editorGroups,
  defaultData,
} from "../lib/presentation";
function entity(
  id: string,
  kind: Kind,
  data: Record<string, unknown>,
  updatedAt = "2026-10-12T00:00:00Z",
): Entity {
  return {
    id,
    kind,
    data,
    owner: "test-user",
    topic: null,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    version: 1,
    contentVersion: 1,
  };
}
test("继续整理按真实更新时间取三个未归档主题", () => {
  const rows = [
    entity("old", "topic", {}, "2026-09-01T00:00:00Z"),
    entity("paused", "topic", { status: "暂停" }, "2026-10-10T00:00:00Z"),
    entity("archive", "topic", { status: "归档" }, "2026-10-12T05:00:00Z"),
    entity("new", "topic", {}, "2026-10-12T01:00:00Z"),
    entity("middle", "topic", {}, "2026-10-11T00:00:00Z"),
  ];
  assert.deepEqual(
    recentTopics(rows).map((e) => e.id),
    ["new", "middle", "paused"],
  );
});
test("今日关注合并去重、优先逾期与今天、只截取五项", () => {
  const overdue = entity("overdue", "task", { due: "2026-10-11" }),
    today = entity("today", "event", { date: "2026-10-12T12:00" }),
    focus = entity("focus", "card", { today: true });
  const rows = [
    focus,
    entity("near", "task", { due: "2026-10-13" }),
    today,
    overdue,
    focus,
    entity("ordinary", "card", {}),
    entity("done", "task", { due: "2026-10-10", status: "已完成" }),
    entity("future", "task", { due: "2026-12-01" }),
    entity("f2", "record", { today: true }),
    entity("f3", "question", { today: true }),
  ];
  const selected = focusItems(rows, "2026-10-12");
  assert.equal(selected.length, 5);
  assert.deepEqual(
    selected.slice(0, 2).map((e) => e.id),
    ["overdue", "today"],
  );
  assert.equal(selected.filter((e) => e.id === "focus").length, 1);
  assert(!selected.some((e) => ["ordinary", "done", "future"].includes(e.id)));
  assert.equal(focusItems(rows, "2026-10-12", Infinity).length, 6);
});
test("旧位置中的全部九种内容映射到三个自由切换阶段", () => {
  assert.equal(topicSections.length, 3);
  for (const kind of kinds.filter((k) => k !== "topic")) {
    assert.equal(rememberedKind(kind), kind);
    assert(
      (topicSections[sectionFor(kind)].kinds as readonly string[]).includes(
        kind,
      ),
    );
  }
  assert.equal(rememberedKind("unknown"), "card");
  assert.equal(rememberedKind("topic"), "card");
});
test("每种类型的所有编辑字段可访问，必填字段位于基础区域", () => {
  for (const kind of kinds) {
    for (const type of [
      undefined,
      "普通任务",
      "验证任务",
      "访谈或反馈",
      "数据或观察",
      "外部资料",
      "个人推断",
    ]) {
      const groups = editorGroups(kind, {
        ...defaultData(kind),
        ...(type ? { type } : {}),
      });
      const keys = groups.flatMap((g) => g.keys);
      for (const field of fields[kind].filter(
        (f) => f.key !== "lastPosition",
      )) {
        assert.equal(
          keys.filter((key) => key === field.key).length,
          1,
          kind + ":" + field.key,
        );
        if (field.required) assert(groups[0].keys.includes(field.key));
      }
    }
  }
});

const thinking = await import("../lib/thinking");
test("独立思考只收纳明确关联的内容，保留反向来源、跨类型链及账号隔离", () => {
  const root = entity("raw", "record", { content: "完整原文" });
  const card = entity("card", "card", {
    content: "观点",
    sourceRefs: [root.id],
  });
  const question = entity("question", "question", {
    title: "疑问",
    refs: [card.id],
  });
  const task = entity("task", "task", {
    title: "行动",
    questionRefs: [question.id],
  });
  const unrelated = entity("other", "record", { content: "无关的私人正文" });
  const foreign = {
    ...entity("foreign", "card", {
      content: "其他账号",
      sourceRefs: [root.id],
    }),
    owner: "another-owner",
  };
  const deleted = {
    ...entity("deleted", "evidence", { title: "已删除", supports: [card.id] }),
    deletedAt: "2026-10-13T00:00:00Z",
  };
  const rows = [root, card, question, task, unrelated, foreign, deleted];
  assert.deepEqual(
    thinking
      .thinkingScope(rows, root)
      .map((e) => e.id)
      .sort(),
    ["card", "question", "raw", "task"],
  );
  assert(!thinking.thinkingScope(rows, root).some((e) => e.id === "other"));
});
test("继续思考包含旧主题和独立原文，按关联内容真实更新时间排序，简称不改原文", () => {
  const content = "  我想参加活动。\n但担心占用时间。  ";
  const root = entity("raw", "record", { content }, "2026-10-10T00:00:00Z");
  const card = entity(
    "c",
    "card",
    { content: "担心时间", sourceRefs: [root.id] },
    "2026-10-13T00:00:00Z",
  );
  const t = entity("topic", "topic", {}, "2026-10-12T00:00:00Z");
  const archived = entity(
    "archive",
    "record",
    { archived: true },
    "2026-10-14T00:00:00Z",
  );
  assert.deepEqual(
    thinking.recentThoughts([root, card, t, archived]).map((e) => e.id),
    [root.id, t.id],
  );
  assert.equal(thinking.shortName(content), "我想参加活动");
  assert.equal(root.data.content, content);
});

test("选择独立卡片只携带必要来源，不通过原文的归属列表扩散到未选卡片", () => {
  const root = entity("root", "record", {
    content: "当前原文",
    refs: ["selected", "unselected"],
  });
  const selected = entity("selected", "card", {
    content: "所选内容",
    sourceRefs: [root.id],
  });
  const unselected = entity("unselected", "card", {
    content: "同一思考中未选的其他内容",
    sourceRefs: [root.id],
  });
  const pool = [root, selected, unselected];
  assert.deepEqual(
    selectScope(pool, null, [selected.id])
      .map((e) => e.id)
      .sort(),
    [root.id, selected.id].sort(),
  );
  assert.equal(
    selectScope(
      pool,
      null,
      thinking.thinkingScope(pool, root).map((e) => e.id),
    ).length,
    3,
  );
});
