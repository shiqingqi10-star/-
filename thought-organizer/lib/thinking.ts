import { Entity, referenceFields } from "./schema";
export const UI_VERSION = "思考空间 · 2026.10.13-r2";
export function thinkingScope(items: Entity[], root: Entity): Entity[] {
  const pool = items.filter((e) => !e.deletedAt && e.owner === root.owner);
  if (root.kind === "topic")
    return pool.filter((e) => e.topic === root.id || e.id === root.id);
  const standalone = pool.filter((e) => !e.topic && e.kind !== "topic");
  const ids = new Set([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of standalone) {
      const refs = referenceFields(e.kind).flatMap(
        (k) => (e.data[k] as string[]) || [],
      );
      if (ids.has(e.id)) {
        for (const id of refs)
          if (standalone.some((x) => x.id === id) && !ids.has(id)) {
            ids.add(id);
            changed = true;
          }
      } else if (refs.some((id) => ids.has(id))) {
        ids.add(e.id);
        changed = true;
      }
    }
  }
  return standalone.filter((e) => ids.has(e.id));
}
export function thinkingUpdatedAt(items: Entity[], root: Entity) {
  return thinkingScope(items, root).reduce(
    (time, e) => (e.updatedAt > time ? e.updatedAt : time),
    root.updatedAt,
  );
}
export function recentThoughts(items: Entity[], cap = 3) {
  return items
    .filter(
      (e) =>
        !e.deletedAt &&
        !e.data.archived &&
        e.data.status !== "归档" &&
        (e.kind === "topic" || (e.kind === "record" && !e.topic)),
    )
    .sort((a, b) =>
      thinkingUpdatedAt(items, b).localeCompare(thinkingUpdatedAt(items, a)),
    )
    .slice(0, cap);
}
export function shortName(content: string) {
  return (
    content
      .trim()
      .split(/[。！？!?\n]/)[0]
      .slice(0, 42) || "一段新的思考"
  );
}
export const cardMeaning: Record<string, string> = {
  事实或观察: "看到的事实或观察",
  假设: "需要确认的条件",
  观点或推断: "当前观点",
  问题: "留下的疑问",
  结论: "当前结论",
  备选方案: "可以考虑的选择",
};
