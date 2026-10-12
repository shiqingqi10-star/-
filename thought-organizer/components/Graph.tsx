"use client";
import { useId } from "react";
import { Entity, cycleWarnings } from "@/lib/schema";
import { entityName } from "@/lib/presentation";
export default function Graph({
  items,
  onOpen,
}: {
  items: Entity[];
  onOpen: (e: Entity) => void;
}) {
  const marker = useId().replaceAll(":", "");
  const cards = items
    .filter((e) => e.kind === "card" && !e.deletedAt)
    .sort((a, b) => Number(a.data.order || 0) - Number(b.data.order || 0));
  const w = 1120,
    h = Math.max(340, Math.ceil(cards.length / 3) * 170 + 90);
  const point = new Map(
    cards.map((c, i) => [
      c.id,
      { x: 40 + (i % 3) * 320, y: 45 + Math.floor(i / 3) * 170 },
    ]),
  );
  const relations = items.filter(
    (e) =>
      e.kind === "relation" &&
      !e.deletedAt &&
      ((e.data.from as string[]) || []).every((id) => point.has(id)) &&
      ((e.data.to as string[]) || []).every((id) => point.has(id)),
  );
  return (
    <>
      <p className="muted graph-help">
        连线表达当前推理，不证明因果。点击卡片或关系查看完整内容。
      </p>
      {cycleWarnings(items) && (
        <p className="notice warning">
          存在环形关系，建议检查；环路本身不代表逻辑错误。
        </p>
      )}
      {cards.length === 0 ? (
        <div className="empty-state">先添加卡片，再把思路连接起来。</div>
      ) : (
        <div
          className="graph"
          role="region"
          aria-label="可滚动逻辑图"
          tabIndex={0}
        >
          <svg width={w} height={h} role="group" aria-label="思路逻辑图">
            <defs>
              <marker
                id={marker}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--graph-line)" />
              </marker>
            </defs>
            {relations.flatMap((r, ri) =>
              (r.data.from as string[]).map((id, i) => {
                const a = point.get(id)!,
                  b = point.get((r.data.to as string[])[0])!,
                  ax = a.x + 135,
                  ay = a.y + 95,
                  bx = b.x + 135,
                  by = b.y;
                const loop = id === (r.data.to as string[])[0];
                const d = loop
                  ? `M${ax + 135},${ay - 40} C${ax + 210},${ay - 140} ${ax + 190},${ay + 50} ${ax + 135},${ay - 10}`
                  : `M${ax},${ay} C${ax},${ay + 60 + ri * 2} ${bx},${by - 60} ${bx},${by}`;
                return (
                  <g key={r.id + id}>
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--graph-line)"
                      strokeWidth="1.5"
                      markerEnd={"url(#" + marker + ")"}
                    />
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={
                        "查看关系：" +
                        String(r.data.type) +
                        "，" +
                        String(r.data.reason || "未填写理由")
                      }
                      onClick={() => onOpen(r)}
                      onKeyDown={(e) => {
                        if (["Enter", " "].includes(e.key)) {
                          e.preventDefault();
                          onOpen(r);
                        }
                      }}
                    >
                      <text
                        x={(ax + bx) / 2 + 6 * i}
                        y={(ay + by) / 2 + (ri % 3) * 16}
                        fontSize="12"
                        fill="var(--accent)"
                        paintOrder="stroke"
                        stroke="var(--background)"
                        strokeWidth="5"
                      >
                        {String(r.data.type)} ·{" "}
                        {String(r.data.reason || "查看理由").slice(0, 14)}
                      </text>
                      <title>{String(r.data.reason)}</title>
                    </g>
                  </g>
                );
              }),
            )}
            {cards.map((c) => {
              const p = point.get(c.id)!;
              return (
                <g
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={"查看卡片：" + entityName(c)}
                  onClick={() => onOpen(c)}
                  onKeyDown={(e) => {
                    if (["Enter", " "].includes(e.key)) {
                      e.preventDefault();
                      onOpen(c);
                    }
                  }}
                >
                  <rect
                    x={p.x}
                    y={p.y}
                    width="270"
                    height="95"
                    rx="10"
                    fill="var(--surface)"
                    stroke="var(--border)"
                  />
                  <text
                    x={p.x + 16}
                    y={p.y + 25}
                    fontSize="12"
                    fill="var(--secondary)"
                  >
                    {String(c.data.type || "思路卡片")}
                    {c.data.group ? " · " + String(c.data.group) : ""}
                  </text>
                  <text
                    x={p.x + 16}
                    y={p.y + 55}
                    fontSize="14"
                    fill="var(--text)"
                  >
                    {entityName(c).slice(0, 17)}
                  </text>
                  <title>{String(c.data.content)}</title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </>
  );
}
