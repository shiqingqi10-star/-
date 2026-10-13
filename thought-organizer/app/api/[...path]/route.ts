import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  authenticate,
  authAction,
  cookieName,
  logout,
  sameOrigin,
  usage,
  removeAccount,
  rateLimit,
} from "@/lib/auth";
import {
  list,
  get,
  create,
  createThinkingItem,
  update,
  softDelete,
  impact,
  history,
  undo,
  transform,
  operations,
  undoOperation,
  exportData,
  importData,
  markdown,
} from "@/lib/service";
import { analyze, analysisList, applySuggestion, configured } from "@/lib/ai";
import { all, one, run } from "@/lib/db";
import { Kind, fail, AppError, kinds } from "@/lib/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const mutation = z.object({
  kind: z.enum(kinds).optional(),
  data: z.record(z.string(), z.unknown()),
  topic: z.string().nullable(),
  version: z.number().int().positive().optional(),
});
async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      fail("请求超过2MB限制", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail("请求不是合法JSON");
  }
}
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const started = Date.now();
  try {
    const path = (await context.params).path;
    const route = path[0],
      id = path[1],
      action = path[2];
    const writing = !["GET", "HEAD"].includes(req.method);
    if (writing) sameOrigin(req);
    const b = writing ? await readBody(req) : {};
    if (
      route === "auth" &&
      ["register", "login"].includes(id) &&
      req.method === "POST"
    ) {
      const auth = authAction(id, b, req);
      const r = reply(auth.user);
      r.headers.set("Set-Cookie", auth.cookie);
      return r;
    }
    const user = authenticate(req);
    if (writing) rateLimit("write:" + user.id, 200, 60);
    if (route === "auth" && id === "logout" && req.method === "POST") {
      logout(req);
      const r = reply({ ok: true });
      r.headers.set(
        "Set-Cookie",
        `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      );
      return r;
    }
    if (route === "me" && req.method === "GET")
      return reply({
        ...user,
        settings: {
          timezone: "Asia/Shanghai",
          reminders: true,
          ...JSON.parse(user.settings),
        },
        aiConfigured: configured(),
        usage: usage(
          user.id,
          JSON.parse(user.settings).timezone || "Asia/Shanghai",
        ),
      });
    if (route === "settings" && req.method === "PATCH") {
      const settings = z
        .object({ timezone: z.string().max(100), reminders: z.boolean() })
        .strict()
        .parse(b);
      try {
        new Intl.DateTimeFormat("en", { timeZone: settings.timezone }).format();
      } catch {
        fail("时区无效");
      }
      run(
        "UPDATE users SET settings=? WHERE id=?",
        JSON.stringify(settings),
        user.id,
      );
      return reply(settings);
    }
    if (route === "account" && req.method === "DELETE") {
      removeAccount(user, String(b.password || ""));
      return reply({ ok: true });
    }
    if (
      route === "thoughts" &&
      id &&
      action === "items" &&
      req.method === "POST"
    ) {
      const v = z
        .object({
          kind: z.enum(kinds),
          data: z.record(z.string(), z.unknown()),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(b);
      return reply(
        createThinkingItem(user.id, id, v.version, v.kind, v.data),
        201,
      );
    }
    if (route === "entities") {
      if (req.method === "GET") {
        if (id) {
          if (action === "history") return reply(history(user.id, id));
          if (action === "impact") return reply(impact(user.id, id));
          return reply(get(user.id, id));
        }
        return reply(
          list(user.id, req.nextUrl.searchParams.get("trash") === "1"),
        );
      }
      if (req.method === "POST" && !id) {
        const m = mutation.parse(b);
        if (!m.kind) fail("需要项目类型");
        return reply(create(user.id, m.kind, m.data, m.topic), 201);
      }
      if (id && req.method === "PATCH") {
        const m = mutation.parse(b);
        if (!m.version) fail("需要编辑版本");
        return reply(update(user.id, id, m.version, m.data, m.topic));
      }
      if (id && req.method === "DELETE")
        return reply(
          softDelete(user.id, id, z.number().int().positive().parse(b.version)),
        );
      if (id && req.method === "POST" && action === "restore")
        return reply(
          softDelete(
            user.id,
            id,
            z.number().int().positive().parse(b.version),
            true,
          ),
        );
      if (id && req.method === "POST" && action === "undo")
        return reply(
          undo(
            user.id,
            id,
            z.number().parse(b.version),
            z.number().parse(b.targetVersion),
          ),
        );
    }
    if (route === "transform" && req.method === "POST") {
      const v = z
        .object({
          ids: z.array(z.string()).min(1).max(50),
          versions: z.record(z.string(), z.number().int().positive()),
          parts: z
            .array(z.string().min(1).max(50000))
            .min(2)
            .max(20)
            .nullable(),
        })
        .parse(b);
      return reply(transform(user.id, v.ids, v.versions, v.parts));
    }
    if (route === "operations") {
      if (req.method === "GET") return reply(operations(user.id));
      if (req.method === "POST" && id) return reply(undoOperation(user.id, id));
    }
    if (route === "search" && req.method === "GET") {
      const q = (req.nextUrl.searchParams.get("q") || "")
        .trim()
        .toLocaleLowerCase();
      if (q.length > 200) fail("搜索文本过长");
      const rows = list(user.id);
      return reply(
        rows.filter(
          (e) =>
            JSON.stringify(e.data).toLocaleLowerCase().includes(q) ||
            String(rows.find((t) => t.id === e.topic)?.data.title || "")
              .toLocaleLowerCase()
              .includes(q),
        ),
      );
    }
    if (route === "export" && req.method === "GET") {
      const md = req.nextUrl.searchParams.get("format") === "md";
      return new NextResponse(
        md ? markdown(user.id) : JSON.stringify(exportData(user.id), null, 2),
        {
          headers: {
            "Content-Type": md
              ? "text/markdown; charset=utf-8"
              : "application/json",
            "Content-Disposition": `attachment; filename="thoughts.${md ? "md" : "json"}"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (route === "import" && req.method === "POST")
      return reply(importData(user.id, b));
    if (route === "analyses") {
      if (req.method === "GET")
        return reply(
          analysisList(user.id, req.nextUrl.searchParams.get("topic") || null),
        );
      if (req.method === "POST") {
        const data = z
          .object({
            topic: z.string().nullable(),
            ids: z.array(z.string()).max(200),
            mode: z.string(),
            answers: z.string().max(10000).optional(),
          })
          .strict()
          .parse(b);
        return reply(await analyze(user.id, data));
      }
    }
    if (route === "suggestions" && id && req.method === "POST") {
      const data = z
        .object({
          action: z.enum(["accept", "ignore"]),
          kind: z.enum(kinds).optional(),
          data: z.record(z.string(), z.unknown()).optional(),
          feedback: z.string().max(2000).optional(),
          recordId: z.string().optional(),
          recordVersion: z.number().int().positive().optional(),
        })
        .parse(b);
      return reply(applySuggestion(user.id, id, data));
    }
    if (route === "feedback" && req.method === "POST") {
      const data = z
        .object({
          analysisId: z.string().nullable(),
          rating: z.enum(["有用", "部分有用", "无用"]),
          comment: z.string().max(2000),
        })
        .parse(b);
      if (
        data.analysisId &&
        !one(
          "SELECT id FROM analyses WHERE id=? AND owner=?",
          data.analysisId,
          user.id,
        )
      )
        fail("分析不存在", 404);
      run(
        "INSERT INTO feedback VALUES(?,?,?,?,?,?)",
        randomUUID(),
        user.id,
        data.analysisId,
        data.rating,
        data.comment,
        new Date().toISOString(),
      );
      return reply({ ok: true });
    }
    if (route === "admin" && req.method === "GET") {
      if (user.role !== "admin") fail("需要管理员权限", 403);
      return reply({
        calls: all(
          "SELECT state,count(*) count,sum(tokens) tokens,avg(ended_at-created_at) duration FROM calls GROUP BY state",
        ),
        metrics: all("SELECT event,count(*) count FROM metrics GROUP BY event"),
        errors: all(
          "SELECT category,status,count(*) count,avg(duration) duration FROM errors GROUP BY category,status",
        ),
      });
    }
    fail("接口不存在", 404);
  } catch (e) {
    const code =
      e instanceof AppError
        ? e.code
        : e instanceof z.ZodError
          ? "字段校验失败"
          : "服务暂时不可用";
    const status =
      e instanceof AppError ? e.status : e instanceof z.ZodError ? 400 : 500;
    if (status >= 500) {
      const category = e instanceof AppError ? "service" : "internal",
        duration = Date.now() - started;
      console.error(JSON.stringify({ category, status, duration }));
      try {
        run(
          "INSERT INTO errors(category,status,duration,created_at) VALUES(?,?,?,?)",
          category,
          status,
          duration,
          new Date().toISOString(),
        );
      } catch {}
    }
    return reply({ error: code }, status);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
