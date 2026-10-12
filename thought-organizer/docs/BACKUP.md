# 数据库备份恢复

个人JSON导出只能备份一个账号的业务内容，不包含登录密码和会话，也不能替代数据库运维备份。

`npm run db:backup -- backups/name.sqlite`使用SQLite原生在线备份API，获得一致性数据库，而非直接复制正在写入的WAL文件。备份后运行 `PRAGMA integrity_check`。备份包含全部用户私人数据及密码哈希，应限制文件权限和访问范围。备份文件不能放在public目录。

恢复步骤：

1. 停止 `npm run dev` / `npm run start`，确保没有其他数据库写入者。
2. 核对 `.env` 的DATABASE_PATH和待恢复备份文件。
3. 执行 `npm run db:restore -- backups/name.sqlite`。
4. 脚本验证完整性、迁移版本，checkpoint并关闭当前库；旧文件保留为 `.before-restore-时间戳`。
5. 重启应用，登录原账号，核对主题、卡片、关系、验证与复盘。

如果恢复中断或文件权限不足，不删除保留的旧库。必要时停止所有进程，把旧库恢复为DATABASE_PATH后重启。恢复影响所有账号和会话，不能在正在使用的实例上执行。

自动测试使用独立临时数据库，验证在线备份、完整性、实体数量和原始记录内容。实际CLI备份/恢复验证见VALIDATION.md。
