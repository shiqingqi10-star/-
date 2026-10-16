import { z } from "zod";
export const directions = [
  "goal",
  "concern",
  "basis",
  "unknown",
  "next",
  "judgment",
] as const;
export type Direction = (typeof directions)[number];
export const guidanceLabels: Record<Direction, string> = {
  goal: "我真正想要的",
  concern: "让我犹豫的",
  basis: "我已有的依据",
  unknown: "还需要弄清楚的",
  judgment: "我目前的倾向",
  next: "我准备做的下一步",
};
export const presets: Record<
  Direction,
  { text: string; rephrase: string; hint: string }
> = {
  goal: {
    text: "你最希望得到什么？",
    rephrase: "这件事如果有一个让你满意的结果，它会是什么？",
    hint: "可以想一想你想获得的体验、改变或感受。不需要先决定怎么做。",
  },
  concern: {
    text: "最让你犹豫的具体是什么？",
    rephrase: "想到这件事，你最担心哪一个具体情况？",
    hint: "可以从时间、成本、风险或与其他事情的冲突中，选一个此刻最在意的。",
  },
  basis: {
    text: "什么信息让你产生这个判断？",
    rephrase: "你是看到或听到了什么，才这么想的？",
    hint: "试着区分亲眼见到的信息、别人告诉你的内容，以及自己的推测。没有依据也可以如实留下。",
  },
  unknown: {
    text: "哪个信息弄清楚后，你会更容易决定？",
    rephrase: "现在还缺哪一条具体信息？",
    hint: "可以想想尚未确认的人、时间、条件或安排；不必把它们全部列完。",
  },
  next: {
    text: "现在可以做的最小一步是什么？",
    rephrase: "如果你愿意往前一点点，可以先做哪件小事？",
    hint: "可以只是询问、观察或等待。没有必要形成行动时，可以跳过。",
  },
  judgment: {
    text: "根据目前这些信息，你现在更倾向于什么？",
    rephrase: "此刻你怎么想，还保留哪些条件？",
    hint: "倾向可以是不决定、等待信息，或在某个条件成立时再选择。决定由你确认。",
  },
};
export const strategies = [
  "concrete",
  "experience",
  "compare",
  "evidence",
  "condition",
  "counterexample",
  "smaller",
  "tradeoff",
  "verify",
] as const;
export const assessments = [
  "unspecified",
  "clear",
  "vague",
  "inferred",
  "observed",
  "preference",
  "decision",
  "external",
  "internal",
  "misunderstood",
  "notApplicable",
  "unwilling",
] as const;
export const scenarioSchema = z.enum([
  "general",
  "decision",
  "project",
  "reflection",
  "purchase",
]);
export const answerFormatSchema = z
  .object({
    kind: z
      .enum(["text", "single", "multiple", "compare", "unknown"])
      .default("text"),
    options: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(100),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export const responseSchema = z
  .object({
    selected: z.array(z.string().max(80)).max(8).default([]),
    detail: z.string().max(50000).default(""),
  })
  .strict();
const strategyUse = z
  .object({
    strategy: z.enum(strategies),
    text: z.string().max(500),
    reason: z.enum(["direct", "abstract", "missing", "notApplicable"]),
    mode: z.enum(["basic", "ai"]),
  })
  .strict();
export const questionSchema = z
  .object({
    id: z.string(),
    direction: z.enum(directions),
    text: z.string().min(1).max(500),
    mode: z.enum(["basic", "ai"]),
    hint: z.string().max(2000),
    rephrase: z.string().max(500),
    review: z.boolean(),
    explanation: z.string().max(2000).default(""),
    understanding: z.string().max(500).default(""),
    input: answerFormatSchema.default({ kind: "text", options: [] }),
    itemKey: z.string().max(200).default(""),
    purpose: z.string().max(500).default(""),
    sourceAnswerIds: z.array(z.string()).max(100).default([]),
    targetId: z.string().nullable().default(null),
    prerequisites: z.array(z.string()).max(30).default([]),
    strategies: z.array(strategyUse).max(9).default([]),
  })
  .strict();
export const answerSchema = z
  .object({
    id: z.string(),
    question: questionSchema,
    text: z.string().max(50000),
    status: z.enum(["answered", "unknown", "skipped"]),
    assessment: z.enum(assessments).default("unspecified"),
    response: responseSchema.nullable().default(null),
    version: z.number().int().positive(),
    review: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export const candidateSchema = z
  .object({
    id: z.string(),
    direction: z.enum(directions),
    text: z.string().min(1).max(50000),
    kind: z.enum(["card", "question", "task", "review"]),
    cardType: z.enum([
      "事实或观察",
      "假设",
      "观点或推断",
      "问题",
      "结论",
      "备选方案",
    ]),
    answerIds: z.array(z.string()).min(1).max(100),
    source: z.enum(["basic", "ai"]),
    answerSnapshots: z.array(answerSchema).max(100).default([]),
    status: z.enum(["pending", "confirmed", "ignored"]),
    target: z.string().nullable(),
    stale: z.boolean(),
    fingerprint: z.string(),
    runId: z.string().nullable(),
    editedByUser: z.boolean().default(false),
  })
  .strict();
export const judgmentMetaSchema = z
  .object({
    entityId: z.string(),
    why: z.string().max(50000).default(""),
    uncertain: z.string().max(50000).default(""),
    conditions: z.string().max(50000).default(""),
    method: z.string().max(50000).default(""),
    answerIds: z.array(z.string()).max(100).default([]),
    evidenceRefs: z.array(z.string()).max(100).default([]),
    needsReview: z.boolean().default(false),
  })
  .strict();
export const updateSchema = z
  .object({
    id: z.string(),
    token: z.string().uuid(),
    fingerprint: z.string(),
    kind: z.enum(["information", "judgment", "result", "check"]),
    text: z.string().max(50000),
    reason: z.string().max(50000),
    targets: z.array(z.string()).max(30),
    evidenceRefs: z.array(z.string()).max(30),
    taskId: z.string().nullable(),
    createdAt: z.string(),
    before: z
      .array(
        z
          .object({
            entityId: z.string(),
            text: z.string(),
            version: z.number().int().positive(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const impactSchema = z
  .object({
    id: z.string(),
    updateId: z.string(),
    entityId: z.string(),
    reason: z.string().max(50000),
    status: z.enum(["pending", "still", "adjust", "uncertain"]),
    comment: z.string().max(50000),
    resolved: z.boolean().default(false),
    stance: z.enum(["supports", "opposes", "related"]),
  })
  .strict();
export const guideSchema = z
  .object({
    current: questionSchema.nullable(),
    answers: z.array(answerSchema).max(300),
    candidates: z.array(candidateSchema).max(500),
    mode: z.enum(["basic", "ai"]),
    paused: z.boolean(),
    draft: z.string().max(50000),
    draftResponse: responseSchema.nullable().default(null),
    closure: z
      .object({
        message: z.string().max(1000),
        reason: z.enum(["external", "enough", "pause"]),
        answerIds: z.array(z.string()).max(100),
      })
      .strict()
      .nullable()
      .default(null),
    understandings: z
      .array(
        z
          .object({
            key: z.string(),
            text: z.string().max(5000),
            answerIds: z.array(z.string()).max(100),
            updatedAt: z.string(),
            review: z.boolean().default(false),
          })
          .strict(),
      )
      .max(300)
      .default([]),
    runs: z
      .array(
        z
          .object({
            id: z.string(),
            snapshot: z.string().max(500000),
            result: z.string().max(100000),
            createdAt: z.string(),
            stale: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    rootSignature: z.string(),
    scenario: scenarioSchema.default("general"),
    parked: z
      .array(
        z
          .object({
            question: questionSchema,
            draft: z.string().max(50000),
            response: responseSchema.nullable().default(null),
            pausedAt: z.string(),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    scenarioSuggestion: scenarioSchema.nullable().default(null),
    agenda: z
      .array(
        z
          .object({
            key: z.string(),
            purpose: z.string(),
            status: z.enum([
              "pending",
              "clear",
              "unclear",
              "external",
              "skipped",
              "notApplicable",
            ]),
            answerId: z.string(),
            requires: z.array(z.string()),
            targetId: z.string().nullable(),
          })
          .strict(),
      )
      .max(500)
      .default([]),
    judgments: z.array(judgmentMetaSchema).max(200).default([]),
    updates: z.array(updateSchema).max(500).default([]),
    impacts: z.array(impactSchema).max(1000).default([]),
  })
  .strict();
export type GuideData = z.infer<typeof guideSchema>;
export type GuideAnswer = z.infer<typeof answerSchema>;
export type GuideCandidate = z.infer<typeof candidateSchema>;
export type GuideSession = {
  id: string;
  root: string;
  version: number;
  data: GuideData;
  updatedAt: string;
  lastRequest?: { state: string; createdAt: string; message: string };
  requests?: {
    id: string;
    snapshot: string;
    result: string;
    state: string;
    stale: number;
    created_at: string;
  }[];
};
