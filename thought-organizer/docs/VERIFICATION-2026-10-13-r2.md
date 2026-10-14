# 上轮交付核验与数据库锁修复

核验开始：2026-10-13；交付完成：2026-10-14（Asia/Shanghai）。当前界面版本：**思考空间 · 2026.10.13-r2**。

## 核验范围与结论

工作仓库为`/workspace/-`，项目为`thought-organizer`，分支`work`，origin脱敏地址为`https://github.com/shiqingqi10-star/-`。开始本轮时工作树干净，本地完整提交为`39b9b3ff546fb68034d288ddfcb10b920e065562`，通过git ls-remote确认远端work也是这个提交。

可以定位上轮优化前后的提交：

- 优化前：`f19987a3494f45be2f1ec2c3964e18eb3d628933`，五个主题标签与原首页。
- 优化后：`39b9b3ff546fb68034d288ddfcb10b920e065562`，31个文件实际变更，2813行新增、431行删除，含三阶段组件、独立原文关联、思考变化、测试、说明和ZIP。
- 更早的`86404972827def93f805d78f8e50fd8c1ab18e6a`只有ZIP，源码优化随后已在f19987a提交，不能与上轮39b9b3f混为一谈。

上轮ZIP`thought-organizer-thinking-space-2026-10-13.zip`实际存在，56个文件，CRC正常，逐文件与开始本轮时的已提交源码完全一致。旧包SHA256为`0ce2c4db1899877b6e11d603d9f2224d480aaab6a59b397da9b135133e2d4a0d`。源码并非只在ZIP里，也并非只有静态示意：app/page.tsx实际渲染Workspace，Workspace实际渲染ThinkingSpace、ThinkingChanges等。

但本工作区的默认生产构建和已启动服务没有同步到上轮源码：开始核验时`.next`的BUILD_ID为`D9XIH_4yZ2qq5Y4c_GwZB`，静态客户端文件不含新版首页标题及2026.10.13版本；隔离测试构建`.next-ui`含有新版内容。实际从3000端口取得的页面及引用客户端JS也不含新版标题和版本，仍含旧“快速记录”。这是本工作区可确认的交付/运行遗漏，本轮已停止我们之前启动的旧进程、重新生成默认.next并启动新版服务。新默认BUILD_ID为`pim9z_zIHWVa5uksemDfL`，实际3000端口提供的客户端文件已含新版首页和r2版本。

**不能访问用户的Windows本地文件夹、运行进程、数据库或本地构建。上述旧构建证据只适用于这个工作区，不能直接断定用户电脑运行了哪个版本，也没有证据归因于浏览器缓存。** 两轮登录表单本身变化很小，主要优化在登录后；本地登录500确实阻止访问这些页面。要判断用户的具体版本，仍需本地版本标记、实际下载包和运行终端所在路径。本轮把r2标记同时放到登录页和设置页，使登录尚未成功时也能辨认。

## 要求—实现—文件—本轮验证

所有“通过”来自本轮新默认生产构建和独立数据库的真实浏览器，源码静态核验作为补充。

| 要求                            | 实际实现                                                   | 对应文件                                               | 验证结果                                                   |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| 首页“有什么事情，你想理清楚？”  | 登录后首页主标题                                           | components/Workspace.tsx                               | 生产页面通过，有截图                                       |
| 首次记录只需正文                | 首页只有正文，简称取第一句，原文不截断                     | components/Workspace.tsx；lib/thinking.ts              | 空账号及完整原文保存通过                                   |
| 保存开始/先存着，确认后跳转     | POST成功才进入，失败保留输入；读取失败与写入失败区分       | components/Workspace.tsx；lib/http.ts                  | 真实保存、刷新及失败响应场景通过                           |
| 首页最近三个                    | 主题和独立原文按真实更新时间选取，归档排除，最多三项       | lib/thinking.ts；components/Workspace.tsx              | 本轮新增4条+归档的生产页面测试通过                         |
| 三个主要导航                    | 我的思考、待想清楚、下一步；其他入口为次级位置             | components/Workspace.tsx                               | 实际导航及入口数量通过                                     |
| 三个自由阶段                    | 写下来、理清楚、往前走，原kind位置映射                     | components/ThinkingSpace.tsx；lib/presentation.ts      | 旧位置、切换、刷新及生产重启通过                           |
| 卡片补依据/疑问/下一步          | 卡片详情常用按钮，问题可创建关联行动                       | components/EntityDetail.tsx；Workspace.tsx             | 周末活动手动场景及关联跳转通过                             |
| 折叠字段不丢值                  | 基于完整已有data编辑，隐藏值及类型切换保留；错误定位       | components/Editor.tsx；lib/presentation.ts             | 生产表单、切换类型与409草稿通过                            |
| 思考变化只用真实数据            | 当前结构、最早留存原文、已有历史、缺失中性说明，不虚构过程 | components/ThinkingChanges.tsx                         | 真实创建的观点/问题/依据/判断及历史通过                    |
| AI默认收起，无钥匙可手动        | 点击打开抽屉，空钥匙禁用调用，真实范围与过期仍保留         | Workspace.tsx；AIAssistant.tsx；lib/schema.ts          | 空钥匙和完整手动场景通过；真实模型效果未验证               |
| 搜索/历史/导出/恢复/回收站/关系 | 原有接口和入口保持，图独立滚动、关系及关联可跳转           | Workspace.tsx；Settings.tsx；Graph.tsx；lib/service.ts | 生产搜索、历史恢复、备份恢复、回收站、账号隔离和逻辑图通过 |
| 可辨认界面版本                  | 登录页及设置顶部都显示r2标记                               | lib/thinking.ts；Workspace.tsx；Settings.tsx           | 生产页面通过，有设置截图                                   |

未发现这些核心界面功能缺失。本轮主要补齐默认生产构建交付、数据库锁处理和异常响应，而非另做设计。历史不足以重建完整思考过程，页面已有明确说明，未冒充完整还原。

## 数据库锁的实测与修复

旧lib/db.ts在模块导入时新建连接，执行顺序是journal_mode=WAL在前、busy_timeout=5000在后，并且每次模块重新执行都重新迁移。导入期间抛错发生在API的try/catch之外，可能使Next返回500或非JSON。旧连接不是进程内按路径共享的，开发热更新可重复开启；初始化失败也没有显式关闭连接。

本轮在临时数据库让另一进程持有BEGIN IMMEDIATE写锁，旧语句在**1毫秒**内复现`ERR_SQLITE_ERROR / errcode 5 / database is locked`。改成先busy_timeout后仍复现即时WAL升级锁错误，因此不能仅靠语句换序判断问题已经解决。

修复包括：

1. 连接按绝对路径在当前进程globalThis中缓存，支持开发模块重载复用；不同进程各自持有连接，由SQLite协调。
2. 惰性初始化，把初始化异常纳入API错误处理。先安装busy_timeout与foreign_keys，再检查journal_mode；已是WAL则不重复切换。
3. WAL升级锁错误增加有限期重试，默认上限5000ms；只对启动时的模式切换重试。长锁不会无限等待。Node原生SQLite是同步接口，等待期间会阻塞该实例的事件循环，正常部署仍建议单实例。
4. 已有schemaVersion=1只读检查，不反复执行写入型迁移；新初始化迁移在事务中完成，失败回滚。失败连接关闭且不缓存，下一请求可重新尝试。
5. 事务失败保留原异常、尝试回滚、复位深度；回滚失败丢弃连接并留脱敏诊断。事务回调必须同步。
6. 注册账号与初始会话原子保存，避免会话失败留下半成账号；同邮箱并发在事务内重新检查。密码哈希与身份验证规则保留。
7. 忙锁返回JSON 503和Retry-After，其他内部故障返回可读通用JSON。日志保留category、stage、SQLite代码、耗时，不记录密码、密钥或用户正文。忙锁时不再向同一个锁定数据库写诊断记录。
8. 前端统一解析响应，空响应、HTML、损坏JSON和网络失败显示可读提示，不展示Unexpected end of JSON input、SQL内容或内部HTML。

生产实测使用两个Next start进程共享一个独立临时数据库：首次WAL切换被锁时，登录与注册均返回安全JSON 503；释放锁后同一服务能注册登录。6个不同账号并发注册和6次并发登录成功，同邮箱竞争得到一个200和一个400，无500。已初始化WAL持长锁返回503，释放后重试成功，100ms短锁等待后成功。测试数据完整性检查为ok，原测试行保留，诊断包含errcode 5且无测试密码。

本地Windows具体持锁进程无法从这里确定，不能声称已确认是重复启动或某个数据库查看器。Windows若持续提示繁忙，应只关闭该工程的旧服务，结束数据库查看器中尚未提交/回滚的事务，再正常重试。不要删除数据库、-wal、-shm、清空data或改密码。网络盘、同步目录的锁行为也未在Windows实测。

## 实际检查

| 检查                                              | 结果                                                 |
| ------------------------------------------------- | ---------------------------------------------------- |
| npm run typecheck                                 | 通过                                                 |
| npm run check                                     | 通过，最初测试变量名触发的ESLint问题已修复后复跑     |
| npm test                                          | 33执行，33通过，0失败/跳过                           |
| npm run build                                     | 默认.next生产构建通过，使用临时DATABASE_PATH和空钥匙 |
| BROWSER_TEST_MODE=production npm run test:browser | 默认.next下14项全部通过，独立测试账号与数据库        |
| npm run test:database:runtime                     | 双生产进程注册/登录/并发/持锁/恢复/诊断验证通过      |
| npm run test:restart                              | 生产重启后原文、字段、关联、版本、位置、登录会话一致 |
| git diff --check                                  | 通过                                                 |

实际生产截图（仅测试账号和测试内容）：

- [登录后桌面首页](screenshots/verification-r2-home-desktop.png)
- [手机首页](screenshots/verification-r2-home-mobile.png)
- [桌面思考整理](screenshots/verification-r2-thinking-desktop.png)
- [手机思考整理](screenshots/verification-r2-thinking-mobile.png)
- [设置版本标记](screenshots/verification-r2-version-desktop.png)

## 修改文件与取得方式

主要修改：lib/db.ts、lib/auth.ts、lib/http.ts、app/api/[...path]/route.ts、Workspace.tsx及其他响应读取处、版本常量、数据库脚本和测试。没有升级依赖、清空正式数据库、覆盖.env、更改现有密码或绕过认证；数据库结构和业务数据格式保持。

本轮完整源码与修复包交付到现有仓库work分支。新包是releases/thought-organizer-thinking-space-2026-10-13-r2.zip，有相邻SHA256文件；旧包保留作历史版本，下载本轮应选r2。提交和实际推送结果在本轮最终交付中另行报告，不能以“已修改”代替“已提交/已推送”。

## Windows ZIP用户更新

1. GitHub分支选择work，下载名称以-r2.zip结尾的工程包，解压到一个新目录；若用仓库Download ZIP，也必须选择work，避免下载main或旧版release ZIP。
2. 先在旧工程终端Ctrl+C停止本项目服务，关闭或结束SQLite查看器里未结束的事务。不要按名称强制杀死所有node进程。
3. 完整保留旧目录作为备份。将原.env/.env.local和整个data目录复制到新工程同名位置；如果DATABASE_PATH指定外部文件，保持该路径和文件，不能初始化一个空数据库替代。不要覆盖真实环境配置，不删除-wal/-shm文件。普通本地文件夹优先，避免把运行数据库放在正在同步或网络共享目录；这只是运行建议，不是对当前故障环境的已证实归因。
4. 安装Node.js 24或以上，在有package.json的新thought-organizer目录打开PowerShell，执行：

```powershell
node -v
npm ci
npm run build
npm run start
```

已有数据库不需要npm run db:init、重新注册或重建。首次空安装才复制.env.example为.env，DEEPSEEK_API_KEY可以为空。打开http://localhost:3000。

5. 登录页底部和设置页顶部应显示：**界面版本：思考空间 · 2026.10.13-r2**。源码也可只读核对：

```powershell
Select-String -Path .\lib\thinking.ts -Pattern "UI_VERSION"
```

源码有r2而运行页面没有r2，说明运行页面与该源码尚未对应，应检查启动终端实际目录和是否重新构建，而不是先删除用户数据或浏览器缓存。源码本身无r2则未取得本次修复版。持续锁定时，可只读查看本机node进程和命令路径，确认哪个属于这个工程：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine
```

只正常停止确认属于本工程的旧实例，其他软件的Node进程应保留。

## 未验证项目

无法读取Windows本机目录、查找具体锁持有者或在Windows原生文件系统实测。本轮运行环境为Linux、Node 24.19.0、Chromium，桌面和390px手机视口。真实DeepSeek调用、所有浏览器/设备、独立安全审计和性能评估未验证。所有删除/恢复/锁定测试都针对自行创建的测试数据库，实际用户数据没有用于这些测试。
