"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  Entity,
  Kind,
  titles,
  dateInZone,
  states,
  fields,
  referenceFields,
  selectScope,
} from "@/lib/schema";
import Editor, { EditRequest } from "./Editor";
import Graph from "./Graph";
type User = {
  id: string;
  email: string;
  role: string;
  settings: { timezone: string; reminders: boolean };
  aiConfigured: boolean;
  usage: unknown;
};
type Suggestion = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  status: string;
  target: string | null;
  feedback: string;
};
type Analysis = {
  id: string;
  created_at: string;
  stale: boolean;
  snapshot: Entity[];
  result: { understanding: string; clarifications: string[] };
  suggestions: Suggestion[];
};
async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
const name = (e: Entity) =>
  String(e.data.title || e.data.content || titles[e.kind]);
const nav = [
  "首页",
  "收集箱",
  "主题",
  "待思考",
  "待办与事件",
  "搜索",
  "设置",
  "回收站",
];
export default function Workspace() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [items, setItems] = useState<Entity[]>([]),
    [page, setPage] = useState("首页"),
    [topic, setTopic] = useState<string | null>(null),
    [tab, setTab] = useState("card"),
    [graph, setGraph] = useState(false),
    [edit, setEdit] = useState<EditRequest | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("全部"),
    [statusFilter, setStatusFilter] = useState("全部"),
    [selected, setSelected] = useState<string[]>([]),
    [analyses, setAnalyses] = useState<Analysis[]>([]),
    [mode, setMode] = useState("整理思路"),
    [answers, setAnswers] = useState(""),
    [quick, setQuick] = useState(""),
    [history, setHistory] = useState<{
      entity: Entity;
      versions: { version: number; snapshot: Entity; created_at: string }[];
    } | null>(null),
    [split, setSplit] = useState<Entity | null>(null),
    [splitText, setSplitText] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [register, setRegister] = useState(false);
  const topicRef = useRef<string | null>(null);
  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);
  const refresh = useCallback(async () => {
    const [u, rows] = await Promise.all([
      api<User>("me"),
      api<Entity[]>("entities?trash=1"),
    ]);
    setUser(u);
    setItems(rows);
    try {
      setQuick(localStorage.getItem("thought-draft:" + u.id + ":quick") || "");
    } catch {}
  }, []);
  useEffect(() => {
    void Promise.all([api<User>("me"), api<Entity[]>("entities?trash=1")])
      .then(([u, rows]) => {
        setUser(u);
        setItems(rows);
        try {
          setQuick(
            localStorage.getItem("thought-draft:" + u.id + ":quick") || "",
          );
        } catch {}
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    let current = true;
    api<Analysis[]>("analyses?" + (topic ? "topic=" + topic : ""))
      .then((x) => {
        if (current) setAnalyses(x);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [topic, user]);
  const alive = items.filter((x) => !x.deletedAt),
    today = dateInZone(new Date(), user?.settings.timezone || "Asia/Shanghai");
  async function work(fn: () => Promise<unknown>, message = "保存成功") {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh().catch((e) => {
        if (["请先登录", "会话已过期，请重新登录"].includes(e.message)) {
          setUser(null);
          setItems([]);
        } else throw e;
      });
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(e: Entity) {
    setEdit({ kind: e.kind, entity: e, topic: e.topic });
  }
  function add(kind: Kind, data?: Record<string, unknown>) {
    setEdit({ kind, topic: page === "主题详情" ? topic : null, data });
  }
  async function openTopic(t: Entity) {
    setTopic(t.id);
    setTab(String(t.data.lastPosition || "card"));
    setPage("主题详情");
    setSelected([]);
    setGraph(false);
  }
  async function switchTab(value: string) {
    setTab(value);
    const t = alive.find((x) => x.id === topic);
    if (t)
      await work(
        () =>
          api("entities/" + t.id, "PATCH", {
            data: { ...t.data, lastPosition: value },
            topic: null,
            version: t.version,
          }),
        "已记住主题位置",
      );
  }
  async function remove(e: Entity) {
    const impacts = await api<{ source: string; field: string }[]>(
      "entities/" + e.id + "/impact",
    );
    if (
      confirm(
        `删除“${name(e).slice(0, 40)}”？有 ${impacts.length} 处关联引用。关系将暂时失效，任务、证据和历史仍保留，可在回收站恢复。`,
      )
    )
      await api("entities/" + e.id, "DELETE", { version: e.version });
  }
  async function patch(e: Entity, data: Record<string, unknown>) {
    await work(() =>
      api("entities/" + e.id, "PATCH", {
        data: { ...e.data, ...data },
        topic: e.topic,
        version: e.version,
      }),
    );
  }
  function jump(e: Entity) {
    if (e.kind === "topic") {
      void openTopic(e);
      return;
    }
    if (e.topic) {
      const t = alive.find((x) => x.id === e.topic);
      if (t) {
        setTopic(t.id);
        setPage("主题详情");
        setTab(e.kind);
        setSelected([e.id]);
      }
    } else {
      setTopic(null);
      setPage(
        e.kind === "task" || e.kind === "event"
          ? "待办与事件"
          : e.kind === "question"
            ? "待思考"
            : "收集箱",
      );
    }
    open(e);
  }
  async function suggestion(s: Suggestion, kind?: Kind) {
    if (s.target) {
      const target = items.find((x) => x.id === s.target);
      if (target) jump(target);
      return;
    }
    const d = s.data;
    let k: Kind = (kind || s.kind) as Kind;
    let data: Record<string, unknown>;
    if (s.kind === "card")
      data = {
        title: d.title,
        content: d.content,
        type: d.type,
        source: "AI推断",
        sourceRefs: d.sourceRefs,
      };
    else if (s.kind === "relation") {
      const resolve = (id: string) =>
        analyses
          .flatMap((a) => a.suggestions)
          .find((x) => x.kind === "card" && x.data.localId === id)?.target ||
        id;
      data = {
        ...d,
        from: (d.from as string[]).map(resolve),
        to: (d.to as string[]).map(resolve),
      };
      if (
        [...(data.from as string[]), ...(data.to as string[])].some(
          (id) => !alive.find((x) => x.id === id),
        )
      ) {
        setError("请先采纳关系中的卡片草稿");
        return;
      }
    } else if (s.kind === "issue") {
      k = kind || "question";
      data =
        k === "question"
          ? {
              title: d.title,
              missing: d.missing,
              approach: d.validation,
              basis: d.reason,
              refs: d.refs,
              status: "待整理",
            }
          : {
              title: d.title,
              type: "普通任务",
              action: d.validation,
              information: d.missing,
              status: "待开始",
            };
    } else
      data =
        k === "question"
          ? {
              title: d.title,
              approach: d.action,
              missing: d.information,
              refs: d.refs,
              status: "待整理",
            }
          : {
              title: d.title,
              type: "普通任务",
              action: d.action,
              information: d.information,
              criterion: d.criterion,
              status: "待开始",
            };
    setEdit({ kind: k, topic, suggestion: s.id, data });
  }
  async function save(
    data: Record<string, unknown>,
    t: string | null,
    version?: number,
  ) {
    if (!edit) return;
    try {
      if (edit.suggestion)
        await api("suggestions/" + edit.suggestion, "POST", {
          action: "accept",
          kind: edit.kind,
          data,
        });
      else
        await api(
          "entities" + (edit.entity ? "/" + edit.entity.id : ""),
          edit.entity ? "PATCH" : "POST",
          {
            kind: edit.kind,
            data,
            topic: edit.kind === "topic" ? null : t,
            version: version ?? edit.entity?.version,
          },
        );
      await refresh();
      setNotice("保存成功");
    } catch (e) {
      await refresh();
      throw e;
    }
  }
  function choose(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  const taskDate = (e: Entity) =>
    String(e.kind === "event" ? e.data.date || "" : e.data.due || "").slice(
      0,
      10,
    );
  const isDone = (e: Entity) =>
    ["已完成", "取消", "已处理"].includes(String(e.data.status));
  function dateMatch(e: Entity) {
    const d = taskDate(e);
    if (filter === "全部") return true;
    if (filter === "逾期") return Boolean(d && d < today && !isDone(e));
    if (filter === "今日") return d === today;
    const current = new Date(today + "T12:00:00Z");
    const day = (current.getUTCDay() + 6) % 7;
    const monday = new Date(current);
    monday.setUTCDate(current.getUTCDate() - day);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return Boolean(
      d &&
      d >= monday.toISOString().slice(0, 10) &&
      d <= sunday.toISOString().slice(0, 10),
    );
  }
  function rows(rows: Entity[]) {
    return rows
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.data.pinned)) - Number(Boolean(a.data.pinned)) ||
          Number(a.data.order || 0) - Number(b.data.order || 0),
      )
      .map((e) => (
        <article className="item" key={e.id}>
          <div className="bar">
            <input
              aria-label={"选择" + name(e)}
              type="checkbox"
              style={{ width: 16 }}
              checked={selected.includes(e.id)}
              onChange={() => choose(e.id)}
            />
            <span className="badge">{titles[e.kind]}</span>
            {Boolean(e.data.status) && (
              <span className="badge">{String(e.data.status)}</span>
            )}
            <span className="muted">{e.id.slice(0, 8)}</span>
            {e.data.today === true && <span className="tag">今日关注</span>}
            {e.data.pinned === true && <span className="tag">重要置顶</span>}
            {e.data.archived === true && <span className="tag">已归档</span>}
          </div>
          <h3>
            <button
              className="subtle"
              onClick={() => (e.kind === "topic" ? void openTopic(e) : open(e))}
            >
              {name(e).slice(0, 120)}
            </button>
          </h3>
          {e.data.group ? (
            <span className="badge">分组：{String(e.data.group)}</span>
          ) : null}
          {Boolean(e.data.type) && (
            <p className="muted">
              {String(e.data.type)}
              {e.kind === "card" && e.data.type === "事实或观察"
                ? " · 不代表已核实"
                : ""}
            </p>
          )}
          {Boolean(e.data.content) && String(e.data.content) !== name(e) && (
            <details open={!e.data.collapsed}>
              <summary>展开内容</summary>
              <p>{String(e.data.content)}</p>
            </details>
          )}
          {String(e.data.content || "").length > 120 &&
            String(e.data.content) === name(e) && (
              <details>
                <summary>展开长内容</summary>
                <p>{String(e.data.content)}</p>
              </details>
            )}
          {e.kind === "relation" && (
            <p>
              {((e.data.from as string[]) || [])
                .map(
                  (id) =>
                    alive.find((x) => x.id === id)?.data.title ||
                    id.slice(0, 8),
                )
                .join(" + ")}{" "}
              →{" "}
              {((e.data.to as string[]) || [])
                .map(
                  (id) =>
                    alive.find((x) => x.id === id)?.data.title ||
                    id.slice(0, 8),
                )
                .join(", ")}{" "}
              · {String(e.data.type)}
              <br />
              为什么这样连接：{String(e.data.reason || "尚未填写")}
            </p>
          )}
          <details>
            <summary>查看完整记录</summary>
            {fields[e.kind]
              .filter(
                (f) =>
                  f.type !== "refs" &&
                  e.data[f.key] !== undefined &&
                  e.data[f.key] !== "",
              )
              .map((f) => (
                <p key={f.key}>
                  <strong>{f.label}：</strong>
                  {String(e.data[f.key])}
                </p>
              ))}
            <p className="muted">
              创建：{e.createdAt}
              <br />
              更新：{e.updatedAt}
            </p>
          </details>
          {referenceFields(e.kind).flatMap((k) =>
            ((e.data[k] as string[]) || []).map((id) => {
              const target = items.find((x) => x.id === id);
              return (
                <button
                  className="subtle"
                  key={k + id}
                  onClick={() => target && jump(target)}
                  disabled={!target || Boolean(target.deletedAt)}
                >
                  {fields[e.kind].find((f) => f.key === k)?.label || "关联"}：
                  {target ? name(target).slice(0, 15) : id.slice(0, 8)}
                  {target?.deletedAt ? "（已删除）" : ""}
                </button>
              );
            }),
          )}
          {taskDate(e) && (
            <p
              className={taskDate(e) < today && !isDone(e) ? "alert" : "muted"}
            >
              {e.kind === "event" ? "事件时间" : "截止日期"}：
              {String(e.kind === "event" ? e.data.date : e.data.due)}
              {taskDate(e) < today && !isDone(e) ? " · 已逾期" : ""}
            </p>
          )}
          {e.kind === "relation" &&
            [
              ...((e.data.from as string[]) || []),
              ...((e.data.to as string[]) || []),
            ].some((id) => !alive.some((x) => x.id === id)) && (
              <p className="alert">
                关联卡片已删除，这条关系暂时失效。可恢复卡片或重新编辑关系。
              </p>
            )}
          {e.kind === "task" &&
            e.data.type === "验证任务" &&
            e.data.status === "已完成" &&
            !e.data.result && (
              <p className="alert">
                行动已完成，验证结果未记录。完成不自动证明假设。
              </p>
            )}
          <div className="bar">
            {e.deletedAt ? (
              <button
                onClick={() =>
                  void work(
                    () =>
                      api("entities/" + e.id + "/restore", "POST", {
                        version: e.version,
                      }),
                    "恢复成功",
                  )
                }
              >
                恢复
              </button>
            ) : (
              <>
                <button onClick={() => open(e)}>编辑</button>
                <button onClick={() => void patch(e, { today: !e.data.today })}>
                  {e.data.today ? "取消今日关注" : "今日关注"}
                </button>
                <button
                  onClick={() => void patch(e, { pinned: !e.data.pinned })}
                >
                  {e.data.pinned ? "取消置顶" : "置顶"}
                </button>
                {e.kind === "card" && (
                  <>
                    <button
                      onClick={() => {
                        setSplit(e);
                        setSplitText(String(e.data.content));
                      }}
                    >
                      拆分
                    </button>
                    <button
                      onClick={() =>
                        void patch(e, { collapsed: !e.data.collapsed })
                      }
                    >
                      {e.data.collapsed ? "展开" : "折叠"}
                    </button>
                    <button
                      onClick={() =>
                        add("question", {
                          title: String(e.data.content),
                          refs: [e.id],
                        })
                      }
                    >
                      转为问题
                    </button>
                  </>
                )}
                {["task", "event", "question"].includes(e.kind) && (
                  <button
                    onClick={() =>
                      void patch(e, {
                        status:
                          isDone(e) || e.data.status === "已解决"
                            ? states[e.kind]?.[0] || "待开始"
                            : e.kind === "task"
                              ? "已完成"
                              : e.kind === "event"
                                ? "已处理"
                                : "已解决",
                      })
                    }
                  >
                    {isDone(e) || e.data.status === "已解决"
                      ? "重新打开"
                      : "完成/解决"}
                  </button>
                )}
                <button
                  onClick={() => void patch(e, { archived: !e.data.archived })}
                >
                  {e.data.archived ? "取消归档" : "归档"}
                </button>
                <button
                  onClick={() =>
                    void work(async () => {
                      setHistory({
                        entity: e,
                        versions: await api("entities/" + e.id + "/history"),
                      });
                    }, "已读取历史")
                  }
                >
                  历史与撤销
                </button>
                <button
                  onClick={() => void work(() => remove(e), "删除处理完成")}
                >
                  删除
                </button>
              </>
            )}
          </div>
        </article>
      ));
  }
  if (loading) return <div className="login panel">正在读取账号…</div>;
  if (!user)
    return (
      <div className="login panel">
        <span className="tag">THOUGHT ORGANIZER</span>
        <h1>思路整理器</h1>
        <p className="muted">记录想法，检查推导，留下下一步。</p>
        <h2>{register ? "创建私人账号" : "登录"}</h2>
        {error && <p className="alert error">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void work(async () => {
              await api("auth/" + (register ? "register" : "login"), "POST", {
                email,
                password,
              });
              setPassword("");
              setRegister(false);
              setPage("首页");
              setTopic(null);
              setSelected([]);
              setAnalyses([]);
              setSearch("");
            }, "登录成功");
          }}
        >
          <label>
            <span>邮箱</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>密码（至少10位）</span>
            <input
              type="password"
              minLength={10}
              maxLength={128}
              required
              autoComplete={register ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="bar">
            <button className="primary" disabled={busy}>
              {busy ? "处理中…" : register ? "注册并登录" : "登录"}
            </button>
            <button type="button" onClick={() => setRegister(!register)}>
              {register ? "已有账号" : "创建账号"}
            </button>
          </div>
        </form>
        <p className="muted">内容默认私人。AI配置不影响手动整理。</p>
      </div>
    );
  const t = alive.find((x) => x.id === topic);
  const scoped = alive.filter((x) => x.topic === topic);
  const trash = items.filter((x) => x.deletedAt);
  const visible = alive.filter(
    (x) =>
      !x.data.archived &&
      (statusFilter === "全部" || x.data.status === statusFilter),
  );
  const inputScope =
    topic && !t
      ? []
      : selectScope(
          alive,
          topic,
          selected.filter((id) => scoped.some((x) => x.id === id)),
        );
  const aiPanel = (
    <aside className="panel">
      <h2>AI建议</h2>
      <p className="muted">
        仅使用当前主题或明确选中内容。建议由你确认后保存。
      </p>
      {!user.aiConfigured && (
        <p className="alert">AI未配置：其他功能正常可用。</p>
      )}
      <label>
        <span>动作</span>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {["整理思路", "检查推导", "生成下一步"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <details>
        <summary>查看本次输入范围（{inputScope.length}项）</summary>
        {inputScope.map((x) => (
          <p key={x.id}>
            {titles[x.kind]} · {x.id} · 内容版本 {x.contentVersion}
            <br />
            {name(x)}
          </p>
        ))}
        <p>目标：{String(t?.data.goal || "未填写")}</p>
      </details>
      <label>
        <span>澄清回答 / 补充要求（可跳过）</span>
        <textarea
          value={answers}
          onChange={(e) => setAnswers(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !user.aiConfigured}
        className="primary"
        onClick={() =>
          void work(async () => {
            await api("analyses", "POST", {
              topic,
              ids: selected.filter((id) => scoped.some((x) => x.id === id)),
              mode,
              answers,
            });
            const results = await api<Analysis[]>("analyses?topic=" + topic);
            if (topicRef.current === topic) setAnalyses(results);
          }, "分析已保存，请逐条确认")
        }
      >
        {busy ? "分析中…" : "生成分析草稿"}
      </button>
      {analyses.map((a) => (
        <div className="item" key={a.id}>
          <span className="muted">
            {new Date(a.created_at).toLocaleString("zh-CN", {
              timeZone: user.settings.timezone,
            })}
          </span>
          {a.stale && (
            <p className="alert">旧分析：输入内容已变化，禁止采纳。</p>
          )}
          <p>{a.result.understanding}</p>
          {a.result.clarifications.map((q, i) => (
            <p key={i}>
              澄清 {i + 1}：{q}（可跳过）
            </p>
          ))}
          <details>
            <summary>查看输入快照</summary>
            <pre>
              {JSON.stringify(
                a.snapshot.map(({ owner: _, ...x }) => {
                  void _;
                  return x;
                }),
                null,
                2,
              )}
            </pre>
          </details>
          {a.suggestions.map((s) => (
            <div className="panel" key={s.id}>
              <strong>
                {String(s.data.title || s.data.type || "关系建议")}
              </strong>
              <p className="muted">
                {s.kind} · {s.status}
              </p>
              <details>
                <summary>理由、原句与字段</summary>
                <pre>{JSON.stringify(s.data, null, 2)}</pre>
              </details>
              <div className="bar">
                <button
                  disabled={a.stale && !s.target}
                  onClick={() => void suggestion(s)}
                >
                  {s.target ? "打开已创建项目" : "预览与修改"}
                </button>
                {s.kind === "issue" && (
                  <button
                    disabled={a.stale}
                    onClick={() => void suggestion(s, "task")}
                  >
                    预览转为任务
                  </button>
                )}
                <button
                  onClick={() =>
                    void work(async () => {
                      await api("suggestions/" + s.id, "POST", {
                        action: "ignore",
                        feedback: prompt("忽略理由（可空）") || "",
                      });
                      const results = await api<Analysis[]>(
                        "analyses?topic=" + topic,
                      );
                      if (topicRef.current === topic) setAnalyses(results);
                    }, "反馈已保存")
                  }
                >
                  忽略
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              void work(
                () =>
                  api("feedback", "POST", {
                    analysisId: a.id,
                    rating: "部分有用",
                    comment: prompt("对本次分析的反馈（可空）") || "",
                  }),
                "反馈已保存",
              )
            }
          >
            提交分析反馈
          </button>
        </div>
      ))}
    </aside>
  );
  return (
    <div className="shell">
      <nav className="nav">
        <h2>思路整理器</h2>
        <p className="muted">想法 → 判断 → 验证</p>
        {nav.map((n) => (
          <button
            key={n}
            aria-pressed={page === n}
            onClick={() => {
              setPage(n);
              setSelected([]);
              setStatusFilter("全部");
              if (n !== "主题详情") setTopic(null);
            }}
          >
            {n}
            {n === "收集箱"
              ? " · " +
                alive.filter((x) => !x.topic && x.kind !== "topic").length
              : ""}
          </button>
        ))}
        <p className="muted">{user.email}</p>
        <button
          onClick={() =>
            void work(async () => {
              await api("auth/logout", "POST", {});
              try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const key = localStorage.key(i);
                  if (key?.startsWith("thought-draft:" + user.id + ":"))
                    localStorage.removeItem(key);
                }
              } catch {}
              setUser(null);
              setItems([]);
            }, "已退出")
          }
        >
          退出登录
        </button>
      </nav>
      <main className="main">
        <div className="toast">
          {error && (
            <p role="alert" className="alert error">
              {error}{" "}
              <button className="subtle" onClick={() => setError("")}>
                关闭
              </button>
            </p>
          )}
          {notice && (
            <p role="status" className="alert">
              {notice}{" "}
              <button className="subtle" onClick={() => setNotice("")}>
                关闭
              </button>
            </p>
          )}
        </div>
        <header className="bar">
          <h1>
            {page === "主题详情" ? String(t?.data.title || "主题") : page}
          </h1>
          <span className="muted">
            {today} · {user.settings.timezone}
          </span>
          <button disabled={busy} onClick={() => void work(refresh, "已刷新")}>
            刷新
          </button>
        </header>
        {page === "首页" && (
          <>
            <section className="panel">
              <h2>先记下来，再慢慢理清</h2>
              <label>
                <span>快速记录（只需内容）</span>
                <textarea
                  value={quick}
                  onChange={(e) => {
                    setQuick(e.target.value);
                    try {
                      localStorage.setItem(
                        "thought-draft:" + user.id + ":quick",
                        e.target.value,
                      );
                    } catch {
                      setError("无法保留快速记录草稿，请复制内容");
                    }
                  }}
                  placeholder="粘贴笔记、聊天，或写下刚刚的想法…"
                />
              </label>
              <button
                className="primary"
                disabled={busy || !quick.trim()}
                onClick={() =>
                  void work(async () => {
                    await api("entities", "POST", {
                      kind: "record",
                      topic: null,
                      data: { content: quick, status: "未整理" },
                    });
                    try {
                      localStorage.removeItem(
                        "thought-draft:" + user.id + ":quick",
                      );
                    } catch {}
                    setQuick("");
                  }, "原文已保存到收集箱")
                }
              >
                保存到收集箱
              </button>
              <div className="bar">
                <button onClick={() => add("topic")}>新建主题</button>
                <button onClick={() => add("question")}>单独创建问题</button>
                <button onClick={() => add("task")}>单独创建任务</button>
                <button onClick={() => add("event")}>单独创建事件</button>
              </div>
            </section>
            <div className="grid">
              <section>
                <h2>今日关注 · 由你选择</h2>
                {rows(alive.filter((x) => x.data.today))}
                {!alive.some((x) => x.data.today) && (
                  <p className="muted">从任意事项选择“今日关注”。</p>
                )}
              </section>
              <section>
                <h2>最近主题</h2>
                {rows(
                  alive
                    .filter(
                      (x) => x.kind === "topic" && x.data.status !== "归档",
                    )
                    .slice(0, 4),
                )}
              </section>
            </div>
            <h2>
              {user.settings.reminders
                ? "临近截止与逾期"
                : "日期事项（工具内提醒已关闭）"}
            </h2>
            {rows(
              alive.filter(
                (x) =>
                  ["task", "event"].includes(x.kind) &&
                  taskDate(x) &&
                  !isDone(x) &&
                  taskDate(x) <=
                    new Date(
                      new Date(today + "T12:00:00Z").getTime() + 7 * 86400000,
                    )
                      .toISOString()
                      .slice(0, 10),
              ),
            )}
            <h2>未归类内容</h2>
            {rows(
              alive.filter((x) => !x.topic && x.kind !== "topic").slice(0, 8),
            )}
          </>
        )}
        {page === "收集箱" && (
          <>
            <div className="bar">
              {(
                [
                  "record",
                  "card",
                  "question",
                  "task",
                  "event",
                  "evidence",
                ] as Kind[]
              ).map((k) => (
                <button key={k} onClick={() => add(k)}>
                  新建{titles[k]}
                </button>
              ))}
            </div>
            {rows(alive.filter((x) => !x.topic && x.kind !== "topic"))}
          </>
        )}
        {page === "主题" && (
          <>
            <div className="bar">
              <button className="primary" onClick={() => add("topic")}>
                新建主题
              </button>
              <input
                style={{ maxWidth: 300 }}
                placeholder="按名称、标签搜索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                style={{ width: 140 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {["全部", ...states.topic!].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            {rows(
              alive.filter(
                (x) =>
                  x.kind === "topic" &&
                  (statusFilter === "全部" || x.data.status === statusFilter) &&
                  JSON.stringify(x.data).includes(search),
              ),
            )}
          </>
        )}
        {page === "主题详情" && t && (
          <>
            <section className="panel">
              <p>
                <span className="badge">{String(t.data.status)}</span>目标：
                {String(t.data.goal || "尚未设置")}
              </p>
              <p className="muted">
                背景与限制：{String(t.data.background || "未填写")}
                <br />
                当前重点：{String(t.data.focus || "未填写")}
              </p>
              <button onClick={() => open(t)}>编辑主题 / 暂停 / 归档</button>
              <p className="muted">
                新增证据 {scoped.filter((x) => x.kind === "evidence").length} ·
                未解决问题{" "}
                {
                  scoped.filter(
                    (x) => x.kind === "question" && x.data.status !== "已解决",
                  ).length
                }{" "}
                · 完成行动{" "}
                {
                  scoped.filter(
                    (x) => x.kind === "task" && x.data.status === "已完成",
                  ).length
                }
              </p>
              {scoped
                .filter((x) => x.kind === "review")
                .slice(0, 1)
                .map((x) => (
                  <p key={x.id}>
                    当前判断：{String(x.data.judgment || "未记录")}
                  </p>
                ))}
            </section>
            <div className="detail">
              <section>
                <div className="bar tabs">
                  {(
                    [
                      "record",
                      "card",
                      "relation",
                      "question",
                      "task",
                      "event",
                      "evidence",
                      "validation",
                      "review",
                    ] as Kind[]
                  ).map((k) => (
                    <button
                      key={k}
                      aria-pressed={tab === k}
                      onClick={() => void switchTab(k)}
                    >
                      {titles[k]}
                    </button>
                  ))}
                </div>
                <div className="bar">
                  <button onClick={() => add(tab as Kind)}>
                    新增{titles[tab as Kind]}
                  </button>
                  {["card", "relation"].includes(tab) && (
                    <>
                      <button onClick={() => setGraph(!graph)}>
                        {graph ? "列表 / 大纲" : "逻辑图"}
                      </button>
                      <button onClick={() => add("relation")}>
                        建立多前提关系
                      </button>
                      <button
                        onClick={() =>
                          void work(async () => {
                            const ops =
                              await api<{ id: string; undone: number }[]>(
                                "operations",
                              );
                            const op = ops.find((x) => !x.undone);
                            if (!op) throw new Error("没有可撤销的拆分或合并");
                            await api("operations/" + op.id, "POST", {});
                          }, "已撤销拆分或合并，恢复原关联")
                        }
                      >
                        撤销最近拆分 / 合并
                      </button>
                    </>
                  )}
                  {tab === "card" &&
                    selected.filter(
                      (id) => scoped.find((x) => x.id === id)?.kind === "card",
                    ).length > 1 && (
                      <button
                        onClick={() =>
                          void work(() => {
                            const cards = scoped.filter(
                              (x) =>
                                selected.includes(x.id) && x.kind === "card",
                            );
                            return api("transform", "POST", {
                              ids: cards.map((x) => x.id),
                              versions: Object.fromEntries(
                                cards.map((x) => [x.id, x.version]),
                              ),
                              parts: null,
                            });
                          }, "卡片已合并，引用和来源已保留")
                        }
                      >
                        合并选中卡片
                      </button>
                    )}
                </div>
                {graph && ["card", "relation"].includes(tab) ? (
                  <Graph items={scoped} onOpen={open} />
                ) : (
                  rows(scoped.filter((x) => x.kind === tab))
                )}
                {!scoped.some((x) => x.kind === tab) && (
                  <p className="panel muted">
                    这里还没有{titles[tab as Kind]}，可手动新增。
                  </p>
                )}
              </section>
              {aiPanel}
            </div>
          </>
        )}
        {page === "待思考" && (
          <>
            <div className="bar">
              <button onClick={() => add("question")}>新建问题</button>
              <select
                style={{ width: 180 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {["全部", ...states.question!].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            {rows(visible.filter((x) => x.kind === "question"))}
          </>
        )}
        {page === "待办与事件" && (
          <>
            <div className="bar">
              <button onClick={() => add("task")}>新建任务 / 验证任务</button>
              <button onClick={() => add("event")}>新建事件</button>
              {["今日", "本周", "逾期", "全部"].map((f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
              <select
                style={{ width: 160 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {["全部", ...new Set([...states.task!, ...states.event!])].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </div>
            {rows(
              visible.filter(
                (x) => ["task", "event"].includes(x.kind) && dateMatch(x),
              ),
            )}
          </>
        )}
        {page === "搜索" && (
          <>
            <label>
              <span>按标题、内容、标签、状态、主题搜索</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {rows(
              alive.filter(
                (x) =>
                  JSON.stringify(x.data).includes(search) ||
                  String(
                    alive.find((t) => t.id === x.topic)?.data.title || "",
                  ).includes(search),
              ),
            )}
          </>
        )}
        {page === "回收站" && (
          <>
            <p className="panel muted">
              软删除数据无限期保留，直到删除账号。删除主题后先恢复主题，再恢复所属项目。失效关系与历史不被静默清除。
            </p>
            {rows(trash)}
          </>
        )}
        {page === "设置" && (
          <>
            <section className="panel">
              <h2>账号与偏好</h2>
              <p>{user.email} · 内容默认私人</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void work(() =>
                    api("settings", "PATCH", {
                      timezone: data.get("timezone"),
                      reminders: data.get("reminders") === "on",
                    }),
                  );
                }}
              >
                <label>
                  <span>时区</span>
                  <input
                    name="timezone"
                    defaultValue={user.settings.timezone}
                    placeholder="Asia/Shanghai"
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="reminders"
                    defaultChecked={user.settings.reminders}
                  />
                  <span>启用工具内日期提醒（不包含关闭网页后的通知）</span>
                </label>
                <button>保存设置</button>
              </form>
            </section>
            <section className="panel">
              <h2>导出、恢复与数据删除</h2>
              <div className="bar">
                <a download href="/api/export?format=md">
                  导出 Markdown
                </a>
                <a download href="/api/export">
                  JSON个人备份
                </a>
              </div>
              <label>
                <span>
                  从JSON备份恢复（最多2MB，事务内导入，冲突编号重映射）
                </span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setError("文件超过2MB");
                      return;
                    }
                    void work(
                      async () =>
                        api("import", "POST", JSON.parse(await file.text())),
                      "备份已导入；现有数据未覆盖",
                    );
                  }}
                />
              </label>
              <p className="muted">
                个人JSON不替代服务端数据库备份。回收站无限期保留；恢复入口在侧栏。
              </p>
              <button
                onClick={() => {
                  const password = prompt(
                    "永久删除账号及全部数据。请输入账号密码确认",
                  );
                  if (password)
                    void work(async () => {
                      await api("account", "DELETE", { password });
                      setUser(null);
                      setItems([]);
                    }, "账号已删除");
                }}
              >
                删除账号及全部数据
              </button>
            </section>
            <section className="panel">
              <h2>AI配置、额度与用量</h2>
              <p>
                {user.aiConfigured ? "已配置，实际调用质量待验证" : "AI未配置"}
              </p>
              <p className="muted">
                密钥仅在服务器环境设置。默认不使用模拟结果。
              </p>
              <pre>{JSON.stringify(user.usage, null, 2)}</pre>
            </section>
          </>
        )}
        {!["首页", "主题详情", "设置", "回收站"].includes(page) &&
          !alive.length && (
            <p className="panel muted">还没有内容，从快速记录开始。</p>
          )}
      </main>
      {edit && (
        <Editor
          key={edit.entity?.id || edit.suggestion || edit.kind}
          request={edit}
          items={alive}
          userId={user.id}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
      {history && (
        <div className="overlay">
          <section className="dialog" role="dialog" aria-modal="true">
            <h2>历史版本 · {name(history.entity).slice(0, 40)}</h2>
            {history.versions.length === 0 && <p>尚无修改历史。</p>}
            {history.versions.map((v) => (
              <div className="panel" key={v.version}>
                <h3>
                  版本 {v.version} · {v.created_at}
                </h3>
                <pre>{JSON.stringify(v.snapshot.data, null, 2)}</pre>
                <button
                  onClick={() =>
                    void work(async () => {
                      const current = items.find(
                        (x) => x.id === history.entity.id,
                      )!;
                      await api("entities/" + current.id + "/undo", "POST", {
                        version: current.version,
                        targetVersion: v.version,
                      });
                      setHistory(null);
                    }, "已恢复历史内容，并保留新版本")
                  }
                >
                  恢复此版本（撤销）
                </button>
              </div>
            ))}
            <button onClick={() => setHistory(null)}>关闭</button>
          </section>
        </div>
      )}
      {split && (
        <div className="overlay">
          <section className="dialog" role="dialog" aria-modal="true">
            <h2>拆分卡片</h2>
            <p>用空行分隔两段或更多内容。来源保留，关系与任务引用同步处理。</p>
            <textarea
              style={{ minHeight: 240 }}
              value={splitText}
              onChange={(e) => setSplitText(e.target.value)}
            />
            <div className="bar">
              <button
                onClick={() =>
                  void work(async () => {
                    await api("transform", "POST", {
                      ids: [split.id],
                      versions: { [split.id]: split.version },
                      parts: splitText
                        .split(/\n\s*\n/)
                        .map((x) => x.trim())
                        .filter(Boolean),
                    });
                    setSplit(null);
                  }, "拆分完成")
                }
              >
                确认拆分
              </button>
              <button onClick={() => setSplit(null)}>取消</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
