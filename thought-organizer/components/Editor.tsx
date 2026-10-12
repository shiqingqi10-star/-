"use client";
import { useState } from "react";
import {
  Entity,
  Kind,
  fields,
  common,
  titles,
  referenceFields,
} from "@/lib/schema";
export type EditRequest = {
  kind: Kind;
  entity?: Entity;
  data?: Record<string, unknown>;
  topic: string | null;
  suggestion?: string;
};
const defaults = (kind: Kind) =>
  Object.fromEntries(
    [...fields[kind], ...common].map((f) => [
      f.key,
      f.type === "boolean"
        ? false
        : f.type === "number"
          ? 0
          : f.type === "refs"
            ? []
            : f.options?.[0] || "",
    ]),
  );
export default function Editor({
  request,
  items,
  userId,
  onSave,
  onClose,
}: {
  request: EditRequest;
  items: Entity[];
  userId: string;
  onSave: (
    data: Record<string, unknown>,
    topic: string | null,
    version?: number,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const key =
    "thought-draft:" +
    userId +
    ":" +
    (request.entity?.id ||
      request.suggestion ||
      "new-" + request.kind + ":" + (request.topic || "inbox"));
  const [restored, setRestored] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const base = {
      ...defaults(request.kind),
      ...request.entity?.data,
      ...request.data,
    };
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw).data || base;
    } catch {}
    return base;
  });
  const [topic, setTopic] = useState<string | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      if ("topic" in saved) return saved.topic;
    } catch {}
    return request.entity?.topic || request.topic;
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [baseVersion, setBaseVersion] = useState<number | undefined>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(key) || "{}").version ??
        request.entity?.version
      );
    } catch {
      return request.entity?.version;
    }
  });
  function change(k: string, v: unknown) {
    const next = { ...data, [k]: v };
    setData(next);
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ data: next, version: baseVersion, topic }),
      );
    } catch {
      setError("无法保留本地草稿，请及时保存或复制内容");
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(data, topic, baseVersion);
      try {
        localStorage.removeItem(key);
      } catch {}
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  const typed: Record<string, Kind[]> = {
    from: ["card"],
    to: ["card"],
    sourceRefs: ["record", "card"],
    evidenceRefs: ["evidence"],
    hypothesisRefs: ["card"],
    taskRefs: ["task"],
    parentRefs: ["task"],
    questionRefs: ["question"],
    supports: ["card"],
    opposes: ["card"],
  };
  return (
    <div className="overlay">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={titles[request.kind] + "编辑"}
      >
        <h2>
          {request.suggestion
            ? "采纳前预览与修改："
            : request.entity
              ? "编辑"
              : "新建"}
          {titles[request.kind]}
        </h2>
        <p className="muted">
          只有后端确认后才显示保存成功。失败草稿仅保留在当前浏览器。冲突时可复制输入，再加载最新版本手动合并。
        </p>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <button
          className="subtle"
          onClick={() => {
            const latest =
              items.find((x) => x.id === request.entity?.id) || request.entity;
            setRestored(true);
            setData({
              ...defaults(request.kind),
              ...latest?.data,
              ...request.data,
            });
            setBaseVersion(latest?.version);
            setTopic(latest?.topic || request.topic);
            localStorage.removeItem(key);
          }}
        >
          放弃本地草稿，使用当前版本
        </button>
        {restored && <span className="muted"> 已加载当前版本</span>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="fields">
            {request.kind !== "topic" && (
              <label className="wide">
                <span>归属主题（留空进入收集箱）</span>
                <select
                  disabled={Boolean(request.suggestion)}
                  value={topic || ""}
                  onChange={(e) => {
                    const t = e.target.value || null;
                    setTopic(t);
                    try {
                      localStorage.setItem(
                        key,
                        JSON.stringify({
                          data,
                          version: baseVersion,
                          topic: t,
                        }),
                      );
                    } catch {
                      setError("无法保留归属草稿");
                    }
                  }}
                >
                  <option value="">收集箱</option>
                  {items
                    .filter((x) => x.kind === "topic")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {String(t.data.title)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {[
              ...fields[request.kind].filter((f) => f.key !== "lastPosition"),
              ...common,
            ].map((f) => (
              <label
                key={f.key}
                className={
                  ["area", "refs"].includes(f.type || "") ? "wide" : ""
                }
              >
                <span>
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
                {f.type === "refs" ? (
                  <>
                    <select
                      aria-label={f.label + (f.required ? " *" : "")}
                      multiple
                      size={Math.min(5, Math.max(2, items.length))}
                      value={(data[f.key] as string[]) || []}
                      onChange={(e) =>
                        change(
                          f.key,
                          Array.from(e.target.selectedOptions, (o) => o.value),
                        )
                      }
                    >
                      {items
                        .filter(
                          (x) =>
                            !x.deletedAt &&
                            (!typed[f.key] || typed[f.key].includes(x.kind)) &&
                            (request.kind !== "relation" ||
                              x.topic === topic) &&
                            (f.key !== "hypothesisRefs" ||
                              x.data.type === "假设"),
                        )
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {titles[x.kind]} ·{" "}
                            {String(
                              x.data.title || x.data.content || x.id,
                            ).slice(0, 40)}{" "}
                            · {x.id.slice(0, 8)}
                          </option>
                        ))}
                    </select>
                    <small className="muted">
                      可用 Ctrl/Command 多选；编号：
                      {((data[f.key] as string[]) || []).join(", ")}
                    </small>
                  </>
                ) : f.options ? (
                  <select
                    aria-label={f.label + (f.required ? " *" : "")}
                    value={String(data[f.key] || f.options[0])}
                    onChange={(e) => change(f.key, e.target.value)}
                  >
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === "area" ? (
                  <textarea
                    aria-label={f.label + (f.required ? " *" : "")}
                    required={f.required}
                    value={String(data[f.key] || "")}
                    onChange={(e) => change(f.key, e.target.value)}
                  />
                ) : f.type === "boolean" ? (
                  <input
                    aria-label={f.label + (f.required ? " *" : "")}
                    type="checkbox"
                    checked={Boolean(data[f.key])}
                    onChange={(e) => change(f.key, e.target.checked)}
                  />
                ) : (
                  <input
                    aria-label={f.label + (f.required ? " *" : "")}
                    required={f.required}
                    type={f.type || "text"}
                    value={String(data[f.key] ?? "")}
                    min={f.type === "number" ? 0 : undefined}
                    onChange={(e) =>
                      change(
                        f.key,
                        f.type === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                )}
              </label>
            ))}
          </div>
          {request.entity && (
            <p className="muted">
              稳定编号：{request.entity.id} · 编辑版本 {request.entity.version}{" "}
              · 内容版本 {request.entity.contentVersion}
            </p>
          )}
          <div className="bar">
            <button className="primary" disabled={busy} type="submit">
              {busy
                ? "保存中…"
                : request.suggestion
                  ? "确认采纳并保存"
                  : "保存"}
            </button>
            <button type="button" onClick={onClose} disabled={busy}>
              关闭（保留草稿）
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
