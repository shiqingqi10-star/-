import { validateOutput, validateSuggestion } from "./ai-schema";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction, metric } from "./db";
import {
  Entity,
  Kind,
  kinds,
  fail,
  validateData,
  referenceFields,
} from "./schema";
type Row = {
  id: string;
  owner: string;
  kind: Kind;
  topic: string | null;
  version: number;
  content_version: number;
  data: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
function decode(r: Row): Entity {
  return {
    id: r.id,
    owner: r.owner,
    kind: r.kind,
    topic: r.topic,
    version: r.version,
    contentVersion: r.content_version,
    data: JSON.parse(r.data),
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export function get(owner: string, id: string, deleted = false) {
  const r = one<Row>(
    "SELECT * FROM entities WHERE owner=? AND id=?",
    owner,
    id,
  );
  if (!r || (!deleted && r.deleted_at)) fail("项目不存在或无权访问", 404);
  return decode(r);
}
export function list(owner: string, deleted = false) {
  return all<Row>(
    "SELECT * FROM entities WHERE owner=? " +
      (deleted ? "" : "AND deleted_at IS NULL") +
      " ORDER BY updated_at DESC",
    owner,
  ).map(decode);
}
function references(
  owner: string,
  kind: Kind,
  topic: string | null,
  data: Record<string, unknown>,
  id?: string,
  preserveDeleted = false,
) {
  if (topic) {
    const t = get(owner, topic);
    if (t.kind !== "topic" || t.id === id) fail("主题归属无效");
  }
  const required: Record<string, Kind[]> = {
    from: ["card"],
    to: ["card"],
    sourceRefs: ["record", "card"],
    evidenceRefs: ["evidence"],
    hypothesisRefs: ["card"],
    taskRefs: ["task"],
    questionRefs: ["question"],
    parentRefs: ["task"],
    supports: ["card"],
    opposes: ["card"],
  };
  for (const key of referenceFields(kind)) {
    for (const target of (data[key] as string[]) || []) {
      if (target === id && key === "parentRefs") fail("任务不能是自己的子任务");
      const preserved =
        preserveDeleted &&
        id &&
        ((get(owner, id, true).data[key] as string[]) || []).includes(target);
      const e = get(owner, target, Boolean(preserved));
      if (required[key] && !required[key].includes(e.kind))
        fail("引用类型错误：" + key);
      if (kind === "relation" && e.topic !== topic)
        fail("逻辑关系仅能连接当前主题卡片");
      if (key === "hypothesisRefs" && e.data.type !== "假设")
        fail("验证目标必须是假设卡片");
    }
  }
  if (kind === "relation" && (data.to as string[]).length !== 1)
    fail("每条关系只能有一个目标结论");
}
function storeLinks(e: Entity) {
  run("DELETE FROM links WHERE source=?", e.id);
  for (const key of referenceFields(e.kind))
    for (const target of (e.data[key] as string[]) || [])
      run(
        "INSERT OR IGNORE INTO links VALUES(?,?,?,?)",
        e.owner,
        e.id,
        key,
        target,
      );
}
function createInternal(
  owner: string,
  kind: Kind,
  data: unknown,
  topic: string | null,
  id: string = randomUUID(),
  validate = true,
) {
  const d = validateData(kind, data);
  if (validate) references(owner, kind, topic, d);
  const now = new Date().toISOString();
  run(
    "INSERT INTO entities VALUES(?,?,?,?,1,1,?,NULL,?,?)",
    id,
    owner,
    kind,
    topic,
    JSON.stringify(d),
    now,
    now,
  );
  const e = get(owner, id);
  if (validate) storeLinks(e);
  metric(owner, "create_" + kind);
  return e;
}
export function create(
  owner: string,
  kind: Kind,
  data: unknown,
  topic: string | null,
) {
  if (!kinds.includes(kind)) fail("未知项目类型");
  return transaction(() => createInternal(owner, kind, data, topic));
}
const operationFields = new Set([
  "status",
  "today",
  "pinned",
  "archived",
  "order",
  "collapsed",
  "lastPosition",
]);
function updateInternal(
  owner: string,
  id: string,
  version: number,
  data: unknown,
  topic: string | null,
) {
  const e = get(owner, id);
  if (e.version !== version)
    fail("数据冲突：已保留输入，请刷新最新版本后合并", 409);
  const d = validateData(e.kind, data);
  references(owner, e.kind, topic, d, id, true);
  const changes = [
    ...new Set([...Object.keys(e.data), ...Object.keys(d)]),
  ].filter((k) => JSON.stringify(e.data[k]) !== JSON.stringify(d[k]));
  const contentChanged =
    e.topic !== topic || changes.some((k) => !operationFields.has(k));
  run(
    "INSERT INTO history(entity_id,owner,version,snapshot,created_at) VALUES(?,?,?,?,?)",
    id,
    owner,
    e.version,
    JSON.stringify(e),
    new Date().toISOString(),
  );
  run(
    "UPDATE entities SET data=?,topic=?,version=version+1,content_version=content_version+?,updated_at=? WHERE id=? AND owner=?",
    JSON.stringify(d),
    topic,
    contentChanged ? 1 : 0,
    new Date().toISOString(),
    id,
    owner,
  );
  const out = get(owner, id);
  storeLinks(out);
  if (e.kind === "task" && e.data.status !== "已完成" && d.status === "已完成")
    metric(
      owner,
      d.type === "验证任务" ? "complete_validation" : "complete_task",
    );
  if (e.kind === "review") metric(owner, "return_update");
  return out;
}
export function update(
  owner: string,
  id: string,
  version: number,
  data: unknown,
  topic: string | null,
) {
  return transaction(() => updateInternal(owner, id, version, data, topic));
}
// Use the existing reference/history model to keep standalone thoughts durable.
export function linkThinkingItem(
  owner: string,
  rootId: string,
  version: number,
  item: Entity,
) {
  return transaction(() => {
    const root = get(owner, rootId);
    if (
      root.kind !== "record" ||
      root.topic ||
      item.owner !== owner ||
      item.topic ||
      item.kind === "topic"
    )
      fail("独立思考关联无效");
    return updateInternal(
      owner,
      root.id,
      version,
      {
        ...root.data,
        refs: [...new Set([...((root.data.refs as string[]) || []), item.id])],
      },
      null,
    );
  });
}
export function createThinkingItem(
  owner: string,
  rootId: string,
  version: number,
  kind: Kind,
  data: unknown,
) {
  return transaction(() => {
    const root = get(owner, rootId);
    if (root.version !== version)
      fail("数据冲突：已保留输入，请刷新最新版本后合并", 409);
    if (root.kind !== "record" || root.topic || kind === "topic")
      fail("独立思考关联无效");
    const item = createInternal(owner, kind, data, null);
    linkThinkingItem(owner, rootId, version, item);
    return item;
  });
}
export function impact(owner: string, id: string) {
  get(owner, id, true);
  return all<{ source: string; field: string }>(
    "SELECT source,field FROM links WHERE owner=? AND target=?",
    owner,
    id,
  );
}
export function softDelete(
  owner: string,
  id: string,
  version: number,
  restore = false,
) {
  return transaction(() => {
    const e = get(owner, id, true);
    if (e.version !== version) fail("数据冲突", 409);
    if (restore) {
      if (e.topic) get(owner, e.topic);
      references(owner, e.kind, e.topic, e.data, e.id);
    }
    run(
      "UPDATE entities SET deleted_at=?,version=version+1,content_version=content_version+1,updated_at=? WHERE owner=? AND id=?",
      restore ? null : new Date().toISOString(),
      new Date().toISOString(),
      owner,
      id,
    );
    return get(owner, id, true);
  });
}
export function history(owner: string, id: string) {
  get(owner, id, true);
  return all<{ version: number; snapshot: string; created_at: string }>(
    "SELECT version,snapshot,created_at FROM history WHERE owner=? AND entity_id=? ORDER BY id DESC",
    owner,
    id,
  ).map((x) => ({ ...x, snapshot: JSON.parse(x.snapshot) }));
}
export function undo(
  owner: string,
  id: string,
  version: number,
  targetVersion: number,
) {
  const h = history(owner, id).find((x) => x.version === targetVersion);
  if (!h) fail("历史版本不存在", 404);
  return update(owner, id, version, h.snapshot.data, h.snapshot.topic);
}
export function transform(
  owner: string,
  ids: string[],
  versions: Record<string, number>,
  parts: string[] | null,
) {
  return transaction(() => {
    const before = list(owner, true);
    if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
      fail("卡片选择无效");
    const old = ids.map((id) => get(owner, id));
    if (old.some((x) => x.kind !== "card" || x.topic !== old[0].topic))
      fail("只能处理同一主题的卡片");
    if (old.some((x) => x.version !== versions[x.id])) fail("数据冲突", 409);
    if (
      parts &&
      (old.length !== 1 ||
        parts.length < 2 ||
        parts.length > 20 ||
        parts.some((x) => !x.trim()))
    )
      fail("拆分至少输入两段内容");
    const content = parts || [
      old.map((x) => String(x.data.content)).join("\n\n"),
    ];
    const sources = [
      ...new Set(old.flatMap((x) => (x.data.sourceRefs as string[]) || [])),
    ];
    const evidence = [
      ...new Set(old.flatMap((x) => (x.data.evidenceRefs as string[]) || [])),
    ];
    const added = content.map((text) =>
      createInternal(
        owner,
        "card",
        {
          ...old[0].data,
          title: parts ? "" : old[0].data.title,
          content: text,
          sourceRefs: sources,
          evidenceRefs: evidence,
        },
        old[0].topic,
      ),
    );
    // Rewrite live references transactionally; history records keep their original stable IDs.
    const linked = all<{ source: string }>(
      "SELECT DISTINCT source FROM links WHERE owner=? AND target IN (" +
        ids.map(() => "?").join(",") +
        ")",
      owner,
      ...ids,
    );
    for (const { source } of linked) {
      if (ids.includes(source)) continue;
      const e = get(owner, source, true);
      if (e.deletedAt) continue;
      const d = { ...e.data };
      for (const key of referenceFields(e.kind)) {
        const before = (d[key] as string[]) || [];
        if (before.some((id) => ids.includes(id))) {
          const replacements =
            e.kind === "relation" && key === "to"
              ? [added[0].id]
              : added.map((x) => x.id);
          d[key] = [
            ...new Set(
              before.flatMap((id) => (ids.includes(id) ? replacements : [id])),
            ),
          ];
        }
      }
      updateInternal(owner, e.id, e.version, d, e.topic);
      // If a split card was a conclusion, retain an explicit relation for each additional card.
      if (
        parts &&
        e.kind === "relation" &&
        (e.data.to as string[]).includes(ids[0])
      )
        for (const a of added.slice(1))
          createInternal(owner, "relation", { ...d, to: [a.id] }, e.topic);
    }
    for (const e of old)
      run(
        "UPDATE entities SET deleted_at=?,version=version+1,content_version=content_version+1 WHERE id=?",
        new Date().toISOString(),
        e.id,
      );
    const after = list(owner, true).filter(
      (e) => !before.some((b) => b.id === e.id && b.version === e.version),
    );
    run(
      "INSERT INTO operations(id,owner,snapshot,created_at) VALUES(?,?,?,?)",
      randomUUID(),
      owner,
      JSON.stringify({
        before: before.filter((b) => after.some((a) => a.id === b.id)),
        created: after
          .filter((a) => !before.some((b) => b.id === a.id))
          .map((a) => a.id),
        after: after.map((e) => ({ id: e.id, version: e.version })),
      }),
      new Date().toISOString(),
    );
    return added;
  });
}
export function operations(owner: string) {
  return all<{ id: string; created_at: string; undone: number }>(
    "SELECT id,created_at,undone FROM operations WHERE owner=? ORDER BY created_at DESC",
    owner,
  );
}
export function undoOperation(owner: string, id: string) {
  return transaction(() => {
    const row = one<{ snapshot: string; undone: number }>(
      "SELECT snapshot,undone FROM operations WHERE id=? AND owner=?",
      id,
      owner,
    );
    if (!row) fail("操作不存在", 404);
    if (row.undone) fail("此操作已撤销");
    const s = JSON.parse(row.snapshot) as {
      before: Entity[];
      created: string[];
      after: { id: string; version: number }[];
    };
    for (const e of s.after)
      if (get(owner, e.id, true).version !== e.version)
        fail("后续已编辑关联内容，不能整体撤销，请使用历史手动恢复", 409);
    for (const e of s.before) {
      const current = get(owner, e.id, true);
      run(
        "INSERT INTO history(entity_id,owner,version,snapshot,created_at) VALUES(?,?,?,?,?)",
        e.id,
        owner,
        current.version,
        JSON.stringify(current),
        new Date().toISOString(),
      );
      run(
        "UPDATE entities SET data=?,topic=?,deleted_at=?,version=version+1,content_version=content_version+1,updated_at=? WHERE id=? AND owner=?",
        JSON.stringify(e.data),
        e.topic,
        e.deletedAt,
        new Date().toISOString(),
        e.id,
        owner,
      );
      storeLinks(get(owner, e.id, true));
    }
    for (const created of s.created)
      run(
        "UPDATE entities SET deleted_at=?,version=version+1,content_version=content_version+1 WHERE id=? AND owner=?",
        new Date().toISOString(),
        created,
        owner,
      );
    run("UPDATE operations SET undone=1 WHERE id=? AND owner=?", id, owner);
    return { ok: true };
  });
}
export function exportData(owner: string) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entities: list(owner, true).map(({ owner: _, ...e }) => {
      void _;
      return e;
    }),
    history: all<{
      entity_id: string;
      version: number;
      snapshot: string;
      created_at: string;
    }>(
      "SELECT entity_id,version,snapshot,created_at FROM history WHERE owner=?",
      owner,
    ).map((h) => ({
      ...h,
      snapshot: { ...JSON.parse(h.snapshot), owner: undefined },
    })),
    analyses: all<{
      id: string;
      topic: string | null;
      mode: string;
      snapshot: string;
      result: string;
      created_at: string;
    }>(
      "SELECT id,topic,mode,snapshot,result,created_at FROM analyses WHERE owner=?",
      owner,
    ),
    suggestions: all(
      "SELECT id,analysis_id,kind,data,status,target,feedback FROM suggestions WHERE owner=?",
      owner,
    ),
  };
}
export function importData(owner: string, body: unknown) {
  if (!body || typeof body !== "object") fail("备份格式错误");
  const b = body as ReturnType<typeof exportData>;
  if (
    b.schemaVersion !== 1 ||
    !Array.isArray(b.entities) ||
    b.entities.length > 10000
  )
    fail("备份版本或大小不支持");
  return transaction(() => {
    const entityShape = z
      .object({
        id: z.string().min(1).max(100),
        kind: z.enum(kinds),
        topic: z.string().max(100).nullable(),
        version: z.number().int().positive().max(2147483647),
        contentVersion: z.number().int().positive().max(2147483647),
        deletedAt: z.iso.datetime().nullable(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
        data: z.record(z.string(), z.unknown()),
      })
      .strict();
    if (!z.array(entityShape).max(10000).safeParse(b.entities).success)
      fail("备份实体元数据格式错误");
    if (
      !Array.isArray(b.history || []) ||
      !Array.isArray(b.analyses || []) ||
      !Array.isArray(b.suggestions || [])
    )
      fail("备份历史或分析格式错误");
    const map = new Map<string, string>();
    for (const e of b.entities) {
      if (
        !e.id ||
        typeof e.id !== "string" ||
        !kinds.includes(e.kind) ||
        map.has(e.id)
      )
        fail("备份编号或类型无效");
      map.set(
        e.id,
        one("SELECT id FROM entities WHERE id=?", e.id) ? randomUUID() : e.id,
      );
    }
    const remap = (id: string) => {
      const m = map.get(id);
      if (!m) fail("备份含未知引用");
      return m;
    };
    const mapped = b.entities.map((e) => {
      const data = validateData(e.kind, e.data);
      for (const k of referenceFields(e.kind))
        if (data[k]) data[k] = (data[k] as string[]).map(remap);
      return {
        ...e,
        id: remap(e.id),
        topic: e.topic ? remap(e.topic) : null,
        data,
      };
    });
    for (const e of mapped.filter((x) => x.kind === "topic"))
      createInternal(owner, e.kind, e.data, null, e.id, false);
    for (const e of mapped.filter((x) => x.kind !== "topic")) {
      if (e.topic && mapped.find((x) => x.id === e.topic)?.kind !== "topic")
        fail("主题引用错误");
      createInternal(owner, e.kind, e.data, e.topic, e.id, false);
    }
    // Validate every reference after all entities exist, before committing.
    for (const e of mapped) {
      references(owner, e.kind, e.topic, e.data, e.id);
      storeLinks(get(owner, e.id));
      run(
        "UPDATE entities SET version=?,content_version=?,created_at=?,updated_at=? WHERE id=?",
        e.version,
        e.contentVersion,
        e.createdAt,
        e.updatedAt,
        e.id,
      );
    }
    for (const e of mapped)
      if (e.deletedAt)
        run("UPDATE entities SET deleted_at=? WHERE id=?", e.deletedAt, e.id);
    for (const h of b.history || []) {
      const s = h.snapshot as unknown as Entity;
      const kind = mapped.find((e) => e.id === remap(h.entity_id))!.kind;
      const d = validateData(kind, s.data);
      for (const k of referenceFields(kind))
        if (d[k]) d[k] = (d[k] as string[]).map(remap);
      run(
        "INSERT INTO history(entity_id,owner,version,snapshot,created_at) VALUES(?,?,?,?,?)",
        remap(h.entity_id),
        owner,
        Number(h.version),
        JSON.stringify({
          ...s,
          id: remap(h.entity_id),
          owner,
          kind,
          topic: s.topic ? remap(s.topic) : null,
          data: d,
        }),
        String(h.created_at),
      );
    }
    // Imported analysis snapshots are historical only; they cannot be applied over newer content.
    const rewrite = (v: unknown): unknown =>
      typeof v === "string"
        ? map.get(v) || v
        : Array.isArray(v)
          ? v.map(rewrite)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, rewrite(x)]),
              )
            : v;
    const analyses = new Map<string, string>();
    for (const a of b.analyses || []) {
      const id = randomUUID();
      analyses.set(a.id, id);
      const snap = JSON.parse(a.snapshot) as Entity[];
      const result = validateOutput(JSON.parse(a.result), snap);
      const snapshot = snap.map((e) => ({
        ...e,
        id: remap(e.id),
        owner,
        topic: e.topic ? remap(e.topic) : null,
        data: rewrite(e.data),
        contentVersion: -1,
      }));
      run(
        "INSERT INTO analyses VALUES(?,?,?,?,?,?,?)",
        id,
        owner,
        a.topic ? remap(a.topic) : null,
        String(a.mode),
        JSON.stringify(snapshot),
        JSON.stringify(rewrite(result)),
        String(a.created_at),
      );
    }
    for (const raw of b.suggestions || []) {
      const s = raw as {
        analysis_id: string;
        kind: string;
        data: string;
        status: string;
        target: string | null;
        feedback: string;
      };
      if (
        !["pending", "accepted", "ignored"].includes(s.status) ||
        typeof s.feedback !== "string" ||
        s.feedback.length > 2000
      )
        fail("备份建议状态错误");
      const analysis = analyses.get(s.analysis_id);
      if (!analysis) fail("分析引用错误");
      run(
        "INSERT INTO suggestions VALUES(?,?,?,?,?,?,?,?)",
        randomUUID(),
        analysis,
        owner,
        s.kind,
        JSON.stringify(rewrite(validateSuggestion(s.kind, JSON.parse(s.data)))),
        s.status,
        s.target ? remap(s.target) : null,
        s.feedback,
      );
    }
    metric(owner, "import");
    return { imported: mapped.length, ids: Object.fromEntries(map) };
  });
}
export function markdown(owner: string) {
  const entries = list(owner);
  return (
    "# 思路整理器\n\n" +
    entries
      .map(
        (e) =>
          "## " +
          e.kind +
          " · " +
          String(e.data.title || e.data.content || e.id) +
          "\n\n编号：" +
          e.id +
          "\n主题：" +
          (e.topic || "收集箱") +
          "\n\n" +
          Object.entries(e.data)
            .map(
              ([k, v]) =>
                "- " + k + ": " + (Array.isArray(v) ? v.join(", ") : String(v)),
            )
            .join("\n"),
      )
      .join("\n\n")
  );
}
