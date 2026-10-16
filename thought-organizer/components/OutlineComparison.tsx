"use client";
import { useState } from "react";
import { z } from "zod";
import {
  Comparison,
  OutlineEntry,
  comparisonSchema,
} from "@/lib/outline-schema";
import { requestToken, api } from "@/lib/http";
import { GuideSession } from "@/lib/guidance-schema";
import Modal from "./ui/Modal";
const draftSchema = z.object({
  version: z.number(),
  value: comparisonSchema.extend({
    options: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
          sourceIds: z.array(z.string()),
        }),
      )
      .min(2)
      .max(4),
    dimensions: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          values: z.array(
            z.object({
              optionId: z.string(),
              text: z.string(),
              state: z.enum(["known", "unknown", "na"]),
            }),
          ),
        }),
      )
      .min(1)
      .max(8),
  }),
});
export default function OutlineComparison({
  value,
  entries,
  userId,
  rootId,
  version,
  onSave,
  onClose,
}: {
  value: Comparison | null;
  entries: OutlineEntry[];
  userId: string;
  rootId: string;
  version: number;
  onSave: (v: Comparison, version: number) => Promise<void>;
  onClose: () => void;
}) {
  const key = `thought-draft:${userId}:outline-comparison:${rootId}`;
  const [form, setForm] = useState(() => {
      const options = entries
        .filter((e) => e.category === "option")
        .slice(0, 4)
        .map((e) => ({ id: requestToken(), text: e.text, sourceIds: [e.id] }));
      while (options.length < 2)
        options.push({ id: requestToken(), text: "", sourceIds: [] });
      let f = {
        version,
        value: value || {
          options,
          dimensions: [
            {
              id: requestToken(),
              label: "我在意的方面",
              values: options.map((o) => ({
                optionId: o.id,
                text: "",
                state: "unknown" as const,
              })),
            },
          ],
        },
      };
      try {
        const parsed = draftSchema.safeParse(
          JSON.parse(localStorage.getItem(key) || "null"),
        );
        if (parsed.success) f = parsed.data;
      } catch {}
      return f;
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [state, setState] = useState("正在编辑 · 本地草稿"),
    [latest, setLatest] = useState<GuideSession | null>(null);
  function patch(value: Comparison) {
    const next = { ...form, value };
    setForm(next);
    setState("正在编辑 · 本地草稿");
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setError("无法保存本地草稿，请复制重要内容。");
    }
  }
  return (
    <Modal
      title="比较选择"
      onClose={onClose}
      description="按自己在意的方面比较。不确定就留下未知，不评分、不自动排名。"
    >
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() =>
              void api<GuideSession>("guidance/" + rootId + "?compact=1")
                .then(setLatest)
                .catch((e) => setError(e.message))
            }
          >
            查看最新比较
          </button>
          {latest && (
            <>
              <p>
                最新保存的选择：
                {latest.data.outline.comparison?.options
                  .map((o) => o.text)
                  .join(" / ") || "尚未保存比较"}
              </p>
              <button
                onClick={() => {
                  setForm({ ...form, version: latest.version });
                  setError("");
                }}
              >
                已核对，保留我的输入
              </button>
            </>
          )}
        </div>
      )}
      <div className="comparison-options">
        {form.value.options.map((o, i) => (
          <label key={o.id}>
            选择{i + 1}
            <textarea
              aria-label={"比较选择" + (i + 1)}
              rows={2}
              value={o.text}
              maxLength={5000}
              onChange={(e) =>
                patch({
                  ...form.value,
                  options: form.value.options.map((x) =>
                    x.id === o.id ? { ...x, text: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      {form.value.options.length < 4 && (
        <button
          className="text-button"
          onClick={() => {
            const id = requestToken();
            patch({
              options: [...form.value.options, { id, text: "", sourceIds: [] }],
              dimensions: form.value.dimensions.map((d) => ({
                ...d,
                values: [
                  ...d.values,
                  { optionId: id, text: "", state: "unknown" },
                ],
              })),
            });
          }}
        >
          增加一个选择
        </button>
      )}
      {form.value.dimensions.map((d, index) => (
        <section className="comparison-dimension" key={d.id}>
          <label>
            比较方面
            <input
              aria-label={"比较方面" + (index + 1)}
              value={d.label}
              maxLength={100}
              onChange={(e) =>
                patch({
                  ...form.value,
                  dimensions: form.value.dimensions.map((x) =>
                    x.id === d.id ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <div className="comparison-cells">
            {d.values.map((v) => (
              <div className="comparison-cell" key={v.optionId}>
                <strong>
                  {form.value.options.find((o) => o.id === v.optionId)?.text ||
                    "待填写的选择"}
                </strong>
                <label>
                  信息状态
                  <select
                    aria-label={"比较状态" + (index + 1) + "-" + v.optionId}
                    value={v.state}
                    onChange={(e) =>
                      patch({
                        ...form.value,
                        dimensions: form.value.dimensions.map((x) =>
                          x.id === d.id
                            ? {
                                ...x,
                                values: x.values.map((c) =>
                                  c.optionId === v.optionId
                                    ? {
                                        ...c,
                                        state: e.target.value as
                                          "known" | "unknown" | "na",
                                      }
                                    : c,
                                ),
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="unknown">尚不清楚</option>
                    <option value="known">已有记录（仍可核对）</option>
                    <option value="na">不适用</option>
                  </select>
                </label>
                <textarea
                  aria-label={"比较说明" + (index + 1) + "-" + v.optionId}
                  rows={3}
                  value={v.text}
                  placeholder="写下已有信息或还需确认的内容"
                  onChange={(e) =>
                    patch({
                      ...form.value,
                      dimensions: form.value.dimensions.map((x) =>
                        x.id === d.id
                          ? {
                              ...x,
                              values: x.values.map((c) =>
                                c.optionId === v.optionId
                                  ? { ...c, text: e.target.value }
                                  : c,
                              ),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      ))}
      {form.value.dimensions.length < 8 && (
        <button
          className="text-button"
          onClick={() =>
            patch({
              ...form.value,
              dimensions: [
                ...form.value.dimensions,
                {
                  id: requestToken(),
                  label: "新的比较方面",
                  values: form.value.options.map((o) => ({
                    optionId: o.id,
                    text: "",
                    state: "unknown",
                  })),
                },
              ],
            })
          }
        >
          新增比较维度
        </button>
      )}
      <p className="muted" role="status">
        {state}
      </p>
      <div className="bar">
        <button
          className="primary"
          disabled={
            busy ||
            !form.value.options.every((o) => o.text.trim()) ||
            !form.value.dimensions.every((d) => d.label.trim())
          }
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setState("保存中…");
            try {
              await onSave(comparisonSchema.parse(form.value), form.version);
              localStorage.removeItem(key);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "保存失败，草稿仍保留。",
              );
              setState("保存失败 · 本地草稿仍保留");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存比较
        </button>
        <button onClick={onClose}>关闭</button>
      </div>
    </Modal>
  );
}
