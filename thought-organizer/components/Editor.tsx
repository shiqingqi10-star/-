"use client";
import { useRef, useState } from "react";
import {
  Entity,
  Kind,
  fields,
  common,
  dataSchema,
  validateData,
} from "@/lib/schema";
import {
  defaultData,
  editorGroups,
  fieldLabel,
  kindLabels,
} from "@/lib/presentation";
import Modal from "./ui/Modal";
import ReferencePicker from "./ReferencePicker";
export type EditRequest = {
  kind: Kind;
  entity?: Entity;
  data?: Record<string, unknown>;
  topic: string | null;
  suggestion?: string;
};
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
  const base = () => ({
    ...request.entity?.data,
    ...(!request.entity ? defaultData(request.kind) : {}),
    ...request.data,
  });
  function draft() {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      return {};
    }
  }
  const [data, setData] = useState<Record<string, unknown>>(
    () => draft().data || base(),
  );
  const [topic, setTopic] = useState<string | null>(() => {
    const d = draft();
    return "topic" in d ? d.topic : (request.entity?.topic ?? request.topic);
  });
  const [version, setVersion] = useState<number | undefined>(
    () => draft().version ?? request.entity?.version,
  );
  const [draftPresent, setDraftPresent] = useState(() => Boolean(draft().data));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [invalid, setInvalid] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  function persist(next: Record<string, unknown>, t = topic) {
    setDraftPresent(true);
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ data: next, topic: t, version }),
      );
    } catch {
      setError("无法保存本地草稿，请复制重要内容。");
    }
  }
  function change(k: string, v: unknown) {
    const next = { ...data, [k]: v };
    setData(next);
    persist(next);
    setErrors((prev) => ({ ...prev, [k]: "" }));
  }
  function locate(keys: string[]) {
    setInvalid(keys);
    requestAnimationFrame(() => {
      const wrapper = form.current?.querySelector<HTMLElement>(
        '[data-field="' + keys[0] + '"]',
      );
      wrapper?.scrollIntoView({ block: "center" });
      wrapper
        ?.querySelector<HTMLElement>("input,select,textarea,button")
        ?.focus();
    });
  }
  async function save() {
    const check = dataSchema(request.kind).safeParse(data);
    const nextErrors: Record<string, string> = {};
    if (!check.success)
      for (const issue of check.error.issues) {
        const k = String(issue.path[0]);
        nextErrors[k] =
          "请检查" +
          (fields[request.kind].find((f) => f.key === k)?.label || "此项");
      }
    if (
      request.kind === "question" &&
      data.status === "等待信息" &&
      !String(data.waitingFor || "").trim()
    )
      nextErrors.waitingFor = "请注明在等待什么信息";
    if (
      request.kind === "relation" &&
      Array.isArray(data.to) &&
      data.to.length !== 1
    )
      nextErrors.to = "请选择一个结论卡片";
    for (const f of fields[request.kind].filter((f) => f.type === "refs")) {
      const refs = data[f.key] as string[] | undefined;
      if (
        refs?.some(
          (id) =>
            !items.some(
              (e) =>
                e.id === id &&
                !e.deletedAt &&
                (!typed[f.key] || typed[f.key].includes(e.kind)) &&
                (request.kind !== "relation" || e.topic === topic) &&
                (f.key !== "hypothesisRefs" || e.data.type === "假设"),
            ),
        )
      )
        nextErrors[f.key] = "某条关联已失效或类型不匹配，请检查已有选择。";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("还有必填或格式错误的内容，请检查标记的字段。");
      locate(Object.keys(nextErrors));
      return;
    }
    try {
      validateData(request.kind, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查输入");
      const dates = fields[request.kind]
        .filter((f) => ["date", "datetime-local"].includes(f.type || ""))
        .map((f) => f.key);
      locate(dates.length ? dates : [fields[request.kind][0].key]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(data, topic, version);
      try {
        localStorage.removeItem(key);
      } catch {}
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请稍后重试。");
      persist(data);
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
  const all = [...fields[request.kind], ...common];
  const groups = editorGroups(request.kind, data);
  function field(k: string) {
    const f = all.find((f) => f.key === k)!;
    const label = fieldLabel(request.kind, f) + (f.required ? " *" : "");
    const error = errors[k];
    if (f.type === "refs")
      return (
        <div className="field wide" data-field={k} key={k}>
          <ReferencePicker
            label={label}
            items={items.filter(
              (e) =>
                !e.deletedAt &&
                (!typed[k] || typed[k].includes(e.kind)) &&
                (request.kind !== "relation" || e.topic === topic) &&
                (k !== "hypothesisRefs" || e.data.type === "假设") &&
                (k !== "parentRefs" || e.id !== request.entity?.id),
            )}
            value={(data[k] as string[]) || []}
            onChange={(v) => change(k, k === "to" ? v.slice(-1) : v)}
            error={error}
          />
        </div>
      );
    return (
      <div
        className={"field " + (f.type === "area" ? "wide" : "")}
        data-field={k}
        key={k}
      >
        <label className={f.type === "boolean" ? "checkbox-label" : ""}>
          {f.type === "boolean" ? (
            <>
              <input
                type="checkbox"
                checked={Boolean(data[k])}
                onChange={(e) => change(k, e.target.checked)}
              />
              <span>{label}</span>
            </>
          ) : (
            <>
              <span>{label}</span>
              {f.options ? (
                <select
                  aria-label={label}
                  aria-invalid={Boolean(error)}
                  value={String(data[k] || f.options[0])}
                  onChange={(e) => change(k, e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === "area" ? (
                <textarea
                  aria-label={label}
                  aria-invalid={Boolean(error)}
                  value={String(data[k] || "")}
                  onChange={(e) => change(k, e.target.value)}
                  rows={k === "content" ? 6 : 3}
                />
              ) : (
                <input
                  aria-label={label}
                  aria-invalid={Boolean(error)}
                  type={f.type || "text"}
                  value={String(data[k] ?? "")}
                  min={f.type === "number" ? 0 : undefined}
                  onChange={(e) =>
                    change(
                      k,
                      f.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              )}
            </>
          )}
        </label>
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }
  return (
    <Modal
      title={
        (request.suggestion ? "采纳预览" : request.entity ? "编辑" : "新建") +
        " · " +
        kindLabels[request.kind]
      }
      onClose={onClose}
      description={
        request.suggestion ? "确认内容与归属后，再加入你的记录。" : undefined
      }
    >
      <form
        ref={form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {draftPresent && (
          <div className="draft-note">
            <span>本地草稿 · 尚未保存</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const latest =
                  items.find((e) => e.id === request.entity?.id) ||
                  request.entity;
                setData({
                  ...(!latest ? defaultData(request.kind) : {}),
                  ...latest?.data,
                  ...request.data,
                });
                setVersion(latest?.version);
                setTopic(latest?.topic ?? request.topic);
                setDraftPresent(false);
                setError("");
                try {
                  localStorage.removeItem(key);
                } catch {}
              }}
            >
              载入已保存内容
            </button>
          </div>
        )}
        <section className="form-section">
          <h3>基础信息</h3>
          <div className="fields">
            {groups[0].keys.map(field)}
            {request.kind !== "topic" && (
              <div className="field wide">
                <label>
                  <span>归属主题</span>
                  <select
                    aria-label="归属主题"
                    disabled={Boolean(request.suggestion)}
                    value={topic || ""}
                    onChange={(e) => {
                      const t = e.target.value || null;
                      setTopic(t);
                      persist(data, t);
                    }}
                  >
                    <option value="">收集箱</option>
                    {items
                      .filter((e) => e.kind === "topic" && !e.deletedAt)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {String(t.data.title)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </section>
        {groups.slice(1).map((g) => (
          <details
            key={g.label + invalid.join(",")}
            className="form-section disclosure"
            open={g.keys.some((k) => invalid.includes(k)) ? true : undefined}
          >
            <summary>{g.label}</summary>
            <div className="fields">{g.keys.map(field)}</div>
          </details>
        ))}
        {request.entity && (
          <details className="disclosure record-info">
            <summary>记录信息</summary>
            <p>
              编号：{request.entity.id}
              <br />
              版本：{version}
              <br />
              内容版本：{request.entity.contentVersion}
            </p>
          </details>
        )}
        <footer className="modal-actions">
          <span className="muted">
            {draftPresent ? "草稿保留在此浏览器" : ""}
          </span>
          <button type="button" onClick={onClose}>
            关闭
          </button>
          <button className="primary" disabled={busy} type="submit">
            {busy ? "保存中…" : "保存"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
