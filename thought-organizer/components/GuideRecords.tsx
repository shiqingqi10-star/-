"use client";
import { useEffect, useRef, useState } from "react";
import { Entity, common, fields } from "@/lib/schema";
import { OutlineEntry, outlineLabels } from "@/lib/outline-schema";
import { GuideAnswer } from "@/lib/guidance-schema";
import { api } from "@/lib/http";
import { entityName, readableTime } from "@/lib/presentation";
import Modal from "./ui/Modal";
function RunOutput({ value }: { value: string }) {
  let result: {
    question?: {
      text?: string;
      understanding?: string;
      explanation?: string;
      hint?: string;
    };
    assessment?: { reason?: string };
    closure?: { message?: string };
    candidates?: { text?: string }[];
    candidateWarnings?: { text?: string; reason?: string }[];
    changes?: {
      text: string;
      reason: string;
      category: keyof typeof outlineLabels;
    }[];
  } | null = null;
  try {
    result = JSON.parse(value);
  } catch {}
  if (!result)
    return <p className="full-body">{value || "这条旧记录未保留返回内容。"}</p>;
  return (
    <details>
      <summary>这次返回的内容</summary>
      {result.question && (
        <>
          <p className="full-body">{result.question.text}</p>
          <p className="full-body">{result.question.understanding}</p>
          <p className="full-body">{result.question.explanation}</p>
          <p className="full-body">{result.question.hint}</p>
        </>
      )}
      {result.assessment?.reason && (
        <p className="full-body">{result.assessment.reason}</p>
      )}
      {result.closure?.message && (
        <p className="full-body">{result.closure.message}</p>
      )}
      {result.changes?.map((c, i) => (
        <p className="full-body" key={"change" + i}>
          {outlineLabels[c.category]}：{c.text}
          <br />
          {c.reason}
        </p>
      ))}
      {result.candidates?.map((c, i) => (
        <p className="full-body" key={i}>
          待确认提炼：{c.text}
        </p>
      ))}
      {result.candidateWarnings?.map((c, i) => (
        <p className="full-body" key={i}>
          未加入成果：{c.text} · {c.reason}
        </p>
      ))}
    </details>
  );
}
type Snapshot = {
  entities: Entity[];
  answers: GuideAnswer[];
  outline?: OutlineEntry[];
  anchor?: {
    original?: string;
    corrections?: { text: string; review?: boolean }[];
  };
  corrections?: { text: string; review?: boolean }[];
};
type RecordInfo = {
  id: string;
  state: string;
  stale: boolean;
  createdAt: string;
};
type Detail = RecordInfo & { snapshot: Snapshot; result: string };
type Page = { records: RecordInfo[]; nextCursor: string | null; total: number };
type Scope = Snapshot & { latestRunId: string | null };
function InputContents({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.entities || [];
  return (
    <div className="scope-contents">
      <p className="muted">
        包含{rows.length}项相关内容、{snapshot.answers?.length || 0}
        条已保存问答。未提交草稿不在其中。
      </p>
      {rows.map((e) => (
        <details key={e.id}>
          <summary>{entityName(e)}</summary>
          <dl className="scope-fields">
            {[...fields[e.kind], ...common]
              .filter(
                (f) => e.data[f.key] !== undefined && e.data[f.key] !== "",
              )
              .map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd className="full-body">
                    {Array.isArray(e.data[f.key])
                      ? (e.data[f.key] as string[])
                          .map((id) => {
                            const item = rows.find((x) => x.id === id);
                            return item ? entityName(item) : "关联内容";
                          })
                          .join("、")
                      : String(e.data[f.key])}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
      {snapshot.outline?.length ? (
        <details>
          <summary>本次使用的整理草稿 · {snapshot.outline.length}条</summary>
          {snapshot.outline.map((e) => (
            <p className="full-body" key={e.id}>
              {outlineLabels[e.category]}：{e.text}
              {e.review ? "（来源需核对）" : ""}
            </p>
          ))}
        </details>
      ) : null}
      {snapshot.answers?.map((a, i) => (
        <details key={a.id}>
          <summary>
            第{i + 1}轮 · {a.question.text}
          </summary>
          <p className="full-body">
            {a.status === "unknown"
              ? "暂时不知道 · "
              : a.status === "skipped"
                ? "已跳过 · "
                : ""}
            {a.text || "未填写内容"}
          </p>
          <small className="muted">
            回答版本{a.version}
            {a.review ? " · 需核对" : ""}
          </small>
        </details>
      ))}
      {(snapshot.anchor?.corrections || snapshot.corrections)?.map((c, i) => (
        <p className="full-body" key={i}>
          用户修正{c.review ? "（来源已变化，需核对）" : ""}：{c.text}
        </p>
      ))}
    </div>
  );
}
export default function GuideRecords({
  root,
  mode,
  zone,
  onClose,
}: {
  root: string;
  mode: "runs" | "scope";
  zone: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState<Page | null>(null),
    [scope, setScope] = useState<Scope | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [prospective, setProspective] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const generation = useRef(0),
    lifecycle = useRef({ active: true });
  useEffect(() => {
    let active = true;
    const state = lifecycle.current;
    state.active = true;
    const request =
      mode === "runs"
        ? api<Page>("guidance/" + root + "/runs").then((v) => {
            if (active) setPage(v);
          })
        : api<Scope>("guidance/" + root + "/scope").then(async (v) => {
            if (!active) return;
            setScope(v);
            if (v.latestRunId) {
              const r = await api<Detail>(
                "guidance/" +
                  root +
                  "/runs?id=" +
                  encodeURIComponent(v.latestRunId),
              );
              if (active) setDetail(r);
            } else setProspective(true);
          });
    request
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      state.active = false;
    };
  }, [root, mode]);
  async function open(info: RecordInfo) {
    const epoch = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const d = await api<Detail>(
        "guidance/" + root + "/runs?id=" + encodeURIComponent(info.id),
      );
      if (epoch === generation.current && lifecycle.current.active) {
        setDetail(d);
        setProspective(false);
      }
    } catch (e) {
      if (epoch === generation.current && lifecycle.current.active)
        setError(e instanceof Error ? e.message : "载入失败");
    } finally {
      if (epoch === generation.current && lifecycle.current.active)
        setLoading(false);
    }
  }
  async function more() {
    if (!page?.nextCursor) return;
    setLoading(true);
    setError("");
    try {
      const p = await api<Page>(
        "guidance/" +
          root +
          "/runs?cursor=" +
          encodeURIComponent(page.nextCursor),
      );
      setPage((old) => ({
        ...p,
        records: [
          ...(old?.records || []),
          ...p.records.filter((r) => !old?.records.some((x) => x.id === r.id)),
        ],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "载入失败");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title={mode === "runs" ? "AI运行记录" : "使用范围"}
      drawer
      onClose={onClose}
      description={
        mode === "runs"
          ? "按实际运行分组。输入快照与分析结果属于同一条记录，查看不会调用AI。"
          : "查看实际发送内容或下一次可用范围；打开此处不会调用AI。"
      }
    >
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="muted" role="status">
          正在读取…
        </p>
      )}
      {mode === "scope" && scope && (
        <div className="bar">
          {detail && (
            <button
              aria-pressed={!prospective}
              onClick={() => setProspective(false)}
            >
              上次实际发送
            </button>
          )}
          <button
            aria-pressed={prospective}
            onClick={() => setProspective(true)}
          >
            下一次可用范围
          </button>
        </div>
      )}
      {mode === "runs" && !detail && page && (
        <>
          <p className="muted">共{page.total}条已保存运行记录</p>
          {page.records.map((r) => (
            <button
              className="run-record-row"
              key={r.id}
              onClick={() => void open(r)}
            >
              {readableTime(r.createdAt, zone)}
              <span>
                {r.state === "success"
                  ? "已返回"
                  : r.state === "running"
                    ? "处理中"
                    : "未成功"}
                {r.stale ? " · 已过期" : ""}
              </span>
            </button>
          ))}
          {!page.records.length && <p>还没有AI运行记录。</p>}
          {page.nextCursor && (
            <button disabled={loading} onClick={() => void more()}>
              更早的记录
            </button>
          )}
        </>
      )}
      {detail && (!prospective || mode === "runs") && (
        <>
          {mode === "runs" && (
            <button className="text-button" onClick={() => setDetail(null)}>
              返回运行列表
            </button>
          )}
          <p>
            {readableTime(detail.createdAt, zone)} ·{" "}
            {detail.state === "success"
              ? "已返回"
              : detail.state === "running"
                ? "处理中"
                : "未成功"}
          </p>
          {detail.stale && (
            <p className="notice">
              原文、回答、整理草稿或相关材料已有变化。这份历史结果已过期，不能作为当前建议直接采纳。
            </p>
          )}
          {detail.state === "error" && (
            <p className="notice error">{detail.result}</p>
          )}
          {detail.state === "success" && <RunOutput value={detail.result} />}
          <h3>这次实际发送的内容</h3>
          <InputContents snapshot={detail.snapshot} />
          <details>
            <summary>高级诊断</summary>
            <p className="muted">
              仅包含本条运行的状态与编号，不包含服务配置或密钥。
            </p>
            <pre>
              {JSON.stringify(
                {
                  id: detail.id,
                  state: detail.state,
                  stale: detail.stale,
                  createdAt: detail.createdAt,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
      {prospective && scope && mode === "scope" && (
        <>
          <p className="muted">
            这是下一次可使用的当前范围，尚未因打开此处而发送给AI。
          </p>
          <InputContents snapshot={scope} />
        </>
      )}
    </Modal>
  );
}
