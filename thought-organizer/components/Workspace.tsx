"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
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
  rememberedKind,
  focusItems,
  matchesDate,
  finished,
  readableTime,
} from "@/lib/presentation";
import Editor, { EditRequest } from "./Editor";
import ThinkingSpace from "./ThinkingSpace";
import OrganizedThinking from "./OrganizedThinking";
import ThinkingChanges from "./ThinkingChanges";
import {
  UI_VERSION,
  thinkingScope,
  recentThoughts,
  thinkingUpdatedAt,
  shortName,
} from "@/lib/thinking";
import EntityList from "./EntityList";
import EntityDetail, { RecordFields } from "./EntityDetail";
import AIAssistant, { Analysis, Suggestion } from "./AIAssistant";
import Modal from "./ui/Modal";
import Menu, { MenuAction } from "./ui/Menu";
import Settings, { User } from "./Settings";
import { api, ApiError, requestToken } from "@/lib/http";
const nav = [
  { name: "我的思考", icon: ReaderIcon },
  { name: "待想清楚", icon: QuestionMarkCircledIcon },
  { name: "下一步", icon: CalendarIcon },
];
export default function Workspace() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [items, setItems] = useState<Entity[]>([]),
    [page, setPage] = useState("我的思考"),
    [topic, setTopic] = useState<string | null>(null),
    [tab, setTab] = useState<Kind>("card"),
    [graph, setGraph] = useState(false),
    [advanced, setAdvanced] = useState(false),
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
    [changesOpen, setChangesOpen] = useState(false),
    [priorityFilter, setPriorityFilter] = useState("全部"),
    [quickState, setQuickState] = useState(""),
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
    quickRef = useRef(""),
    quickGate = useRef(false),
    quickToken = useRef<{ content: string; token: string } | null>(null);
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
          const location = JSON.parse(
            localStorage.getItem("thought-location:" + u.id) || "null",
          );
          const root = rows.find(
            (e) =>
              e.id === location?.root &&
              !e.deletedAt &&
              (e.kind === "topic" || (e.kind === "record" && !e.topic)),
          );
          if (root) {
            setTopic(root.id);
            setPage("思考空间");
            setAdvanced(location.advanced === true);
            setTab(rememberedKind(root.data.lastPosition || location.tab));
          }
        } catch {}
        try {
          const value =
            localStorage.getItem("thought-draft:" + u.id + ":quick") || "";
          setQuick(value);
          quickRef.current = value;
        } catch {}
      })
      .catch((e) => {
        setUser(null);
        if (!(e instanceof ApiError && e.status === 401))
          setError(
            e instanceof Error ? e.message : "无法载入内容，请稍后重试。",
          );
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user || !topic) return;
    const root = items.find((e) => e.id === topic);
    if (!root || root.deletedAt) return;
    let current = true;
    const query = root.kind === "topic" ? "?topic=" + root.id : "";
    api<Analysis[]>("analyses" + query)
      .then((rows) => {
        if (current)
          setAnalyses(
            root.kind === "topic"
              ? rows
              : rows.filter((a) => a.snapshot.some((e) => e.id === root.id)),
          );
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [topic, user, items]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const alive = items.filter((e) => !e.deletedAt),
    zone = user?.settings.timezone || "Asia/Shanghai",
    today = dateInZone(new Date(), zone),
    t = alive.find((e) => e.id === topic),
    scoped = t ? thinkingScope(alive, t).filter((e) => e.kind !== "topic") : [],
    selectedScoped = selected.filter((id) => scoped.some((e) => e.id === id));
  const inputScope =
    t && !(selecting && !selectedScoped.length)
      ? selectScope(
          alive,
          t.kind === "topic" ? t.id : null,
          selecting
            ? selectedScoped
            : t.kind === "record"
              ? scoped.map((e) => e.id)
              : [],
        )
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
    setAdvanced(false);
    if (user)
      try {
        localStorage.removeItem("thought-location:" + user.id);
      } catch {}
    setPriorityFilter("全部");
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
    setAdvanced(false);
    setTopic(e.id);
    setPage("思考空间");
    if (user)
      try {
        localStorage.setItem(
          "thought-location:" + user.id,
          JSON.stringify({
            root: e.id,
            tab: rememberedKind(e.data.lastPosition),
          }),
        );
      } catch {}
    setTab(rememberedKind(e.data.lastPosition));
    setGraph(false);
    setSelected([]);
    setSelecting(false);
    setAnalyses([]);
    setAiOpen(false);
    setMobileNav(false);
  }
  function openDetail(e: Entity) {
    if (
      (e.kind === "topic" || (e.kind === "record" && !e.topic)) &&
      !e.deletedAt
    ) {
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
    const root = page === "思考空间" ? t : undefined;
    const initial: Record<string, unknown> =
      kind === "card"
        ? {
            type: "观点或推断",
            source: "用户陈述",
            verification: "未核实",
            ...(root?.kind === "record" ? { sourceRefs: [root.id] } : {}),
          }
        : kind === "question" && root?.kind === "record"
          ? { refs: [root.id] }
          : {};
    setEdit({
      kind,
      topic: root?.kind === "topic" ? root.id : null,
      data: { ...initial, ...data },
      ...(root?.kind === "record"
        ? { rootId: root.id, rootVersion: root.version }
        : {}),
    });
  }
  function jump(e: Entity) {
    setDetail(null);
    setHistory(null);
    if (e.deletedAt) {
      navigate("回收站");
      setDetail(e);
      return;
    }
    if (e.kind === "topic" || (e.kind === "record" && !e.topic)) {
      openTopic(e);
      return;
    }
    if (e.topic) {
      const parent = alive.find((x) => x.id === e.topic);
      if (parent) {
        openTopic(parent);
        setTab(e.kind);
        setAdvanced(true);
        setDetail(e);
        return;
      }
    }
    const root = alive.find(
      (x) =>
        x.kind === "record" &&
        !x.topic &&
        thinkingScope(alive, x).some((child) => child.id === e.id),
    );
    if (root) {
      openTopic(root);
      setTab(e.kind);
      setAdvanced(true);
      setDetail(e);
      return;
    }
    navigate(
      e.kind === "question"
        ? "待想清楚"
        : ["task", "event"].includes(e.kind)
          ? "下一步"
          : "未整理",
    );
    setDetail(e);
  }
  async function switchTab(kind: Kind) {
    setTab(kind);
    if (user && topic)
      try {
        localStorage.setItem(
          "thought-location:" + user.id,
          JSON.stringify({ root: topic, tab: kind, advanced: true }),
        );
      } catch {}
    const current = items.find((e) => e.id === topic);
    if (current && current.data.lastPosition !== kind) {
      try {
        const saved = await api<Entity>("entities/" + current.id, "PATCH", {
          data: { ...current.data, lastPosition: kind },
          topic: current.topic,
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
    if (e.id === topic) navigate("全部思考");
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
        { label: "补充依据", action: () => supplement("evidence", e) },
        { label: "看看下一步", action: () => supplement("task", e) },
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
          label: "留下疑问",
          action: () => supplement("question", e),
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
  function supplement(kind: "evidence" | "question" | "task", entity: Entity) {
    setDetail(null);
    const data: Record<string, unknown> =
      kind === "evidence"
        ? { supports: [entity.id], type: "访谈或反馈", status: "待核实" }
        : kind === "question"
          ? { refs: [entity.id] }
          : entity.kind === "question"
            ? { questionRefs: [entity.id] }
            : {
                type: entity.data.type === "假设" ? "验证任务" : "普通任务",
                ...(entity.data.type === "假设"
                  ? { hypothesisRefs: [entity.id] }
                  : {}),
              };
    const root = entity.topic
      ? alive.find((e) => e.id === entity.topic)
      : t?.kind === "record" && scoped.some((e) => e.id === entity.id)
        ? t
        : alive.find(
            (e) =>
              e.kind === "record" &&
              !e.topic &&
              thinkingScope(alive, e).some((x) => x.id === entity.id),
          );
    setEdit({
      kind,
      topic: entity.topic,
      data,
      ...(root?.kind === "record"
        ? { rootId: root.id, rootVersion: root.version }
        : {}),
    });
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
          ...(edit.rootId && !target
            ? { recordId: edit.rootId, recordVersion: edit.rootVersion }
            : {}),
        });
      else if (!edit.entity && edit.rootId && !target)
        await api("thoughts/" + edit.rootId + "/items", "POST", {
          kind: edit.kind,
          data,
          version: edit.rootVersion,
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
      await refresh().catch(() =>
        setError("内容已保存，但列表暂时无法更新。请刷新内容后继续。"),
      );
      setNotice(
        edit.suggestion
          ? "已保存采纳内容 · 保留AI来源与分析记录"
          : edit.kind === "evidence" &&
              (((data.supports as string[]) || []).length ||
                ((data.opposes as string[]) || []).length)
            ? "这个判断有了可追溯的依据。"
            : edit.kind === "task" &&
                ((data.questionRefs as string[]) || []).length
              ? "这个疑问已经有了推进方法。"
              : edit.kind === "review" && data.change && data.changeReason
                ? "你留下了改变判断的理由。"
                : edit.kind === "question" && !edit.entity
                  ? "你留下了一个值得确认的问题。"
                  : "已保存",
      );
    } catch (e) {
      try {
        await refresh();
      } catch {}
      throw e;
    }
  }
  async function saveQuick(organize: boolean) {
    const content = quick;
    if (!content.trim() || busy || quickGate.current || !user) return;
    quickGate.current = true;
    if (quickToken.current?.content !== content) {
      let stored: { content: string; token: string } | null = null;
      try {
        stored = JSON.parse(
          localStorage.getItem("thought-draft:" + user.id + ":quick-token") ||
            "null",
        );
      } catch {}
      quickToken.current =
        stored?.content === content && stored.token
          ? stored
          : { content, token: requestToken() };
      try {
        localStorage.setItem(
          "thought-draft:" + user.id + ":quick-token",
          JSON.stringify(quickToken.current),
        );
      } catch {}
    }
    setBusy(true);
    setError("");
    setQuickState("保存中…");
    try {
      const saved = await api<Entity>("guidance", "POST", {
        content,
        token: quickToken.current.token,
        organize,
        initial: organize,
      });
      quickToken.current = null;
      try {
        localStorage.removeItem("thought-draft:" + user.id + ":quick-token");
      } catch {}
      setItems((rows) => [saved, ...rows.filter((e) => e.id !== saved.id)]);
      if (quickRef.current === content) {
        setQuick("");
        quickRef.current = "";
        try {
          localStorage.removeItem("thought-draft:" + user.id + ":quick");
        } catch {}
        setQuickState("已保存");
      } else setQuickState("本地草稿 · 尚未保存");
      try {
        await refresh();
      } catch {
        setError("想法已保存，但列表暂时无法更新。可以继续整理，或稍后刷新。");
      }
      setNotice(
        organize ? "已保存，可以开始整理。" : "已保存到未整理，准备好再继续。",
      );
      if (organize) openTopic(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      setQuickState("保存失败 · 本地草稿仍保留");
    } finally {
      quickGate.current = false;
      setBusy(false);
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
    setEdit({
      kind: k,
      topic: a.topic,
      suggestion: s.id,
      data,
      ...(t?.kind === "record" && a.snapshot.some((e) => e.id === t.id)
        ? { rootId: t.id, rootVersion: t.version }
        : {}),
    });
  }
  async function analyze(mode: string, answers: string) {
    if (!t) return;
    const rootId = t.id,
      target = t.kind === "topic" ? t.id : null;
    return work(async () => {
      await api("analyses", "POST", {
        topic: target,
        ids: selecting
          ? selectedScoped
          : t.kind === "record"
            ? scoped.map((e) => e.id)
            : [],
        mode,
        answers,
      });
      const results = await api<Analysis[]>(
        "analyses" + (target ? "?topic=" + target : ""),
      );
      if (topicRef.current === rootId)
        setAnalyses(
          target
            ? results
            : results.filter((a) => a.snapshot.some((e) => e.id === rootId)),
        );
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
              navigate("我的思考");
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
          <br />
          界面版本：{UI_VERSION}
        </p>
      </main>
    );
  const inbox = alive.filter((e) => !e.topic && e.kind !== "topic"),
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
            aria-current={
              page === n.name ||
              (n.name === "下一步" && page === "今日关注") ||
              (n.name === "我的思考" &&
                ["全部思考", "未整理", "思考空间"].includes(page))
                ? "page"
                : undefined
            }
            onClick={() => navigate(n.name)}
          >
            <n.icon />
            <span>{n.name}</span>
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
              {page === "思考空间"
                ? "我的思考 / " + String(t ? entityName(t) : "思考")
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
              {page === "思考空间" && (
                <button
                  className="text-button back-link"
                  onClick={() => navigate("全部思考")}
                >
                  <ArrowLeftIcon />
                  返回我的思考
                </button>
              )}
              <h1 tabIndex={-1}>
                {page === "思考空间"
                  ? advanced
                    ? String(t ? entityName(t) : "思考已移入回收站")
                    : "梳理这个问题"
                  : page === "我的思考"
                    ? "有什么问题，你想理清楚？"
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
            </div>
            {page === "全部思考" && (
              <button className="primary" onClick={() => add("topic")}>
                <PlusIcon />
                新建一个思考
              </button>
            )}
            {page === "思考空间" && t && advanced && (
              <div className="bar">
                <button onClick={() => setAdvanced(false)}>返回当前追问</button>
                <button onClick={() => setAiOpen(true)}>
                  <LightningBoltIcon />
                  AI助手
                </button>
                <Menu label="思考" actions={actions(t)} />
              </div>
            )}
          </div>
          {["全部思考", "未整理"].includes(page) && (
            <div className="bar library-navigation">
              <button
                className="text-button"
                onClick={() => navigate("我的思考")}
              >
                返回记录入口
              </button>
              <button
                aria-pressed={page === "全部思考"}
                onClick={() => {
                  setSearch("");
                  navigate("全部思考");
                }}
              >
                全部思考
              </button>
              <button
                aria-pressed={page === "未整理"}
                onClick={() => navigate("未整理")}
              >
                未整理
              </button>
            </div>
          )}
          {page === "我的思考" && (
            <div className="home-layout thinking-home">
              <section
                className="quick-record surface"
                aria-label="记录一个思考"
              >
                <textarea
                  aria-label="写下想法"
                  value={quick}
                  onChange={(e) => {
                    setQuick(e.target.value);
                    quickRef.current = e.target.value;
                    setQuickState("");
                    try {
                      localStorage.setItem(
                        "thought-draft:" + user.id + ":quick",
                        e.target.value,
                      );
                    } catch {
                      setError("无法保留本地草稿，请复制重要内容。");
                    }
                  }}
                  placeholder="写下你的纠结、想法或计划，不用先组织好语言。"
                />
                <div className="quick-footer">
                  <span className="muted" role="status">
                    {quickState ||
                      (quick.trim()
                        ? "本地草稿 · 尚未保存"
                        : "只写内容就好，稍后再慢慢理清。")}
                  </span>
                  <div className="bar">
                    <button
                      className="text-button"
                      disabled={busy || !quick.trim()}
                      onClick={() => void saveQuick(false)}
                    >
                      先存着
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !quick.trim()}
                      onClick={() => void saveQuick(true)}
                    >
                      {busy ? "保存中…" : "开始整理"}
                    </button>
                  </div>
                </div>
                <p className="muted quick-ai-note">
                  {user.aiConfigured
                    ? "开始整理会使用AI，原文会先保存。"
                    : "AI尚未配置；原文、手动整理和基础引导仍可使用。"}
                </p>
              </section>
              {recentThoughts(alive).length > 0 && (
                <section className="continue-section">
                  <div className="section-heading">
                    <h2>继续上次的思考</h2>
                  </div>
                  <div className="recent-thinking">
                    {recentThoughts(alive).map((e) => (
                      <button
                        className="recent-thought"
                        aria-label={entityName(e)}
                        key={e.id}
                        onClick={() => openTopic(e)}
                      >
                        <div>
                          <strong>{entityName(e)}</strong>
                          <p>
                            {String(
                              e.data.summary ||
                                e.data.goal ||
                                e.data.content ||
                                "随时可以继续补充。",
                            ).slice(0, 120)}
                          </p>
                          <span className="muted">
                            更新于{" "}
                            {readableTime(thinkingUpdatedAt(alive, e), zone)}
                          </span>
                        </div>
                        <ChevronRightIcon />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <div className="bar home-library-links">
                <button
                  className="text-button"
                  onClick={() => {
                    setSearch("");
                    navigate("全部思考");
                  }}
                >
                  查看全部思考
                </button>
                {inbox.length > 0 && (
                  <button
                    className="text-button"
                    onClick={() => navigate("未整理")}
                  >
                    未整理内容 · {inbox.length} 条
                  </button>
                )}
              </div>
            </div>
          )}
          {page === "全部思考" && (
            <>
              <div className="toolbar">
                <label className="search-input">
                  <MagnifyingGlassIcon />
                  <input
                    aria-label="搜索思考"
                    placeholder="搜索思考内容或标签"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="思考状态"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {["全部", ...states.topic!, "未整理", "整理中", "已整理"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
                {archives}
              </div>
              {list(
                visible.filter(
                  (e) =>
                    (e.kind === "topic" || (e.kind === "record" && !e.topic)) &&
                    JSON.stringify(e.data)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ),
                true,
                "还没有思考，先在记录入口写下一段想法。",
              )}
            </>
          )}
          {page === "未整理" && (
            <>
              <p className="muted page-intro">
                独立原文也可以直接开始整理，无需先创建主题。
              </p>
              <div className="toolbar">
                <button className="primary" onClick={() => add("record")}>
                  补充原文
                </button>
                <select
                  aria-label="内容类型"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="全部">全部</option>
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
                "还没有未整理内容，有想法时随时记下来。",
              )}
            </>
          )}
          {page === "思考空间" && t && !advanced && (
            <OrganizedThinking
              key={t.id}
              root={t}
              rows={thinkingScope(alive, t)}
              items={items}
              user={user}
              onRefresh={refresh}
              onEdit={openEdit}
              onHistory={(e) => void openHistory(e)}
              onOpen={openDetail}
              onAdvanced={() => setAdvanced(true)}
              onGraph={() => {
                setAdvanced(true);
                setTab("card");
                setGraph(true);
              }}
              onAdd={add}
              onExport={() => navigate("设置")}
            />
          )}
          {page === "思考空间" && t && advanced && (
            <ThinkingSpace
              root={t}
              rows={scoped}
              items={items}
              tab={tab}
              graph={graph}
              zone={zone}
              onTab={(kind) => void switchTab(kind)}
              onGraph={setGraph}
              onAdd={add}
              onOpen={openDetail}
              onEdit={openEdit}
              onHistory={(e) => void openHistory(e)}
              onJump={jump}
              onChanges={() => setChangesOpen(true)}
              actions={actions}
              renderList={list}
              selection={selectBar()}
              onUndo={() =>
                void work(async () => {
                  const ops =
                    await api<{ id: string; undone: number }[]>("operations");
                  const last = ops.find((e) => !e.undone);
                  if (!last) throw new Error("没有可撤销的拆分或合并。");
                  await api("operations/" + last.id, "POST", {});
                }, "已恢复拆分或合并前的内容")
              }
            />
          )}
          {page === "待想清楚" && (
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
                <select
                  aria-label="问题优先级"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  {["全部", "高", "中", "低"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                {archives}
              </div>
              {list(
                visible.filter(
                  (e) =>
                    e.kind === "question" &&
                    (priorityFilter === "全部" ||
                      e.data.priority === priorityFilter),
                ),
                false,
                "还没有未想清楚的问题，遇到疑问时可以直接留下来。",
              )}
            </>
          )}
          {page === "下一步" && (
            <>
              <div className="toolbar">
                <button className="primary" onClick={() => add("task")}>
                  <PlusIcon />
                  新建行动
                </button>
                <button onClick={() => add("event")}>新建事件</button>
                <button
                  className="text-button"
                  onClick={() => navigate("今日关注")}
                >
                  今日关注
                </button>
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
          onSupplement={supplement}
        />
      )}
      {changesOpen && t && (
        <ThinkingChanges
          rows={scoped}
          zone={zone}
          onClose={() => setChangesOpen(false)}
          onOpen={(e) => {
            setChangesOpen(false);
            jump(e);
          }}
        />
      )}
      {aiOpen && t && (
        <AIAssistant
          error={error}
          analyses={analyses}
          scope={inputScope}
          selection={selecting}
          standalone={t.kind === "record"}
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
          items={items}
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
                }, "你把这个想法分清楚了。")
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
            AI由服务管理员统一配置，账号无需填写密钥。需要开通或遇到服务问题，请联系管理员。
          </p>
          <p className="muted">
            未配置时，记录、卡片、关系、问题、任务、证据与复盘都可以正常使用。
          </p>
        </Modal>
      )}
    </div>
  );
}
