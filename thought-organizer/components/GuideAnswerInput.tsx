"use client";
import { RefObject, useLayoutEffect, useRef } from "react";
import { GuideQuestion, GuideResponse } from "@/lib/guide-experience";
export default function GuideAnswerInput({
  question,
  value,
  onChange,
  disabled = false,
  inputRef,
  label = "你的回答",
}: {
  question: GuideQuestion;
  value: GuideResponse;
  onChange: (v: GuideResponse) => void;
  disabled?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  label?: string;
}) {
  const local = useRef<HTMLTextAreaElement>(null),
    format = question.input;
  useLayoutEffect(() => {
    const e = local.current;
    if (e) {
      e.style.height = "auto";
      e.style.height = Math.max(108, Math.min(e.scrollHeight, 420)) + "px";
    }
  }, [value.detail]);
  const select = (id: string) => {
    let selected: string[];
    if (format.kind !== "multiple")
      selected = value.selected.includes(id) ? [] : [id];
    else if (id === "uncertain")
      selected = value.selected.includes(id) ? [] : [id];
    else
      selected = value.selected.includes(id)
        ? value.selected.filter((x) => x !== id)
        : [...value.selected.filter((x) => x !== "uncertain"), id];
    onChange({ ...value, selected });
  };
  return (
    <div className="guide-answer-input">
      {format.options.length > 0 && (
        <fieldset
          className={
            "answer-options " +
            (format.kind === "compare" ? "compare-options" : "")
          }
          disabled={disabled}
          aria-label="回答选项"
        >
          <legend>
            {format.kind === "multiple"
              ? "可以选择几项，也可以自己写"
              : format.kind === "compare"
                ? "选择一个倾向，也可以直接说明"
                : "可以选择，也可以直接写下想法"}
          </legend>
          {format.options.map((o) => (
            <label className="answer-option" key={o.id}>
              <input
                type={format.kind === "multiple" ? "checkbox" : "radio"}
                name={question.id + ":" + label}
                checked={value.selected.includes(o.id)}
                onChange={() => select(o.id)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="answer-label">
        <span className={format.options.length ? "muted" : "sr-only"}>
          {format.options.length ? "补充说明（可留空）" : label}
        </span>
        <textarea
          ref={(e) => {
            local.current = e;
            if (inputRef) inputRef.current = e;
          }}
          aria-label={label}
          aria-describedby={
            label === "你的回答" ? "current-followup" : undefined
          }
          rows={4}
          value={value.detail}
          maxLength={50000}
          disabled={disabled}
          placeholder={
            format.kind === "unknown"
              ? "写下还需要确认的信息。"
              : format.options.length
                ? "也可以按自己的情况补充，不必认同这些选项。"
                : "按自己的理解写下来，几句话也可以。"
          }
          onChange={(e) => onChange({ ...value, detail: e.target.value })}
        />
      </label>
    </div>
  );
}
