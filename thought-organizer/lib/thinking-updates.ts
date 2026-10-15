import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "./db";
import { create, createThinkingItem, get, update } from "./service";
import { fail, Entity } from "./schema";
import { getGuide, guideScope, persistGuide } from "./guidance";
import { judgmentMetaSchema, GuideSession } from "./guidance-schema";
import { shortName, judgmentText, isJudgment } from "./thinking";
const version = z.number().int().positive(),
  text = z.string().max(50000);
const targets = z.array(z.string()).max(30),
  refs = z.array(z.string()).max(30);
const updatesSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("information"),
      version,
      token: z.string().uuid(),
      text: text.default(""),
      evidenceId: z.string().optional(),
      evidenceType: z
        .enum(["访谈或反馈", "数据或观察", "外部资料", "个人推断"])
        .default("个人推断"),
      targets,
      stance: z.enum(["supports", "opposes", "related"]).default("related"),
    })
    .strict(),
  z
    .object({
      action: z.literal("judgment"),
      version,
      token: z.string().uuid(),
      entityId: z.string().optional(),
      entityVersion: version.optional(),
      text,
      why: text.optional(),
      uncertain: text.optional(),
      conditions: text.optional(),
      method: text.optional(),
      evidenceRefs: refs.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("result"),
      version,
      token: z.string().uuid(),
      taskId: z.string(),
      taskVersion: version,
      happened: text.default(""),
      information: text.default(""),
      influence: text.default(""),
      targets,
      criterion: text.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("check"),
      version,
      token: z.string().uuid(),
      impactId: z.string(),
      status: z.enum(["still", "adjust", "uncertain"]),
      comment: text.default(""),
    })
    .strict(),
]);
function inScope(owner: string, root: string, id: string, kind?: string) {
  const e = guideScope(owner, root).find((e) => e.id === id);
  if (!e) fail("请选择当前思考中明确相关的内容", 403);
  if (kind && e.kind !== kind) fail("内容类型不匹配");
  return e;
}
function attach(
  owner: string,
  root: string,
  kind: Entity["kind"],
  data: Record<string, unknown>,
) {
  const e = get(owner, root);
  return e.kind === "topic"
    ? create(owner, kind, data, root)
    : createThinkingItem(owner, root, e.version, kind, data);
}
function invalidate(s: GuideSession, affected: string[]) {
  s.data.runs.forEach((r) => {
    r.stale = true;
  });
  s.data.candidates.forEach((c) => {
    if (!c.target || affected.includes(c.target)) c.stale = true;
  });
  if (s.data.current?.mode === "ai") s.data.current.review = true;
}
export function updateThinking(owner: string, root: string, input: unknown) {
  const b = updatesSchema.parse(input),
    fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          ...b,
          version: undefined,
          entityVersion: undefined,
          taskVersion: undefined,
        }),
      )
      .digest("hex");
  return transaction(() => {
    const s = getGuide(owner, root),
      previous = s.data.updates.find((u) => u.token === b.token);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        fail("这个保存请求已处理，请核对后重新保存。", 409);
      return { session: s, update: previous };
    }
    if (s.version !== b.version)
      fail("思考记录已变化，输入保留，请载入最新记录再保存。", 409);
    const id = randomUUID(),
      now = new Date().toISOString();
    let changed: string[] = [],
      evidenceRefs: string[] = [],
      resultText = "",
      reason = "",
      taskId: string | null = null;
    const before: { entityId: string; text: string; version: number }[] = [];
    const remember = (entity: Entity) => {
      before.push({
        entityId: entity.id,
        text: judgmentText(entity),
        version: entity.version,
      });
    };
    const impact = (
      entity: Entity,
      why: string,
      stance: "supports" | "opposes" | "related",
    ) => {
      let meta = s.data.judgments.find((j) => j.entityId === entity.id);
      if (!meta) {
        meta = judgmentMetaSchema.parse({ entityId: entity.id });
        s.data.judgments.push(meta);
      }
      meta.needsReview = true;
      meta.evidenceRefs = [...new Set([...meta.evidenceRefs, ...evidenceRefs])];
      s.data.impacts.push({
        id: randomUUID(),
        updateId: id,
        entityId: entity.id,
        reason: why,
        status: "pending",
        comment: "",
        stance,
        resolved: false,
      });
    };
    if (b.action === "information") {
      const selected = [...new Set(b.targets)].map((id) =>
        inScope(owner, root, id),
      );
      if (selected.some((e) => !isJudgment(e))) fail("请关联当前判断或看法");
      selected.forEach(remember);
      if (!b.evidenceId && !b.text.trim())
        fail("请写下新信息，或选择一条已有材料。");
      let evidence = b.evidenceId ? get(owner, b.evidenceId) : null;
      if (evidence && evidence.kind !== "evidence") fail("请选择已有依据材料");
      if (!evidence)
        evidence = attach(owner, root, "evidence", {
          title: shortName(b.text),
          type: b.evidenceType,
          status: "待核实",
          ...(b.evidenceType === "访谈或反馈"
            ? { answer: b.text }
            : b.evidenceType === "数据或观察"
              ? { observation: b.text }
              : { excerpt: b.text }),
        });
      const key = b.stance === "related" ? null : b.stance;
      if (key) {
        const cards = selected
          .filter((e) => e.kind === "card")
          .map((e) => e.id);
        if (cards.length)
          evidence = update(
            owner,
            evidence.id,
            evidence.version,
            {
              ...evidence.data,
              [key]: [
                ...new Set([
                  ...((evidence.data[key] as string[]) || []),
                  ...cards,
                ]),
              ],
            },
            evidence.topic,
          );
      }
      evidenceRefs = [evidence.id];
      resultText =
        b.text.trim() ||
        String(
          evidence.data.answer ||
            evidence.data.observation ||
            evidence.data.excerpt ||
            evidence.data.title,
        );
      changed = selected.map((e) => e.id);
      for (const e of selected) {
        // New material augments references without changing the judgment's words or prior basis.
        update(
          owner,
          e.id,
          e.version,
          {
            ...e.data,
            evidenceRefs: [
              ...new Set([
                ...((e.data.evidenceRefs as string[]) || []),
                evidence.id,
              ]),
            ],
          },
          e.topic,
        );
        impact(e, "加入了新材料，请由你核对它对原判断的影响。", b.stance);
      }
    } else if (b.action === "judgment") {
      if (!b.text.trim()) fail("请写下你现在的看法。");
      for (const ref of b.evidenceRefs || []) {
        if (get(owner, ref).kind !== "evidence") fail("请选择依据材料");
      }
      let e = b.entityId ? inScope(owner, root, b.entityId) : null;
      if (e && !isJudgment(e)) fail("请选择一条当前判断");
      const chosenRefs = b.evidenceRefs ?? [
        ...new Set([
          ...((e?.data.evidenceRefs as string[]) || []),
          ...(s.data.judgments.find((j) => j.entityId === e?.id)
            ?.evidenceRefs || []),
        ]),
      ];
      if (e) {
        if (e.version !== b.entityVersion)
          fail("这条判断已有新版本，输入保留，请核对后再保存。", 409);
        remember(e);
        const data =
          e.kind === "review"
            ? {
                ...e.data,
                judgment: b.text,
                change: b.text,
                ...(b.why !== undefined ? { changeReason: b.why } : {}),
                ...(b.why !== undefined ? { reason: b.why } : {}),
                ...(b.conditions !== undefined
                  ? { reevaluate: b.conditions }
                  : {}),
                evidenceRefs: chosenRefs,
              }
            : { ...e.data, content: b.text, evidenceRefs: chosenRefs };
        e = update(owner, e.id, e.version, data, e.topic);
      } else
        e = attach(owner, root, "review", {
          title: shortName(b.text),
          judgment: b.text,
          reason: b.why || "",
          reevaluate: b.conditions || "",
          evidenceRefs: chosenRefs,
        });
      let meta = s.data.judgments.find((j) => j.entityId === e!.id);
      if (!meta) {
        meta = judgmentMetaSchema.parse({ entityId: e.id });
        s.data.judgments.push(meta);
      }
      for (const key of ["why", "conditions", "uncertain", "method"] as const)
        if (b[key] !== undefined) meta[key] = b[key]!;
      meta.evidenceRefs = chosenRefs;
      meta.needsReview = false;
      // Historical review requests remain readable; this explicit edit resolves the open ones.
      s.data.impacts
        .filter((i) => i.entityId === e!.id && !i.resolved)
        .forEach((i) => {
          i.resolved = true;
          if (i.status === "pending") i.status = "adjust";
          if (!i.comment) i.comment = b.why || "用户主动更新判断";
        });
      changed = [e.id];
      evidenceRefs = chosenRefs;
      resultText = b.text;
      reason = b.why || "";
    } else if (b.action === "result") {
      let task = inScope(owner, root, b.taskId, "task");
      if (task.version !== b.taskVersion)
        fail("这一步已有新版本，输入保留，请重新核对。", 409);
      const selected = [...new Set(b.targets)].map((id) =>
        inScope(owner, root, id),
      );
      if (selected.some((e) => !isJudgment(e))) fail("请选择要核对的判断");
      selected.forEach(remember);
      task = update(
        owner,
        task.id,
        task.version,
        {
          ...task.data,
          status: "已完成",
          ...(b.criterion !== undefined ? { criterion: b.criterion } : {}),
          result:
            [
              b.happened && "实际发生：" + b.happened,
              b.information && "获得信息：" + b.information,
              b.influence && "我的影响判断：" + b.influence,
            ]
              .filter(Boolean)
              .join("\n\n") || String(task.data.result || ""),
        },
        task.topic,
      );
      taskId = task.id;
      changed = selected.map((e) => e.id);
      resultText = [b.happened, b.information, b.influence]
        .filter(Boolean)
        .join("\n\n");
      reason = b.influence;
      if (b.information.trim()) {
        const e = attach(owner, root, "evidence", {
          title: shortName(b.information),
          type: "数据或观察",
          status: "待核实",
          method: "用户记录的行动结果",
          observation: b.information,
        });
        evidenceRefs = [e.id];
      }
      for (const e of selected)
        impact(
          e,
          "这一步完成并留下了结果；完成行动本身不证明假设成立。",
          "related",
        );
      // Verification remains a separate explicit record with a direction and actual evidence.
      // No hypothesis status or validation conclusion is inferred from task completion.
    } else {
      const i = s.data.impacts.find((i) => i.id === b.impactId);
      if (!i) fail("核对事项不存在", 404);
      inScope(owner, root, i.entityId);
      i.status = b.status;
      i.comment = b.comment;
      i.resolved = b.status === "still";
      changed = [i.entityId];
      const meta = s.data.judgments.find((j) => j.entityId === i.entityId);
      if (meta)
        meta.needsReview = s.data.impacts.some(
          (x) =>
            x.entityId === i.entityId &&
            !x.resolved &&
            (x.status === "pending" ||
              x.status === "adjust" ||
              x.status === "uncertain"),
        );
      resultText = {
        still: "仍然适用",
        adjust: "需要调整",
        uncertain: "暂时无法判断",
      }[b.status];
      reason = b.comment;
    }
    const entry = {
      id,
      token: b.token,
      fingerprint,
      kind: b.action,
      text: resultText,
      reason,
      targets: changed,
      evidenceRefs,
      taskId,
      createdAt: now,
      before,
    };
    s.data.updates.push(entry);
    invalidate(s, changed);
    const session = persistGuide(owner, s);
    return { session, update: entry };
  });
}
