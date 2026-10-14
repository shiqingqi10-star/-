"use client";
import { useEffect, useState } from "react";
import { Entity } from "@/lib/schema";
import { entityName, readableTime } from "@/lib/presentation";
import { api } from "@/lib/http";
import Modal from "./ui/Modal";
type Version = { version: number; snapshot: Entity; created_at: string };
export default function ThinkingChanges({
  rows,
  zone,
  onClose,
  onOpen,
}: {
  rows: Entity[];
  zone: string;
  onClose: () => void;
  onOpen: (e: Entity) => void;
}) {
  const [history, setHistory] = useState<Record<string, Version[]>>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.allSettled(
      rows
        .filter((e) => ["record", "review"].includes(e.kind))
        .map(async (e) => {
          return [e.id, await api<Version[]>(`entities/${e.id}/history`)] as [
            string,
            Version[],
          ];
        }),
    ).then((results) => {
      if (!active) return;
      setHistory(
        Object.fromEntries(
          results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
        ),
      );
      if (results.some((r) => r.status === "rejected"))
        setError("部分历史暂时无法载入，下面展示已保存的当前结构。");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [rows]);
  const sections: [string, Entity[]][] = [
    ["最初写了什么", rows.filter((e) => e.kind === "record")],
    [
      "现在分清了哪些观点",
      rows.filter(
        (e) =>
          e.kind === "card" && !["问题", "假设"].includes(String(e.data.type)),
      ),
    ],
    ["补充了哪些依据", rows.filter((e) => e.kind === "evidence")],
    [
      "还有哪些未知",
      rows.filter(
        (e) =>
          (e.kind === "question" && e.data.status !== "已解决") ||
          (e.kind === "card" && ["问题", "假设"].includes(String(e.data.type))),
      ),
    ],
    ["当前判断是什么", rows.filter((e) => e.kind === "review")],
    [
      "下一步准备做什么",
      rows.filter((e) => ["task", "event"].includes(e.kind)),
    ],
    ["已记录的验证结果", rows.filter((e) => e.kind === "validation")],
  ];
  return (
    <Modal
      title="看看我的思考变化"
      drawer
      onClose={onClose}
      description="这里只展示已保存的内容、当前关联和留存版本，不代表完整还原全部思考过程。"
    >
      {loading && <p role="status">正在读取已有版本…</p>}
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
      {sections.map(([label, entities]) => (
        <section className="change-section" key={label}>
          <h3>{label}</h3>
          {!entities.length ? (
            <p className="muted">暂未记录这部分信息。</p>
          ) : (
            entities
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((e) => {
                const versions = (history[e.id] || [])
                    .slice()
                    .sort((a, b) => a.version - b.version),
                  earliest = versions[0]?.snapshot;
                return (
                  <article key={e.id}>
                    <button
                      className="text-button change-title"
                      onClick={() => onOpen(e)}
                    >
                      {entityName(e)}
                    </button>
                    {e.kind === "record" ? (
                      <>
                        <span className="muted">
                          {earliest ? "最早保留的原文版本" : "目前保存的原文"}
                        </span>
                        <p className="full-text">
                          {String((earliest || e).data.content)}
                        </p>
                        {earliest &&
                          String(earliest.data.content) !==
                            String(e.data.content) && (
                            <details className="disclosure">
                              <summary>现在的原文</summary>
                              <p className="full-text">
                                {String(e.data.content)}
                              </p>
                            </details>
                          )}
                      </>
                    ) : (
                      <p className="full-text">
                        {String(
                          e.data.content ||
                            e.data.judgment ||
                            e.data.actual ||
                            e.data.answer ||
                            e.data.observation ||
                            e.data.excerpt ||
                            e.data.action ||
                            e.data.notes ||
                            e.data.title ||
                            "",
                        )}
                      </p>
                    )}
                    <p className="muted">
                      {String(e.data.type || "")}
                      {e.data.source ? " · 来源：" + e.data.source : ""}
                      {e.data.verification ? " · " + e.data.verification : ""}
                      {e.data.status ? " · " + e.data.status : ""}
                      {e.data.direction
                        ? " · 验证方向：" + e.data.direction
                        : ""}{" "}
                      · {readableTime(e.updatedAt, zone)}
                    </p>
                    {Boolean(e.data.change) && (
                      <p>判断变化：{String(e.data.change)}</p>
                    )}
                    {Boolean(e.data.changeReason) && (
                      <p>改变的理由：{String(e.data.changeReason)}</p>
                    )}
                    {!!versions.length && (
                      <details className="disclosure">
                        <summary>已有版本（{versions.length}）</summary>
                        {versions.map((v) => (
                          <div key={v.version}>
                            <span className="muted">
                              {readableTime(v.created_at, zone, true)}
                            </span>
                            <p className="full-text">
                              {String(
                                v.snapshot.data.content ||
                                  v.snapshot.data.judgment ||
                                  v.snapshot.data.change ||
                                  "此版本没有记录判断正文。",
                              )}
                            </p>
                          </div>
                        ))}
                      </details>
                    )}
                  </article>
                );
              })
          )}
        </section>
      ))}
    </Modal>
  );
}
