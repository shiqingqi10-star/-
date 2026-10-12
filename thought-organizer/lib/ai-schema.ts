import { z } from "zod";
import { Entity, fail } from "./schema";
const ref = z.string().min(1).max(100);
const issueSchema = z
  .object({
    title: z.string().min(1).max(300),
    refs: z.array(ref).min(1).max(20),
    quote: z.string().min(1).max(2000),
    type: z.enum(["逻辑矛盾", "信息不足", "现实约束", "目标冲突", "价值取舍"]),
    reason: z.string().min(1).max(5000),
    missing: z.string().max(3000),
    alternative: z.string().max(3000),
    validation: z.string().max(3000),
    impact: z.enum(["当前关键", "值得补充", "可暂缓"]),
    impactReason: z.string().min(1).max(2000),
  })
  .strict();
export const outputSchema = z
  .object({
    understanding: z.string().min(1).max(10000),
    clarifications: z.array(z.string().min(1).max(1000)).max(3),
    cards: z
      .array(
        z
          .object({
            localId: ref,
            title: z.string().max(300),
            content: z.string().min(1).max(10000),
            type: z.enum([
              "事实或观察",
              "假设",
              "观点或推断",
              "问题",
              "结论",
              "备选方案",
            ]),
            sourceRefs: z.array(ref).max(20),
          })
          .strict(),
      )
      .max(30),
    relations: z
      .array(
        z
          .object({
            from: z.array(ref).min(1).max(20),
            to: z.array(ref).length(1),
            type: z.enum(["推导", "支持", "反对", "前提依赖", "分类归属"]),
            reason: z.string().max(3000),
          })
          .strict(),
      )
      .max(30),
    issues: z.array(issueSchema).max(8),
    next: z
      .array(
        z
          .object({
            kind: z.enum(["question", "task"]),
            title: z.string().min(1).max(300),
            refs: z.array(ref).max(20),
            action: z.string().max(3000),
            information: z.string().max(3000),
            criterion: z.string().max(3000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
type Output = z.infer<typeof outputSchema>;
export function validateSuggestion(kind: string, value: unknown) {
  const shapes = {
    card: outputSchema.shape.cards.element,
    relation: outputSchema.shape.relations.element,
    issue: issueSchema,
    question: outputSchema.shape.next.element,
    task: outputSchema.shape.next.element,
  };
  const schema = shapes[kind as keyof typeof shapes];
  if (!schema) fail("备份建议类型错误");
  const result = schema.safeParse(value);
  if (!result.success) fail("备份建议字段错误");
  return result.data;
}
export function validateOutput(value: unknown, snapshot: Entity[]): Output {
  const parsed = outputSchema.safeParse(value);
  if (!parsed.success) fail("AI格式错误：请重试", 502);
  const out = parsed.data;
  const known = new Map(snapshot.map((e) => [e.id, e]));
  const drafts = new Set<string>();
  for (const c of out.cards) {
    if (known.has(c.localId) || drafts.has(c.localId))
      fail("AI草稿编号重复", 502);
    drafts.add(c.localId);
    for (const id of c.sourceRefs)
      if (!known.has(id) || !["record", "card"].includes(known.get(id)!.kind))
        fail("AI来源引用无效", 502);
  }
  for (const r of out.relations)
    for (const id of [...r.from, ...r.to])
      if (!drafts.has(id) && known.get(id)?.kind !== "card")
        fail("AI关系引用无效", 502);
  for (const i of out.issues) {
    for (const id of i.refs) if (!known.has(id)) fail("AI疑点引用无效", 502);
    if (
      !i.refs.some((id) =>
        String(known.get(id)?.data.content || "").includes(i.quote),
      )
    )
      fail("AI疑点无法定位原句", 502);
  }
  for (const n of out.next)
    for (const id of n.refs) if (!known.has(id)) fail("AI下一步引用无效", 502);
  return out;
}
