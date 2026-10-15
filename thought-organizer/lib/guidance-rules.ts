import {
  Direction,
  GuideData,
  GuideSession,
  questionSchema,
  presets,
} from "./guidance-schema";
export const scenarios = {
  general: "通用梳理",
  decision: "在几个选项间决定",
  project: "小项目是否值得做",
  reflection: "理解一次结果或失败",
} as const;
export const strategyLabels = {
  concrete: "具体化",
  experience: "回忆经历",
  compare: "对照比较",
  evidence: "检查依据",
  condition: "检查条件",
  counterexample: "寻找反例",
  smaller: "缩小问题",
  tradeoff: "澄清取舍",
  verify: "转向验证",
} as const;
export type Strategy = keyof typeof strategyLabels;
export type Scenario = keyof typeof scenarios;
export const assessmentLabels = {
  unspecified: "暂不分类",
  clear: "这一点表达清楚了",
  vague: "还比较笼统",
  inferred: "主要是我的推测",
  observed: "有实际观察或材料",
  preference: "这是我的偏好",
  decision: "这是我目前的选择",
  external: "缺少外部事实",
  internal: "还没想清自己的想法",
  misunderstood: "没理解这个问题",
  notApplicable: "不适合我的情况",
  unwilling: "暂时不想回答",
} as const;
export type Assessment = keyof typeof assessmentLabels;
type Step = {
  key: string;
  direction: Direction;
  focus: string;
  text: string;
  requires?: string[];
};
const steps: Record<Scenario, Step[]> = {
  general: [
    {
      key: "goal",
      direction: "goal",
      focus: "希望得到的结果",
      text: presets.goal.text,
    },
    {
      key: "concern",
      direction: "concern",
      focus: "让你犹豫的具体情况",
      text: presets.concern.text,
    },
    {
      key: "basis",
      direction: "basis",
      focus: "当前判断的依据",
      text: presets.basis.text,
    },
    {
      key: "unknown",
      direction: "unknown",
      focus: "会影响判断的未知信息",
      text: presets.unknown.text,
    },
    {
      key: "next",
      direction: "next",
      focus: "是否需要一个最小推进方法",
      text: presets.next.text,
    },
  ],
  decision: [
    {
      key: "options",
      direction: "goal",
      focus: "可选择的方案",
      text: "你目前在考虑哪些选择？",
    },
    {
      key: "values",
      direction: "goal",
      focus: "选择时最重视的东西",
      text: "比较这些选择时，你最不愿意牺牲的是什么？",
      requires: ["options"],
    },
    {
      key: "limits",
      direction: "concern",
      focus: "不能忽略的限制",
      text: "哪一条现实限制会直接影响你的选择？",
      requires: ["options"],
    },
    {
      key: "cost",
      direction: "basis",
      focus: "不同选择需要承受的代价",
      text: "你最倾向的选择，需要承受什么代价？",
      requires: ["values"],
    },
    {
      key: "change",
      direction: "unknown",
      focus: "可能改变选择的信息或条件",
      text: "哪条信息得到确认后，可能改变你的倾向？",
      requires: ["values"],
    },
    {
      key: "leaning",
      direction: "judgment",
      focus: "有条件的当前倾向",
      text: "带着目前的依据和不确定，你现在更倾向哪一个选择？",
      requires: ["options", "values"],
    },
  ],
  project: [
    {
      key: "audience",
      direction: "goal",
      focus: "具体使用者和使用场景",
      text: "谁会在什么情况下需要这个小工具？",
    },
    {
      key: "alternative",
      direction: "basis",
      focus: "目前的解决方式与差异",
      text: "这个人现在是怎么解决这个麻烦的？",
      requires: ["audience"],
    },
    {
      key: "demand",
      direction: "basis",
      focus: "有人需要它的实际依据",
      text: "哪些实际信息让你认为有人需要它？",
      requires: ["audience"],
    },
    {
      key: "assumption",
      direction: "unknown",
      focus: "尚未验证且影响方向的假设",
      text: "如果只能先核对一个假设，你会选哪一个？",
      requires: ["audience"],
    },
    {
      key: "investment",
      direction: "concern",
      focus: "愿意为确认需求承受的投入",
      text: "在需求确认前，你愿意投入多少时间或成本？",
      requires: ["audience"],
    },
    {
      key: "verdict",
      direction: "judgment",
      focus: "小项目的有条件判断",
      text: "根据现有依据，你现在怎么看这个项目？",
      requires: ["audience", "demand"],
    },
  ],
  reflection: [
    {
      key: "expected",
      direction: "goal",
      focus: "原先的预期",
      text: "在结果发生之前，你原本期待什么？",
    },
    {
      key: "actual",
      direction: "basis",
      focus: "实际发生的事实",
      text: "实际发生了什么可以确认的事情？",
      requires: ["expected"],
    },
    {
      key: "explanation",
      direction: "basis",
      focus: "事实之外的原因解释",
      text: "你目前怎样解释预期和实际之间的差别？",
      requires: ["actual"],
    },
    {
      key: "control",
      direction: "concern",
      focus: "可控因素与其他可能解释",
      text: "在这些因素中，哪一部分是你能够影响的？",
      requires: ["actual"],
    },
    {
      key: "uncertainCause",
      direction: "unknown",
      focus: "尚不能确定的原因",
      text: "哪一个原因目前还缺少依据？",
      requires: ["actual"],
    },
    {
      key: "adjustment",
      direction: "judgment",
      focus: "下一次可尝试的调整",
      text: "如果再遇到类似情况，你愿意尝试怎样调整？",
      requires: ["actual"],
    },
  ],
};
export function firstStep(scenario: Scenario): Step {
  return steps[scenario][0];
}
export function ruleQuestion(
  step: Step,
  id: string,
  sourceAnswerIds: string[] = [],
  targetId: string | null = null,
) {
  return questionSchema.parse({
    id,
    direction: step.direction,
    text: step.text,
    mode: "basic",
    hint: presets[step.direction].hint,
    rephrase: "",
    review: false,
    itemKey: step.key,
    purpose: step.focus,
    sourceAnswerIds,
    targetId,
    prerequisites: step.requires || [],
  });
}
export function strategyQuestion(q: GuideData["current"], strategy: Strategy) {
  if (!q) throw new Error("没有当前问题");
  const focus =
    q.purpose ||
    {
      goal: "你希望得到的结果",
      concern: "让你犹豫的情况",
      basis: "当前判断的依据",
      unknown: "尚未弄清的信息",
      next: "可行的推进方法",
      judgment: "目前的倾向",
    }[q.direction];
  const subject = `关于「${focus}」`;
  const templates: Record<Strategy, string> = {
    concrete: `${subject}，一个具体的例子是什么？`,
    experience: `${subject}，你能回忆起哪一次真实经历？`,
    compare: `${subject}，与另一种可能相比，最关键的区别是什么？`,
    evidence: `${subject}，哪部分有观察或材料支持，哪部分是自己的推测或偏好？`,
    condition: `${subject}，什么条件成立时，你的回答才适用？`,
    counterexample: `${subject}，什么信息会让你重新考虑现在的回答？`,
    smaller: `${subject}，先只处理哪一小部分会最有帮助？`,
    tradeoff: `${subject}，如果不能同时兼顾，你最想先保留什么？`,
    verify: `${subject}，可以通过什么方式得到现在缺少的信息？`,
  };
  return templates[strategy];
}
export function chooseStrategy(
  q: NonNullable<GuideData["current"]>,
  reason = "direct",
): Strategy | null {
  const used = new Set(q.strategies.map((x) => x.strategy));
  const preferred: Strategy[] =
    reason === "missing"
      ? ["verify", "evidence", "condition", "smaller"]
      : reason === "abstract"
        ? ["concrete", "experience", "smaller", "compare"]
        : reason === "notApplicable"
          ? ["smaller", "condition", "compare", "tradeoff"]
          : [
              "concrete",
              "experience",
              "compare",
              "evidence",
              "condition",
              "counterexample",
              "smaller",
              "tradeoff",
              "verify",
            ];
  return (
    [...preferred, ...(Object.keys(strategyLabels) as Strategy[])].find(
      (s) => !used.has(s),
    ) || null
  );
}
export function nextRule(s: GuideSession, id: string) {
  const last = s.data.answers.at(-1);
  if (!last) return ruleQuestion(firstStep(s.data.scenario), id);
  const a = last.assessment,
    q = last.question,
    source = [last.id];
  if (a === "vague" || a === "internal" || a === "misunderstood") {
    const strategy = a === "misunderstood" ? "concrete" : "smaller";
    const next = ruleQuestion(
      {
        key: q.itemKey || q.direction,
        direction: q.direction,
        focus: q.purpose || presets[q.direction].text,
        text: strategyQuestion(q, strategy),
      },
      id,
      source,
      q.targetId,
    );
    next.strategies = [
      { strategy, text: next.text, reason: "abstract", mode: "basic" },
    ];
    return next;
  }
  if (q.itemKey.startsWith("verify:")) return null;
  if (a === "external" || a === "inferred") {
    return ruleQuestion(
      {
        key: `verify:${q.itemKey || q.direction}`,
        direction: "next",
        focus: `确认${q.purpose || "这条推测"}的方法`,
        text: "可以向谁了解，或用什么方式确认这条信息？",
      },
      id,
      source,
      q.targetId,
    );
  }
  if (
    q.targetId ||
    q.itemKey.startsWith("verify:") ||
    q.itemKey.startsWith("focus:")
  )
    return null; // Focused work may stop without inventing another required task.
  const done = new Set(
    s.data.answers.map((x) => x.question.itemKey || x.question.direction),
  );
  const clear = new Set(
    s.data.agenda
      .filter(
        (n) =>
          n.status === "clear" ||
          (n.status === "pending" &&
            s.data.answers.some(
              (a) =>
                a.id === n.answerId && a.status === "answered" && !a.review,
            )),
      )
      .map((n) => n.key),
  );
  const pool = steps[s.data.scenario];
  let next = pool.find(
    (n) =>
      !done.has(n.key) && (n.requires || []).every((key) => clear.has(key)),
  );
  // Unclassified answers remain records, not proven resolutions. User can explicitly
  // choose exploration in general mode; scenario-dependent questions wait.
  if (s.data.scenario === "general") next = pool.find((n) => !done.has(n.key));
  return next ? ruleQuestion(next, id, source) : null;
}
export function markAgenda(s: GuideSession, a: GuideData["answers"][number]) {
  const key = a.question.itemKey || a.question.direction;
  const status =
    a.status === "skipped" || a.assessment === "unwilling"
      ? "skipped"
      : a.assessment === "notApplicable"
        ? "notApplicable"
        : a.assessment === "external"
          ? "external"
          : a.status === "unknown" ||
              ["vague", "internal", "misunderstood", "inferred"].includes(
                a.assessment,
              )
            ? "unclear"
            : ["clear", "observed", "preference", "decision"].includes(
                  a.assessment,
                )
              ? "clear"
              : "pending";
  const node = {
    key,
    purpose: a.question.purpose || presets[a.question.direction].text,
    status,
    answerId: a.id,
    requires: a.question.prerequisites,
    targetId: a.question.targetId,
  };
  const i = s.data.agenda.findIndex((n) => n.key === key);
  if (i >= 0) s.data.agenda[i] = node as GuideData["agenda"][number];
  else s.data.agenda.push(node as GuideData["agenda"][number]);
}

export function reenterScenario(s: GuideSession, id: string) {
  const pool = steps[s.data.scenario],
    applicable = new Set(
      s.data.agenda
        .filter(
          (n) =>
            n.status === "clear" ||
            (n.status === "pending" &&
              s.data.answers.some(
                (a) =>
                  a.id === n.answerId && a.status === "answered" && !a.review,
              )),
        )
        .map((n) => n.key),
    );
  const fresh = pool.find(
    (step) =>
      !s.data.answers.some((a) => a.question.itemKey === step.key) &&
      (step.requires || []).every((key) => applicable.has(key)),
  );
  if (fresh) return ruleQuestion(fresh, id);
  const unresolved = pool.find((step) =>
    s.data.agenda.some((n) => n.key === step.key && n.status !== "clear"),
  );
  if (unresolved) {
    const source = s.data.answers
      .filter((a) => a.question.itemKey === unresolved.key)
      .at(-1);
    return ruleQuestion(
      {
        ...unresolved,
        text: `关于「${unresolved.focus}」，你现在有什么想补充或重新确认的？`,
      },
      id,
      source ? [source.id] : [],
    );
  }
  return null;
}
