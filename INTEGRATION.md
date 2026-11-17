# 网页与 C++ 整合约定

## 调用链

浏览器 → Node.js HTTP/会话 → 常驻 C++ 标准输入输出 → 根目录 data 下的片目、评价与账号文本文件。

Node 不保存片目、评价或统计状态，也不计算业务分数。浏览器仅按 C++ 返回的数据展示；两处均无评分降级逻辑。

## 内部通信

启动：`documentary-core --stdio`。通过环境变量指定统一目录和初始化资料；启动参数支持 `--data-dir`。Windows 参数与路径使用原生宽字符，支持中文文件夹。

启动成功后 C++ 输出一行：

```json
{"event":"ready","engine":"cpp","protocol":1,"pid":1234,"dataDirectory":"..."}
```

每行一个请求：

```json
{"id":1,"operation":"review.submit","params":{"review":{"filmId":101,"viewerId":"U1","content":5,"image":4,"narration":3,"comment":"短评"}}}
```

响应使用同一 id；成功为 `ok: true, result: ...`，失败为 `ok: false, status: 400, error: ...`。JSON 内的换行被转义，不会拆成多条通信消息。日志只写 stderr。请求编号由 Node 分配，以正确对应并发请求；C++ 单线程顺序执行写入。

支持的操作：`ping`、`catalog`、`search`、`ranking`、`distribution`、`film.add`、`film.update`、`film.delete`、`review.submit`、`review.clearComment`、`reviews.import`，以及内部可信通道中的 `account.status/lookup/bootstrap/register/invite`。账号凭据查询只用于 Node 认证，不对 HTTP 公开。

`catalog` 返回影片、带综合分的逐条评价、每片的平均分和人数、四类前十榜单，以及 C++ 提供的公式字符串。网页只格式化小数位。管理员权限由 Node 在转发维护/统计操作之前检查。

## HTTP 接口

| 方法 | 地址 | 行为 |
|---|---|---|
| GET | /api/catalog | 完整 C++ 快照 |
| GET | /api/search?query=关键词&category=类别 | C++ 多字段、多关键词同时匹配，按相关性返回片号；空查询时真实片优先；exact=true 精确片名 |
| GET | /api/rankings?metric=overall | C++ 单维度榜单；维度还可为 content/image/narration |
| GET | /api/health | 核对 C++ 引擎、进程编号及数据目录 |
| GET | /api/auth/me | 当前账号与角色，未登录返回 user:null |
| GET / PATCH | /api/account/activity | 当前观众账号的偏好、收藏和历史，管理员不可访问 |
| POST | /api/auth/login、/api/auth/register、/api/auth/logout | 两类账号统一认证。注册由 C++ 校验并保存，登录后建立会话 |
| POST | /api/admin/invites | 管理员创建单次、24 小时有效的邀请码 |
| POST | /api/admin/films | C++ 新增片目，需管理员 |
| PATCH / DELETE | /api/admin/films/:id | C++ 修改/关联删除，需管理员 |
| POST | /api/reviews | 必须登录；Node 强制使用会话中的观众编号，C++ 校验、评分与复评 |
| DELETE | /api/reviews/comment | 按会话身份清除本人短评，保留评分 |
| DELETE | /api/admin/reviews/comment | 管理员按片号与观众编号清除短评，保留评分 |
| POST | /api/reviews/import | 管理员兼容旧浏览器实际修改，整批校验后由 C++ 提交 |
| POST | /api/admin/distribution | C++ 分数段校验与统计，需管理员 |

核心退出或通信失败返回 503，不自动重试写请求。响应不确定时应重启并核对保存结果。关闭 Node 后管道结束，C++ 退出并释放锁；正常信号退出会先关闭子进程输入。

网页快照中的评价拥有 `own` 布尔字段。观众端返回昵称字段 `viewerName`，管理员端返回编号字段 `viewerId`。账号接口的公开资料只包含账号、昵称和角色。

Node 从会话取得观众编号，再转发给 C++ 的 `activity.read` 或 `activity.update`。更新操作包括 `favorite`、`unfavorite`、`visit`、`removeVisit`、`clearHistory` 和 `preferences`。每次只更新当前账号的一项数据。网页请求带当前账号绑定字段，Cookie 对应账号发生变化时拒绝旧页面的操作。

## 唯一运行数据

`data/documentaries.txt` 与 `data/reviews.txt` 均为 UTF-8 JSON Lines，每条记录一行。新增 `data/users.txt` 为 UTF-8 JSON 对象，保存账号、密码摘要、固定观众编号、角色及邀请码摘要；三者都由同一个 C++ 进程在同一目录锁下读写。只读初始化资料在 `resources/catalog-seed.json`，海报在 `web/public/posters/`。

Node 使用随机盐和 scrypt 派生密码摘要、常量时间比较并维护 8 小时 HttpOnly/SameSite=Strict Cookie 会话；C++ 负责账号格式、唯一性、邀请码校验、单次消费以及原子写入。新账号观众编号随机生成，不能自行认领旧评价身份。除认证和健康检查外，HTTP 业务接口均要求登录，管理员操作检查角色。服务重启结束会话，用户重新登录。旧 `/api/admin/login/logout` 保留兼容。

片目示例（展示扩展字段可选）：

```json
{"id":101,"title":"示例片","category":"自然","director":"导演","crew":"主创","episodes":1,"synopsis":"第一段\n\n第二段","year":2020,"posterId":1,"highlights":["看点"],"chapters":["分集"],"sources":[{"label":"来源","url":"https://example.org/"}]}
```

评价示例：

```json
{"filmId":101,"viewerId":"U1","content":5,"image":4,"narration":3,"comment":"短评"}
```

`isSample` 只标识预置演示评价；实际提交会清除该标识。`summary`、`overallScore`、`rankings` 是 C++ 计算的响应字段，不作为另一套分数存储。

## 保存与恢复

1. 在内存副本中完成全部校验、维护及关联清理。
2. 写完两份 `.tmp` 暂存文件；暂存失败时原文件与已公布内存不变。
3. 写入 `transaction.pending` 提交标记，再分别替换两个目标文件。
4. 删除标记后公布新内存状态。替换中途失败则停止核心，在下次启动完成恢复。

`.core.lock` 使用操作系统文件锁，不依赖可遗留的锁目录。第二个网页服务或调试终端无法取得相同目录的写入权。调试菜单保留独立的控制台交互，但与网页使用同样的业务类、格式与文件；调试时需先关闭网页服务。

## 一次性迁移

只有统一目录两个文件都不存在时才迁移或初始化；已有文件不会被旧 JSON 覆盖。旧网页与 C++ 文件先全部校验，冲突则保留源文件并停止，不重新编号。迁移前复制源文件到 `data/backups/migration-*/`，提交后将旧活动文件归档，并记录迁移清单。

已知旧 demo 会增加真实纪录片、标记旧片，并保留原片号、原评价和用户修改；与用户自建片号冲突时保留用户片目，不把新片的演示评价附到该编号。已有统一目录缺少一个文件或内容损坏时停止启动，由备份恢复，避免误判为首次启动。

## 验证

`npm test` 使用临时目录验证 HTTP→C++ 调用、错误处理、并发、互斥、迁移及重启。规则验证测试只修改临时副本中的 C++ 权重再编译替代核心，确认网页接口分数与公式发生变化；正式程序仍使用选题规定的权重 2。
