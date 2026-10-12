import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { all, one, run, transaction } from "./db";
import { fail, dateInZone } from "./schema";
export type User = {
  id: string;
  email: string;
  role: string;
  settings: string;
};
export const cookieName = "thought_session";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const a = Buffer.from(key, "hex"),
    b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function rateLimit(key: string, max: number, seconds: number) {
  transaction(() => {
    const window = Math.floor(Date.now() / 1000 / seconds);
    run(
      "INSERT INTO rate_limits(key,count,window) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window",
      key,
      window,
    );
    if (
      one<{ count: number }>("SELECT count FROM rate_limits WHERE key=?", key)!
        .count > max
    )
      fail("请求太频繁，请稍后重试", 429);
  });
}
export function authenticate(req: Request): User {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!token) fail("请先登录", 401);
  const user = one<User>(
    "SELECT u.id,u.email,u.role,u.settings FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
    hash(token),
    Date.now(),
  );
  if (!user) fail("会话已过期，请重新登录", 401);
  return user;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_ORIGIN || "http://localhost:3000";
  if (origin !== expected) fail("同来源验证失败", 403);
}
export function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  run("DELETE FROM sessions WHERE expires<?", Date.now());
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    userId,
    Date.now() + 7 * 86400000,
  );
  return token;
}
export function authAction(
  action: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const email = String(body.email || "")
      .trim()
      .toLowerCase(),
    password = String(body.password || "");
  rateLimit("auth:" + hash(email), 15, 600);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 10 ||
    password.length > 128
  )
    fail("请输入邮箱及10至128位密码");
  if (action === "register") rateLimit("registration", 20, 3600);
  let user = one<User & { password: string }>(
    "SELECT * FROM users WHERE email=?",
    email,
  );
  if (action === "register") {
    if (user) fail("无法注册该账号");
    const id = randomUUID();
    run(
      "INSERT INTO users(id,email,password,created_at) VALUES(?,?,?,?)",
      id,
      email,
      passwordHash(password),
      new Date().toISOString(),
    );
    user = one<User & { password: string }>(
      "SELECT * FROM users WHERE id=?",
      id,
    );
  } else if (!user || !verifyPassword(password, user.password))
    fail("邮箱或密码错误", 401);
  const token = session(user!.id);
  const secure =
    new URL(process.env.APP_ORIGIN || req.url).protocol === "https:";
  return {
    user: { id: user!.id, email: user!.email, role: user!.role },
    cookie: `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? "; Secure" : ""}`,
  };
}
export function logout(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (token) run("DELETE FROM sessions WHERE token=?", hash(token));
}
export function removeAccount(user: User, password: string) {
  const row = one<{ password: string }>(
    "SELECT password FROM users WHERE id=?",
    user.id,
  );
  if (!row || !verifyPassword(password, row.password)) fail("密码错误", 403);
  transaction(() => {
    run("DELETE FROM links WHERE owner=?", user.id);
    run("DELETE FROM suggestions WHERE owner=?", user.id);
    run("DELETE FROM analyses WHERE owner=?", user.id);
    run("UPDATE entities SET topic=NULL WHERE owner=?", user.id);
    run("DELETE FROM users WHERE id=?", user.id);
  });
}
export function usage(owner: string, timezone = "Asia/Shanghai") {
  const now = Date.now(),
    today = dateInZone(new Date(now), timezone);
  const rows = all<{ created_at: number }>(
    "SELECT created_at FROM calls WHERE owner=? AND created_at>=?",
    owner,
    now - 40 * 86400000,
  );
  const days = rows.map((row) =>
    dateInZone(new Date(row.created_at), timezone),
  );
  return {
    calls: all(
      "SELECT state,count(*) count,sum(tokens) tokens,avg(ended_at-created_at) duration FROM calls WHERE owner=? GROUP BY state",
      owner,
    ),
    events: all(
      "SELECT event,count(*) count FROM metrics WHERE owner=? GROUP BY event",
      owner,
    ),
    todayUsed: days.filter((day) => day === today).length,
    monthUsed: days.filter((day) => day.startsWith(today.slice(0, 7))).length,
    rollingDayUsed: rows.filter((row) => row.created_at > now - 86400000)
      .length,
    rollingMonthUsed: rows.filter((row) => row.created_at > now - 30 * 86400000)
      .length,
    dailyLimit: Number(process.env.AI_DAILY_LIMIT || 20),
    monthlyLimit: Number(process.env.AI_MONTHLY_LIMIT || 100),
  };
}
