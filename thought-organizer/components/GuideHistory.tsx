"use client";
import { useState } from "react";
import { GuideAnswer, GuideSession } from "@/lib/guidance-schema";
import Modal from "./ui/Modal";
export default function GuideHistory({
  session,
  initialId,
  onClose,
  onEdit,
  onAcknowledge,
}: {
  session: GuideSession;
  initialId?: string;
  onClose: () => void;
  onEdit: (a: GuideAnswer) => void;
  onAcknowledge: (a: GuideAnswer) => void;
}) {
  const [index, setIndex] = useState(
    Math.max(
      0,
      session.data.answers.findIndex((a) => a.id === initialId),
    ),
  );
  const a =
    session.data.answers[Math.min(index, session.data.answers.length - 1)];
  return (
    <Modal
      title="前面的回答"
      drawer
      onClose={onClose}
      description="按轮次查看原话；修改会保留历史，并提示受影响的后续内容重新核对。"
    >
      <div className="history-navigation">
        <button disabled={index <= 0} onClick={() => setIndex((i) => i - 1)}>
          上一轮
        </button>
        <label>
          定位轮次
          <select
            aria-label="定位回答轮次"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {session.data.answers.map((a, i) => (
              <option key={a.id} value={i}>
                第{i + 1}轮 · {a.question.text.slice(0, 30)}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={index >= session.data.answers.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          下一轮
        </button>
      </div>
      {a ? (
        <article className="history-answer">
          <small className="muted">
            第{index + 1}轮 ·{" "}
            {a.status === "unknown"
              ? "暂时不知道"
              : a.status === "skipped"
                ? "已跳过"
                : "已回答"}
          </small>
          <h3>{a.question.text}</h3>
          <p className="full-body">{a.text || "这轮没有填写回答。"}</p>
          {a.review && (
            <p className="notice">前面的内容有变化，这条回答需要核对。</p>
          )}
          <div className="bar">
            <button onClick={() => onEdit(a)}>修改回答</button>
            {a.review && (
              <button onClick={() => onAcknowledge(a)}>核对并保留</button>
            )}
          </div>
        </article>
      ) : (
        <p className="muted">还没有保存的回答。</p>
      )}
    </Modal>
  );
}
