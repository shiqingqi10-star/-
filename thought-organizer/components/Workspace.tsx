"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HomeIcon,
  ArchiveIcon,
  ReaderIcon,
  QuestionMarkCircledIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  GearIcon,
  TrashIcon,
  PlusIcon,
  HamburgerMenuIcon,
  LightningBoltIcon,
  ExitIcon,
  ReloadIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  LayersIcon,
} from "@radix-ui/react-icons";
import {
  Entity,
  Kind,
  kinds,
  fields,
  states,
  dateInZone,
  selectScope,
} from "@/lib/schema";
import {
  entityName,
  kindLabels,
  topicSections,
  sectionFor,
  rememberedKind,
  recentTopics,
  focusItems,
  matchesDate,
  finished,
  readableTime,
} from "@/lib/presentation";
import Editor, { EditRequest } from "./Editor";
import Graph from "./Graph";
import EntityList from "./EntityList";
import EntityDetail, { RecordFields } from "./EntityDetail";
import AIAssistant, { Analysis, Suggestion } from "./AIAssistant";
import Modal from "./ui/Modal";
import Menu, { MenuAction } from "./ui/Menu";
import Settings, { User } from "./Settings";
async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败，请稍后重试。");
  return data;
}
const nav = [
  { name: "首页", icon: HomeIcon },
  { name: "收集箱", icon: ArchiveIcon },
  { name: "我的主题", icon: ReaderIcon },
  { name: "待思考", icon: QuestionMarkCircledIcon },
  { name: "待办与事件", icon: CalendarIcon },
];
export default function Workspace() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [items, setItems] = useState<Entity[]>([]),
    [page, setPage] = useState("首页"),
    [topic, setTopic] = useState<string | null>(null),
    [tab, setTab] = useState<Kind>("card"),
    [graph, setGraph] = useState(false),
    [edit, setEdit] = useState<EditRequest | null>(null),
    [detail, setDetail] = useState<Entity | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("全部"),
    [statusFilter, setStatusFilter] = useState("全部"),
    [typeFilter, setTypeFilter] = useState("全部"),
    [showArchived, setShowArchived] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [selecting, setSelecting] = useState(false),
    [analyses, setAnalyses] = useState<Analysis[]>([]),
    [aiOpen, setAiOpen] = useState(false),
    [guide, setGuide] = useState(false),
    [quick, setQuick] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [history, setHistory] = useState<{
      entity: Entity;
      versions: { version: number; snapshot: Entity; created_at: string }[];
    } | null>(null),
    [split, setSplit] = useState<Entity | null>(null),
    [splitText, setSplitText] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [register, setRegister] = useState(false),
    [feedback, setFeedback] = useState<{
      analysisId: string | null;
      suggestionId?: string;
      rating: string;
      comment: string;
    } | null>(null);
  const topicRef = useRef<string | null>(null),
    quickRef = useRef("");
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
  }, []);
  useEffect(() => {
    void Promise.all([api<User>("me"), api<Entity[]>("entities?trash=1")])
      .then(([u, rows]) => {
        setUser(u);
        setItems(rows);
        try {
          const value =
            localStorage.getItem("thought-draft:" + u.id + ":quick") || "";
          setQuick(value);
          quickRef.current = value;
        } catch {}
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user || !topic) return;
    let current = true;
    api<Analysis[]>("analyses?topic=" + topic)
      .then((rows) => {
        if (current) setAnalyses(rows);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [topic, user]);
  const alive = items.filter((e) => !e.deletedAt),
    zone = user?.settings.timezone || "Asia/Shanghai",
    today = dateInZone(new Date(), zone),
    t = alive.find((e) => e.id === topic),
    scoped = alive.filter((e) => e.topic === topic),
    selectedScoped = selected.filter((id) => scoped.some((e) => e.id === id));
  const inputScope =
    topic && t
      ? selectScope(alive, topic, selecting ? selectedScoped : [])
      : [];
  async function work(fn: () => Promise<unknown>, message = "已保存") {
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
      setError(e instanceof Error ? e.message : "操作失败，请稍后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: string) {
    setPage(next);
    setTopic(null);
    setSelected([]);
    setSelecting(false);
    setAiOpen(false);
    setAnalyses([]);
    setMobileNav(false);
    setStatusFilter("全部");
    setTypeFilter("全部");
    setShowArchived(false);
    setDetail(null);
  }
  function openTopic(e: Entity) {
    setTopic(e.id);
    setPage("主题详情");
    setTab(rememberedKind(e.data.lastPosition));
    setGraph(false);
    setSelected([]);
    setSelecting(false);
    setAnalyses([]);
    setAiOpen(false);
    setMobileNav(false);
  }
  function openDetail(e: Entity) {
    if (e.kind === "topic" && !e.deletedAt) {
      openTopic(e);
      return;
    }
    setDetail(e);
  }
  function openEdit(e: Entity) {
    setDetail(null);
    setEdit({ kind: e.kind, entity: e, topic: e.topic });
  }
  function add(kind: Kind, data?: Record<string, unknown>) {
    setEdit({ kind, topic: page === "主题详情" ? topic : null, data });
  }
  function jump(e: Entity) {
    setDetail(null);
    setHistory(null);
    if (e.deletedAt) {
      navigate("回收站");
      setDetail(e);
      return;
    }
    if (e.kind === "topic") {
      openTopic(e);
      return;
    }
    if (e.topic) {
      const parent = alive.find((x) => x.id === e.topic);
      if (parent) {
        openTopic(parent);
        setTab(e.kind);
        setDetail(e);
        return;
      }
    }
    navigate(
      e.kind === "question"
        ? "待思考"
        : ["task", "event"].includes(e.kind)
          ? "待办与事件"
          : "收集箱",
    );
    setDetail(e);
  }
  async function switchTab(kind: Kind) {
    setTab(kind);
    const current = items.find((e) => e.id === topic);
    if (current && current.data.lastPosition !== kind) {
      try {
        const saved = await api<Entity>("entities/" + current.id, "PATCH", {
          data: { ...current.data, lastPosition: kind },
          topic: null,
          version: current.version,
        });
        setItems((rows) => rows.map((e) => (e.id === saved.id ? saved : e)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "无法保存当前位置");
      }
    }
  }
  async function patch(e: Entity, change: Record<string, unknown>) {
    await work(() =>
      api("entities/" + e.id, "PATCH", {
        data: { ...e.data, ...change },
        topic: e.topic,
        version: e.version,
      }),
    );
  }
  async function complete(e: Entity) {
    await patch(e, {
      status: finished(e)
        ? states[e.kind]?.[0]
        : e.kind === "task"
          ? "已完成"
          : e.kind === "event"
            ? "已处理"
            : "已解决",
    });
  }
  async function remove(e: Entity) {
    const impact = await api<{ source: string; field: string }[]>(
      "entities/" + e.id + "/impact",
    );
    if (
      !confirm(
        `删除“${entityName(e).slice(0, 45)}”？${impact.length ? "有 " + impact.length + " 处关联会暂时失效。" : ""}你可以在回收站恢复，历史记录会保留。`,
      )
    )
      return;
    await api("entities/" + e.id, "DELETE", { version: e.version });
    if (e.id === topic) navigate("我的主题");
  }
  async function openHistory(e: Entity) {
    await work(async () => {
      const versions = await api<
        { version: number; snapshot: Entity; created_at: string }[]
      >("entities/" + e.id + "/history");
      setDetail(null);
      setHistory({ entity: e, versions });
    }, "已载入历史版本");
  }
  function actions(e: Entity): MenuAction[] {
    if (e.deletedAt)
      return [
        {
          label: "恢复",
          action: () =>
            void work(
              () =>
                api("entities/" + e.id + "/restore", "POST", {
                  version: e.version,
                }),
              "已恢复",
            ),
        },
      ];
    const rows: MenuAction[] = [
      { label: "编辑", action: () => openEdit(e) },
      {
        label: e.data.pinned ? "取消置顶" : "置顶",
        action: () => void patch(e, { pinned: !e.data.pinned }),
      },
      {
        label: e.data.today ? "取消今日关注" : "今日关注",
        action: () => void patch(e, { today: !e.data.today }),
      },
    ];
    if (e.kind === "card")
      rows.push(
        {
          label: "拆分",
          action: () => {
            setSplit(e);
            setSplitText(String(e.data.content));
          },
        },
        {
          label: e.data.collapsed ? "展开卡片" : "折叠卡片",
          action: () => void patch(e, { collapsed: !e.data.collapsed }),
        },
        {
          label: "转为待思考问题",
          action: () =>
            add("question", { title: String(e.data.content), refs: [e.id] }),
        },
      );
    rows.push(
      {
        label: e.data.archived ? "取消归档" : "归档",
        action: () => void patch(e, { archived: !e.data.archived }),
      },
      { label: "历史版本", action: () => void openHistory(e) },
      {
        label: "删除",
        danger: true,
        action: () => void work(() => remove(e), "删除操作已处理"),
      },
    );
    return rows;
  }
  async function save(
    data: Record<string, unknown>,
    target: string | null,
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
            topic: edit.kind === "topic" ? null : target,
            version: version ?? edit.entity?.version,
          },
        );
      await refresh();
      setNotice("已保存");
    } catch (e) {
      try {
        await refresh();
      } catch {}
      throw e;
    }
  }
  async function suggest(s: Suggestion, a: Analysis, kind?: Kind) {
    if (s.target) {
      const target = items.find((e) => e.id === s.target);
      if (target) {
        setAiOpen(false);
        jump(target);
      }
      return;
    }
    let k = (kind || s.kind) as Kind;
    const d = s.data;
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
        a.suggestions.find((x) => x.kind === "card" && x.data.localId === id)
          ?.target || id;
      data = {
        ...d,
        from: (d.from as string[]).map(resolve),
        to: (d.to as string[]).map(resolve),
      };
      if (
        [...(data.from as string[]), ...(data.to as string[])].some(
          (id) => !alive.some((e) => e.id === id),
        )
      ) {
        setError("请先采纳这条关系引用的卡片。");
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
              type: "验证任务",
              action: d.validation,
              information: d.missing,
              hypothesisRefs: ((d.refs as string[]) || []).filter(
                (id) => items.find((e) => e.id === id)?.data.type === "假设",
              ),
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
    setEdit({ kind: k, topic: a.topic, suggestion: s.id, data });
  }
  async function analyze(mode: string, answers: string) {
    const target = topic;
    if (!target) return;
    return work(async () => {
      await api("analyses", "POST", {
        topic: target,
        ids: selecting ? selectedScoped : [],
        mode,
        answers,
      });
      const results = await api<Analysis[]>("analyses?topic=" + target);
      if (topicRef.current === target) setAnalyses(results);
    }, "分析已保存，请确认需要采纳的建议。");
  }
  function choose(id: string) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }
  function selectToggle() {
    setSelecting((v) => !v);
    setSelected([]);
  }
  function list(rows: Entity[], topics = false, empty?: string) {
    return (
      <EntityList
        items={rows}
        topics={topics}
        onOpen={openDetail}
        actions={actions}
        onComplete={(e) => void complete(e)}
        selecting={selecting}
        selected={selected}
        onSelect={choose}
        zone={zone}
        today={today}
        empty={empty}
      />
    );
  }
  function selectBar() {
    return (
      <>
        {selecting ? (
          <div className="selection-bar">
            <span>已选择 {selected.length} 项</span>
            <button
              onClick={() =>
                setSelected(
                  scoped.filter((e) => e.kind === tab).map((e) => e.id),
                )
              }
            >
              全选当前列表
            </button>
            {selectedScoped.filter(
              (id) => scoped.find((e) => e.id === id)?.kind === "card",
            ).length > 1 && (
              <button
                onClick={() =>
                  void work(() => {
                    const cards = scoped.filter(
                      (e) => selectedScoped.includes(e.id) && e.kind === "card",
                    );
                    return api("transform", "POST", {
                      ids: cards.map((e) => e.id),
                      versions: Object.fromEntries(
                        cards.map((e) => [e.id, e.version]),
                      ),
                      parts: null,
                    });
                  }, "已合并卡片，关联和来源已保留")
                }
              >
                合并卡片
              </button>
            )}
            <button className="text-button" onClick={selectToggle}>
              退出选择
            </button>
          </div>
        ) : (
          <button className="text-button" onClick={selectToggle}>
            选择内容
          </button>
        )}
      </>
    );
  }
  const archives = (
    <label className="checkbox-label compact-label">
      <input
        type="checkbox"
        checked={showArchived}
        onChange={(e) => setShowArchived(e.target.checked)}
      />
      <span>显示已归档</span>
    </label>
  );
  if (loading)
    return (
      <main className="login">
        <p className="muted">正在载入你的思路…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <div className="brand">
          <LayersIcon />
          <span>思路整理器</span>
        </div>
        <h1>{register ? "创建你的私人空间" : "继续你的思路"}</h1>
        <p className="muted">记录、整理，再向前走一步。</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
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
              navigate("首页");
              const u = await api<User>("me");
              try {
                const value =
                  localStorage.getItem("thought-draft:" + u.id + ":quick") ||
                  "";
                setQuick(value);
                quickRef.current = value;
              } catch {}
            }, "已登录");
          }}
        >
          <label>
            <span>邮箱</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>密码（至少10位）</span>
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary full-width" disabled={busy}>
            {busy ? "处理中…" : register ? "注册并登录" : "登录"}
          </button>
          <button
            className="text-button full-width"
            type="button"
            onClick={() => setRegister(!register)}
          >
            {register ? "已有账号，去登录" : "创建账号"}
          </button>
        </form>
        <p className="muted small">
          内容默认私人，未配置 AI 也可以完整使用手动整理功能。
        </p>
      </main>
    );
  const inbox = alive.filter((e) => !e.topic && e.kind !== "topic"),
    activeSection = sectionFor(tab),
    visible = alive.filter(
      (e) =>
        (showArchived || !e.data.archived) &&
        (statusFilter === "全部" || e.data.status === statusFilter),
    );
  const navigation = (
    <>
      <div className="brand">
        <LayersIcon />
        <span>思路整理器</span>
      </div>
      <nav aria-label="主要导航">
        {nav.map((n) => (
          <button
            key={n.name}
            aria-label={n.name}
            aria-current={page === n.name ? "page" : undefined}
            onClick={() => navigate(n.name)}
          >
            <n.icon />
            <span>{n.name}</span>
            {n.name === "收集箱" && inbox.length > 0 && (
              <small>{inbox.length}</small>
            )}
          </button>
        ))}
      </nav>
      <div className="nav-bottom">
        <p className="account-label">{user.email}</p>
        <button
          onClick={() => navigate("设置")}
          aria-current={page === "设置" ? "page" : undefined}
        >
          <GearIcon />
          设置
        </button>
        <button
          onClick={() => navigate("回收站")}
          aria-current={page === "回收站" ? "page" : undefined}
        >
          <TrashIcon />
          回收站
        </button>
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
              setDetail(null);
              setEdit(null);
            }, "已退出登录")
          }
        >
          <ExitIcon />
          退出登录
        </button>
      </div>
    </>
  );
  return (
    <div className="shell">
      <aside className="sidebar">{navigation}</aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileNav(true)}
            >
              <HamburgerMenuIcon />
            </button>
            <span className="breadcrumb">
              {page === "主题详情"
                ? "我的主题 / " + String(t?.data.title || "主题")
                : page}
            </span>
          </div>
          <div className="bar">
            <button
              className="global-search"
              onClick={() => {
                navigate("搜索");
                setSearch("");
              }}
            >
              <MagnifyingGlassIcon />
              <span>搜索全部内容</span>
            </button>
            <button
              className="icon-button"
              disabled={busy}
              aria-label="刷新内容"
              onClick={() => void work(refresh, "已刷新")}
            >
              <ReloadIcon />
            </button>
          </div>
        </header>
        <main className="main" id="main-content">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                关闭提示
              </button>
            </div>
          )}
          {notice && (
            <div className="save-status" role="status">
              {notice}
              <button
                className="text-button"
                aria-label="关闭保存提示"
                onClick={() => setNotice("")}
              >
                关闭
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              {page === "主题详情" && (
                <button
                  className="text-button back-link"
                  onClick={() => navigate("我的主题")}
                >
                  <ArrowLeftIcon />
                  所有主题
                </button>
              )}
              <h1 tabIndex={-1}>
                {page === "主题详情"
                  ? String(t?.data.title || "主题已移入回收站")
                  : page}
              </h1>
              {page === "今日关注" && (
                <>
                  {list(
                    focusItems(alive, today, Infinity),
                    false,
                    "暂时没有关注事项。",
                  )}
                </>
              )}
              {page === "首页" && (
                <p className="muted">留住想法，继续上次的思考。</p>
              )}
            </div>
            {page === "我的主题" && (
              <button className="primary" onClick={() => add("topic")}>
                <PlusIcon />
                新建主题
              </button>
            )}
            {page === "主题详情" && t && (
              <div className="bar">
                <button onClick={() => setAiOpen(true)}>
                  <LightningBoltIcon />
                  AI助手
                </button>
                <Menu label="主题" actions={actions(t)} />
              </div>
            )}
          </div>
          {page === "首页" && (
            <div className="home-layout">
              <section className="quick-record surface" aria-label="快速记录区">
                <h2>快速记录</h2>
                <p className="muted">先写下来，不用急着整理。</p>
                <textarea
                  aria-label="快速记录"
                  value={quick}
                  onChange={(e) => {
                    setQuick(e.target.value);
                    quickRef.current = e.target.value;
                    try {
                      localStorage.setItem(
                        "thought-draft:" + user.id + ":quick",
                        e.target.value,
                      );
                    } catch {
                      setError("无法保留本地草稿，请复制重要内容。");
                    }
                  }}
                  placeholder="写下一个想法，或粘贴你的笔记和聊天…"
                />
                <div className="quick-footer">
                  <span className="muted">
                    {quick.trim()
                      ? "本地草稿 · 尚未保存"
                      : "文字会直接存入收集箱"}
                  </span>
                  <button
                    className="primary"
                    disabled={busy || !quick.trim()}
                    onClick={() => {
                      const content = quick;
                      void work(async () => {
                        await api("entities", "POST", {
                          kind: "record",
                          topic: null,
                          data: { content, status: "未整理" },
                        });
                        if (quickRef.current === content) {
                          setQuick("");
                          quickRef.current = "";
                          try {
                            localStorage.removeItem(
                              "thought-draft:" + user.id + ":quick",
                            );
                          } catch {}
                        }
                      }, "已保存到收集箱");
                    }}
                  >
                    保存想法
                  </button>
                </div>
              </section>
              <section className="continue-section">
                <div className="section-heading">
                  <h2>继续整理</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("我的主题")}
                  >
                    查看全部主题
                    <ChevronRightIcon />
                  </button>
                </div>
                {recentTopics(alive).length ? (
                  list(recentTopics(alive), true)
                ) : (
                  <div className="empty-state">
                    <p>把相关想法放进一个主题，下一次就能接着整理。</p>
                    <button onClick={() => add("topic")}>
                      <PlusIcon />
                      新建主题
                    </button>
                  </div>
                )}
                {inbox.length > 0 && (
                  <button
                    className="inbox-shortcut"
                    onClick={() => navigate("收集箱")}
                  >
                    <ArchiveIcon />
                    收集箱还有 {inbox.length} 条内容待整理
                    <ChevronRightIcon />
                  </button>
                )}
              </section>
              <section className="today-section">
                <div className="section-heading">
                  <h2>今日关注</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("今日关注")}
                  >
                    查看完整列表
                    <ChevronRightIcon />
                  </button>
                </div>
                {list(
                  focusItems(alive, today),
                  false,
                  "暂时没有需要关注的事项。在内容的“更多”中选择今日关注。",
                )}
              </section>
            </div>
          )}
          {page === "我的主题" && (
            <>
              <div className="toolbar">
                <div className="search-input">
                  <MagnifyingGlassIcon />
                  <input
                    aria-label="搜索主题"
                    placeholder="搜索主题名称或标签"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="主题阶段"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {["全部", ...states.topic!].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                {archives}
              </div>
              {list(
                visible.filter(
                  (e) =>
                    e.kind === "topic" &&
                    JSON.stringify(e.data)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ),
                true,
                "还没有主题，点击“新建主题”开始。",
              )}
            </>
          )}
          {page === "收集箱" && (
            <>
              <p className="muted page-intro">
                先收下还没想清楚的内容，准备好时再归入主题。
              </p>
              <div className="toolbar">
                <button className="primary" onClick={() => add("record")}>
                  <PlusIcon />
                  新建想法
                </button>
                <Menu
                  label="新建其他内容"
                  actions={kinds
                    .filter((k) => !["topic", "record"].includes(k))
                    .map((k) => ({
                      label: "新建" + kindLabels[k],
                      action: () => add(k),
                    }))}
                />
                <select
                  aria-label="内容类型"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="全部">全部类型</option>
                  {kinds
                    .filter((k) => k !== "topic")
                    .map((k) => (
                      <option key={k} value={k}>
                        {kindLabels[k]}
                      </option>
                    ))}
                </select>
                {archives}
              </div>
              {list(
                visible.filter(
                  (e) =>
                    !e.topic &&
                    e.kind !== "topic" &&
                    (typeFilter === "全部" || e.kind === typeFilter),
                ),
                false,
                "收集箱是空的，有新想法时随时记下来。",
              )}
            </>
          )}
          {page === "主题详情" && t && (
            <>
              <section className="topic-overview">
                <div>
                  <span className="overview-label">目标</span>
                  <p>{String(t.data.goal || "暂未填写，随时可以补充。")}</p>
                </div>
                <div>
                  <span className="overview-label">当前重点</span>
                  <p>
                    {String(t.data.focus || "从当前最想弄清楚的内容开始。")}
                  </p>
                </div>
                <details className="disclosure">
                  <summary>主题详情</summary>
                  <RecordFields
                    entity={t}
                    items={items}
                    zone={zone}
                    onJump={jump}
                  />
                  <button onClick={() => openEdit(t)}>编辑主题</button>
                </details>
              </section>
              <div className="topic-tabs" role="group" aria-label="主题内容">
                {topicSections.map((s, index) => (
                  <button
                    key={s.label}
                    aria-pressed={activeSection === index}
                    onClick={() => {
                      const remembered = (
                        s.kinds as readonly string[]
                      ).includes(tab)
                        ? tab
                        : s.kinds[0];
                      setGraph(false);
                      void switchTab(remembered);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <section className="topic-content">
                <div className="content-toolbar">
                  <div className="segmented">
                    {activeSection === 1 ? (
                      <>
                        <button
                          aria-pressed={!graph && tab === "card"}
                          onClick={() => {
                            setGraph(false);
                            void switchTab("card");
                          }}
                        >
                          卡片
                        </button>
                        <button
                          aria-pressed={graph}
                          onClick={() => setGraph(true)}
                        >
                          逻辑图
                        </button>
                        <button
                          aria-pressed={tab === "relation" && !graph}
                          onClick={() => {
                            setGraph(false);
                            void switchTab("relation");
                          }}
                        >
                          关系
                        </button>
                      </>
                    ) : (
                      topicSections[activeSection]?.kinds.map((k) => (
                        <button
                          key={k}
                          aria-pressed={tab === k}
                          onClick={() => void switchTab(k)}
                        >
                          {
                            (
                              {
                                record: "原始想法",
                                card: "卡片",
                                relation: "关系",
                                question: "问题",
                                task: "任务",
                                event: "事件",
                                evidence: "证据",
                                validation: "验证",
                                review: "复盘",
                                topic: "主题",
                              } as Record<Kind, string>
                            )[k]
                          }
                        </button>
                      ))
                    )}
                  </div>
                  <div className="bar">
                    <button
                      className="primary"
                      onClick={() => add(graph ? "card" : tab)}
                    >
                      <PlusIcon />
                      新建{kindLabels[graph ? "card" : tab]}
                    </button>
                    {activeSection === 1 && (
                      <button onClick={() => add("relation")}>建立关系</button>
                    )}
                    {selectBar()}
                    {activeSection === 1 && (
                      <Menu
                        label="整理操作"
                        actions={[
                          {
                            label: "撤销最近拆分或合并",
                            action: () =>
                              void work(async () => {
                                const ops =
                                  await api<{ id: string; undone: number }[]>(
                                    "operations",
                                  );
                                const last = ops.find((e) => !e.undone);
                                if (!last)
                                  throw new Error("没有可撤销的拆分或合并。");
                                await api("operations/" + last.id, "POST", {});
                              }, "已恢复拆分或合并前的内容"),
                          },
                        ]}
                      />
                    )}
                  </div>
                </div>
                <h2 className="content-kind">
                  {graph ? "逻辑图" : kindLabels[tab]}
                </h2>
                {tab === "review" && (
                  <div className="judgment-summary">
                    <span>当前判断</span>
                    <p>
                      {String(
                        scoped
                          .filter((e) => e.kind === "review")
                          .sort((a, b) =>
                            b.updatedAt.localeCompare(a.updatedAt),
                          )[0]?.data.judgment || "还没有记录当前判断。",
                      )}
                    </p>
                  </div>
                )}
                {graph ? (
                  <Graph items={scoped} onOpen={openDetail} />
                ) : (
                  list(scoped.filter((e) => e.kind === tab))
                )}
              </section>
            </>
          )}
          {page === "待思考" && (
            <>
              <div className="toolbar">
                <button className="primary" onClick={() => add("question")}>
                  <PlusIcon />
                  新建问题
                </button>
                <select
                  aria-label="问题状态"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {["全部", ...states.question!].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                {archives}
              </div>
              {list(
                visible.filter((e) => e.kind === "question"),
                false,
                "没有待思考问题，遇到疑问时可以直接记下来。",
              )}
            </>
          )}
          {page === "待办与事件" && (
            <>
              <div className="toolbar">
                <button className="primary" onClick={() => add("task")}>
                  <PlusIcon />
                  新建任务
                </button>
                <button onClick={() => add("event")}>新建事件</button>
                <div className="segmented">
                  {["今日", "本周", "逾期", "全部"].map((v) => (
                    <button
                      key={v}
                      aria-pressed={filter === v}
                      onClick={() => setFilter(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="事项状态"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {[
                    "全部",
                    ...new Set([...states.task!, ...states.event!]),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                {archives}
              </div>
              {list(
                visible.filter(
                  (e) =>
                    ["task", "event"].includes(e.kind) &&
                    matchesDate(e, filter, today),
                ),
                false,
                "这里没有对应的任务或事件。",
              )}
            </>
          )}
          {page === "搜索" && (
            <>
              <label className="search-input search-page">
                <MagnifyingGlassIcon />
                <input
                  autoFocus
                  aria-label="搜索全部内容"
                  placeholder="搜索标题、正文、标签、状态或主题"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {search.trim() ? (
                list(
                  alive.filter(
                    (e) =>
                      JSON.stringify(e.data)
                        .toLowerCase()
                        .includes(search.toLowerCase()) ||
                      String(
                        alive.find((t) => t.id === e.topic)?.data.title || "",
                      )
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  ),
                  false,
                  "没有匹配内容，换一个关键词试试。",
                )
              ) : (
                <p className="empty-state">输入关键词，找到想继续的内容。</p>
              )}
            </>
          )}
          {page === "回收站" && (
            <>
              <p className="muted page-intro">
                删除的内容保留在这里。恢复主题后，可继续恢复所属内容。
              </p>
              {list(
                items.filter((e) => e.deletedAt),
                false,
                "回收站是空的。",
              )}
            </>
          )}
          {page === "设置" && (
            <Settings
              user={user}
              busy={busy}
              onSave={(data) => work(() => api("settings", "PATCH", data))}
              onImport={(data) =>
                work(
                  () => api("import", "POST", data),
                  "备份已恢复，现有内容保持保留。",
                )
              }
              onDelete={(password) =>
                work(async () => {
                  await api("account", "DELETE", { password });
                  setUser(null);
                  setItems([]);
                }, "账号已删除")
              }
              onGuide={() => setGuide(true)}
            />
          )}
        </main>
      </div>
      {mobileNav && (
        <Modal title="导航" drawer onClose={() => setMobileNav(false)}>
          <div className="mobile-navigation">{navigation}</div>
        </Modal>
      )}
      {detail && (
        <EntityDetail
          entity={items.find((e) => e.id === detail.id) || detail}
          items={items}
          zone={zone}
          onClose={() => setDetail(null)}
          onEdit={() =>
            openEdit(items.find((e) => e.id === detail.id) || detail)
          }
          onHistory={() => void openHistory(detail)}
          onJump={jump}
        />
      )}
      {aiOpen && t && (
        <AIAssistant
          error={error}
          analyses={analyses}
          scope={inputScope}
          selection={selecting}
          selectedCount={selectedScoped.length}
          configured={user.aiConfigured}
          busy={busy}
          zone={zone}
          onClose={() => setAiOpen(false)}
          onGuide={() => setGuide(true)}
          onAnalyze={analyze}
          onSuggestion={(s, a, k) => void suggest(s, a, k)}
          onIgnore={(s) =>
            setFeedback({
              analysisId: null,
              suggestionId: s.id,
              rating: "部分有用",
              comment: "",
            })
          }
          onFeedback={(a) =>
            setFeedback({ analysisId: a.id, rating: "部分有用", comment: "" })
          }
        />
      )}
      {edit && (
        <Editor
          key={
            edit.entity?.id || edit.suggestion || edit.kind + ":" + edit.topic
          }
          request={edit}
          items={alive}
          userId={user.id}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
      {history && (
        <Modal
          title="历史版本"
          onClose={() => setHistory(null)}
          description={entityName(history.entity)}
        >
          {!history.versions.length && (
            <p className="empty-state">尚未修改过这条内容。</p>
          )}
          {history.versions.map((v) => (
            <section className="history-entry" key={v.version}>
              <div className="section-heading">
                <h3>{readableTime(v.created_at, zone, true)}</h3>
                <span className="muted">修改前的记录</span>
              </div>
              <RecordFields
                entity={v.snapshot}
                items={items}
                zone={zone}
                onJump={jump}
              />
              <details className="disclosure">
                <summary>高级查看</summary>
                <pre>{JSON.stringify(v.snapshot.data, null, 2)}</pre>
              </details>
              <button
                disabled={Boolean(history.entity.deletedAt) || busy}
                onClick={() =>
                  void work(async () => {
                    const current = items.find(
                      (e) => e.id === history.entity.id,
                    )!;
                    await api("entities/" + current.id + "/undo", "POST", {
                      version: current.version,
                      targetVersion: v.version,
                    });
                    setHistory(null);
                  }, "已恢复这个版本，后续历史仍保留。")
                }
              >
                恢复此版本
              </button>
            </section>
          ))}
        </Modal>
      )}
      {split && (
        <Modal title="拆分卡片" onClose={() => setSplit(null)}>
          <p className="muted">
            用空行分隔两段或更多内容。来源和关联会继续保留。
          </p>
          <label>
            <span>拆分内容</span>
            <textarea
              rows={9}
              value={splitText}
              onChange={(e) => setSplitText(e.target.value)}
            />
          </label>
          <footer className="modal-actions">
            <button onClick={() => setSplit(null)}>关闭</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await api("transform", "POST", {
                    ids: [split.id],
                    versions: { [split.id]: split.version },
                    parts: splitText
                      .split(/\n\s*\n/)
                      .map((v) => v.trim())
                      .filter(Boolean),
                  });
                  setSplit(null);
                }, "已拆分卡片")
              }
            >
              保存拆分
            </button>
          </footer>
        </Modal>
      )}
      {feedback && (
        <Modal
          title={feedback.suggestionId ? "忽略建议" : "分析反馈"}
          onClose={() => setFeedback(null)}
        >
          {!feedback.suggestionId && (
            <label>
              <span>这次分析有帮助吗？</span>
              <select
                value={feedback.rating}
                onChange={(e) =>
                  setFeedback({ ...feedback, rating: e.target.value })
                }
              >
                {["有用", "部分有用", "无用"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>补充说明（可选）</span>
            <textarea
              value={feedback.comment}
              onChange={(e) =>
                setFeedback({ ...feedback, comment: e.target.value })
              }
            />
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                if (feedback.suggestionId)
                  await api("suggestions/" + feedback.suggestionId, "POST", {
                    action: "ignore",
                    feedback: feedback.comment,
                  });
                else
                  await api("feedback", "POST", {
                    analysisId: feedback.analysisId,
                    rating: feedback.rating,
                    comment: feedback.comment,
                  });
                setFeedback(null);
              }, "反馈已保存")
            }
          >
            保存
          </button>
        </Modal>
      )}
      {guide && (
        <Modal title="AI配置说明" onClose={() => setGuide(false)}>
          <p>
            在运行此工具的服务器环境中配置 DeepSeek 密钥，然后重新启动应用。
          </p>
          <p>
            使用环境变量 <code>DEEPSEEK_API_KEY</code>，服务地址和模型分别由{" "}
            <code>DEEPSEEK_BASE_URL</code>、<code>DEEPSEEK_MODEL</code>{" "}
            配置。此页面不收集密钥。
          </p>
          <p className="muted">
            未配置时，记录、卡片、关系、问题、任务、证据与复盘都可以正常使用。
          </p>
        </Modal>
      )}
    </div>
  );
}
