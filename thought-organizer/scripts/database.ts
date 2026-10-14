import { backup, DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import {
  mkdirSync,
  existsSync,
  renameSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
const action = process.argv[2],
  target = resolve(process.argv[3] || "backups/thoughts.sqlite");
const { db, databasePath, getDatabase } = await import("../lib/db");
if (action === "init") {
  getDatabase();
  console.log("数据库初始化完成：" + databasePath);
  db.close();
} else if (action === "backup") {
  if (target === databasePath) throw new Error("备份路径不能与数据库相同");
  mkdirSync(dirname(target), { recursive: true });
  await backup(getDatabase(), target);
  chmodSync(target, 0o600);
  const check = new DatabaseSync(target, { readOnly: true });
  if (check.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
    throw new Error("备份完整性检查失败");
  check.close();
  db.close();
  console.log("一致性备份完成：" + target);
} else if (action === "restore") {
  if (!existsSync(target) || target === databasePath)
    throw new Error("请提供有效的备份文件路径，先停止应用");
  const check = new DatabaseSync(target, { readOnly: true });
  if (
    check.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" ||
    ![1, 2].includes(
      Number(
        check
          .prepare("SELECT max(version) version FROM schema_migrations")
          .get()?.version,
      ),
    ) ||
    check.prepare("PRAGMA foreign_key_check").all().length > 0
  )
    throw new Error("不兼容或损坏的备份");
  check.close();
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  const old = databasePath + ".before-restore-" + Date.now();
  renameSync(databasePath, old);
  copyFileSync(target, databasePath);
  chmodSync(databasePath, 0o600);
  console.log("恢复完成，原数据库保留：" + old);
} else throw new Error("用法：init | backup <文件> | restore <文件>");
