import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse, ApiError } from "../lib/http";
test("空响应、HTML及损坏JSON都显示可读提示，不泄露正文或JSON解析错误", async () => {
  for (const body of [
    "",
    "<html>private SQL database is locked password=hidden</html>",
    '{"error":',
  ]) {
    await assert.rejects(
      readApiResponse(new Response(body, { status: 500 })),
      (e) =>
        e instanceof ApiError &&
        e.status === 500 &&
        e.message.includes("HTTP 500") &&
        !/Unexpected|SQL|password|locked/.test(e.message),
    );
  }
  await assert.rejects(
    readApiResponse(new Response("", { status: 200 })),
    /空响应/,
  );
});
test("结构化503锁定错误与正常JSON保持状态和内容", async () => {
  await assert.rejects(
    readApiResponse(
      new Response(JSON.stringify({ error: "数据库暂时繁忙，请稍后重试。" }), {
        status: 503,
      }),
    ),
    (e) =>
      e instanceof ApiError &&
      e.status === 503 &&
      e.message.includes("数据库暂时繁忙"),
  );
  assert.deepEqual(
    await readApiResponse(new Response('{"ok":true}', { status: 200 })),
    { ok: true },
  );
});
