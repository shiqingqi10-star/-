"use client";
import { useState, useId } from "react";
import {
  Cross2Icon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { Entity } from "@/lib/schema";
import { entityName, kindLabels } from "@/lib/presentation";
export default function ReferencePicker({
  label,
  items,
  value,
  onChange,
  error,
}: {
  label: string;
  items: Entity[];
  value: string[];
  onChange: (v: string[]) => void;
  error?: string;
}) {
  const [query, setQuery] = useState(""),
    id = useId();
  const results = items
    .filter((e) =>
      entityName(e)
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    )
    .slice(0, 12);
  return (
    <div className="reference-picker">
      <label htmlFor={id}>{label}</label>
      <div className="search-input">
        <MagnifyingGlassIcon aria-hidden />
        <input
          id={id}
          aria-invalid={Boolean(error)}
          placeholder="搜索标题，选择关联内容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="selected-tags" aria-live="polite">
        {value.map((ref) => (
          <button
            type="button"
            className="selected-tag"
            key={ref}
            aria-label={
              "移除" +
              (items.find((e) => e.id === ref)
                ? entityName(items.find((e) => e.id === ref)!)
                : "已失效关联")
            }
            onClick={() => onChange(value.filter((x) => x !== ref))}
          >
            {items.find((e) => e.id === ref)
              ? entityName(items.find((e) => e.id === ref)!)
              : "已失效关联"}
            <Cross2Icon />
          </button>
        ))}
      </div>
      {(query || !value.length) && (
        <div
          className="reference-results"
          role="group"
          aria-label={label + "搜索结果"}
        >
          {results.map((e) => (
            <button
              type="button"
              key={e.id}
              aria-pressed={value.includes(e.id)}
              onClick={() => {
                onChange(
                  value.includes(e.id)
                    ? value.filter((x) => x !== e.id)
                    : [...value, e.id],
                );
                setQuery("");
              }}
            >
              <span>{entityName(e)}</span>
              <small>{kindLabels[e.kind]}</small>
              {value.includes(e.id) && <CheckIcon />}
            </button>
          ))}
          {!results.length && (
            <p className="muted">没有匹配内容，已有选择会保留。</p>
          )}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
