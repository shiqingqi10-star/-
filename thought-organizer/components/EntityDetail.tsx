"use client";
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
}: {
  entity: Entity;
  items: Entity[];
  zone: string;
  onJump: (e: Entity) => void;
}) {
  return (
    <dl className="record-fields">
      {[...fields[entity.kind], ...common]
        .filter(
          (f) =>
            f.key !== "lastPosition" &&
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
}: {
  entity: Entity;
  items: Entity[];
  zone: string;
  onClose: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onJump: (e: Entity) => void;
}) {
  return (
    <Modal
      title={kindLabels[entity.kind]}
      description={
        entity.deletedAt ? "这条内容在回收站中，可恢复后继续编辑。" : undefined
      }
      onClose={onClose}
    >
      <h3 className="record-title">{entityName(entity)}</h3>
      <RecordFields entity={entity} items={items} zone={zone} onJump={onJump} />
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
