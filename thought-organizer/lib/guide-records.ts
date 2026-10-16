import { all, one } from "./db";
import { getGuide, guideScope } from "./guidance";
import { GuideSession } from "./guidance-schema";
import { fail } from "./schema";
export function compactGuide(s: GuideSession): GuideSession {
  const last = one<{ state: string; created_at: string; message: string }>(
    "SELECT state,created_at,CASE WHEN state='error' THEN result ELSE '' END AS message FROM guidance_requests WHERE session_id=? ORDER BY created_at DESC LIMIT 1",
    s.id,
  );
  return {
    ...s,
    lastRequest: last
      ? { state: last.state, createdAt: last.created_at, message: last.message }
      : undefined,
    requests: undefined,
    data: {
      ...s.data,
      runs: s.data.runs.slice(-1).map((r) => ({ ...r, snapshot: "" })),
    },
  };
}
export function guideRunRecords(
  owner: string,
  root: string,
  id: string | null,
  cursor: string | null,
) {
  const s = getGuide(owner, root, false);
  if (id) {
    const row = one<{
      id: string;
      snapshot: string;
      result: string;
      state: string;
      stale: number;
      created_at: string;
    }>(
      "SELECT id,snapshot,result,state,stale,created_at FROM guidance_requests WHERE owner=? AND session_id=? AND id=?",
      owner,
      s.id,
      id,
    );
    const legacy = s.data.runs.find((r) => r.id === id);
    if (!row && !legacy) fail("这条运行记录不存在", 404);
    return row
      ? {
          id: row.id,
          snapshot: JSON.parse(row.snapshot),
          result: row.result,
          state: row.state,
          stale: !!row.stale || !!legacy?.stale,
          createdAt: row.created_at,
        }
      : {
          id: legacy!.id,
          snapshot: JSON.parse(legacy!.snapshot),
          result: legacy!.result,
          state: "success",
          stale: legacy!.stale,
          createdAt: legacy!.createdAt,
        };
  }
  const rows = all<{
    id: string;
    state: string;
    stale: number;
    created_at: string;
  }>(
    "SELECT id,state,stale,created_at FROM guidance_requests WHERE owner=? AND session_id=? ORDER BY created_at DESC",
    owner,
    s.id,
  );
  const records = rows.map((r) => ({
    id: r.id,
    state: r.state,
    stale: !!r.stale || !!s.data.runs.find((x) => x.id === r.id)?.stale,
    createdAt: r.created_at,
  }));
  const ids = new Set(records.map((r) => r.id));
  records.push(
    ...s.data.runs
      .filter((r) => !ids.has(r.id))
      .map((r) => ({
        id: r.id,
        state: "success",
        stale: r.stale,
        createdAt: r.createdAt,
      })),
  );
  records.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
  const start = cursor ? records.findIndex((r) => r.id === cursor) + 1 : 0;
  if (cursor && !start) fail("运行记录已变化，请刷新列表。", 409);
  const page = records.slice(start, start + 10);
  return {
    records: page,
    nextCursor: start + page.length < records.length ? page.at(-1)!.id : null,
    total: records.length,
  };
}
export function guideInputScope(owner: string, root: string) {
  const s = getGuide(owner, root, false);
  return {
    entities: guideScope(owner, root),
    answers: s.data.answers,
    outline: s.data.outline.entries,
    corrections: s.data.understandings,
    latestRunId:
      one<{ id: string }>(
        "SELECT id FROM guidance_requests WHERE owner=? AND session_id=? ORDER BY created_at DESC LIMIT 1",
        owner,
        s.id,
      )?.id ||
      s.data.runs.at(-1)?.id ||
      null,
  };
}
