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
export const questionSchema = z
  .object({
    id: z.string(),
    direction: z.enum(directions),
    text: z.string().min(1).max(500),
    mode: z.enum(["basic", "ai"]),
    hint: z.string().max(2000),
    rephrase: z.string().max(500),
    review: z.boolean(),
  })
  .strict();
export const answerSchema = z
  .object({
    id: z.string(),
    question: questionSchema,
    text: z.string().max(50000),
    status: z.enum(["answered", "unknown", "skipped"]),
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
};
