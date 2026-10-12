"use client";
import { Entity, Kind } from "@/lib/schema";
import {
  entityName,
  excerpt,
  kindLabels,
  itemDate,
  finished,
  readableTime,
} from "@/lib/presentation";
import { CheckIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import Menu, { MenuAction } from "./ui/Menu";
export default function EntityList({
  items,
  onOpen,
  actions,
  onComplete,
  selecting = false,
  selected = [],
  onSelect,
  zone,
  today,
  empty = "这里还没有内容。",
  topics = false,
}: {
  items: Entity[];
  onOpen: (e: Entity) => void;
  actions: (e: Entity) => MenuAction[];
  onComplete?: (e: Entity) => void;
  selecting?: boolean;
  selected?: string[];
  onSelect?: (id: string) => void;
  zone: string;
  today: string;
  empty?: string;
  topics?: boolean;
}) {
  const sorted = items
    .slice()
    .sort((a, b) =>
      topics
        ? b.updatedAt.localeCompare(a.updatedAt)
        : Number(Boolean(b.data.pinned)) - Number(Boolean(a.data.pinned)) ||
          Number(a.data.order || 0) - Number(b.data.order || 0),
    );
  if (!sorted.length)
    return (
      <div className="empty-state">
        <p>{empty}</p>
      </div>
    );
  const types: Kind[] = ["question", "task", "event"];
  return (
    <div className={topics ? "topic-grid" : "entity-list"}>
      {sorted.map((e) => (
        <article
          key={e.id}
          className={
            "entity-row " +
            e.kind +
            (selected.includes(e.id) ? " selected" : "")
          }
          data-entity={e.id}
        >
          {selecting && (
            <input
              type="checkbox"
              className="select-checkbox"
              aria-label={"选择" + entityName(e)}
              checked={selected.includes(e.id)}
              onChange={() => onSelect?.(e.id)}
            />
          )}
          <button
            className="entity-open"
            onClick={() => onOpen(e)}
            aria-label={entityName(e)}
          >
            <div className="entity-title">{entityName(e)}</div>
            {excerpt(e) && <p className="entity-summary">{excerpt(e)}</p>}
            <div className="entity-meta">
              {!topics && (
                <span>{String(e.data.type || kindLabels[e.kind])}</span>
              )}
              {Boolean(e.data.status) && (
                <span
                  className={
                    "status " +
                    (finished(e)
                      ? "done"
                      : e.data.status === "待核实"
                        ? "warn"
                        : "")
                  }
                >
                  {String(e.data.status)}
                </span>
              )}
              {e.data.today === true && (
                <span className="focus-label">今日关注</span>
              )}
              {e.data.pinned === true && <span>置顶</span>}
              {e.data.archived === true && <span>已归档</span>}
              {itemDate(e) && (
                <span
                  className={
                    itemDate(e) < today && !finished(e) ? "overdue" : ""
                  }
                >
                  {itemDate(e) < today && !finished(e) ? "已逾期 · " : ""}
                  {itemDate(e)}
                </span>
              )}
              {topics && <span>更新于 {readableTime(e.updatedAt, zone)}</span>}
              {["evidence", "review", "record"].includes(e.kind) && (
                <span>{readableTime(e.updatedAt, zone)}</span>
              )}
            </div>
            {e.kind === "task" &&
              e.data.type === "验证任务" &&
              e.data.status === "已完成" &&
              !e.data.result && (
                <p className="inline-warning">行动已完成，验证结果未记录</p>
              )}
          </button>
          <div className="row-actions">
            {types.includes(e.kind) && !e.deletedAt && onComplete && (
              <button
                className={
                  "icon-button complete " + (finished(e) ? "done" : "")
                }
                aria-label={
                  (finished(e) ? "重新打开" : "完成或处理") +
                  "：" +
                  entityName(e)
                }
                title={finished(e) ? "重新打开" : "完成或处理"}
                onClick={() => onComplete(e)}
              >
                <CheckIcon />
              </button>
            )}
            {e.deletedAt ? (
              <button onClick={() => actions(e)[0]?.action()}>恢复</button>
            ) : (
              <Menu label={entityName(e)} actions={actions(e)} />
            )}{" "}
            {topics && <ChevronRightIcon className="row-chevron" />}
          </div>
        </article>
      ))}
    </div>
  );
}
