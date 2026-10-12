"use client";
import { useState } from "react";
export type User = {
  id: string;
  email: string;
  role: string;
  settings: { timezone: string; reminders: boolean };
  aiConfigured: boolean;
  usage: {
    dailyLimit: number;
    monthlyLimit: number;
    todayUsed?: number;
    monthUsed?: number;
    rollingDayUsed?: number;
    rollingMonthUsed?: number;
    calls: {
      state: string;
      count: number;
      tokens: number | null;
      duration: number | null;
    }[];
    events: unknown[];
  };
};
export default function Settings({
  user,
  busy,
  onSave,
  onImport,
  onDelete,
  onGuide,
}: {
  user: User;
  busy: boolean;
  onSave: (data: unknown) => Promise<unknown>;
  onImport: (data: unknown) => Promise<unknown>;
  onDelete: (password: string) => Promise<unknown>;
  onGuide: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="settings-stack">
      <section className="settings-section surface">
        <h2>账号与偏好</h2>
        <p className="muted">{user.email} · 内容默认私人</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void onSave({
              timezone: form.get("timezone"),
              reminders: form.get("reminders") === "on",
            });
          }}
        >
          <label>
            <span>时区</span>
            <input name="timezone" defaultValue={user.settings.timezone} />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="reminders"
              defaultChecked={user.settings.reminders}
            />
            <span>工具内日期提醒</span>
          </label>
          <button disabled={busy}>保存偏好</button>
        </form>
      </section>
      <section className="settings-section surface">
        <h2>AI与用量</h2>
        <p>
          {user.aiConfigured ? "AI已配置" : "AI尚未配置"}{" "}
          <button className="text-button" onClick={onGuide}>
            配置说明
          </button>
        </p>
        <div className="usage-grid">
          <div>
            <span>今日已用</span>
            <strong>
              {user.usage.todayUsed ?? "暂不可用"} <small>次</small>
            </strong>
          </div>
          <div>
            <span>月度已用</span>
            <strong>
              {user.usage.monthUsed ?? "暂不可用"} <small>次</small>
            </strong>
          </div>
        </div>
        <p className="muted">
          调用额度：最近24小时 {user.usage.rollingDayUsed ?? "暂不可用"} /{" "}
          {user.usage.dailyLimit} 次，最近30天{" "}
          {user.usage.rollingMonthUsed ?? "暂不可用"} /{" "}
          {user.usage.monthlyLimit} 次。失败调用也计入额度。
        </p>
      </section>
      <section className="settings-section surface">
        <h2>导出与恢复</h2>
        <p className="muted">保留一份自己的记录，或从个人备份中恢复。</p>
        <div className="bar">
          <a className="button-link" download href="/api/export?format=md">
            导出 Markdown
          </a>
          <a className="button-link" download href="/api/export">
            下载个人备份
          </a>
        </div>
        <label className="import-label">
          <span>恢复个人备份</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              try {
                if (file.size > 2 * 1024 * 1024)
                  throw new Error("备份超过2MB，请使用较小的个人备份。");
                await onImport(JSON.parse(await file.text()));
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "无法读取备份文件。",
                );
              }
              e.target.value = "";
            }}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <details className="disclosure">
          <summary>备份与回收站说明</summary>
          <p>
            恢复个人备份不会覆盖其他账号的数据。回收站内容会保留，直到删除账号；恢复主题后，再恢复其所属内容。
          </p>
          <p>
            个人备份不能替代服务器数据库备份。服务器操作方法见工程的备份说明。
          </p>
        </details>
      </section>
      <section className="settings-section">
        <h2>删除账号</h2>
        <p className="muted">这会永久删除账号与全部记录，无法从回收站恢复。</p>
        <button
          className="danger-button"
          onClick={() => {
            if (!confirm("确定永久删除账号和全部内容吗？此操作无法撤销。"))
              return;
            const password = prompt("请输入账号密码确认删除");
            if (password) void onDelete(password);
          }}
        >
          删除账号及全部数据
        </button>
      </section>
    </div>
  );
}
