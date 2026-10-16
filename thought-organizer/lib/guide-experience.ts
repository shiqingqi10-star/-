import {
  GuideData,
  GuideSession,
  guidanceLabels,
  answerFormatSchema,
  responseSchema,
} from "./guidance-schema";
import { Entity } from "./schema";
import { entityName } from "./presentation";
import { isJudgment, judgmentText } from "./thinking";
import { z } from "zod";
export type AnswerFormat = z.infer<typeof answerFormatSchema>;
export type GuideResponse = z.infer<typeof responseSchema>;
export type GuideQuestion = NonNullable<GuideData["current"]>;
export function usableAnswerFormat(input: AnswerFormat): AnswerFormat {
  if (!["single", "multiple", "compare"].includes(input.kind))
    return { ...input, options: [] };
  const options = input.options.filter(
    (o) => !["uncertain", "other"].includes(o.id),
  );
  if (
    options.length < 2 ||
    new Set(input.options.map((o) => o.id)).size !== input.options.length ||
    new Set(input.options.map((o) => o.label.trim())).size !==
      input.options.length
  )
    return { kind: "text", options: [] };
  return {
    ...input,
    options: [
      ...options.slice(0, 6),
      { id: "uncertain", label: "不确定" },
      { id: "other", label: "其他" },
    ],
  };
}
export function composeResponse(q: GuideQuestion, response: GuideResponse) {
  const labels = response.selected
    .map((id) => q.input.options.find((o) => o.id === id)?.label)
    .filter(Boolean);
  return [labels.length ? `选择：${labels.join("、")}` : "", response.detail]
    .filter(Boolean)
    .join("\n");
}
export function validateResponse(q: GuideQuestion, response: GuideResponse) {
  if (new Set(response.selected).size !== response.selected.length)
    return "选择项重复，请重新核对。";
  if (response.selected.some((id) => !q.input.options.some((o) => o.id === id)))
    return "回答选项已变化，补充内容保留，请重新选择。";
  if (q.input.kind !== "multiple" && response.selected.length > 1)
    return "这一问请选择一项，或直接补充说明。";
  if (response.selected.includes("uncertain") && response.selected.length > 1)
    return "不确定不能与其他选项同时选择。";
  return null;
}
export type GuideClue = {
  key: string;
  label: string;
  text: string;
  nature: string;
  answerIds: string[];
  entityIds: string[];
  candidateId?: string;
  review: boolean;
  slot: string;
  score: number;
};
export function guideClues(
  session: GuideSession,
  rows: Entity[],
  limit = 3,
): GuideClue[] {
  const out: GuideClue[] = [];
  const valid = session.data.answers.filter(
    (a) =>
      a.status !== "skipped" &&
      !a.review &&
      !["notApplicable", "unwilling"].includes(a.assessment),
  );
  const usedAnswers = new Set<string>(),
    usedEntities = new Set<string>();
  const slot = (ids: string[], direction: string) =>
    ids.some(
      (id) => valid.find((a) => a.id === id)?.question.itemKey === "context",
    )
      ? "context"
      : direction;
  const score = (key: string) =>
    ({
      goal: 100,
      context: 95,
      unknown: 92,
      judgment: 90,
      basis: 85,
      concern: 80,
      next: 75,
    })[key] || 70;
  for (const c of [...session.data.candidates].reverse()) {
    if (
      c.status === "ignored" ||
      c.stale ||
      c.answerIds.some((id) => !valid.some((a) => a.id === id))
    )
      continue;
    const target = rows.find((e) => e.id === c.target && !e.deletedAt),
      s = slot(c.answerIds, c.direction);
    if (c.target && !target) continue;
    out.push({
      key: c.id,
      label: s === "context" ? "想到的场景" : guidanceLabels[c.direction],
      text: target && isJudgment(target) ? judgmentText(target) : c.text,
      nature: target
        ? "已确认记录"
        : c.editedByUser
          ? "我的整理 · 待确认"
          : c.source === "ai"
            ? "AI理解 · 待确认"
            : "原话整理 · 待确认",
      answerIds: c.answerIds,
      entityIds: target ? [target.id] : [],
      candidateId: c.id,
      review: false,
      slot: s,
      score: score(s),
    });
    c.answerIds.forEach((id) => usedAnswers.add(id));
    if (target) usedEntities.add(target.id);
  }
  for (const a of [...valid].reverse()) {
    if (usedAnswers.has(a.id)) continue;
    const unknown = a.status === "unknown" || a.assessment === "external",
      s = unknown
        ? "unknown"
        : a.question.itemKey === "context"
          ? "context"
          : a.question.direction;
    out.push({
      key: a.id,
      label: unknown
        ? "还待确认"
        : s === "context"
          ? "想到的场景"
          : guidanceLabels[a.question.direction],
      text: a.text || a.question.text,
      nature: unknown
        ? "未知 · 用户记录"
        : a.assessment === "inferred"
          ? "个人推测 · 未核实"
          : "原话",
      answerIds: [a.id],
      entityIds: [],
      review: false,
      slot: s,
      score: score(s),
    });
  }
  for (const e of rows) {
    if (
      usedEntities.has(e.id) ||
      e.deletedAt ||
      !["card", "review", "question", "task"].includes(e.kind)
    )
      continue;
    if (
      e.kind === "task" &&
      ["已完成", "已取消"].includes(String(e.data.status))
    )
      continue;
    const s = isJudgment(e)
      ? "judgment"
      : e.kind === "question"
        ? "unknown"
        : e.kind === "task"
          ? "next"
          : "basis";
    out.push({
      key: e.id,
      label: guidanceLabels[s],
      text: isJudgment(e)
        ? judgmentText(e)
        : String(
            e.data.missing || e.data.action || e.data.content || e.data.title,
          ),
      nature:
        e.kind === "card"
          ? `${e.data.type} · ${e.data.verification || "未核实"}`
          : "已有记录",
      answerIds: [],
      entityIds: [e.id],
      review: session.data.judgments.some(
        (j) => j.entityId === e.id && j.needsReview,
      ),
      slot: s,
      score: score(s),
    });
  }
  const seen = new Set<string>(),
    slots = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const key = c.text.replace(/\s/g, "");
      if (seen.has(key) || slots.has(c.slot)) return false;
      seen.add(key);
      slots.add(c.slot);
      return true;
    })
    .slice(0, limit);
}
export function guideAnchor(root: Entity, s: GuideSession, rows: Entity[]) {
  return {
    original:
      root.kind === "record"
        ? String(root.data.content)
        : String(root.data.goal || root.data.title),
    goals: s.data.answers
      .filter(
        (a) =>
          a.status === "answered" &&
          !a.review &&
          a.question.direction === "goal",
      )
      .map((a) => ({ id: a.id, question: a.question.text, text: a.text })),
    corrections: s.data.understandings.filter((u) => !u.review),
    clues: guideClues(s, rows, 6),
    unknowns: s.data.answers
      .filter(
        (a) =>
          !a.review && (a.status === "unknown" || a.assessment === "external"),
      )
      .map((a) => ({ id: a.id, question: a.question.text, text: a.text })),
    decisions: rows
      .filter(isJudgment)
      .map((e) => ({ id: e.id, title: entityName(e), text: judgmentText(e) })),
  };
}
