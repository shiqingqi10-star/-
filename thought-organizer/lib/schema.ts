import { z } from "zod";
export const kinds = [
  "topic",
  "record",
  "card",
  "relation",
  "question",
  "task",
  "event",
  "evidence",
  "validation",
  "review",
] as const;
export type Kind = (typeof kinds)[number];
export type Entity = {
  id: string;
  owner: string;
  kind: Kind;
  topic: string | null;
  version: number;
  contentVersion: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
};
export type Field = {
  key: string;
  label: string;
  type?:
    "text" | "area" | "date" | "datetime-local" | "number" | "boolean" | "refs";
  options?: readonly string[];
  required?: boolean;
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  options?: readonly string[],
  required = false,
): Field => ({ key, label, type, options, required });
export const states: Partial<Record<Kind, readonly string[]>> = {
  topic: ["探索中", "验证中", "执行中", "暂停", "归档"],
  question: [
    "待整理",
    "思考中",
    "等待信息",
    "已有暂定判断",
    "已解决",
    "暂时搁置",
  ],
  task: ["待开始", "进行中", "等待", "已完成", "取消"],
  event: ["未处理", "准备中", "已处理", "取消"],
  evidence: ["待核实", "已有支持", "存在冲突", "暂时无结论"],
};
export const titles: Record<Kind, string> = {
  topic: "主题",
  record: "原始记录",
  card: "思路卡片",
  relation: "逻辑关系",
  question: "待思考问题",
  task: "任务",
  event: "重要事件",
  evidence: "文字证据",
  validation: "验证结果",
  review: "决策与复盘",
};
export const fields: Record<Kind, Field[]> = {
  topic: [
    f("title", "名称", "text", undefined, true),
    f("summary", "简介", "area"),
    f("tags", "标签（逗号分隔）"),
    f("goal", "目标", "area"),
    f("background", "背景与限制", "area"),
    f("focus", "当前重点"),
    f("status", "阶段", "text", states.topic),
    f("lastPosition", "上次位置"),
  ],
  record: [
    f("title", "标题（可选）"),
    f("content", "原始文字", "area", undefined, true),
    f("tags", "标签"),
    f("status", "整理状态", "text", ["未整理", "整理中", "已整理"]),
    f("refs", "与哪些内容有关", "refs"),
    f("lastPosition", "上次位置"),
  ],
  card: [
    f("title", "摘要"),
    f("content", "内容", "area", undefined, true),
    f("type", "类型", "text", [
      "事实或观察",
      "假设",
      "观点或推断",
      "问题",
      "结论",
      "备选方案",
    ]),
    f("details", "详细说明", "area"),
    f("source", "创建者来源", "text", ["用户陈述", "AI推断", "外部证据"]),
    f("sourceRefs", "来源原文编号", "refs"),
    f("sourcePosition", "原文位置"),
    f("evidenceRefs", "证据编号", "refs"),
    f("verification", "核实状态", "text", ["未核实", "已核实", "有争议"]),
    f("tags", "标记"),
    f("group", "分组"),
    f("order", "排序", "number"),
    f("collapsed", "折叠", "boolean"),
  ],
  relation: [
    f("title", "关系摘要"),
    f("from", "前提卡片编号（支持多个）", "refs", undefined, true),
    f("to", "结论卡片编号", "refs", undefined, true),
    f("type", "关系类型", "text", [
      "推导",
      "支持",
      "反对",
      "前提依赖",
      "分类归属",
    ]),
    f("reason", "为什么这样连接", "area"),
    f("order", "排序", "number"),
  ],
  question: [
    f("title", "问题", "text", undefined, true),
    f("importance", "重要性", "text", ["普通", "重要", "关键"]),
    f("priority", "用户优先级", "text", ["低", "中", "高"]),
    f("decisionDate", "决策日期", "date"),
    f("known", "已知", "area"),
    f("unknown", "未知", "area"),
    f("missing", "缺少的信息", "area"),
    f("approach", "推进方式", "area"),
    f("answer", "暂定答案", "area"),
    f("basis", "依据", "area"),
    f("unresolved", "未解决部分", "area"),
    f("waitingFor", "等待什么"),
    f("reviewDate", "复盘日期", "date"),
    f("choiceReason", "选择理由", "area"),
    f("refs", "关联卡片、证据、任务、事件、方案", "refs"),
    f("status", "状态", "text", states.question),
  ],
  task: [
    f("title", "名称", "text", undefined, true),
    f("type", "任务类型", "text", ["普通任务", "验证任务"]),
    f("status", "状态", "text", states.task),
    f("priority", "优先级", "text", ["低", "中", "高"]),
    f("due", "截止日期", "date"),
    f("estimate", "预估分钟", "number"),
    f("parentRefs", "父任务编号", "refs"),
    f("questionRefs", "关联问题编号", "refs"),
    f("hypothesisRefs", "待验证假设编号", "refs"),
    f("action", "具体行动", "area"),
    f("information", "希望获得的信息", "area"),
    f("observation", "观察方式", "area"),
    f("criterion", "判断条件", "area"),
    f("result", "实际结果", "area"),
    f("order", "排序", "number"),
  ],
  event: [
    f("title", "名称", "text", undefined, true),
    f("date", "日期或时间", "datetime-local"),
    f("status", "处理状态", "text", states.event),
    f("location", "地点"),
    f("taskRefs", "准备任务编号", "refs"),
    f("notes", "备注", "area"),
    f("order", "排序", "number"),
  ],
  evidence: [
    f("title", "标题", "text", undefined, true),
    f("type", "类型", "text", [
      "访谈或反馈",
      "数据或观察",
      "外部资料",
      "个人推断",
    ]),
    f("status", "状态", "text", states.evidence),
    f("time", "记录时间", "datetime-local"),
    f("question", "提问", "area"),
    f("answer", "实际回答", "area"),
    f("method", "记录方法", "area"),
    f("observation", "数值或观察", "area"),
    f("sourceName", "来源名称"),
    f("url", "来源链接"),
    f("published", "发布时间", "date"),
    f("acquired", "获取时间", "date"),
    f("excerpt", "相关摘录", "area"),
    f("scope", "适用范围与限制", "area"),
    f("supports", "支持的卡片编号", "refs"),
    f("opposes", "反对的卡片编号", "refs"),
  ],
  validation: [
    f("title", "验证名称", "text", undefined, true),
    f("hypothesisRefs", "目标假设编号", "refs", undefined, true),
    f("taskRefs", "关联任务编号", "refs"),
    f("evidenceRefs", "关联证据编号", "refs"),
    f("method", "方法", "area"),
    f("expected", "预期", "area"),
    f("actual", "实际结果", "area"),
    f("direction", "方向", "text", ["支持", "反对", "无结论"]),
    f("sample", "样本范围", "area"),
    f("unexplained", "无法解释部分", "area"),
    f("next", "下一步", "area"),
  ],
  review: [
    f("title", "标题", "text", undefined, true),
    f("selected", "选定方案", "area"),
    f("reason", "理由", "area"),
    f("basis", "依据", "area"),
    f("cost", "承受代价", "area"),
    f("judgment", "当前判断", "area"),
    f("change", "判断变化", "area"),
    f("changeReason", "修改原因", "area"),
    f("evidenceRefs", "关联证据编号", "refs"),
    f("reevaluate", "再次评估条件", "area"),
    f("nextDate", "下次复盘", "date"),
  ],
};
export const common: Field[] = [
  f("today", "今日关注", "boolean"),
  f("pinned", "重要置顶", "boolean"),
  f("archived", "归档", "boolean"),
];
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function fail(code: string, status = 400): never {
  throw new AppError(code, status);
}
export function dataSchema(kind: Kind) {
  const shape: Record<string, z.ZodType> = {};
  for (const x of [...fields[kind], ...common]) {
    let s: z.ZodType =
      x.type === "refs"
        ? z.array(z.string().min(1).max(100)).max(100)
        : x.type === "boolean"
          ? z.boolean()
          : x.type === "number"
            ? z.number().finite().min(0).max(1e7)
            : x.options
              ? z.enum(x.options as [string, ...string[]])
              : z.string().max(x.type === "area" ? 50000 : 2000);
    if (x.required) {
      if (x.type === "refs")
        s = z.array(z.string().min(1).max(100)).min(1).max(100);
      else s = z.string().min(1).max(50000);
    }
    shape[x.key] = x.required ? s : s.optional();
  }
  return z.object(shape).strict();
}
export function validateData(kind: Kind, data: unknown) {
  const parsed = dataSchema(kind).safeParse(data);
  if (!parsed.success)
    fail(
      "字段格式错误：" +
        parsed.error.issues
          .map((x) => x.path.join(".") + " " + x.message)
          .join(";"),
    );
  const d = parsed.data;
  if (
    ["topic", "record"].includes(kind) &&
    d.lastPosition &&
    !kinds.includes(d.lastPosition as Kind)
  )
    fail("主题位置无效");
  if (kind === "question" && d.status === "等待信息" && !d.waitingFor)
    fail("等待信息时请注明在等什么");
  for (const key of [
    "decisionDate",
    "reviewDate",
    "due",
    "date",
    "time",
    "published",
    "acquired",
    "nextDate",
  ])
    if (
      d[key] &&
      (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(d[key])) ||
        Number.isNaN(Date.parse(String(d[key]))))
    )
      fail("日期格式错误");
  for (const key of [
    "decisionDate",
    "reviewDate",
    "due",
    "date",
    "time",
    "published",
    "acquired",
    "nextDate",
  ])
    if (d[key]) {
      const day = String(d[key]).slice(0, 10);
      if (new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day)
        fail("日期不存在");
    }
  if (d.url) {
    try {
      const u = new URL(String(d.url));
      if (!["http:", "https:"].includes(u.protocol)) fail("仅支持HTTP来源链接");
    } catch {
      fail("来源链接无效");
    }
  }
  return d as Record<string, unknown>;
}
export function referenceFields(kind: Kind) {
  return fields[kind].filter((x) => x.type === "refs").map((x) => x.key);
}
export function selectScope(
  items: Entity[],
  topic: string | null,
  ids: string[],
) {
  const pool = items.filter(
    (e) => !e.deletedAt && (e.topic === topic || e.id === topic),
  );
  const chosen = new Map<string, Entity>();
  const queue = ids.length ? [...new Set(ids)] : pool.map((x) => x.id);
  if (topic) queue.push(topic);
  while (queue.length) {
    const id = queue.shift()!;
    if (chosen.has(id)) continue;
    const e = pool.find((x) => x.id === id);
    if (!e) fail("分析范围不存在或跨主题", 403);
    chosen.set(id, e);
    // Record refs organize a standalone space; selecting one card must not
    // expand through its source record into every other member of that space.
    for (const key of referenceFields(e.kind).filter(
      (key) => !(ids.length && e.kind === "record" && key === "refs"),
    ))
      for (const ref of (e.data[key] as string[]) || [])
        if (pool.some((x) => x.id === ref) && !chosen.has(ref)) queue.push(ref);
  }
  return [...chosen.values()];
}
export function dateInZone(date: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function cycleWarnings(items: Entity[]) {
  const adj = new Map<string, string[]>();
  for (const r of items.filter((x) => x.kind === "relation" && !x.deletedAt)) {
    for (const f of (r.data.from as string[]) || [])
      adj.set(f, [...(adj.get(f) || []), ...((r.data.to as string[]) || [])]);
  }
  const visited = new Set<string>(),
    stack = new Set<string>();
  let cycle = false;
  function walk(id: string) {
    if (stack.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const n of adj.get(id) || []) walk(n);
    stack.delete(id);
  }
  for (const k of adj.keys()) walk(k);
  return cycle;
}
