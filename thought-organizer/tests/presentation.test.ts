import test from "node:test";
import assert from "node:assert/strict";
import { Entity, Kind, kinds, fields } from "../lib/schema";
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
test("旧位置中的全部九种内容映射到五个新主标签", () => {
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
