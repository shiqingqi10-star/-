"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Entity, fields, common } from "@/lib/schema";
import { api } from "@/lib/http";
import {
  Direction,
  directions,
  guidanceLabels,
  GuideAnswer,
  GuideCandidate,
  GuideData,
  GuideSession,
} from "@/lib/guidance-schema";
import { entityName, readableTime } from "@/lib/presentation";
import { User } from "./Settings";
import Modal from "./ui/Modal";
import Menu from "./ui/Menu";
type Choice = Pick<GuideCandidate, "id" | "text" | "kind" | "cardType"> & {
  selected: boolean;
};
export default function GuidedThinking({
  root,
  rows,
  user,
  onRefresh,
  onEdit,
  onHistory,
  onOpen,
  onAdvanced,
  onGraph,
  onAdd,
  onExport,
}: {
  root: Entity;
  rows: Entity[];
  user: User;
  onRefresh: () => Promise<void>;
  onEdit: (e: Entity) => void;
  onHistory: (e: Entity) => void;
  onOpen: (e: Entity) => void;
  onAdvanced: () => void;
  onGraph: () => void;
  onAdd: (kind: "question" | "task" | "evidence" | "review") => void;
  onExport: () => void;
}) {
  const [session, setSession] = useState<GuideSession | null>(null),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [hint, setHint] = useState(false),
    [rephrased, setRephrased] = useState(false),
    [results, setResults] = useState(false),
    [preview, setPreview] = useState<Choice[] | null>(null),
    [editing, setEditing] = useState<GuideAnswer | null>(null),
    [versions, setVersions] = useState<
      { version: number; data: GuideData; created_at: string }[] | null
    >(null),
    [aiMode, setAiMode] = useState("整理思路"),
    [aiHelp, setAiHelp] = useState(false),
    [allCandidates, setAllCandidates] = useState(false),
    [previewFocus, setPreviewFocus] = useState<HTMLElement | null>(null);
  const gate = useRef(false),
    textarea = useRef<HTMLTextAreaElement>(null),
    valueRef = useRef(""),
    sessionRef = useRef<GuideSession | null>(null);
  const draftKey = useCallback(
    (s: GuideSession) =>
      `thought-draft:${user.id}:guidance:${s.id}:${s.data.current?.id || "end"}`,
    [user.id],
  );
  const accept = useCallback(
    (s: GuideSession, retain?: string) => {
      sessionRef.current = s;
      setSession(s);
      setHint(false);
      setRephrased(false);
      let text = retain ?? s.data.draft;
      if (retain === undefined)
        try {
          text = localStorage.getItem(draftKey(s)) ?? text;
        } catch {}
      setAnswer(text);
      valueRef.current = text;
      setSaved(
        text
          ? text === s.data.draft
            ? "草稿已保存 · 尚未提交为回答"
            : "本地草稿 · 尚未保存为回答"
          : "已保存",
      );
    },
    [draftKey],
  );
  useEffect(() => {
    let active = true;
    void api<GuideSession>("guidance/" + root.id, "POST", {})
      .then((s) => {
        if (active) accept(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [root.id, root.contentVersion, accept]);
  async function run<T>(
    fn: () => Promise<T>,
    saving = "保存中…",
    failure = "保存失败 · 输入仍保留",
  ): Promise<T | null> {
    if (gate.current) return null;
    gate.current = true;
    setBusy(true);
    setError("");
    setSaved(saving);
    try {
      const result = await fn();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      setSaved(failure);
      return null;
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  async function mutate(command: Record<string, unknown>, retain?: string) {
    const s = sessionRef.current;
    if (!s) return null;
    const updated = await api<GuideSession>("guidance/" + root.id, "PATCH", {
      version: s.version,
      ...command,
    });
    accept(updated, retain);
    return updated;
  }
  async function ai(s: GuideSession) {
    setSaved("已有记录已保存 · AI追问生成中…");
    const response = await api<{ session: GuideSession; stale: boolean }>(
      "guidance/" + root.id + "/ai",
      "POST",
      { version: s.version, mode: aiMode },
    );
    accept(response.session);
    await onRefresh().catch(() => setError("AI结果已保存，用量暂时无法更新。"));
    if (response.stale)
      setError("生成期间内容有变化，这次分析已标为过期，请重试。");
  }
  async function respond(status: "answered" | "unknown" | "skipped") {
    const s = sessionRef.current;
    if (!s?.data.current) return;
    const text = valueRef.current;
    await run(async () => {
      const updated = await mutate(
        { action: "answer", questionId: s.data.current!.id, status, text },
        "",
      );
      try {
        localStorage.removeItem(draftKey(s));
      } catch {}
      if (status === "unknown")
        setSaved("已保存 · 你留下了一个需要确认的信息。");
      else if (
        updated?.data.answers.some(
          (a) => a.status === "answered" && a.question.direction === "goal",
        ) &&
        updated.data.answers.some(
          (a) => a.status === "answered" && a.question.direction === "concern",
        )
      )
        setSaved("已保存 · 你把目标和顾虑分开了。");
      if (updated?.data.mode === "ai" && user.aiConfigured) {
        try {
          await ai(updated);
        } catch (e) {
          setError(
            (e instanceof Error ? e.message : "AI追问失败。") +
              " 回答已保存，可重试或切回基础引导。",
          );
          setSaved("回答已保存 · AI追问未更新");
        }
      }
      requestAnimationFrame(() => textarea.current?.focus());
    });
  }
  async function showResults(pause = false, wantPreview = false) {
    if (wantPreview)
      setPreviewFocus(document.activeElement as HTMLElement | null);
    await run(async () => {
      if (pause)
        await mutate(
          { action: "pause", draft: valueRef.current },
          valueRef.current,
        );
      const s = await mutate({ action: "prepare" }, valueRef.current);
      setResults(true);
      if (wantPreview && s)
        setPreview(
          s.data.candidates
            .filter((c) => c.status === "pending" && !c.stale)
            .map((c) => ({
              id: c.id,
              text: c.text,
              kind: c.kind,
              cardType: c.cardType,
              selected: true,
            })),
        );
    });
  }
  const current = session?.data.current;
  const originals =
    root.kind === "record" ? [root] : rows.filter((e) => e.kind === "record");
  const grouped = directions
    .map((direction) => ({
      direction,
      answers:
        session?.data.answers.filter(
          (a) =>
            a.status !== "skipped" &&
            (a.status === "unknown"
              ? direction === "unknown"
              : a.question.direction === direction),
        ) || [],
    }))
    .filter((g) => g.answers.length);
  const candidates =
    session?.data.candidates.filter((c) => c.status !== "ignored") || [];
  return (
    <div className="guided-space">
      <div className="guided-heading">
        <strong>{entityName(root)}</strong>
        <span role="status" className="muted">
          {saved || "载入梳理记录…"}
        </span>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const s = await api<GuideSession>("guidance/" + root.id);
                accept(s, valueRef.current);
              })
            }
          >
            载入最新记录
          </button>
        </div>
      )}
      <div className="guided-layout">
        <div className="guided-main">
          <details className="original-question">
            <summary>
              最初的问题
              <span className="original-excerpt">
                {String(
                  originals[0]?.data.content || root.data.goal || "",
                ).slice(0, 110)}
              </span>
            </summary>
            {originals.length ? (
              originals.map((e) => (
                <article key={e.id}>
                  <p className="full-body">{String(e.data.content || "")}</p>
                  <div className="bar">
                    <button className="text-button" onClick={() => onEdit(e)}>
                      编辑原文
                    </button>
                    <button
                      className="text-button"
                      onClick={() => onHistory(e)}
                    >
                      原文历史
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">
                这个已有思考还没有原文；原有内容可在完整整理中继续使用。
              </p>
            )}
          </details>
          <section className="current-question surface" aria-label="当前追问">
            {session ? (
              <>
                {session.data.paused && (
                  <p className="muted">
                    你上次先到这里。现在可以继续，也可以先看看成果。
                  </p>
                )}
                <div className="question-caption">
                  <span>
                    {current?.mode === "ai" ? "AI追问" : "基础引导 · 预设问题"}
                  </span>
                  <button
                    className="text-button"
                    disabled={busy || !user.aiConfigured || !!answer.trim()}
                    onClick={() =>
                      void run(
                        () => ai(session),
                        "AI追问生成中…",
                        "AI追问失败 · 已保存记录仍保留",
                      )
                    }
                  >
                    {session.data.mode === "ai" ? "更新AI追问" : "开启AI追问"}
                  </button>
                </div>
                {!user.aiConfigured && (
                  <p className="muted ai-unconfigured">
                    AI尚未配置 · 基础引导可以继续使用。
                    <button
                      className="text-button"
                      onClick={() => setAiHelp(true)}
                    >
                      配置说明
                    </button>
                  </p>
                )}
                {current ? (
                  <>
                    <h2>
                      {rephrased
                        ? current.rephrase || current.text
                        : current.text}
                    </h2>
                    {current.review && (
                      <p className="notice error">
                        原回答或材料已变化，这个追问需重新核对。请更新AI追问或使用基础引导。
                      </p>
                    )}
                    <label className="answer-label">
                      <span className="sr-only">你的回答</span>
                      <textarea
                        ref={textarea}
                        aria-label="你的回答"
                        aria-describedby="current-followup"
                        rows={6}
                        placeholder="按照自己的理解写下来，几句话也可以。"
                        value={answer}
                        maxLength={50000}
                        disabled={busy}
                        onChange={(e) => {
                          setAnswer(e.target.value);
                          valueRef.current = e.target.value;
                          setSaved("正在编辑 · 本地草稿");
                          try {
                            localStorage.setItem(
                              draftKey(session),
                              e.target.value,
                            );
                          } catch {
                            setError("本地草稿无法保存，请复制重要内容。");
                          }
                        }}
                      />
                    </label>
                    <div className="answer-actions">
                      <button
                        className="primary"
                        disabled={busy || !answer.trim() || current.review}
                        onClick={() => void respond("answered")}
                      >
                        {busy ? "保存中…" : "继续"}
                      </button>
                      <button
                        disabled={busy || current.review}
                        onClick={() => void respond("unknown")}
                      >
                        暂时不知道
                      </button>
                    </div>
                    <div className="question-help">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setRephrased((v) => !v)}
                      >
                        换个问法
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setHint((v) => !v)}
                        aria-expanded={hint}
                      >
                        给我一点提示
                      </button>
                      <button
                        className="text-button"
                        disabled={busy || current.review}
                        onClick={() => void respond("skipped")}
                      >
                        跳过
                      </button>
                    </div>
                    {hint && (
                      <p className="question-hint">
                        {current.mode === "ai"
                          ? "AI提供的思考角度："
                          : "预设思考角度："}
                        {current.hint ||
                          "可以按自己的理解回答；不适用时可以跳过。"}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2>想先看看目前理清了什么吗？</h2>
                    <p className="muted">
                      不必回答所有方向，也不必马上作出决定。你可以继续补充一个方向。
                    </p>
                    <button
                      className="primary"
                      onClick={() => void showResults()}
                      disabled={busy}
                    >
                      看看目前理清了什么
                    </button>
                  </>
                )}
                {current && !results && session.data.answers.length >= 3 && (
                  <p className="muted">
                    已经留下了几条记录。准备好时，可以
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void showResults()}
                    >
                      看看目前理清了什么
                    </button>
                    ，也可以继续。
                  </p>
                )}
                <details className="followup-options">
                  <summary>
                    选择想继续想的方向
                    {session.data.mode === "ai" ? "与AI分析方式" : ""}
                  </summary>
                  <p className="muted">
                    由你选择。基础引导不会自动理解或归纳自由文本。
                  </p>
                  <div className="bar">
                    {directions.map((d) => (
                      <button
                        key={d}
                        disabled={busy || !!answer.trim()}
                        onClick={() =>
                          void run(() =>
                            mutate({ action: "direction", direction: d }),
                          )
                        }
                      >
                        {guidanceLabels[d]}
                        {session.data.answers.some(
                          (a) => a.question.direction === d,
                        )
                          ? " · 已记录"
                          : ""}
                      </button>
                    ))}
                  </div>
                  {session.data.mode === "ai" && (
                    <>
                      <p className="muted">
                        今日已用 {user.usage.todayUsed ?? 0} 次 · 月度已用{" "}
                        {user.usage.monthUsed ?? 0} 次 · 滚动额度{" "}
                        {user.usage.rollingDayUsed ?? 0}/{user.usage.dailyLimit}
                        （24小时）、{user.usage.rollingMonthUsed ?? 0}/
                        {user.usage.monthlyLimit}（30天）
                      </p>
                      <label>
                        追问侧重
                        <select
                          value={aiMode}
                          onChange={(e) => setAiMode(e.target.value)}
                        >
                          {[
                            ["整理思路", "帮我分清这段想法"],
                            ["检查推导", "看看哪里还没说通"],
                            ["生成下一步", "我下一步可以做什么"],
                          ].map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            mutate({ action: "basic" }, valueRef.current),
                          )
                        }
                      >
                        切回基础引导
                      </button>
                    </>
                  )}
                </details>
                {answer.trim() && (
                  <p className="muted">
                    先保存当前回答，再切换追问方向或开启AI。提示不会保存成你的回答。
                  </p>
                )}
                <details className="scope-disclosure">
                  <summary>本次AI输入范围</summary>
                  <p className="muted">
                    仅当前思考及明确关联的 {rows.length} 项内容、已保存的{" "}
                    {session.data.answers.length} 条问答；不发送其他无关思考。
                  </p>
                  {rows.map((e) => (
                    <details key={e.id}>
                      <summary>{entityName(e)}</summary>
                      <dl className="scope-fields">
                        {[...fields[e.kind], ...common]
                          .filter(
                            (f) =>
                              e.data[f.key] !== undefined &&
                              e.data[f.key] !== "",
                          )
                          .map((f) => (
                            <div key={f.key}>
                              <dt>{f.label}</dt>
                              <dd className="full-body">
                                {Array.isArray(e.data[f.key])
                                  ? (e.data[f.key] as string[])
                                      .map((id) => {
                                        const target = rows.find(
                                          (x) => x.id === id,
                                        );
                                        return target
                                          ? entityName(target)
                                          : "关联内容不可用";
                                      })
                                      .join("、")
                                  : String(e.data[f.key])}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </details>
                  ))}
                  {session.data.answers.map((a) => (
                    <p className="full-body" key={a.id}>
                      {a.question.text}
                      <br />
                      {a.status === "skipped"
                        ? "已跳过"
                        : a.status === "unknown"
                          ? "暂时不知道：" + a.text
                          : a.text}
                    </p>
                  ))}
                  {session.data.runs.map((r) => (
                    <details key={r.id}>
                      <summary>
                        已保存的AI输入 ·{" "}
                        {readableTime(r.createdAt, user.settings.timezone)}
                        {r.stale ? " · 已过期" : ""}
                      </summary>
                      {(() => {
                        const snap = JSON.parse(r.snapshot) as {
                          entities: Entity[];
                          answers: GuideAnswer[];
                        };
                        return (
                          <>
                            <p className="muted">
                              输入快照与版本已保留。当前内容可能与此处不同。
                            </p>
                            {snap.entities.map((e) => (
                              <p className="full-body" key={e.id}>
                                {entityName(e)} · 内容版本 {e.contentVersion}
                                <br />
                                {String(
                                  e.data.content ||
                                    e.data.goal ||
                                    e.data.title ||
                                    "",
                                )}
                              </p>
                            ))}
                            {snap.answers.map((a) => (
                              <p className="full-body" key={a.id}>
                                {a.question.text} · 回答版本 {a.version}
                                <br />
                                {a.status} · {a.text}
                              </p>
                            ))}
                          </>
                        );
                      })()}
                    </details>
                  ))}
                </details>
              </>
            ) : (
              <p className="muted">正在载入你的梳理记录…</p>
            )}
          </section>
          <div className="guided-secondary">
            <button
              className="text-button"
              disabled={busy || !session}
              onClick={() => void showResults(true)}
            >
              先到这里
            </button>
            <Menu
              label="梳理"
              actions={[
                { label: "高级编辑与完整整理", action: onAdvanced },
                { label: "导出与个人备份", action: onExport },
                {
                  label: "问答版本",
                  action: () =>
                    void run(async () => {
                      setVersions(
                        await api("guidance/" + root.id + "/history"),
                      );
                      setSaved("已保存");
                    }),
                },
              ]}
            />
          </div>
          {!!session?.data.answers.length && (
            <details className="answer-history">
              <summary>前面的回答 · {session.data.answers.length} 条</summary>
              {session.data.answers.map((a) => (
                <article key={a.id}>
                  <strong>{a.question.text}</strong>
                  <p className="full-body">
                    {a.status === "unknown"
                      ? "暂时不知道"
                      : a.status === "skipped"
                        ? "已跳过"
                        : ""}
                    {a.text && (
                      <>
                        <br />
                        {a.text}
                      </>
                    )}
                  </p>
                  {a.review && (
                    <p className="warning-text">
                      前面的回答已修改，请核对这一条。
                    </p>
                  )}
                  <div className="bar">
                    <button
                      className="text-button"
                      onClick={() => setEditing({ ...a })}
                    >
                      修改回答
                    </button>
                    {a.review && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            mutate(
                              { action: "acknowledge", answerId: a.id },
                              valueRef.current,
                            ),
                          )
                        }
                      >
                        核对并保留
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </details>
          )}
        </div>
        <aside className="guided-results">
          <details
            open={results}
            onToggle={(e) => setResults(e.currentTarget.open)}
          >
            <summary>
              已理清的内容
              {session?.data.answers.length
                ? ` · ${session.data.answers.filter((a) => a.status !== "skipped").length} 条记录`
                : ""}
            </summary>
            <h2>我的思考</h2>
            <p className="muted">
              这里展示原回答和待确认提炼，不代表信息已核实。
            </p>
            {grouped.length ? (
              grouped
                .filter(
                  (g) =>
                    !candidates.some(
                      (c) =>
                        c.source === "basic" &&
                        c.direction === g.direction &&
                        !c.stale,
                    ),
                )
                .map((g) => (
                  <section key={g.direction}>
                    <h3>{guidanceLabels[g.direction]}</h3>
                    {g.answers.map((a) => (
                      <p className="full-body" key={a.id}>
                        {a.text || `暂时不知道：${a.question.text}`}
                        <small>{a.review ? "需重新核对" : "用户记录"}</small>
                      </p>
                    ))}
                    {g.direction === "unknown" && (
                      <button
                        className="text-button"
                        onClick={() => onAdd("question")}
                      >
                        留下待确认问题
                      </button>
                    )}
                    {g.direction === "next" && (
                      <button
                        className="text-button"
                        onClick={() => onAdd("task")}
                      >
                        下一步怎么确认
                      </button>
                    )}
                    {g.direction === "judgment" && (
                      <div className="bar">
                        <button
                          className="text-button"
                          onClick={() => onAdd("evidence")}
                        >
                          依据和条件、补充材料
                        </button>
                        <button
                          className="text-button"
                          onClick={() => onAdd("review")}
                        >
                          记录判断变化
                        </button>
                      </div>
                    )}
                  </section>
                ))
            ) : (
              <p className="muted">还没有保存的回答，按自己的节奏开始就好。</p>
            )}
            {(allCandidates ? candidates : candidates.slice(0, 5)).map((c) => (
              <section className="candidate-summary" key={c.id}>
                <h3>{guidanceLabels[c.direction]}</h3>
                <span className="muted">
                  {c.source === "ai" ? "AI提炼" : "原回答整理"} ·{" "}
                  {c.target ? "已确认" : "待确认"}
                  {c.stale ? " · 需重新核对" : ""}
                </span>
                <p className="full-body">{c.text}</p>
                <details>
                  <summary>追溯对应回答</summary>
                  {c.answerIds.map((id) => {
                    const a =
                      c.answerSnapshots.find((a) => a.id === id) ||
                      session?.data.answers.find((a) => a.id === id);
                    return a ? (
                      <p className="full-body" key={id}>
                        {a.question.text} · 回答版本 {a.version}
                        <br />
                        {a.text || "暂时不知道"}
                      </p>
                    ) : (
                      <p key={id}>来源回答不可用</p>
                    );
                  })}
                </details>
                {!c.target && !c.stale && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setPreviewFocus(
                        document.activeElement as HTMLElement | null,
                      );
                      setPreview([
                        {
                          id: c.id,
                          text: c.text,
                          kind: c.kind,
                          cardType: c.cardType,
                          selected: true,
                        },
                      ]);
                    }}
                  >
                    预览、补充并采纳
                  </button>
                )}
                {c.target && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const target = rows.find((e) => e.id === c.target);
                      if (target) onOpen(target);
                    }}
                  >
                    查看正式记录
                  </button>
                )}
                {c.stale && c.target && (
                  <p className="muted">
                    原判断保留，没有自动改写。请核对后在正式记录中决定是否修改。
                  </p>
                )}
              </section>
            ))}
            {candidates.length > 5 && (
              <button
                className="text-button"
                onClick={() => setAllCandidates((v) => !v)}
              >
                {allCandidates
                  ? "收起其他成果"
                  : `展开全部 ${candidates.length} 条成果`}
              </button>
            )}
            <div className="result-actions">
              <button
                className="primary"
                disabled={busy || !grouped.length}
                onClick={() => void showResults(false, true)}
              >
                确认整理结果
              </button>
              <button disabled={busy} onClick={() => onAdd("task")}>
                留下下一步
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setResults(false);
                  textarea.current?.focus();
                }}
              >
                继续梳理
              </button>
              <button className="text-button" onClick={onGraph}>
                看看它们怎么连接
              </button>
            </div>
            {!!rows.filter((e) => !["record", "topic"].includes(e.kind))
              .length && (
              <details>
                <summary>
                  已有整理内容 ·{" "}
                  {
                    rows.filter((e) => !["record", "topic"].includes(e.kind))
                      .length
                  }{" "}
                  项
                </summary>
                {rows
                  .filter((e) => !["record", "topic"].includes(e.kind))
                  .map((e) => (
                    <button
                      className="existing-guide-item"
                      key={e.id}
                      onClick={() => onOpen(e)}
                    >
                      {entityName(e)}
                    </button>
                  ))}
                <button className="text-button" onClick={onAdvanced}>
                  打开完整整理
                </button>
              </details>
            )}
          </details>
          <button
            className="text-button view-results"
            disabled={busy || !session}
            onClick={() => void showResults()}
          >
            看看目前理清了什么
          </button>
        </aside>
      </div>
      {preview && (
        <Modal
          title="预览并确认整理结果"
          returnFocus={previewFocus}
          onClose={() => setPreview(null)}
          description="只保存你选择的内容。可修改、取消；再次确认不会重复创建。"
        >
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {preview.length ? (
            <>
              <p className="muted">
                个人陈述与观察仍标为未核实。AI提炼保留AI来源。多个回答可共同支撑一条记录。
              </p>
              {preview.map((c, i) => (
                <section key={c.id} className="preview-choice">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={(e) =>
                        setPreview((p) =>
                          p!.map((x, j) =>
                            j === i ? { ...x, selected: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    确认这条内容
                  </label>
                  <textarea
                    aria-label={"成果内容 " + (i + 1)}
                    value={c.text}
                    onChange={(e) =>
                      setPreview((p) =>
                        p!.map((x, j) =>
                          j === i ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <label>
                    保存为
                    <select
                      value={c.kind}
                      onChange={(e) =>
                        setPreview((p) =>
                          p!.map((x, j) =>
                            j === i
                              ? { ...x, kind: e.target.value as Choice["kind"] }
                              : x,
                          ),
                        )
                      }
                    >
                      {[
                        ["card", "整理后的观点"],
                        ["question", "待确认问题"],
                        ["task", "普通行动"],
                        ["review", "我目前的判断"],
                      ].map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  {c.kind === "card" && (
                    <label>
                      内容性质
                      <select
                        value={c.cardType}
                        onChange={(e) =>
                          setPreview((p) =>
                            p!.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    cardType: e.target
                                      .value as Choice["cardType"],
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {[
                          "事实或观察",
                          "假设",
                          "观点或推断",
                          "问题",
                          "结论",
                          "备选方案",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </section>
              ))}
              <div className="bar">
                <button
                  className="primary"
                  disabled={
                    busy || !preview.some((c) => c.selected && c.text.trim())
                  }
                  onClick={() =>
                    void run(async () => {
                      await mutate(
                        {
                          action: "confirm",
                          candidates: preview
                            .filter((c) => c.selected)
                            .map(({ selected: _, ...c }) => {
                              void _;
                              return c;
                            }),
                        },
                        valueRef.current,
                      );
                      setPreview(null);
                      setSaved("已保存 · 你留下了可追溯的整理成果。");
                      await onRefresh().catch(() =>
                        setError("成果已保存，列表暂时无法更新，请稍后刷新。"),
                      );
                    })
                  }
                >
                  确认保存
                </button>
                <button onClick={() => setPreview(null)}>取消</button>
              </div>
            </>
          ) : (
            <p className="muted">
              没有可确认的新内容。已确认记录不会重复创建；需核对的回答请先在“前面的回答”中处理。
            </p>
          )}
        </Modal>
      )}
      {editing && (
        <Modal
          title="修改前面的回答"
          onClose={() => setEditing(null)}
          description="原版本保留；修改后，后续回答及候选成果会提示重新核对，已确认记录保持原样。"
        >
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <p>{editing.question.text}</p>
          <textarea
            aria-label="修改回答内容"
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
          />
          <label>
            回答状态
            <select
              value={editing.status}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  status: e.target.value as GuideAnswer["status"],
                })
              }
            >
              <option value="answered">已回答</option>
              <option value="unknown">暂时不知道</option>
              <option value="skipped">跳过</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await mutate(
                  {
                    action: "editAnswer",
                    answerId: editing.id,
                    text: editing.text,
                    status: editing.status,
                  },
                  valueRef.current,
                );
                setEditing(null);
              })
            }
          >
            保存修改
          </button>
        </Modal>
      )}
      {versions && (
        <Modal title="问答版本" onClose={() => setVersions(null)}>
          {versions.length ? (
            versions.map((v) => (
              <details key={v.version}>
                <summary>
                  版本 {v.version} ·{" "}
                  {readableTime(v.created_at, user.settings.timezone)}
                </summary>
                {v.data.answers.map((a) => (
                  <p className="full-body" key={a.id}>
                    {a.question.text}
                    <br />
                    {a.status === "unknown"
                      ? "暂时不知道："
                      : a.status === "skipped"
                        ? "已跳过："
                        : ""}
                    {a.text}
                  </p>
                ))}
              </details>
            ))
          ) : (
            <p>还没有历史版本。</p>
          )}
        </Modal>
      )}
      {aiHelp && (
        <Modal title="AI配置说明" onClose={() => setAiHelp(false)}>
          <p>
            在服务端 .env 中设置 DEEPSEEK_API_KEY
            后重启应用。沿用已有供应商与模型；密钥不会发送到浏览器。留空时可以使用全部手动整理和基础引导。
          </p>
        </Modal>
      )}
    </div>
  );
}
