"use client";
import { useState } from "react";
import { Entity, Kind } from "@/lib/schema";
import { entityName, kindLabels, readableTime } from "@/lib/presentation";
import Modal from "./ui/Modal";
export type Suggestion = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  status: string;
  target: string | null;
  feedback: string;
};
export type Analysis = {
  id: string;
  topic: string | null;
  created_at: string;
  stale: boolean;
  snapshot: Entity[];
  result: { understanding: string; clarifications: string[] };
  suggestions: Suggestion[];
};
export default function AIAssistant({
  analyses,
  scope,
  selection,
  selectedCount,
  configured,
  busy,
  zone,
  onClose,
  onGuide,
  onAnalyze,
  onSuggestion,
  onIgnore,
  onFeedback,
  error,
}: {
  analyses: Analysis[];
  scope: Entity[];
  selection: boolean;
  selectedCount: number;
  configured: boolean;
  busy: boolean;
  zone: string;
  onClose: () => void;
  onGuide: () => void;
  onAnalyze: (mode: string, answers: string) => Promise<unknown>;
  onSuggestion: (s: Suggestion, a: Analysis, kind?: Kind) => void;
  onIgnore: (s: Suggestion) => void;
  onFeedback: (a: Analysis) => void;
  error?: string;
}) {
  const [mode, setMode] = useState("整理思路"),
    [answers, setAnswers] = useState("");
  function suggestions(a: Analysis, kinds: string[]) {
    const rows = a.suggestions.filter((s) => kinds.includes(s.kind));
    if (!rows.length) return <p className="muted">本次没有相关建议。</p>;
    return rows.map((s) => (
      <article className="ai-suggestion" key={s.id}>
        <h4>{String(s.data.title || s.data.type || "关系建议")}</h4>
        <p className="muted">
          {s.status === "accepted"
            ? "已采纳"
            : s.status === "ignored"
              ? "已忽略"
              : "待确认"}
          {s.data.impact ? " · " + s.data.impact : ""}
        </p>
        {Boolean(s.data.quote) && (
          <blockquote>{String(s.data.quote)}</blockquote>
        )}
        <details className="disclosure">
          <summary>查看理由与内容</summary>
          {Object.entries(s.data)
            .filter(
              ([k]) =>
                !["refs", "localId", "sourceRefs", "from", "to"].includes(k),
            )
            .map(([k, v]) => (
              <p key={k}>
                <strong>
                  {(
                    {
                      title: "标题",
                      content: "内容",
                      type: "类型",
                      quote: "原句",
                      reason: "分析理由",
                      missing: "缺少信息",
                      alternative: "替代解释",
                      validation: "验证方式",
                      impact: "影响程度",
                      impactReason: "影响理由",
                      action: "具体行动",
                      information: "希望获得的信息",
                      criterion: "判断条件",
                      kind: "项目类型",
                    } as Record<string, string>
                  )[k] || k}
                  ：
                </strong>
                {String(v)}
              </p>
            ))}
        </details>
        <div className="bar">
          {s.kind === "issue" ? (
            <>
              <button
                disabled={a.stale && !s.target}
                onClick={() => onSuggestion(s, a, "question")}
              >
                {s.target ? "查看已创建内容" : "转为待思考问题"}
              </button>
              {!s.target && (
                <button
                  disabled={a.stale}
                  onClick={() => onSuggestion(s, a, "task")}
                >
                  创建验证任务
                </button>
              )}
            </>
          ) : (
            <button
              disabled={a.stale && !s.target}
              onClick={() => onSuggestion(s, a)}
            >
              {s.target ? "查看已创建内容" : "预览与采纳"}
            </button>
          )}
          {!s.target && s.status !== "ignored" && (
            <button className="text-button" onClick={() => onIgnore(s)}>
              忽略
            </button>
          )}
        </div>
      </article>
    ));
  }
  return (
    <Modal
      title="AI助手"
      drawer
      onClose={onClose}
      description="先理解，再检查。每条建议都由你决定是否保存。"
    >
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!configured && (
        <div className="notice">
          <strong>AI尚未配置</strong>
          <p>你仍然可以手动整理和保存内容。</p>
          <button className="text-button" onClick={onGuide}>
            配置说明
          </button>
        </div>
      )}
      <div className="segmented ai-actions">
        {["整理思路", "检查推导", "生成下一步"].map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>
      <details className="disclosure scope-preview">
        <summary>
          {selection ? "选中内容" : "当前主题"} · 包含{" "}
          {selection && !selectedCount ? 0 : scope.length} 项
        </summary>
        <p className="muted">
          包含当前主题目标及所选内容引用的同主题前提和证据。
        </p>
        {scope.map((e) => (
          <div key={e.id}>
            <span>{kindLabels[e.kind]}</span>
            <p>{entityName(e)}</p>
          </div>
        ))}
      </details>
      <label>
        <span>补充说明或澄清回答（可跳过）</span>
        <textarea
          rows={3}
          value={answers}
          onChange={(e) => setAnswers(e.target.value)}
          placeholder="你最希望弄清的问题是什么？"
        />
      </label>
      <button
        className="primary full-width"
        disabled={!configured || busy || (selection && !selectedCount)}
        onClick={() => void onAnalyze(mode, answers)}
      >
        {busy ? "分析中…" : "开始分析"}
      </button>
      {analyses.length === 0 && (
        <p className="muted ai-empty">
          分析结果会保留在这里。采纳前不会改变正式记录。
        </p>
      )}
      {analyses.map((a) => (
        <section className="analysis" key={a.id}>
          <div className="section-heading">
            <h3>分析结果</h3>
            <span className="muted">{readableTime(a.created_at, zone)}</span>
          </div>
          {a.stale && (
            <p className="notice warning">
              内容已变化，这份分析已过期。请重新分析后采纳。
            </p>
          )}
          <h4>理解总结</h4>
          <p>{a.result.understanding}</p>
          {a.result.clarifications.length > 0 && (
            <details className="disclosure">
              <summary>有几个问题可以补充（可跳过）</summary>
              {a.result.clarifications.map((q) => (
                <p key={q}>{q}</p>
              ))}
            </details>
          )}
          <h4>疑点与解释</h4>
          {suggestions(a, ["issue"])}
          <h4>建议的下一步</h4>
          {suggestions(a, ["question", "task"])}
          <h4>可采纳的卡片或关系</h4>
          {suggestions(a, ["card", "relation"])}
          <details className="disclosure">
            <summary>本次采用的内容快照</summary>
            {a.snapshot.map((e) => (
              <div key={e.id}>
                <h4>{entityName(e)}</h4>
                <p>
                  {String(e.data.content || e.data.goal || e.data.reason || "")}
                </p>
              </div>
            ))}
          </details>
          <button className="text-button" onClick={() => onFeedback(a)}>
            提交分析反馈
          </button>
        </section>
      ))}
    </Modal>
  );
}
