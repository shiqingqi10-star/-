"use client";
import { Entity, cycleWarnings } from "@/lib/schema";
export default function Graph({
  items,
  onOpen,
}: {
  items: Entity[];
  onOpen: (e: Entity) => void;
}) {
  const cards = items.filter((x) => x.kind === "card");
  const w = 960,
    h = Math.max(340, Math.ceil(cards.length / 3) * 150 + 50);
  const point = new Map(
    cards.map((c, i) => [
      c.id,
      { x: 40 + (i % 3) * 310, y: 40 + Math.floor(i / 3) * 150 },
    ]),
  );
  const relations = items.filter(
    (x) =>
      x.kind === "relation" &&
      (x.data.from as string[]).every((id) => point.has(id)) &&
      (x.data.to as string[]).every((id) => point.has(id)),
  );
  return (
    <>
      <p className="muted">
        箭头表达当前推理，不证明因果关系。点击关系文字查看连接理由。
      </p>
      {cycleWarnings(items) && (
        <p className="alert">
          存在环形关系，建议检查；环路本身不代表逻辑错误。
        </p>
      )}
      <div className="graph">
        <svg width={w} height={h} role="img" aria-label="思路逻辑图">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#5e806c" />
            </marker>
          </defs>
          {relations.flatMap((r, ri) =>
            (r.data.from as string[]).map((id, i) => {
              const a = point.get(id)!,
                b = point.get((r.data.to as string[])[0])!;
              const ax = a.x + 130,
                ay = a.y + 75,
                bx = b.x + 130,
                by = b.y;
              return (
                <g key={r.id + id}>
                  <path
                    d={`M${ax},${ay} C${ax},${ay + 60 + ri * 2} ${bx},${by - 60} ${bx},${by}`}
                    fill="none"
                    stroke="#6f947b"
                    strokeWidth="1.5"
                    markerEnd="url(#arrow)"
                  />
                  <g
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onOpen(r);
                    }}
                  >
                    <text
                      x={(ax + bx) / 2 + 6 * i}
                      y={(ay + by) / 2 + (ri % 3) * 14}
                      fontSize="12"
                      fill="#315c43"
                      paintOrder="stroke"
                      stroke="#f9fbf7"
                      strokeWidth="4"
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
                onClick={() => onOpen(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(c);
                }}
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width="260"
                  height="80"
                  rx="10"
                  fill="white"
                  stroke="#b2c7b6"
                />
                <text x={p.x + 12} y={p.y + 22} fontSize="12" fill="#708075">
                  {String(c.data.type)} · {c.id.slice(0, 8)}
                </text>
                <text x={p.x + 12} y={p.y + 48} fontSize="14" fill="#274a36">
                  {String(c.data.title || c.data.content).slice(0, 17)}
                </text>
                <title>{String(c.data.content)}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}
