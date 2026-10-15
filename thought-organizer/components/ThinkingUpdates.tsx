"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Entity } from "@/lib/schema";
import { GuideSession } from "@/lib/guidance-schema";
import { entityName, readableTime } from "@/lib/presentation";
import { isJudgment, judgmentText } from "@/lib/thinking";
import { api, requestToken } from "@/lib/http";
import Modal from "./ui/Modal";
import ReferencePicker from "./ReferencePicker";
const formSchema = z
  .object({
    kind: z.enum(["information", "judgment", "result"]),
    token: z.string().uuid(),
    baseVersion: z.number(),
    entityId: z.string(),
    entityVersion: z.number(),
    text: z.string(),
    why: z.string(),
    conditions: z.string(),
    uncertain: z.string(),
    method: z.string(),
    evidenceRefs: z.array(z.string()),
    evidenceType: z.enum(["访谈或反馈", "数据或观察", "外部资料", "个人推断"]),
    targets: z.array(z.string()),
    stance: z.enum(["supports", "opposes", "related"]),
    taskId: z.string(),
    taskVersion: z.number(),
    happened: z.string(),
    information: z.string(),
    influence: z.string(),
    criterion: z.string(),
  })
  .strict();
type Form = z.infer<typeof formSchema>;
export default function ThinkingUpdates({
  root,
  rows,
  items,
  session,
  userId,
  zone,
  busy,
  onSave,
  onFocus,
  onHistory,
  onOpen,
}: {
  root: Entity;
  rows: Entity[];
  items: Entity[];
  session: GuideSession;
  userId: string;
  zone: string;
  busy: boolean;
  onSave: (data: Record<string, unknown>) => Promise<GuideSession | null>;
  onFocus: (entityId: string, purpose?: "condition" | "update") => void;
  onHistory: (entity: Entity) => void;
  onOpen: (entity: Entity) => void;
}) {
  const [form, setForm] = useState<Form | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [draftState, setDraftState] = useState(""),
    [latest, setLatest] = useState<{
      session: GuideSession;
      entity?: Entity;
    } | null>(null),
    [history, setHistory] = useState<string | null>(null);
  const saveGate = useRef(false);
  const judgments = rows.filter(isJudgment),
    tasks = rows.filter((e) => e.kind === "task"),
    materials = items.filter((e) => e.kind === "evidence" && !e.deletedAt);
  const title = {
    information: "我有新信息",
    judgment: "我改变想法了",
    result: "我做完这一步了",
  };
  const key = (f: Form) =>
    `thought-draft:${userId}:update:${root.id}:${f.kind}:${f.entityId || "new"}`;
  function open(kind: Form["kind"], entity?: Entity) {
    const meta = session.data.judgments.find((j) => j.entityId === entity?.id);
    let f: Form = {
      kind,
      token: requestToken(),
      baseVersion: session.version,
      entityId: entity?.id || "",
      entityVersion: entity?.version || 0,
      text: kind === "judgment" && entity ? judgmentText(entity) : "",
      why: meta?.why || String(entity?.data.reason || ""),
      conditions: meta?.conditions || String(entity?.data.reevaluate || ""),
      uncertain: meta?.uncertain || "",
      method: meta?.method || "",
      evidenceRefs: [
        ...new Set([
          ...((entity?.data.evidenceRefs as string[]) || []),
          ...(meta?.evidenceRefs || []),
        ]),
      ],
      evidenceType: "个人推断",
      targets: entity ? [entity.id] : [],
      stance: "related",
      taskId: "",
      taskVersion: 0,
      happened: "",
      information: "",
      influence: "",
      criterion: "",
    };
    let restored = false;
    try {
      const parsed = formSchema.safeParse(
        JSON.parse(localStorage.getItem(key(f)) || "null"),
      );
      if (parsed.success) {
        f = parsed.data;
        restored = true;
      }
    } catch {}
    setForm(f);
    setLatest(null);
    setError("");
    setDraftState(restored ? "已恢复本地草稿 · 尚未保存" : "正在编辑");
  }
  useEffect(() => {
    if (!form) return;
    try {
      localStorage.setItem(
        `thought-draft:${userId}:update:${root.id}:${form.kind}:${form.entityId || "new"}`,
        JSON.stringify(form),
      );
    } catch {}
  }, [form, userId, root.id]);
  function patch(values: Partial<Form>) {
    setForm((f) => (f ? { ...f, ...values } : null));
    setDraftState("本地草稿 · 尚未保存");
  }
  async function save(skip = false) {
    const f = form;
    if (!f || saveGate.current) return;
    if (f.kind === "judgment" && !f.text.trim()) {
      setError("请写下你现在的看法。");
      return;
    }
    if (f.kind === "information" && !f.text.trim() && !f.evidenceRefs.length) {
      setError("请写下新信息，或选择已有材料。");
      return;
    }
    if (f.kind === "result" && !f.taskId) {
      setError("请先选择这一步。");
      return;
    }
    saveGate.current = true;
    setSaving(true);
    setError("");
    setDraftState("保存中…");
    try {
      const common = { version: f.baseVersion, token: f.token };
      const body =
        f.kind === "information"
          ? {
              ...common,
              action: "information",
              text: f.text,
              evidenceId: f.evidenceRefs[0] || undefined,
              evidenceType: f.evidenceType,
              targets: f.targets,
              stance: f.stance,
            }
          : f.kind === "judgment"
            ? {
                ...common,
                action: "judgment",
                entityId: f.entityId || undefined,
                entityVersion: f.entityVersion || undefined,
                text: f.text,
                why: f.why,
                conditions: f.conditions,
                uncertain: f.uncertain,
                method: f.method,
                evidenceRefs: f.evidenceRefs,
              }
            : {
                ...common,
                action: "result",
                taskId: f.taskId,
                taskVersion: f.taskVersion,
                targets: f.targets,
                happened: skip ? "" : f.happened,
                information: skip ? "" : f.information,
                influence: skip ? "" : f.influence,
                criterion: f.criterion,
              };
      const saved = await onSave(body);
      if (!saved)
        throw new Error("保存失败，草稿仍保留。请载入最新记录核对后重试。");
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k?.startsWith(`thought-draft:${userId}:update:${root.id}:`)) {
            try {
              if (
                JSON.parse(localStorage.getItem(k) || "null")?.token === f.token
              )
                localStorage.removeItem(k);
            } catch {}
          }
        }
      } catch {}
      setForm(null);
      setDraftState("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，输入仍保留。");
      setDraftState("保存失败 · 本地草稿仍保留");
    } finally {
      saveGate.current = false;
      setSaving(false);
    }
  }
  const targetHistory = history
    ? session.data.updates.filter((u) => u.targets.includes(history))
    : [];
  return (
    <section className="thinking-updates" aria-label="更新这个思考">
      <div className="thinking-update-entries">
        <button disabled={busy} onClick={() => open("information")}>
          我有新信息
        </button>
        <button disabled={busy} onClick={() => open("judgment")}>
          我改变想法了
        </button>
        <button disabled={busy} onClick={() => open("result")}>
          我做完这一步了
        </button>
      </div>
      {!!judgments.length && (
        <details className="living-judgments">
          <summary>
            我现在怎么看 · {judgments.length} 条
            {session.data.judgments.some((j) => j.needsReview)
              ? " · 有内容需核对"
              : ""}
          </summary>
          {judgments.map((e) => {
            const meta = session.data.judgments.find(
                (j) => j.entityId === e.id,
              ),
              candidate = session.data.candidates.find(
                (c) => c.target === e.id,
              );
            const impacts = session.data.impacts.filter(
                (i) => i.entityId === e.id,
              ),
              pending = impacts.filter(
                (i) =>
                  !i.resolved &&
                  ["pending", "adjust", "uncertain"].includes(i.status),
              );
            const evidenceIds = [
              ...new Set([
                ...(meta?.evidenceRefs || []),
                ...((e.data.evidenceRefs as string[]) || []),
                ...impacts.flatMap(
                  (i) =>
                    session.data.updates.find((u) => u.id === i.updateId)
                      ?.evidenceRefs || [],
                ),
              ]),
            ];
            return (
              <article className="living-judgment" key={e.id}>
                <strong>当前看法</strong>
                <p className="full-body">{judgmentText(e)}</p>
                <small className="muted">
                  {e.kind === "card"
                    ? `${e.data.type || "个人观点"} · ${e.data.verification || "未核实"}`
                    : "用户当前判断"}
                  {e.data.source === "AI推断" || candidate?.source === "ai"
                    ? " · 来源于已确认的AI建议"
                    : ""}
                </small>
                {(meta?.needsReview || (!meta && candidate?.stale)) && (
                  <p className="warning-text">
                    相关内容变化，需重新核对。原判断保留，没有自动改写。
                  </p>
                )}
                <details>
                  <summary>依据、条件与来源</summary>
                  {!!(meta?.why || e.data.reason) && (
                    <p className="full-body">
                      为什么这样想：{meta?.why || String(e.data.reason)}
                    </p>
                  )}
                  {meta?.uncertain && (
                    <p className="full-body">还不确定：{meta.uncertain}</p>
                  )}
                  {!!(meta?.conditions || e.data.reevaluate) && (
                    <p className="full-body">
                      适用条件：{meta?.conditions || String(e.data.reevaluate)}
                    </p>
                  )}
                  {meta?.method && (
                    <p className="full-body">确认方法：{meta.method}</p>
                  )}
                  {evidenceIds.map((id) => {
                    const material = items.find((x) => x.id === id);
                    return material ? (
                      <button
                        className="existing-guide-item"
                        key={id}
                        onClick={() => onOpen(material)}
                      >
                        {entityName(material)}
                        {material.deletedAt ? " · 已在回收站" : ""}
                      </button>
                    ) : (
                      <p key={id} className="muted">
                        一条关联材料暂时不可用，可从完整记录核对。
                      </p>
                    );
                  })}
                  {(candidate?.answerSnapshots || []).map((a) => (
                    <p className="full-body" key={a.id}>
                      {a.question.text}
                      <br />
                      {a.text || "暂时不知道"}
                      <small className="muted">
                        采纳时的原回答 · 版本 {a.version}
                      </small>
                    </p>
                  ))}
                  {!evidenceIds.length &&
                    !candidate?.answerSnapshots.length &&
                    !meta?.why &&
                    !e.data.reason && (
                      <p className="muted">
                        目前没有补充来源；可以保留看法，按需增加依据。
                      </p>
                    )}
                </details>
                {impacts.map((i) => (
                  <div className="judgment-impact" key={i.id}>
                    <p>{i.reason}</p>
                    <small>
                      {i.resolved ? "已随核对或判断更新处理 · " : ""}
                      {
                        {
                          supports: "支持信息",
                          opposes: "反对信息",
                          related: "相关信息，影响待核对",
                        }[i.stance]
                      }{" "}
                      ·
                      {
                        {
                          pending: "等待你核对",
                          still: "你认为仍然适用",
                          adjust: "你认为需要调整",
                          uncertain: "你暂时无法判断",
                        }[i.status]
                      }
                      {i.comment && " · " + i.comment}
                    </small>
                    {pending.some((p) => p.id === i.id) && (
                      <div className="bar">
                        {(
                          [
                            ["still", "仍然适用"],
                            ["adjust", "需要调整"],
                            ["uncertain", "暂时无法判断"],
                          ] as const
                        ).map(([status, label]) => (
                          <button
                            disabled={busy}
                            key={status}
                            onClick={() =>
                              void onSave({
                                action: "check",
                                version: session.version,
                                token: requestToken(),
                                impactId: i.id,
                                status,
                                comment: "",
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="bar">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => open("judgment", e)}
                  >
                    修改这条看法
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => open("information", e)}
                  >
                    补充支持或反对信息
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onFocus(e.id)}
                  >
                    围绕这一条继续追问
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setHistory(e.id)}
                  >
                    看法变化
                  </button>
                  <button className="text-button" onClick={() => onHistory(e)}>
                    完整历史
                  </button>
                </div>
              </article>
            );
          })}
        </details>
      )}
      {!!session.data.updates.length && (
        <details className="thinking-update-history">
          <summary>新信息与行动结果</summary>
          {session.data.updates
            .slice()
            .reverse()
            .map((u) => (
              <article key={u.id}>
                <small className="muted">
                  {
                    {
                      information: "新信息",
                      judgment: "看法更新",
                      result: "行动结果",
                      check: "用户核对",
                    }[u.kind]
                  }{" "}
                  · {readableTime(u.createdAt, zone)}
                </small>
                {u.taskId && (
                  <p>
                    {(items.find((e) => e.id === u.taskId)?.data
                      .title as string) || "原行动"}
                  </p>
                )}
                <p className="full-body">
                  {u.text || "已完成行动，尚未补充结果。"}
                </p>
                {u.reason && u.reason !== u.text && (
                  <p className="full-body">我的解释：{u.reason}</p>
                )}
                {u.before.map((b) => (
                  <details key={b.entityId}>
                    <summary>
                      之前的看法 ·{" "}
                      {items.find((e) => e.id === b.entityId)
                        ? entityName(items.find((e) => e.id === b.entityId)!)
                        : "相关判断"}
                    </summary>
                    <p className="full-body">{b.text}</p>
                  </details>
                ))}
                {u.kind === "result" && u.targets[0] && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onFocus(u.targets[0], "update")}
                  >
                    带着结果继续核对原判断
                  </button>
                )}
              </article>
            ))}
        </details>
      )}
      {form && (
        <Modal title={title[form.kind]} onClose={() => setForm(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="muted" role="status">
              {draftState}
            </p>
            {error && (
              <div className="notice error" role="alert">
                {error}
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    void (async () => {
                      try {
                        const s = await api<GuideSession>(
                          "guidance/" + root.id,
                        );
                        const id = form.entityId || form.taskId;
                        const entity = id
                          ? await api<Entity>("entities/" + id)
                          : undefined;
                        setLatest({ session: s, entity });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "载入失败");
                      }
                    })()
                  }
                >
                  载入最新记录核对
                </button>
              </div>
            )}
            {latest && (
              <section className="notice">
                <p>
                  最新保存内容：
                  {latest.entity
                    ? judgmentText(latest.entity)
                    : "思考记录已载入"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    patch({
                      baseVersion: latest.session.version,
                      entityVersion:
                        latest.entity?.version || form.entityVersion,
                      taskVersion: latest.entity?.version || form.taskVersion,
                    });
                    setLatest(null);
                    setError("");
                  }}
                >
                  已核对，保留我的输入
                </button>
              </section>
            )}
            {form.kind === "information" && (
              <>
                <label>
                  新信息
                  <textarea
                    value={form.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    placeholder="写下你刚知道的内容，也可以复用已有材料。"
                  />
                </label>
                <ReferencePicker
                  label="与哪些看法有关"
                  items={judgments}
                  value={form.targets}
                  onChange={(targets) => patch({ targets })}
                />
                <label>
                  这条信息与看法的关系
                  <select
                    value={form.stance}
                    onChange={(e) =>
                      patch({ stance: e.target.value as Form["stance"] })
                    }
                  >
                    <option value="related">有关，影响还需核对</option>
                    <option value="supports">补充支持信息</option>
                    <option value="opposes">补充反对信息</option>
                  </select>
                </label>
                <details>
                  <summary>来源与已有材料</summary>
                  <label>
                    材料类型
                    <select
                      value={form.evidenceType}
                      onChange={(e) =>
                        patch({
                          evidenceType: e.target.value as Form["evidenceType"],
                        })
                      }
                    >
                      {["个人推断", "访谈或反馈", "数据或观察", "外部资料"].map(
                        (v) => (
                          <option key={v}>{v}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <ReferencePicker
                    label="复用一条已有依据"
                    items={materials}
                    value={form.evidenceRefs.slice(0, 1)}
                    onChange={(ids) => patch({ evidenceRefs: ids.slice(-1) })}
                  />
                </details>
                <p className="muted">
                  新信息不会自动推翻原判断，也不会自动变成已核实事实。
                </p>
              </>
            )}
            {form.kind === "judgment" && (
              <>
                <ReferencePicker
                  label="修改哪条已有看法（留空则记录新看法）"
                  items={judgments}
                  value={form.entityId ? [form.entityId] : []}
                  onChange={(ids) => {
                    const entity = judgments.find((e) => e.id === ids.at(-1));
                    const meta = session.data.judgments.find(
                      (j) => j.entityId === entity?.id,
                    );
                    patch({
                      entityId: entity?.id || "",
                      entityVersion: entity?.version || 0,
                      text: form.text.trim()
                        ? form.text
                        : entity
                          ? judgmentText(entity)
                          : "",
                      why: meta?.why || String(entity?.data.reason || ""),
                      conditions:
                        meta?.conditions ||
                        String(entity?.data.reevaluate || ""),
                      uncertain: meta?.uncertain || "",
                      method: meta?.method || "",
                      evidenceRefs: [
                        ...new Set([
                          ...((entity?.data.evidenceRefs as string[]) || []),
                          ...(meta?.evidenceRefs || []),
                        ]),
                      ],
                    });
                  }}
                />
                <label>
                  我现在怎么想
                  <textarea
                    required
                    value={form.text}
                    onChange={(e) => patch({ text: e.target.value })}
                  />
                </label>
                <label>
                  为什么这样想（可留空）
                  <textarea
                    value={form.why}
                    onChange={(e) => patch({ why: e.target.value })}
                  />
                </label>
                <details>
                  <summary>条件、不确定与依据</summary>
                  {(
                    [
                      ["conditions", "什么条件会影响判断"],
                      ["uncertain", "哪些信息还不确定"],
                      ["method", "下一步可以怎样确认"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field}>
                      {label}
                      <textarea
                        value={form[field]}
                        onChange={(e) => patch({ [field]: e.target.value })}
                      />
                    </label>
                  ))}
                  <ReferencePicker
                    label="关联具体依据"
                    items={materials}
                    value={form.evidenceRefs}
                    onChange={(evidenceRefs) => patch({ evidenceRefs })}
                  />
                </details>
                <p className="muted">
                  旧看法与已有来源保留在历史里。这里保存的是你确认的判断。
                </p>
              </>
            )}
            {form.kind === "result" && (
              <>
                <ReferencePicker
                  label="记录哪一步的结果"
                  items={tasks}
                  value={form.taskId ? [form.taskId] : []}
                  onChange={(ids) => {
                    const id = ids.at(-1) || "",
                      task = tasks.find((e) => e.id === id);
                    patch({
                      taskId: id,
                      taskVersion: task?.version || 0,
                      criterion: String(task?.data.criterion || ""),
                    });
                  }}
                />
                {!tasks.length && (
                  <p className="muted">
                    还没有行动。可以先从成果区“留下下一步”，也可以继续思考而不创建行动。
                  </p>
                )}
                <label>
                  实际发生了什么？
                  <textarea
                    value={form.happened}
                    onChange={(e) => patch({ happened: e.target.value })}
                  />
                </label>
                <details>
                  <summary>获得的信息、影响与原先判断条件</summary>
                  <label>
                    获得了什么信息？
                    <textarea
                      value={form.information}
                      onChange={(e) => patch({ information: e.target.value })}
                    />
                  </label>
                  <label>
                    你认为对原判断有什么影响？
                    <textarea
                      value={form.influence}
                      onChange={(e) => patch({ influence: e.target.value })}
                    />
                  </label>
                  <label>
                    看到什么结果会继续，什么结果会调整？
                    <textarea
                      value={form.criterion}
                      onChange={(e) => patch({ criterion: e.target.value })}
                    />
                  </label>
                </details>
                <ReferencePicker
                  label="哪些判断需要重新核对"
                  items={judgments}
                  value={form.targets}
                  onChange={(targets) => patch({ targets })}
                />
                <p className="muted">
                  完成行动不等于假设成立。验证结论仍在“下一步怎么确认”与完整验证记录中明确填写。
                </p>
              </>
            )}
            <div className="bar">
              <button
                className="primary"
                disabled={saving || busy}
                type="submit"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              {form.kind === "result" && (
                <button
                  disabled={saving || busy}
                  type="button"
                  onClick={() => void save(true)}
                >
                  先完成，暂不记结果
                </button>
              )}
              <button type="button" onClick={() => setForm(null)}>
                关闭
              </button>
            </div>
          </form>
        </Modal>
      )}
      {history && (
        <Modal title="这条看法的变化" onClose={() => setHistory(null)}>
          {targetHistory.length ? (
            targetHistory.map((u) => (
              <article key={u.id}>
                <small>{readableTime(u.createdAt, zone)}</small>
                {u.before.map(
                  (b) =>
                    b.entityId === history && (
                      <p className="full-body" key={b.entityId}>
                        之前：{b.text}
                      </p>
                    ),
                )}
                <p className="full-body">
                  {u.kind === "judgment" ? "当时的新看法：" : "当时记录："}
                  {u.text}
                </p>
                {u.reason && (
                  <p className="full-body">用户留下的原因：{u.reason}</p>
                )}
              </article>
            ))
          ) : (
            <p className="muted">
              本轮尚无更新记录。更早的版本可在“完整历史”查看。
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
