# 思路整理器 V1

这是独立的中文私人思考工具。前端与完整业务后端使用 Next.js App Router、React、TypeScript、Tailwind CSS 和 Zod；正式数据使用 Node.js 原生 SQLite 驱动保存到真实文件数据库。`localStorage`只保留编辑失败草稿，不作为正式数据源。没有 AI 密钥也能注册、登录、整理卡片、编辑多前提关系、管理问题/任务/事件、记录证据、验证、复盘、搜索、回收站和导入导出。

## 环境与启动

需要 Node.js 24 或以上（使用内置 `node:sqlite`）。安装时保留锁文件：

```bash
cd /workspace/-/thought-organizer
npm ci --cache /workspace/.npm-cache
cp .env.example .env
npm run db:init
npm run dev
```

在自己的电脑上将第一行替换为实际工程目录，缓存参数也可以省略。浏览器打开 `http://localhost:3000`，选择创建账号，密码至少10位。此版本不提供默认账号或默认密码。停止使用 Ctrl+C。

生产运行：

```bash
npm run typecheck
npm run check
npm test
npm run build
npm run start
```

服务器配置 `APP_ORIGIN=https://你的域名`，通过受信任的反向代理终止 HTTPS，将应用端口限制为内部访问。会话 Cookie 在 HTTPS 配置下包含 Secure，始终包含 HttpOnly 和 SameSite=Lax。写接口严格匹配 APP_ORIGIN。常驻运行可由 systemd、容器或进程管理器负责，保持工作目录为工程根目录，并持久挂载 DATABASE_PATH 所在目录；进程重启后服务需要重新启动。不要把 `.env`、数据库、备份或测试数据放入公开静态目录。本次没有部署、发布或调用付费模型。

## 数据和架构

- 页面：`app`；交互：`components`。
- 模型/字段/Zod规则：`lib/schema.ts`；关系和历史事务：`lib/service.ts`。
- 数据访问/迁移：`lib/db.ts`、`lib/migration.sql`。
- 用户、哈希、会话、同来源和限速：`lib/auth.ts`。
- AI请求、提示词、持久额度和建议转换：`lib/ai.ts`；输出验证：`lib/ai-schema.ts`。
- 后端API：`app/api/[...path]/route.ts`，详见 `docs/API.md`。

SQLite启用外键、WAL和忙等待。实体与用户、主题、关联、历史、分析、反馈、用量有真实关系表；各业务实体的差异字段在经过严格Zod校验的JSON列中保存。数据库适用于小规模**单实例**应用；同步驱动会阻塞该实例的事件循环，不能把数据库文件放在多个实例共享的网络文件系统上。换用PostgreSQL需要改数据访问、SQL、迁移和备份流程，不能只换连接字符串。

`version`保护所有编辑，`contentVersion`仅在内容/归属变化时递增；任务状态、排序、折叠、今日关注不让分析误过期。软删除会使关联暂时失效，图中不再绘制失效关系，但任务、证据和历史保留。回收站无限期保留，直到账号删除。主题恢复应先于所属内容恢复。

拆分合并会事务性重写活跃引用并保留来源；多个前提和跨分组关系不会压成单树。拆分一个结论时保留各新结论的关系。整体撤销通过持久操作快照恢复原关系；若后续有人编辑相关内容，则返回冲突，不覆盖新输入。一般编辑可从历史版本恢复。

浏览器草稿按账号和实体分隔，恢复时携带原编辑版本，冲突不会静默覆盖；可复制输入，再加载最新版本手动合并。退出登录会清除本账号的编辑草稿。日期视图以账号时区计算；事件中的本地日期时间解释为账号时区，改变时区不会自动迁移既有文字日期。完成或取消验证任务不自动改变假设或解决问题。

## AI配置

`.env.example` 的 DEEPSEEK_API_KEY 为空。以后在自己服务器的 `.env` 或安全环境变量中设置，然后重启：

```dotenv
DEEPSEEK_API_KEY=由你在自己的环境安全填写
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

密钥永远只在服务端使用，没有 NEXT_PUBLIC 变量。默认使用兼容的 `/chat/completions` 及 `response_format: {type:"json_object"}`；代码实现超时、HTTP错误、截断、空输出、JSON结构、原句、引用和旧版本验证。提示词和服务地址不能由客户端指定。只读取当前主题或明确选定范围，关系引用的同主题前提/证据会加入可见输入范围；不访问证据URL，不自动检索事实。

未配置时返回 `503 AI未配置`，不发送外部请求，没有模拟回退。澄清问题可以跳过或在侧栏填写回答后重新分析。所有卡片、关系、疑点与下一步都逐条预览、编辑、确认后保存；疑点可转问题或任务，重复点击打开已有项目。先采纳卡片，再采纳使用这些卡片的关系。用户反馈和调用统计持久化。默认每账号24小时20次、30天100次，每分钟3次，并发1；额度含失败调用，重启不会清零，可通过服务端环境变量调整。

**真实DeepSeek调用尚未测试，待配置密钥。** 当前环境访问官方文档 `https://api-docs.deepseek.com/guides/json_mode` 被网络代理403拒绝，因此无法声称已核对当前官方模型和结构化输出兼容性。官方GitHub仓库确认提供OpenAI兼容API，但不能替代最新API文档的核对。首次启用前应核对模型名和JSON模式：`https://api-docs.deepseek.com/`。这不是密钥缺失导致的代码占位；请求、验证、反馈、建议保存和额度代码都已实现并用测试提供器验证。

## 备份恢复

详见 `docs/BACKUP.md`。JSON导出是账号级备份（schemaVersion=1），保留稳定编号、历史、分析与建议；恢复在事务中进行，碰到既有编号重新映射，不覆盖任何账号。引用必须存在于同一个备份，不能注入另一账号的私人编号。恢复分析作为历史快照，默认标记过期。单次导入最多2MB、最多10000实体。

服务端数据库备份包含账号和全部私人数据，必须限制访问：

```bash
npm run db:backup -- backups/2026-10-12.sqlite
# 先停止应用，再恢复
npm run db:restore -- backups/2026-10-12.sqlite
```

脚本读取 `.env.local`/`.env`；命令行已注入变量优先。恢复前校验完整性和版本，自动保留旧数据库。不要运行多个实例，也不要在运行中的应用旁执行恢复。

## 验证

```bash
npm run typecheck
npm run check
npm test
# 脚本自动在3100端口启动独立测试服务，无需手动先启动应用
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

浏览器测试使用Playwright及已安装的Chromium。在其他机器可安装Chromium，或将CHROMIUM_PATH设为浏览器路径。浏览器测试由 `scripts/test-server.mjs` 自动创建临时SQLite数据库，使用独立 `.next-ui` 构建目录，并在3100端口启动服务。测试服务显式禁用AI密钥，不使用正式账号或运行数据库。测试结束后自动停止服务。可用 `PLAYWRIGHT_BASE_URL=http://localhost:3200` 改变测试端口。测试构建目录不纳入Git提交。

实际验证结果见 `docs/VALIDATION.md`；需求对应见 `REQUIREMENTS.md`。P1/P2没有伪装按钮。首版采用可读SVG图、表单字段、人工排序数字与简洁列表，未做复杂无限画布、分享、附件、语义搜索和外部通知。

## 排错

- Node版本错误：升级到24，确认 `node --version`。
- npm缓存不可写：使用 `npm ci --cache /workspace/.npm-cache` 或其他可写缓存目录。
- 数据库打不开：确认DATABASE_PATH目录可写且持久化，运行 `npm run db:init`。
- 同来源403：APP_ORIGIN必须精确匹配浏览器的协议、域名、端口，修改后重启。
- 编辑409：输入仍在草稿；复制内容，加载最新版本手动合并。
- AI503：检查服务端是否设置密钥；不要在浏览器填密钥。
- AI超时/认证/余额/限流/格式错误：保留输入，核对配置后手动重试，不会无限重试或回退模拟。
- 恢复失败：确认来源文件和版本，先停止应用，保留原文件与恢复前备份。

日志只记录类别、状态、耗时，不记录私人正文、密码或密钥。默认用户无管理权限，管理统计API只接受数据库中已由运营者设置的admin角色，注册不能赋权。

## 界面优化与更新

首页只显示快速记录、最近三个未归档主题和最多五项今日关注，收集箱通过简短入口访问。主题内容分为原始想法、思路整理、问题与行动、证据与验证、判断与复盘五个主标签；仍以原对象类型保存上次位置，不需要迁移数据。

默认列表只显示摘要、状态和必要日期，点击内容可看完整详情。“更多”保留编辑、置顶、关注、拆分、归档、历史和删除；“选择内容”开启复选框、AI范围和合并操作。编辑表单采用基础信息与补充区域，隐藏或切换类型的字段保留原值。关联内容可按标题搜索、点击选择并通过标签移除，不需要Ctrl多选。

AI助手从主题右上角按需打开。没有密钥时显示“AI尚未配置”，手动功能不受影响。所有建议依旧需要预览并保存；历史显示可读字段，原始JSON放在高级查看入口。设置显示真实今日、月度调用数，并另外说明原有滚动24小时/30天额度。

新版界面的源码位于 GitHub 的 `work` 分支。此前仅上传 ZIP 的提交 `8640497` 不包含源码更新；请拉取后续的界面源码提交。若有自己的代码改动，先提交或妥善保存，再更新分支：

```bash
git switch work
git pull --ff-only origin work
cd thought-organizer
```

已有安装更新时保留自己的 `.env`、`.env.local` 和数据库；停止自己启动的旧服务，在工程目录执行：

```bash
npm ci
npm run typecheck
npm run check
npm test
npm run build
npm run start
```

开发时使用 `npm run dev`。生产环境的 `npm run start` 使用已经生成的构建，请在拉取源码后重新执行 `npm run build` 并重启服务，最后刷新浏览器。登录后的新版首页应显示“快速记录”“继续整理”“今日关注”，主题内应有五个主标签。本次没有更改数据库结构，不需要重新创建账号或清空数据；密钥继续由服务端环境变量读取。新增的唯一运行依赖是固定版本的 `@radix-ui/react-icons`。此次修改和验证记录见 `docs/UI-UPDATE.md`。
