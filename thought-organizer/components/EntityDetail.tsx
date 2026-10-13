"use client";
import { useEffect, useState } from "react";
import { Entity, fields, common } from "@/lib/schema";
import {
  entityName,
  fieldLabel,
  kindLabels,
  readableTime,
} from "@/lib/presentation";
import Modal from "./ui/Modal";
export function RecordFields({
  entity,
  items,
  zone,
  onJump,
  exclude = [],
}: {
  entity: Entity;
  items: Entity[];
  zone: string;
  onJump: (e: Entity) => void;
  exclude?: string[];
}) {
  return (
    <dl className="record-fields">
      {[...fields[entity.kind], ...common]
        .filter(
          (f) =>
            f.key !== "lastPosition" &&
            !exclude.includes(f.key) &&
            entity.data[f.key] !== undefined &&
            entity.data[f.key] !== "" &&
            entity.data[f.key] !== false &&
            (!Array.isArray(entity.data[f.key]) ||
              (entity.data[f.key] as string[]).length),
        )
        .map((f) => (
          <div key={f.key}>
            <dt>{fieldLabel(entity.kind, f)}</dt>
            <dd>
              {f.type === "refs" ? (
                <div className="link-tags">
                  {(entity.data[f.key] as string[]).map((id) => {
                    const target = items.find((e) => e.id === id);
                    return target ? (
                      <button
                        key={id}
                        className="linked-record"
                        onClick={() => onJump(target)}
                      >
                        {entityName(target)}
                        {target.deletedAt ? "（已删除）" : ""}
                      </button>
                    ) : (
                      <span key={id}>关联已失效</span>
                    );
                  })}
                </div>
              ) : f.key === "url" ? (
                <a
                  href={String(entity.data[f.key])}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {String(entity.data[f.key])}
                </a>
              ) : (
                <p>
                  {f.type === "boolean" ? "是" : String(entity.data[f.key])}
                </p>
              )}
            </dd>
          </div>
        ))}
      <div>
        <dt>更新日期</dt>
        <dd>{readableTime(entity.updatedAt, zone)}</dd>
      </div>
    </dl>
  );
}
export default function EntityDetail({
  entity,
  items,
  zone,
  onClose,
  onEdit,
  onHistory,
  onJump,
  onSupplement,
}: {
  entity: Entity;
  items: Entity[];
  zone: string;
  onClose: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onJump: (e: Entity) => void;
  onSupplement?: (action: "evidence" | "question" | "task", e: Entity) => void;
}) {
  const [aiOrigin, setAiOrigin] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/analyses" + (entity.topic ? "?topic=" + entity.topic : ""))
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { suggestions: { target: string | null }[] }[]) => {
        if (active)
          setAiOrigin(
            rows.some((a) => a.suggestions.some((s) => s.target === entity.id)),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entity.id, entity.topic]);
  return (
    <Modal
      title={kindLabels[entity.kind]}
      description={
        entity.deletedAt ? "这条内容在回收站中，可恢复后继续编辑。" : undefined
      }
      onClose={onClose}
    >
      {Boolean(entity.data.title) && (
        <h3 className="record-title">{String(entity.data.title)}</h3>
      )}
      {(aiOrigin || entity.data.source === "AI推断") && (
        <p className="notice">
          来源：AI建议，经你确认后保存；不代表已核实事实。
        </p>
      )}
      {Boolean(entity.data.content) && !entity.deletedAt && (
        <button
          className="body-edit"
          onClick={onEdit}
          aria-label="点击正文编辑"
        >
          {String(entity.data.content)}
        </button>
      )}
      {entity.kind === "card" && !entity.deletedAt && onSupplement && (
        <div className="bar contextual-actions">
          <button onClick={() => onSupplement("evidence", entity)}>
            补充依据
          </button>
          <button onClick={() => onSupplement("question", entity)}>
            留下疑问
          </button>
          <button onClick={() => onSupplement("task", entity)}>
            看看下一步
          </button>
        </div>
      )}
      {entity.kind === "question" && !entity.deletedAt && onSupplement && (
        <button onClick={() => onSupplement("task", entity)}>
          为这个疑问安排下一步
        </button>
      )}
      {entity.kind === "card" && (
        <section className="related-basis">
          <h3>与这条观点有关的依据</h3>
          {items
            .filter(
              (e) =>
                !e.deletedAt &&
                e.kind === "evidence" &&
                ([
                  ...((e.data.supports as string[]) || []),
                  ...((e.data.opposes as string[]) || []),
                ].includes(entity.id) ||
                  ((entity.data.evidenceRefs as string[]) || []).includes(
                    e.id,
                  )),
            )
            .map((e) => (
              <button
                key={e.id}
                className="linked-record"
                onClick={() => onJump(e)}
              >
                {entityName(e)} · {String(e.data.type || "依据")} ·{" "}
                {String(e.data.status || "待核实")}
              </button>
            ))}
          {!items.some(
            (e) =>
              !e.deletedAt &&
              e.kind === "evidence" &&
              ([
                ...((e.data.supports as string[]) || []),
                ...((e.data.opposes as string[]) || []),
              ].includes(entity.id) ||
                ((entity.data.evidenceRefs as string[]) || []).includes(e.id)),
          ) && (
            <p className="muted">
              暂未关联依据。个人推断与已核实事实仍需分开。
            </p>
          )}
        </section>
      )}
      <RecordFields
        entity={entity}
        items={items}
        zone={zone}
        onJump={onJump}
        exclude={
          entity.data.content && !entity.deletedAt
            ? ["title", "content"]
            : ["title"]
        }
      />
      <details className="disclosure record-info">
        <summary>记录信息</summary>
        <p>编号：{entity.id}</p>
        <button
          className="text-button"
          onClick={() => void navigator.clipboard?.writeText(entity.id)}
        >
          复制编号
        </button>
        <p>
          版本：{entity.version} · 内容版本：{entity.contentVersion}
          <br />
          创建：{readableTime(entity.createdAt, zone, true)}
          <br />
          更新：{readableTime(entity.updatedAt, zone, true)}
        </p>
      </details>
      <footer className="modal-actions">
        <button onClick={onHistory}>历史版本</button>
        <button onClick={onClose}>关闭</button>
        {!entity.deletedAt && (
          <button className="primary" onClick={onEdit}>
            编辑
          </button>
        )}
      </footer>
    </Modal>
  );
}
