import { z } from "zod";
export const outlineCategories = [
  "issue",
  "known",
  "goal",
  "concern",
  "option",
  "basis",
  "condition",
  "unknown",
  "next",
  "judgment",
] as const;
export const outlineLabels: Record<(typeof outlineCategories)[number], string> =
  {
    issue: "现在要解决什么",
    known: "已经明确的",
    goal: "想获得的",
    concern: "在意或担心的",
    option: "可以考虑的选择",
    basis: "已有依据",
    condition: "需要权衡的条件",
    unknown: "还待确认",
    next: "可能的下一步",
    judgment: "当前倾向",
  };
export const outlineSourceSchema = z
  .object({
    kind: z.enum(["entity", "answer", "entry"]),
    id: z.string().min(1),
    version: z.number().int().positive(),
    signature: z.string().default(""),
    excerpt: z.string().max(50000),
  })
  .strict();
export const outlineEntrySchema = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    category: z.enum(outlineCategories),
    text: z.string().min(1).max(5000),
    origin: z.enum(["ai", "manual"]),
    aiDerived: z.boolean().default(false),
    runId: z.string().nullable().default(null),
    sources: z.array(outlineSourceSchema).max(30),
    review: z.boolean().default(false),
    targetId: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export const outlineChangeSchema = z
  .object({
    id: z.string(),
    targetId: z.string().nullable(),
    baseEntryVersion: z.number().int().nullable(),
    before: z.string(),
    category: z.enum(outlineCategories),
    text: z.string().min(1).max(5000),
    reason: z.string().max(1000),
    sources: z.array(outlineSourceSchema).min(1).max(30),
    state: z.enum(["pending", "accepted", "ignored"]),
    review: z.boolean(),
    runId: z.string(),
  })
  .strict();
export const comparisonSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            id: z.string(),
            text: z.string().min(1).max(5000),
            sourceIds: z.array(z.string()).max(30),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    dimensions: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string().min(1).max(100),
            values: z
              .array(
                z
                  .object({
                    optionId: z.string(),
                    text: z.string().max(2000),
                    state: z.enum(["known", "unknown", "na"]),
                  })
                  .strict(),
              )
              .max(4),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const outlineSchema = z
  .object({
    autoToken: z.string().uuid().nullable(),
    attempted: z.boolean(),
    entries: z.array(outlineEntrySchema).max(200),
    changes: z.array(outlineChangeSchema).max(300),
    jobs: z
      .array(
        z
          .object({
            token: z.string().uuid(),
            id: z.string().nullable(),
            fingerprint: z.string(),
            state: z.enum(["running", "success", "error"]),
            message: z.string(),
            stale: z.boolean(),
            createdAt: z.string(),
          })
          .strict(),
      )
      .max(100),
    comparison: comparisonSchema.nullable(),
    focusId: z.string().nullable(),
    clarification: z.boolean(),
    questionRunId: z.string().nullable().default(null),
  })
  .strict();
export const emptyOutline = () => ({
  autoToken: null,
  attempted: false,
  entries: [],
  changes: [],
  jobs: [],
  comparison: null,
  focusId: null,
  clarification: false,
  questionRunId: null,
});
export type OutlineEntry = z.infer<typeof outlineEntrySchema>;
export type OutlineSource = z.infer<typeof outlineSourceSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
