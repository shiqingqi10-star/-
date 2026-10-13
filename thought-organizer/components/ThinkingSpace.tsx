"use client";
import { ReactNode } from "react";
import { Entity, Kind } from "@/lib/schema";
import {
  kindLabels,
  topicSections,
  sectionFor,
  entityName,
} from "@/lib/presentation";
import { cardMeaning } from "@/lib/thinking";
import Graph from "./Graph";
import { RecordFields } from "./EntityDetail";
import Menu, { MenuAction } from "./ui/Menu";
export default function ThinkingSpace({
  root,
  rows,
  items,
  tab,
  graph,
  zone,
  onTab,
  onGraph,
  onAdd,
  onOpen,
  onEdit,
  onHistory,
  onJump,
  onChanges,
  actions,
  renderList,
  selection,
  onUndo,
}: {
  root: Entity;
  rows: Entity[];
  items: Entity[];
  tab: Kind;
  graph: boolean;
  zone: string;
  onTab: (kind: Kind) => void;
  onGraph: (value: boolean) => void;
  onAdd: (kind: Kind, data?: Record<string, unknown>) => void;
  onOpen: (e: Entity) => void;
  onEdit: (e: Entity) => void;
  onHistory: (e: Entity) => void;
  onJump: (e: Entity) => void;
  onChanges: () => void;
  actions: (e: Entity) => MenuAction[];
  renderList: (rows: Entity[], topics?: boolean, empty?: string) => ReactNode;
  selection: ReactNode;
  onUndo: () => void;
}) {
  const stage = sectionFor(tab);
  const records = rows
    .filter((e) => e.kind === "record")
    .sort(
      (a, b) =>
        Number(b.id === root.id) - Number(a.id === root.id) ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const subLabels: Partial<Record<Kind, string>> = {
    card: "分清观点",
    relation: "连接与理由",
    evidence: "我有哪些依据",
    question: "还没想清楚",
    task: "下一步行动",
    event: "事件",
    validation: "验证结果",
    review: "我现在怎么看",
  };
  const switchTo = (kind: Kind) => {
    onGraph(false);
    onTab(kind);
  };
  return (
    <>
      {root.kind === "topic" && (
        <section className="thinking-goal">
          <span className="overview-label">我想理清的方向</span>
          <button className="body-edit" onClick={() => onEdit(root)}>
            {String(root.data.goal || "点这里，补充想理清的方向。")}
          </button>
          {Boolean(root.data.focus) && (
            <p className="muted">当前重点 · {String(root.data.focus)}</p>
          )}
        </section>
      )}
      <div className="topic-tabs stage-tabs" role="group" aria-label="思考阶段">
        {topicSections.map((s, i) => (
          <button
            key={s.label}
            aria-pressed={stage === i}
            onClick={() =>
              switchTo(
                (s.kinds as readonly string[]).includes(tab) ? tab : s.kinds[0],
              )
            }
          >
            <span aria-hidden="true" className="stage-number">
              {i + 1}
            </span>
            {s.label}
          </button>
        ))}
      </div>
      <section className="thinking-content">
        {stage === 0 ? (
          <>
            <div className="section-heading">
              <div>
                <h2>我最初的想法</h2>
                <p className="muted">
                  这里保留原文；整理后的观点会放在“理清楚”。
                </p>
              </div>
              <button onClick={() => onAdd("record")}>补充原文</button>
            </div>
            {records.length ? (
              records.map((e, i) => (
                <article className="original-record" key={e.id}>
                  {i === 0 ? (
                    <>
                      <button
                        className="body-edit original-content"
                        aria-label="点击原文编辑"
                        onClick={() => onEdit(e)}
                      >
                        {String(e.data.content)}
                      </button>
                      <div className="bar">
                        <button
                          className="text-button"
                          onClick={() => onEdit(e)}
                        >
                          编辑原文
                        </button>
                        <button
                          className="text-button"
                          onClick={() => onHistory(e)}
                        >
                          原文版本
                        </button>
                        <Menu label={entityName(e)} actions={actions(e)} />
                      </div>
                    </>
                  ) : (
                    <details className="disclosure">
                      <summary>{entityName(e)}</summary>
                      <button
                        className="body-edit original-content"
                        onClick={() => onEdit(e)}
                      >
                        {String(e.data.content)}
                      </button>
                      <button onClick={() => onHistory(e)}>原文版本</button>
                    </details>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-state">
                先写下此刻的想法，随时可以继续补充。
              </p>
            )}
            <div className="stage-next">
              <button className="primary" onClick={() => switchTo("card")}>
                开始整理
              </button>
              <span className="muted">
                随时可以回来修改，也可以直接往前走。
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="content-toolbar">
              <div className="segmented">
                {(stage === 1
                  ? ["card", "relation", "evidence"]
                  : ["question", "task", "event"]
                ).map((k) => (
                  <button
                    key={k}
                    aria-pressed={tab === k && !graph}
                    onClick={() => switchTo(k as Kind)}
                  >
                    {subLabels[k as Kind]}
                  </button>
                ))}
              </div>
              <div className="bar">
                {stage === 1 && (
                  <button
                    aria-pressed={graph}
                    onClick={() => {
                      onTab("card");
                      onGraph(!graph);
                    }}
                  >
                    看看它们怎么连接
                  </button>
                )}
                <button
                  className="primary"
                  onClick={() => onAdd(graph ? "card" : tab)}
                >
                  {tab === "review"
                    ? "记录当前判断"
                    : tab === "validation"
                      ? "记录验证结果"
                      : tab === "evidence"
                        ? "补充依据"
                        : "新建" + kindLabels[graph ? "card" : tab]}
                </button>
              </div>
            </div>
            <div className="section-heading">
              <h2 className="content-kind">
                {graph ? "连接与理由" : subLabels[tab]}
              </h2>
              <div className="bar">
                {selection}
                {stage === 1 && (
                  <Menu
                    label="整理操作"
                    actions={[
                      { label: "建立关系", action: () => onAdd("relation") },
                      { label: "撤销最近拆分或合并", action: onUndo },
                    ]}
                  />
                )}
              </div>
            </div>
            {stage === 1 && tab === "card" && !graph && (
              <p className="muted card-guide">
                把想获得的、担心的、还需确认的条件分开。点开卡片，可以补充依据、留下疑问或安排下一步。
              </p>
            )}
            {tab === "review" && (
              <p className="muted">
                记录现在的判断，以及改变判断的依据。判断可以再次修改。
              </p>
            )}
            {tab === "validation" && (
              <p className="notice warning">
                完成行动不代表假设成立。请根据实际结果记录支持、反对或无结论。
              </p>
            )}
            {graph ? (
              <Graph items={rows} onOpen={onOpen} />
            ) : (
              renderList(
                rows.filter((e) => e.kind === tab),
                false,
                tab === "card"
                  ? "先分清一个观点或条件，不必一次整理完。"
                  : "还没有这类记录，需要时再补充。",
              )
            )}
            {stage === 1 && tab === "card" && !graph && (
              <details className="disclosure card-types">
                <summary>这些卡片类型有什么区别？</summary>
                {Object.entries(cardMeaning).map(([type, label]) => (
                  <p key={type}>
                    <strong>{label}</strong> · {type}
                    {type === "事实或观察" ? "（仍需查看核实状态）" : ""}
                  </p>
                ))}
              </details>
            )}
            {stage === 2 && (
              <details
                className="disclosure next-more"
                open={["validation", "review"].includes(tab) || undefined}
              >
                <summary>依据、确认与判断</summary>
                <div className="bar">
                  <button onClick={() => switchTo("evidence")}>
                    我有哪些依据
                  </button>
                  <button onClick={() => onAdd("task", { type: "验证任务" })}>
                    下一步怎么确认
                  </button>
                  <button
                    aria-pressed={tab === "validation"}
                    onClick={() => switchTo("validation")}
                  >
                    验证结果
                  </button>
                  <button
                    aria-pressed={tab === "review"}
                    onClick={() => switchTo("review")}
                  >
                    我现在怎么看
                  </button>
                </div>
              </details>
            )}
          </>
        )}
      </section>
      <div className="thinking-footer">
        <button className="text-button" onClick={onChanges}>
          看看我的思考变化
        </button>
        <details className="disclosure">
          <summary>思考详情</summary>
          <RecordFields
            entity={root}
            items={items}
            zone={zone}
            onJump={onJump}
          />
          <button onClick={() => onEdit(root)}>编辑思考信息</button>
          <button onClick={() => onHistory(root)}>历史版本</button>
        </details>
      </div>
    </>
  );
}
