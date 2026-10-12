# API说明

所有接口位于 `/api`。除注册/登录外必须有有效的 HttpOnly 会话Cookie。所有写入必须有与 `APP_ORIGIN` 相同的 `Origin` 头，JSON请求总大小最多2MB。成功直接返回数据；错误为 `{error:string}`，使用400/401/403/404/409/413/429/500/502/503。后端不接受客户端owner或服务商地址。

| 方法   | 路径                        | 输入/行为                                                                                    |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------- |
| POST   | /auth/register、/auth/login | `{email,password}`，注册普通用户，创建7天会话                                                |
| POST   | /auth/logout                | `{}`，注销当前会话                                                                           |
| GET    | /me                         | 账号、时区、AI配置状态、用量统计                                                             |
| PATCH  | /settings                   | `{timezone,reminders}`                                                                       |
| DELETE | /account                    | `{password}`，永久删除账号及所属数据                                                         |
| GET    | /entities?trash=1           | 当前账号全部实体，省略trash只返回活跃数据                                                    |
| POST   | /entities                   | `{kind,topic:null或编号,data}`，返回持久实体                                                 |
| GET    | /entities/:id               | 单个活跃实体，验证用户归属                                                                   |
| PATCH  | /entities/:id               | `{topic,data,version}`，完整校验与乐观锁                                                     |
| DELETE | /entities/:id               | `{version}`，软删除，保留关联历史                                                            |
| GET    | /entities/:id/impact        | 删除前关联引用影响                                                                           |
| POST   | /entities/:id/restore       | `{version}`，恢复前验证关联                                                                  |
| GET    | /entities/:id/history       | 该实体历史快照                                                                               |
| POST   | /entities/:id/undo          | `{version,targetVersion}`，恢复历史形成新版本                                                |
| POST   | /transform                  | `{ids,versions:{编号:版本},parts:字符串数组或null}`，拆分或合并                              |
| GET    | /operations                 | 当前账号拆分/合并操作记录                                                                    |
| POST   | /operations/:id             | `{}`，事务整体撤销，校验所有受影响版本                                                       |
| GET    | /search?q=文本              | 按内容、标题、标签、状态和主题名搜索                                                         |
| GET    | /export                     | JSON账号备份，schemaVersion=1，不含密码/密钥                                                 |
| GET    | /export?format=md           | 可读Markdown导出                                                                             |
| POST   | /import                     | JSON备份对象，严格引用、版本、大小校验，事务导入                                             |
| GET    | /analyses?topic=:id         | 当前主题分析、快照、建议、过期状态                                                           |
| POST   | /analyses                   | `{topic,ids:[],mode,answers?:string}`，模式为整理思路/检查推导/生成下一步                    |
| POST   | /suggestions/:id            | `{action:"accept"或"ignore",kind?:"question"或"task",data?:修改后业务字段,feedback?:string}` |
| POST   | /feedback                   | `{analysisId:string或null,rating:"有用"或"部分有用"或"无用",comment}`                        |
| GET    | /admin                      | 仅admin聚合事件、AI成功率/耗时/用量、错误类别                                                |

实体kind：topic、record、card、relation、question、task、event、evidence、validation、review。每种可用字段、枚举和多对多引用由 `lib/schema.ts` 统一定义，前端表单与后端校验使用同一规则。返回实体有稳定id、owner、kind、topic、version、contentVersion、deletedAt、createdAt、updatedAt和data。不能传未定义字段。

例如新建验证任务：

```json
{
  "kind": "task",
  "topic": null,
  "data": {
    "title": "访谈3名用户",
    "type": "验证任务",
    "status": "待开始",
    "action": "询问实际使用场景",
    "information": "愿意尝试的条件",
    "criterion": "记录明确意愿和原因"
  }
}
```

引用目标不仅要求编号存在，还验证账号、类型、必要的同主题限制和活跃状态。关系from为多个卡片编号、to为一个卡片编号，type为推导/支持/反对/前提依赖/分类归属，reason说明理由。外部来源链接仅保存，服务器不会抓取任意URL。

AI建议采纳幂等：若已有target，重复调用直接返回该项目；旧分析不能创建新内容。卡片、关系、任务等写入与建议target保存都在同一SQLite事务中。未配置AI时不会发送外部请求，返回503。并发分析、频率和额度由数据库计数，重启不能绕过。

### 用量展示补充

`GET /me` 的usage保留原calls/events/dailyLimit/monthlyLimit，新增todayUsed/monthUsed（按账号时区的自然日、自然月）及rollingDayUsed/rollingMonthUsed（最近24小时、30天）。原有后端额度规则未改变，界面分别显示日历用量和滚动额度。新增统计只读取当前账号的调用记录。
