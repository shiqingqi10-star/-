import { Entity, Kind, Field, titles, fields, dateInZone } from "./schema";
export const topicSections = [
  { label: "写下来", kinds: ["record"] },
  { label: "理清楚", kinds: ["card", "relation", "evidence"] },
  {
    label: "往前走",
    kinds: ["question", "task", "event", "validation", "review"],
  },
] as const;
export const kindLabels: Record<Kind, string> = {
  ...titles,
  topic: "一个思考",
  record: "我最初的想法",
  question: "还没想清楚",
  task: "下一步行动",
  event: "事件",
  evidence: "我有哪些依据",
  validation: "验证结果",
  review: "我现在怎么看",
};
export function sectionFor(kind: Kind) {
  return topicSections.findIndex((s) =>
    (s.kinds as readonly string[]).includes(kind),
  );
}
export function rememberedKind(value: unknown): Kind {
  return fields[String(value) as Kind] && value !== "topic"
    ? (value as Kind)
    : "card";
}
export const entityName = (e: Entity) =>
  String(e.data.title || e.data.content || kindLabels[e.kind]);
export function excerpt(e: Entity) {
  for (const key of [
    "content",
    "summary",
    "goal",
    "judgment",
    "actual",
    "answer",
    "observation",
    "excerpt",
    "reason",
    "approach",
    "action",
    "notes",
    "details",
  ])
    if (e.data[key] && String(e.data[key]) !== entityName(e))
      return String(e.data[key]);
  return e.kind === "topic"
    ? String(e.data.focus || "从一个想法开始，慢慢理清方向。")
    : "";
}
export const itemDate = (e: Entity) =>
  String(
    e.kind === "event"
      ? e.data.date || ""
      : e.kind === "question"
        ? e.data.decisionDate || ""
        : e.kind === "review"
          ? e.data.nextDate || ""
          : e.data.due || "",
  ).slice(0, 10);
export const finished = (e: Entity) =>
  ["已完成", "已处理", "已解决", "取消"].includes(String(e.data.status));
export function recentTopics(items: Entity[]) {
  return items
    .filter(
      (e) =>
        e.kind === "topic" &&
        !e.deletedAt &&
        !e.data.archived &&
        e.data.status !== "归档",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
}
export function focusItems(items: Entity[], today: string, cap = 5) {
  const end = new Date(today + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 7);
  const limit = end.toISOString().slice(0, 10);
  return [...new Map(items.map((e) => [e.id, e])).values()]
    .filter(
      (e) =>
        !e.deletedAt &&
        !e.data.archived &&
        !finished(e) &&
        (e.data.today ||
          (["task", "event", "question"].includes(e.kind) &&
            itemDate(e) &&
            itemDate(e) <= limit)),
    )
    .sort((a, b) => {
      const rank = (e: Entity) =>
        itemDate(e) && itemDate(e) < today
          ? 0
          : itemDate(e) === today
            ? 1
            : e.data.today
              ? 2
              : 3;
      return (
        rank(a) - rank(b) ||
        (itemDate(a) || "9999").localeCompare(itemDate(b) || "9999") ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    })
    .slice(0, cap);
}
export function matchesDate(e: Entity, filter: string, today: string) {
  const d = itemDate(e);
  if (filter === "全部") return true;
  if (filter === "逾期") return Boolean(d && d < today && !finished(e));
  if (filter === "今日") return d === today;
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return Boolean(d && d >= start && d <= date.toISOString().slice(0, 10));
}
export function readableTime(value: string, zone: string, full = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    month: "numeric",
    day: "numeric",
    ...(full ? { year: "numeric", hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
export function fieldLabel(kind: Kind, field: Field) {
  const names: Record<string, string> = {
    refs: "与哪些内容有关",
    sourceRefs: "来源原文",
    evidenceRefs: "关联证据",
    hypothesisRefs: "待验证假设",
    taskRefs: "关联任务",
    parentRefs: "父任务",
    questionRefs: "关联问题",
    supports: "支持的卡片",
    opposes: "反对的卡片",
    from: "前提卡片",
    to: "结论卡片",
    priority: "优先级",
  };
  if (field.key === "content") return kind === "record" ? "原文" : "内容";
  return names[field.key] || field.label;
}
export function defaultData(kind: Kind) {
  const d: Record<string, unknown> = {};
  for (const f of fields[kind]) {
    if (f.required) d[f.key] = f.type === "refs" ? [] : "";
    if (f.options) d[f.key] = f.options[0];
  }
  if (kind === "validation") d.direction = "无结论";
  return d;
}
export type EditorGroup = { label: string; keys: string[] };
export function editorGroups(
  kind: Kind,
  data: Record<string, unknown>,
): EditorGroup[] {
  const basics: Record<Kind, string[]> = {
    topic: ["title", "goal"],
    record: ["content"],
    card: ["content", "type"],
    relation: ["from", "to", "type", "reason"],
    question: ["title"],
    task: ["title", "due"],
    event: ["title", "date"],
    evidence: ["title", "type"],
    validation: ["title", "hypothesisRefs", "actual", "direction"],
    review: ["title", "judgment", "change", "changeReason"],
  };
  const base = [...basics[kind]];
  if (kind === "question" && data.status === "等待信息")
    base.push("waitingFor");
  if (kind === "task" && data.type === "验证任务")
    base.push(
      "type",
      "action",
      "information",
      "observation",
      "criterion",
      "hypothesisRefs",
    );
  if (kind === "evidence")
    base.push(
      ...({
        访谈或反馈: ["question", "answer"],
        数据或观察: ["observation", "method"],
        外部资料: ["sourceName", "url", "excerpt"],
        个人推断: ["observation", "scope"],
      }[String(data.type)] || ["question", "answer"]),
    );
  const allKeys = fields[kind]
    .filter((f) => f.key !== "lastPosition")
    .map((f) => f.key);
  const refs = allKeys.filter(
    (k) =>
      fields[kind].find((f) => f.key === k)?.type === "refs" &&
      !base.includes(k),
  );
  const source = allKeys.filter(
    (k) =>
      [
        "source",
        "sourcePosition",
        "published",
        "acquired",
        "time",
        "verification",
        "sample",
        "scope",
        "unexplained",
      ].includes(k) && !base.includes(k),
  );
  const more = allKeys.filter(
    (k) => !base.includes(k) && !refs.includes(k) && !source.includes(k),
  );
  return [
    { label: "基础信息", keys: base },
    { label: "补充信息", keys: more },
    { label: "来源与记录方法", keys: source },
    { label: "与哪些内容有关", keys: refs },
    { label: "关注与归档", keys: ["today", "pinned", "archived"] },
  ].filter((g) => g.keys.length);
}
export function periodDate(zone: string) {
  return dateInZone(new Date(), zone);
}
