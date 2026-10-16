"use client";
import {
  ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import GuidedThinking from "./GuidedThinking";
import { GuideSession, GuideAnswer } from "@/lib/guidance-schema";
import {
  OutlineEntry,
  outlineLabels,
  outlineCategories,
  Comparison,
} from "@/lib/outline-schema";
import { api, requestToken } from "@/lib/http";
import { entityName } from "@/lib/presentation";
import { guideClues } from "@/lib/guide-experience";
import { judgmentText, isJudgment } from "@/lib/thinking";
import Modal from "./ui/Modal";
import Menu from "./ui/Menu";
import ReferencePicker from "./ReferencePicker";
import GuideRecords from "./GuideRecords";
import GuideHistory from "./GuideHistory";
import ThinkingUpdates from "./ThinkingUpdates";
import ComparisonEditor from "./OutlineComparison";
const formSchema = z.object({
  id: z.string().optional(),
  entryVersion: z.number().optional(),
  category: z.enum(outlineCategories),
  text: z.string(),
  relatedIds: z.array(z.string()),
  token: z.string(),
  baseVersion: z.number(),
  formal: z.enum(["card", "question", "task", "review"]).nullable(),
  askAI: z.boolean(),
  reviewed: z.boolean().default(false),
});
type Form = z.infer<typeof formSchema>;
export default function OrganizedThinking(
  props: ComponentProps<typeof GuidedThinking>,
) {
  const {
    root,
    rows,
    items,
    user,
    onRefresh,
    onEdit,
    onHistory,
    onOpen,
    onAdvanced,
    onGraph,
    onAdd,
    onExport,
  } = props;
  const [session, setSession] = useState<GuideSession | null>(null),
    [saving, setSaving] = useState(false),
    [requesting, setRequesting] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("正在读取已保存的整理…"),
    [tool, setTool] = useState<
      "original" | "scope" | "runs" | "versions" | null
    >(null),
    [ask, setAsk] = useState<{
      deep: boolean;
      tool?: "adjust";
      editing?: GuideAnswer;
    } | null>(null),
    [history, setHistory] = useState(false),
    [source, setSource] = useState<OutlineEntry | null>(null),
    [form, setForm] = useState<Form | null>(null),
    [change, setChange] = useState<{
      id: string;
      text: string;
      version: number;
      recordVersion?: number;
    } | null>(null),
    [comparison, setComparison] = useState(false),
    [versions, setVersions] = useState<
      { version: number; data: GuideSession["data"] }[] | null
    >(null),
    [editorError, setEditorError] = useState(""),
    [editorState, setEditorState] = useState(""),
    [help, setHelp] = useState(false);
  const current = useRef<GuideSession | null>(null),
    gates = useRef({ save: false, ai: false }),
    alive = useRef({ active: true }),
    loadEpoch = useRef(0),
    updates = useRef<{
      open: (kind: "information" | "judgment" | "result") => void;
    }>(null);
  const accept = useCallback((s: GuideSession) => {
    if (current.current?.id === s.id && current.current.version > s.version)
      return;
    current.current = s;
    setSession(s);
  }, []);
  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    const s = await api<GuideSession>(
      "guidance/" + root.id + "?compact=1",
      "POST",
      {},
    );
    if (alive.current.active && epoch === loadEpoch.current) accept(s);
    return s;
  }, [root.id, accept]);
  const scopeRevision = rows
    .map((e) => e.id + ":" + e.contentVersion + ":" + (e.deletedAt || ""))
    .sort()
    .join("|");
  useEffect(() => {
    const state = alive.current;
    state.active = true;
    void load()
      .then(() => {
        if (state.active) setSaved("已保存");
      })
      .catch((e) => {
        if (state.active) setError(e.message);
      });
    return () => {
      state.active = false;
    };
  }, [load, root.contentVersion, scopeRevision]);
  const lastJob = session?.data.outline.jobs.at(-1),
    running = lastJob?.state === "running";
  // Recover an in-flight saved job using reads only; opening a page never retries it.
  useEffect(() => {
    if (!running) return;
    let active = true;
    const timer = setInterval(() => {
      void api<GuideSession>("guidance/" + root.id + "?compact=1")
        .then((s) => {
          if (active) accept(s);
        })
        .catch(() => {});
    }, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [running, root.id, accept]);
  async function analyze(
    intent: "initial" | "update" | "question",
    focusId: string | null = null,
    token = requestToken(),
    s = current.current,
  ) {
    if (!s || gates.current.ai) return;
    gates.current.ai = true;
    setRequesting(true);
    setError("");
    setSaved("原文与已有内容已保存 · AI整理中…");
    try {
      const r = await api<{ session: GuideSession; stale: boolean }>(
        "guidance/" + root.id + "/outline?compact=1",
        "POST",
        { version: s.version, token, intent, focusId },
      );
      if (!alive.current.active) return;
      accept(r.session);
      if (
        !r.stale &&
        (r.session.data.outline.clarification ||
          (intent === "question" &&
            r.session.data.outline.questionRunId ===
              r.session.data.outline.jobs.at(-1)?.id))
      )
        setAsk({ deep: false });
      setSaved(
        r.session.data.outline.jobs.at(-1)?.state === "running"
          ? "原文已保存 · AI仍在处理中"
          : r.stale
            ? "已有内容保留 · 这次建议需重新核对"
            : r.session.data.outline.entries.length ||
                r.session.data.outline.changes.length
              ? "整理草稿已保存 · 尚未确认成正式记录"
              : "原文已保存 · 本次没有新增整理内容",
      );
      if (r.stale)
        setError(
          "生成期间内容已有变化，本次结果仅存入历史，没有覆盖当前整理。",
        );
      await onRefresh().catch(() => {});
    } catch (e) {
      if (alive.current.active) {
        setError(
          e instanceof Error ? e.message : "AI整理失败，已有内容仍保留。",
        );
        setSaved("AI整理未完成 · 原文和已有内容仍保留");
        try {
          const latest = await api<GuideSession>(
            "guidance/" + root.id + "?compact=1",
          );
          if (alive.current.active) accept(latest);
        } catch {}
      }
    } finally {
      gates.current.ai = false;
      if (alive.current.active) setRequesting(false);
    }
  }
  useEffect(() => {
    const s = session,
      token = s?.data.outline.autoToken;
    if (
      !s ||
      ask ||
      !token ||
      s.data.outline.attempted ||
      !user.aiConfigured ||
      gates.current.ai
    )
      return;
    const timer = setTimeout(() => {
      const key = `thought-draft:${user.id}:auto-outline:${root.id}`;
      try {
        if (localStorage.getItem(key) === token) return;
        localStorage.setItem(key, token);
      } catch {}
      void analyze("initial", null, token, s);
    }, 0);
    return () => clearTimeout(timer);
    // Automatic work is tied to the explicit saved start token, never to view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.data.outline.attempted, user.aiConfigured]);
  async function mutate(
    body: Record<string, unknown>,
    base = current.current?.version,
  ) {
    if (!base) throw Error("记录尚未载入，请稍后重试。");
    loadEpoch.current++;
    const s = await api<GuideSession>(
      "guidance/" + root.id + "/outline?compact=1",
      "PATCH",
      { version: base, ...body },
    );
    if (alive.current.active) accept(s);
    return s;
  }
  async function saveAction(fn: () => Promise<void>) {
    if (gates.current.save) return;
    gates.current.save = true;
    setSaving(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，输入仍保留。");
      setSaved("保存失败 · 输入仍保留");
    } finally {
      gates.current.save = false;
      setSaving(false);
    }
  }
  const formKey = (f: Form) =>
    `thought-draft:${user.id}:outline:${root.id}:${f.formal || "note"}:${f.id || "new"}`;
  function edit(entry?: OutlineEntry, formal: Form["formal"] = null) {
    if (entry?.targetId && !formal) {
      const entity = items.find((e) => e.id === entry.targetId);
      if (entity) {
        onEdit(entity);
        return;
      }
    }
    let f: Form = {
      id: entry?.id,
      entryVersion: entry?.version,
      category: entry?.category || "known",
      text: entry?.text || "",
      relatedIds: [],
      token: requestToken(),
      baseVersion: current.current?.version || 1,
      formal,
      askAI: !entry && user.aiConfigured,
      reviewed: false,
    };
    let restored = false;
    try {
      const parsed = formSchema.safeParse(
        JSON.parse(localStorage.getItem(formKey(f)) || "null"),
      );
      if (parsed.success) {
        f = parsed.data;
        restored = true;
      }
    } catch {}
    setEditorError("");
    setEditorState(restored ? "已恢复本地草稿 · 尚未保存" : "正在编辑");
    setForm(f);
  }
  function patchForm(p: Partial<Form>) {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...p };
      try {
        localStorage.setItem(formKey(next), JSON.stringify(next));
      } catch {
        setEditorError("本地草稿无法保留，请复制重要内容。");
      }
      return next;
    });
    setEditorState("正在编辑 · 本地草稿");
  }
  async function saveForm() {
    if (!form || !form.text.trim() || gates.current.save) return;
    const f = form;
    gates.current.save = true;
    setSaving(true);
    setEditorState("保存中…");
    setEditorError("");
    try {
      const s = await mutate(
        f.formal
          ? {
              action: "confirm",
              id: f.id,
              entryVersion: f.entryVersion,
              kind: f.formal,
              text: f.text,
            }
          : {
              action: "note",
              id: f.id,
              entryVersion: f.entryVersion,
              category: f.category,
              text: f.text,
              token: f.token,
              relatedIds: f.relatedIds,
              reviewed: f.reviewed,
            },
        f.baseVersion,
      );
      try {
        localStorage.removeItem(formKey(f));
      } catch {}
      setForm(null);
      setSaved("已保存");
      await onRefresh().catch(() => {});
      if (!f.formal && f.askAI && user.aiConfigured)
        void analyze("update", f.id || null, requestToken(), s);
    } catch (e) {
      setEditorError(
        (e instanceof Error ? e.message : "保存失败") +
          " 输入与本地草稿仍保留。",
      );
      setEditorState("保存失败 · 本地草稿");
    } finally {
      gates.current.save = false;
      setSaving(false);
    }
  }
  async function startFollowup(id: string | null = null) {
    await saveAction(async () => {
      const s = await mutate({ action: "focus", id });
      accept(s);
      if (
        user.aiConfigured &&
        !(
          s.data.current?.mode === "ai" &&
          !s.data.current.review &&
          s.data.outline.questionRunId
        )
      )
        await analyze("question", id, requestToken(), s);
      else setAsk({ deep: false });
    });
  }
  async function answered(s: GuideSession) {
    accept(s);
    setAsk(null);
    setSaved("回答已保存");
    await onRefresh().catch(() => {});
    if (user.aiConfigured && s.data.answers.at(-1)?.status !== "skipped")
      await analyze("update", s.data.outline.focusId, requestToken(), s);
  }
  const outline = session?.data.outline,
    entries = outline?.entries || [],
    pending = outline?.changes.filter((c) => c.state === "pending") || [],
    legacy = session
      ? guideClues(session, rows, 8).filter(
          (c) =>
            !entries.some(
              (e) =>
                e.text === c.text ||
                (e.targetId && c.entityIds.includes(e.targetId)),
            ),
        )
      : [];
  const readText = (e: OutlineEntry) => {
    const target = items.find((x) => x.id === e.targetId);
    return target
      ? isJudgment(target)
        ? judgmentText(target)
        : String(
            target.data.missing ||
              target.data.action ||
              target.data.content ||
              e.text,
          )
      : e.text;
  };
  if (ask)
    return (
      <div className="optional-followup">
        {ask.deep && (
          <button
            className="text-button"
            onClick={() => {
              setAsk(null);
              void load().catch((e) => setError(e.message));
            }}
          >
            返回整理成果
          </button>
        )}
        <GuidedThinking
          {...props}
          initialTool={ask.tool || null}
          initialEditing={ask.editing || null}
          onAnswered={ask.deep ? undefined : answered}
          onPause={
            ask.deep
              ? undefined
              : (s) => {
                  accept(s);
                  setAsk(null);
                  setSaved("已保存 · 可以下次继续");
                }
          }
        />
      </div>
    );
  return (
    <div className="organized-space">
      <div className="organized-heading">
        <button
          className="thinking-name text-button"
          onClick={() => setTool("original")}
        >
          {entityName(root)}
        </button>
        <span role="status" className="muted">
          {saved}
        </span>
        <Menu
          label="梳理"
          actions={[
            { label: "AI运行记录", action: () => setTool("runs") },
            {
              label: "调整引导",
              action: () => setAsk({ deep: true, tool: "adjust" }),
            },
            { label: "完整追问工具", action: () => setAsk({ deep: true }) },
            { label: "比较选择", action: () => setComparison(true) },
            { label: "留下下一步", action: () => onAdd("task") },
            { label: "检查相关更新", action: () => void analyze("update") },
            {
              label: "我有新信息",
              action: () => updates.current?.open("information"),
            },
            {
              label: "记录决定或结果",
              action: () => updates.current?.open("judgment"),
            },
            {
              label: "我做完这一步了",
              action: () => updates.current?.open("result"),
            },
            { label: "高级编辑与完整整理", action: onAdvanced },
            { label: "导出与个人备份", action: onExport },
            {
              label: "整理与问答版本",
              action: () => {
                void api<{ version: number; data: GuideSession["data"] }[]>(
                  "guidance/" + root.id + "/history",
                )
                  .then((v) => {
                    setVersions(v);
                    setTool("versions");
                  })
                  .catch((e) => setError(e.message));
              },
            },
          ]}
        />
      </div>
      {!user.aiConfigured && (
        <p className="muted ai-unconfigured">
          AI尚未配置；可以手动整理、查看已有成果或使用基础引导。
          <button className="text-button" onClick={() => setHelp(true)}>
            配置说明
          </button>
        </p>
      )}
      {(error || lastJob?.state === "error" || lastJob?.stale) && (
        <div className="notice error" role="alert">
          {error || lastJob?.message}
          <div className="bar">
            <button
              disabled={requesting || running || !user.aiConfigured}
              onClick={() =>
                void analyze(entries.length ? "update" : "initial")
              }
            >
              重试AI整理
            </button>
            <button
              className="text-button"
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              载入最新记录
            </button>
            <button className="text-button" onClick={() => edit()}>
              手动整理
            </button>
          </div>
        </div>
      )}
      {(requesting || running) && (
        <p className="notice" role="status">
          AI正在整理已有材料。原文已保存，你也可以继续查看或编辑。
        </p>
      )}
      <div className="outline-title">
        <div>
          <h2 tabIndex={-1}>我的思考</h2>
          <p className="muted">
            {entries.length
              ? "直接点击内容可修改；AI理解和可能的下一步都由你确认。"
              : "先看看已有内容，再决定哪里需要继续。"}
          </p>
        </div>
        <button className="text-button" onClick={() => setTool("scope")}>
          使用范围
        </button>
      </div>
      {!entries.length && !legacy.length && (
        <div className="outline-empty">
          <details open>
            <summary>已保存的原文</summary>
            <p className="full-body">
              {String(root.data.content || root.data.goal || root.data.title)}
            </p>
          </details>
          {!requesting && !running && (
            <>
              <p className="muted">
                {user.aiConfigured
                  ? "可以根据原文生成简短、可修改的初步整理。"
                  : "这里还没有整理草稿，你可以先留下一条自己的理解。"}
              </p>
              <div className="bar">
                <button
                  className="primary"
                  disabled={!user.aiConfigured || !session}
                  onClick={() => void analyze("initial")}
                >
                  生成初步整理
                </button>
                <button onClick={() => edit()}>手动留下一条</button>
              </div>
            </>
          )}
        </div>
      )}
      <section className="outline-notes" aria-label="当前整理成果">
        {entries.map((e) => (
          <article className="outline-note" key={e.id}>
            <div className="note-caption">
              <span>{outlineLabels[e.category]}</span>
              <small>
                {e.targetId
                  ? "已确认记录"
                  : e.origin === "ai"
                    ? "AI理解 · 待确认"
                    : e.aiDerived
                      ? "我修改的AI理解 · 待确认"
                      : "我的记录 · 待确认"}
              </small>
            </div>
            <button
              className="note-text"
              onClick={() => edit(e)}
              aria-label={"修改理解：" + e.text}
            >
              {readText(e)}
            </button>
            {e.review && (
              <p className="notice">
                相关原话或材料已变化，需要核对；已确认内容没有自动改写。
              </p>
            )}
            <div className="note-actions">
              <button
                className="text-button"
                onClick={() => void startFollowup(e.id)}
              >
                继续想这一点
              </button>
              <button className="text-button" onClick={() => setSource(e)}>
                查看原话与依据
              </button>
              <Menu
                label={"整理：" + e.text}
                actions={[
                  { label: "修改理解", action: () => edit(e) },
                  {
                    label: "补充依据或材料",
                    action: () => updates.current?.open("information"),
                  },
                  ...(e.targetId
                    ? [
                        {
                          label: "打开正式记录",
                          action: () => {
                            const t = items.find((x) => x.id === e.targetId);
                            if (t) onOpen(t);
                          },
                        },
                      ]
                    : [
                        {
                          label: "预览并确认记录",
                          action: () =>
                            edit(
                              e,
                              e.category === "unknown"
                                ? "question"
                                : e.category === "next"
                                  ? "task"
                                  : e.category === "judgment"
                                    ? "review"
                                    : "card",
                            ),
                        },
                      ]),
                ]}
              />
            </div>
          </article>
        ))}
      </section>
      {legacy.length > 0 && (
        <details className="previous-structure" open={!entries.length}>
          <summary>已有整理与原回答</summary>
          <h3>{entries.length ? "之前保留的线索" : "已有的整理与原回答"}</h3>
          <p className="muted">按已有记录展示，未自动生成新的总结。</p>
          {legacy.slice(0, 3).map((c) => (
            <article key={c.key}>
              <small>
                {c.label} · {c.nature}
              </small>
              <p className="full-body">{c.text}</p>
              <button
                className="text-button"
                onClick={() => {
                  const e = items.find((x) => c.entityIds.includes(x.id));
                  if (e) onOpen(e);
                  else setHistory(true);
                }}
              >
                查看来源
              </button>
            </article>
          ))}
          <button className="text-button" onClick={onAdvanced}>
            查看全部已有内容
          </button>
        </details>
      )}
      {pending.length > 0 && (
        <section className="outline-changes" aria-label="待核对的局部更新">
          <h3>有几处可以更新</h3>
          <p className="muted">已有内容保持原样，选择你认可的修改。</p>
          {pending.map((c) => (
            <article key={c.id}>
              <span>
                {outlineLabels[c.category]}
                {c.review ? " · 需重新核对" : ""}
              </span>
              {c.before && <p className="change-before">原来：{c.before}</p>}
              <p className="full-body">建议：{c.text}</p>
              <details>
                <summary>为什么这样更新？</summary>
                <p>{c.reason}</p>
                {c.sources.map((s, i) => (
                  <p className="full-body" key={i}>
                    {s.excerpt}
                  </p>
                ))}
              </details>
              <div className="bar">
                <button
                  disabled={c.review}
                  onClick={() => {
                    const target = entries.find((e) => e.id === c.targetId),
                      record = items.find((e) => e.id === target?.targetId);
                    setChange({
                      id: c.id,
                      text: c.text,
                      version: session!.version,
                      recordVersion: record?.version,
                    });
                  }}
                >
                  核对、编辑并接受
                </button>
                <button
                  className="text-button"
                  disabled={saving}
                  onClick={() =>
                    void saveAction(async () => {
                      await mutate({
                        action: "change",
                        id: c.id,
                        decision: "ignore",
                      });
                      setSaved("已保存 · 这条建议已放弃");
                    })
                  }
                >
                  放弃这条建议
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {outline?.comparison && (
        <section className="comparison-summary">
          <h3>选择比较</h3>
          <p>{outline.comparison.options.map((x) => x.text).join(" / ")}</p>
          <button className="text-button" onClick={() => setComparison(true)}>
            查看和修改比较
          </button>
        </section>
      )}
      <div className="outline-primary-actions">
        <button
          className="primary"
          disabled={saving || !session}
          onClick={() => void startFollowup()}
        >
          还没想清楚
        </button>
        <button disabled={!session} onClick={() => edit()}>
          补充信息
        </button>
        {(entries.filter((e) => e.category === "option").length >= 2 ||
          outline?.comparison) && (
          <button onClick={() => setComparison(true)}>比较选择</button>
        )}
        <button onClick={() => updates.current?.open("judgment")}>
          记录决定或结果
        </button>
        <button
          className="text-button"
          disabled={saving || !session}
          onClick={() =>
            void saveAction(async () => {
              await mutate({ action: "pause" });
              setSaved("已保存 · 可以下次直接继续");
            })
          }
        >
          先到这里
        </button>
      </div>
      <div className="organized-secondary">
        <button
          className="text-button"
          disabled={!session?.data.answers.length}
          onClick={() => setHistory(true)}
        >
          前面的回答
        </button>
        <button className="text-button" onClick={onGraph}>
          看看它们怎么连接
        </button>
      </div>
      {session && (
        <ThinkingUpdates
          root={root}
          rows={rows}
          items={items}
          session={session}
          userId={user.id}
          zone={user.settings.timezone}
          busy={saving}
          compact
          controller={updates}
          onSave={async (body) => {
            const r = await api<{ session: GuideSession }>(
              "guidance/" + root.id + "/updates?compact=1",
              "POST",
              body,
            );
            accept(r.session);
            setSaved("已保存");
            await onRefresh().catch(() => {});
            return r.session;
          }}
          onFocus={() => void startFollowup()}
          onHistory={onHistory}
          onOpen={onOpen}
        />
      )}
      {tool === "original" && (
        <Modal title="最初的问题" onClose={() => setTool(null)}>
          {(root.kind === "record"
            ? [root]
            : rows.filter((e) => e.kind === "record")
          ).map((e) => (
            <article key={e.id}>
              <p className="full-body">{String(e.data.content)}</p>
              <div className="bar">
                <button
                  onClick={() => {
                    setTool(null);
                    onEdit(e);
                  }}
                >
                  编辑原文
                </button>
                <button
                  onClick={() => {
                    setTool(null);
                    onHistory(e);
                  }}
                >
                  原文历史
                </button>
              </div>
            </article>
          ))}
        </Modal>
      )}
      {(tool === "scope" || tool === "runs") && (
        <GuideRecords
          key={tool}
          mode={tool}
          root={root.id}
          zone={user.settings.timezone}
          onClose={() => setTool(null)}
        />
      )}
      {history && session && (
        <GuideHistory
          session={session}
          onClose={() => setHistory(false)}
          onEdit={(a) => {
            setHistory(false);
            setAsk({ deep: true, editing: a });
          }}
          onAcknowledge={(a) =>
            void saveAction(async () => {
              const s = await api<GuideSession>(
                "guidance/" + root.id + "?compact=1",
                "PATCH",
                {
                  action: "acknowledge",
                  answerId: a.id,
                  version: current.current!.version,
                },
              );
              accept(s);
            })
          }
        />
      )}
      {source && (
        <Modal title="原话与依据" onClose={() => setSource(null)}>
          <p className="full-body">{source.text}</p>
          {source.sources.map((src, i) => (
            <article key={i}>
              <small>
                {src.kind === "answer"
                  ? "对应回答"
                  : src.kind === "entity"
                    ? "原文或材料"
                    : "对应整理"}{" "}
                · 来源版本{src.version}
              </small>
              <p className="full-body">{src.excerpt}</p>
              {src.kind === "entity" && (
                <button
                  onClick={() => {
                    const e = items.find((x) => x.id === src.id);
                    if (e) {
                      setSource(null);
                      onOpen(e);
                    }
                  }}
                >
                  查看完整材料
                </button>
              )}
              {src.kind === "answer" && (
                <button
                  onClick={() => {
                    setSource(null);
                    setHistory(true);
                  }}
                >
                  查看前面的回答
                </button>
              )}
            </article>
          ))}
        </Modal>
      )}
      {form && (
        <Modal
          title={
            form.formal ? "预览并确认记录" : form.id ? "修改理解" : "补充信息"
          }
          onClose={() => setForm(null)}
          description={
            form.formal
              ? "只有确认后才写入正式记录；行动不等于假设成立。"
              : "只修改这里的内容，其他理解、原话与关系保持。"
          }
        >
          {editorError && (
            <div role="alert" className="notice error">
              {editorError}
              <button
                className="text-button"
                onClick={() =>
                  void load()
                    .then((s) => {
                      setEditorState("最新内容已载入，请核对后保留输入");
                      accept(s);
                    })
                    .catch((e) => setEditorError(e.message))
                }
              >
                载入最新记录核对
              </button>
              {session && (
                <button
                  className="text-button"
                  onClick={() => {
                    const e = current.current!.data.outline.entries.find(
                      (e) => e.id === form.id,
                    );
                    patchForm({
                      baseVersion: current.current!.version,
                      entryVersion: e?.version,
                    });
                    setEditorError("");
                  }}
                >
                  已核对，保留我的输入
                </button>
              )}
            </div>
          )}
          <label>
            内容
            <textarea
              aria-label="整理内容"
              rows={5}
              value={form.text}
              onChange={(e) => patchForm({ text: e.target.value })}
              maxLength={5000}
            />
          </label>
          {form.formal ? (
            <label>
              保存为
              <select
                aria-label="确认记录类型"
                value={form.formal}
                onChange={(e) =>
                  patchForm({ formal: e.target.value as Form["formal"] })
                }
              >
                <option value="card">一条理解（仍未核实）</option>
                <option value="question">待确认问题</option>
                <option value="task">普通行动</option>
                <option value="review">我目前的判断</option>
              </select>
            </label>
          ) : (
            <details>
              <summary>补充信息与相关材料</summary>
              <label>
                内容位置
                <select
                  aria-label="整理内容位置"
                  value={form.category}
                  onChange={(e) =>
                    patchForm({ category: e.target.value as Form["category"] })
                  }
                >
                  {outlineCategories.map((c) => (
                    <option key={c} value={c}>
                      {outlineLabels[c]}
                    </option>
                  ))}
                </select>
              </label>
              <ReferencePicker
                label="与哪些材料有关"
                items={rows}
                value={form.relatedIds}
                onChange={(relatedIds) => patchForm({ relatedIds })}
              />
            </details>
          )}
          {form.id && entries.find((e) => e.id === form.id)?.review && (
            <label className="check">
              <input
                type="checkbox"
                checked={form.reviewed}
                onChange={(e) => patchForm({ reviewed: e.target.checked })}
              />
              我已查看并核对变化后的来源
            </label>
          )}
          {!form.formal && user.aiConfigured && (
            <label className="check">
              <input
                type="checkbox"
                checked={form.askAI}
                onChange={(e) => patchForm({ askAI: e.target.checked })}
              />
              保存后让AI提出相关更新
            </label>
          )}
          <p role="status" className="muted">
            {editorState}
          </p>
          <div className="bar">
            <button
              className="primary"
              disabled={saving || !form.text.trim()}
              onClick={() => void saveForm()}
            >
              {saving ? "保存中…" : form.formal ? "确认保存" : "保存"}
            </button>
            <button onClick={() => setForm(null)}>关闭</button>
          </div>
        </Modal>
      )}
      {change && session && (
        <Modal title="核对这条更新" onClose={() => setChange(null)}>
          <p className="muted">只有这一条会更新；旧版本和改变理由保留。</p>
          <textarea
            aria-label="候选更新内容"
            rows={5}
            value={change.text}
            onChange={(e) => setChange({ ...change, text: e.target.value })}
          />
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={saving || !change.text.trim()}
            onClick={() =>
              void saveAction(async () => {
                await mutate(
                  {
                    action: "change",
                    id: change.id,
                    decision: "accept",
                    text: change.text,
                    recordVersion: change.recordVersion,
                  },
                  change.version,
                );
                setChange(null);
                setSaved("已保存 · 这一处理解已更新");
                await onRefresh().catch(() => {});
              })
            }
          >
            确认这条更新
          </button>
        </Modal>
      )}
      {comparison && session && (
        <ComparisonEditor
          value={outline?.comparison || null}
          entries={entries}
          userId={user.id}
          rootId={root.id}
          version={session.version}
          onClose={() => setComparison(false)}
          onSave={async (value: Comparison, base: number) => {
            await mutate({ action: "comparison", comparison: value }, base);
            setComparison(false);
            setSaved("比较已保存");
          }}
        />
      )}
      {tool === "versions" && versions && (
        <Modal title="整理与问答版本" onClose={() => setTool(null)}>
          {versions.map((v) => (
            <details key={v.version}>
              <summary>版本{v.version}</summary>
              {v.data.outline?.entries.map((e) => (
                <p className="full-body" key={e.id}>
                  {outlineLabels[e.category]}：{e.text}
                </p>
              ))}
              {v.data.answers.map((a) => (
                <p className="full-body" key={a.id}>
                  {a.question.text}
                  <br />
                  {a.text || a.status}
                </p>
              ))}
            </details>
          ))}
        </Modal>
      )}
      {help && (
        <Modal title="AI配置说明" onClose={() => setHelp(false)}>
          <p>
            AI由服务管理员统一配置。未开通时仍能保存原文、手动整理和使用基础引导；需要开通请联系管理员。
          </p>
        </Modal>
      )}
    </div>
  );
}
