# Daily 作文登录桥接

本目录是可版本追踪的 Daily 集成包。保留 Daily/WordUp 既有登录验证器；新增模块只使用验证后的不可变身份和当前班级授权。学生互批是独立应用，本包增加默认关闭的独立授权交接页，不在 Daily 导航或教师默认批阅流程加入互批入口。

## 安装与回滚

先运行以下预检，再使用 `--apply` 安装源码。预检核对原有 `server.mjs`、登录返回白名单、Daily 首页和学习记录页的 SHA-256，发现其他人的改动时停止。新增模块只有在匹配当前集成包或本工具先前安装快照时才可覆盖。

```sh
node scripts/install-daily-bridge.mjs /absolute/path/to/Daily
node scripts/install-daily-bridge.mjs /absolute/path/to/Daily --apply
```

安装器仅修改清单中的 22 个源码/测试/静态文件，原文件及安装前后摘要保存在本工程被 Git 忽略的 `audit/private/daily-bridge-<时间>/`。不会复制账号库、媒体或 `.env`，不会启动/重启服务。安装可重复运行。

```sh
node scripts/rollback-daily-bridge.mjs /absolute/path/to/snapshot
node scripts/rollback-daily-bridge.mjs /absolute/path/to/snapshot --apply
```

回滚前核对当前文件仍等于安装后的摘要，防止覆盖后续工作。已在独立临时 Daily 目录验证安装、重复安装、回滚预检和恢复原文件。源码回滚不删除业务数据库中的记录；正式启用后的数据回滚仍需停止新写入、对账并保留导出。

## 启用配置

需要在 Daily 服务端配置以下变量。当前正式环境未设置或修改这些变量，未重启现有服务。

| Daily 变量 | 用途 |
| --- | --- |
| `WRITING_BRIDGE_SERVICE_TOKEN` | 独立随机机器凭据，至少 32 字符；Worker 的 `BRIDGE_SERVICE_TOKEN` 使用相同值 |
| `WRITING_BRIDGE_STORAGE_KEY` | Daily 本机独立随机加密密钥，至少 32 字符，绝不传到 Worker 或浏览器 |
| `WRITING_ALLOWED_CALLBACKS` | 逗号分隔的完整回调白名单；测试环境为 `https://writeascend-staging.317792050.workers.dev/api/auth/callback` |

机器凭据保护 `token/introspect/revoke/roster`、`directory/*` 、`work/*` 及 `report-events[/receipt]`。`authorize` 只接受 Daily 同源 JSON POST。原 WordUp 会话仅作为 Daily 本机加密的来源引用保存，每次核验仍调用原会话验证器；Cloudflare 不接收该 Cookie 或原始签名密钥。更换本机存储密钥会使旧授权失效，用户需要重新登录。

缺少任何必需配置时桥接关闭，桥接路由返回 503；不会创建 `writing_*` 表，也不会改变既有模块行为。公网机器接口还需核对 Cloudflare 防护是否允许服务端受认证请求，不能直接假定本地通过就能公网使用。

## 权限与名册

已定义学校、学年学期班级、学生成员关系和教师班级授权表。注册教师仅拥有自己的 `writing.personal` 工作区，不自动拥有全校名单。具体班级可分别授予 `roster.read`、`writing.manage`、`writing.grade` 和 `writing.publish`。

名册适配器只读现有 WordUp 权威库，只选择非认证字段，并按唯一 subject、当前启用状态、已确认的源班级、年级和有效成员关系共同过滤。默认使用实际服务的 `~/Library/Application Support/WordUp/data/wordup.sqlite3`，可用 `WORDUP_REPORT_DB` 显式指定；不读旁边的旧库。

现已提供仅管理员可见的目录预检、确认同步、教师权限和停班界面。学校默认值经用户确认：瑞安市新纪元实验学校；当前学期 `2026-1`。新目录使用 `YYYY-1` / `YYYY-2`，历史 `academic_year` 字段保留名称并承载学期键，不按日期自动切换。不同学期创建独立班级，教师权限不自动继承。

同步前必须核对具体新增、移出、改名、转班和同名数量；确认时重新读取来源并比较目录摘要，事务内保存。成员关系分段保留历史；授权只能使用在用教师账号的稳定 ID，撤销不依赖学生来源库可读。角色、操作人和会话均由服务端核验，不接受浏览器自行声明。详情见 [学校目录实现](../../docs/school-directory.md)。

真实 54 班、2327 人只读对账通过，已生成学校 `2026-1` 初始化预检。正式目录仍未写入，不能通过姓名自动授予班级权限。

只读名册现在返回完整过滤名册的 `snapshotHash`，各页使用同一摘要。WriteAscend 建立班级任务时要求该摘要，分页期间发生改名、停用、转班或成员变化会拒绝拼接不一致的名单；确认时还会重新比较预览内容。本次模块升级已经过安装摘要检查并保留快照，没有启用正式桥接或重启运行进程。

## 已验证与未完成

- WriteAscend 的 `npm test` 包含桥接、来源身份适配、名册权限和 Worker/Daily HTTP 协议测试。
- 实际 Daily 当前完整回归共 205 项通过（含学校学生返回作文反馈页和互批授权页的登录路由检查）。
- 实际 Wrangler 本地 D1/Worker + 合成 Daily 来源 + 390px 浏览器完成跨域登录、会话核验和退出验证，见 `scripts/qa/cloud-login.cjs`。
- 合成来源不代表真实账号登录、正式 Cloudflare 防护、真实名册初始化已经通过。
- 后续已接入教师云端登录状态和模型任务，并完成本地 Wrangler 联调，见 `../../docs/cloud-model-runtime.md`。任务与成员快照也已本地联调，见 `../../docs/writing-tasks.md`；目录管理和真实名册核对见 [验证记录](../../docs/verification/school-directory.md)；正式目录写入及结果发布尚未启用。

安装器支持已安装的旧版集成升级，也支持从原始 Daily 源码安装；未知文件改动会中止，不能跳过摘要检查。

## 学生反馈交接补充（2026-10-17）

交接页现支持已经验证的学校学生账号进入“我的作文”；教师入口保持原批阅路径。学生来源仍由同一 Daily/WordUp 验证器核验，不接受浏览器自报身份。Worker 的学生反馈接口仅提供本人已发布快照和关联原稿，教师编辑和发布分开，撤回和原稿更正会停止旧反馈访问。

此前 18 文件版本通过摘要预检安装，其回滚快照为 `audit/private/daily-bridge-2026-10-16T18-33-28-609Z`。正式桥接仍关闭，未改环境配置、未重启服务。此前各次快照保留，可逐次恢复相应版本；回滚只恢复源码，不删除数据库中的发布事件。

## 独立互批授权补充（21 文件版本）

新增 `src/writing-peer-bridge.mjs`、`public/writing-peer-connect.html` 和 `.mjs`；同步更新服务器接入与登录返回白名单，原 `writing-bridge.mjs` 未修改。21 文件版本已按 SHA 预检安装到本机 Daily 源码，最新回滚快照为 `audit/private/daily-bridge-2026-10-16T20-50-12-849Z`。旧快照继续保留；未修改正式 `.env`、重启服务或写入正式目录。

| Daily 可选变量 | 用途 |
| --- | --- |
| `WRITING_PEER_SERVICE_TOKEN` | 至少 32 字符，与教师机器凭据不同；仅独立互批 Worker 使用 |
| `WRITING_PEER_STORAGE_KEY` | 至少 32 字符，只存 Daily，加密互批来源会话引用 |
| `WRITING_PEER_ALLOWED_CALLBACKS` | 互批完整回调白名单，路径固定 `/api/auth/callback` |

不配置则仅互批桥接关闭，不创建 `writing_peer_*` 表。独立机器只能兑换、核验和撤销本客户端授权，不能调用教师目录、名册、模型或报告事件。来源注销/角色切换使旧授权失效，当前班级权限每次核验；互批退出仅撤销本会话。详细配置、权限派生及未完成范围见 [独立登录](../../docs/peer-review-auth.md)。

## 发布摘要同步与 Daily 入口

- 教师在 WriteAscend 核对并发布后，同一事务写入不可变发布快照和 outbox。独立 `FEEDBACK_EVENTS` 队列投递事件，模型任务仍使用原队列；Daily 连接故障不占用模型队列。
- Daily 仅保存题目、班级、学期、稿次、分数、教师名称、发布版本与报告链接；原稿、全文、逐句批注、模型原始响应和密钥继续保留在 WriteAscend 私有存储。链接从服务器登记的回调白名单生成，浏览器或事件不能指定任意外站地址。
- `POST report-events` 接受经过机器认证的 WriteAscend 作为已审批事件的可信签发方。异步交付不是新的发布，不依赖已过期的交互登录授权；教师发布动作仍在 WriteAscend 当场验证当前班级权限、原稿和报告版本。
- 事件 ID 和投影内容摘要幂等，同稿次不能改绑学生、教师或任务；版本单调递增，撤回保留墓碑，旧发布即使后到也不会覆盖新撤回。
- `GET feedback` 每次核验 Daily/WordUp 当前学校学生账号，只返回本人的已发布摘要，每页 25 条。`GET portal` 给已验证的教师/学生返回相应入口；访客、停用账号和匿名访问不会显示首页入口。
- Daily 学习页和学习记录页增加默认隐藏的入口，桥接关闭或连接失败时原页面继续可用。学生进入 `writing-feedback.html`，从摘要打开 WriteAscend 的本人完整反馈；教师入口指向 WriteAscend 登录。
- 连接的第一条 `WRITING_ALLOWED_CALLBACKS` 是教师入口。正式环境只能登记明确选择的正式目标，不能把测试实例作为第一条回调；测试与正式实例应使用各自的机器凭据与数据库。

## 同步修复与发布版本冲突

网络/5xx 失败保留事件并退避重试，机器认证或接口配置失败显示管理员检查提示，不把老师当前登录误报为过期。丢失回执时重发同一事件 ID，Daily 不重复创建记录。老师可点击“核对 Daily 同步”，先查机器回执；缺失的记录补发，已有的记录确认成功，整个过程不重新调用模型。

定时任务还会重新投递至少一天未核对的当前成功事件，每次至多 25 条，以修复 Daily 数据库恢复后缺失的摘要。恢复正确的完整 WriteAscend 备份后也要核对两端版本，不能把发布计数归零。如果 Daily 已有更高版本或同版本内容不同，WriteAscend 暂停该稿学生访问和再次发布，保留冲突记录供管理员对账；恢复一致的源记录并核对回执后才解除暂停。

老师撤回或替换原稿时，WriteAscend 的完整反馈和原图立即停止访问。Daily 摘要异步更新，断网期间旧摘要可能短暂保留，但链接不能绕过完整报告的实时权限检查。同步恢复后摘要撤回。不能把摘要投递成功等同于学生已经查看、阅读或理解反馈。

Cloudflare 新增迁移 `0009_integration_delivery.sql` 和每环境独立的 `FEEDBACK_EVENTS` 生产/消费队列；远程测试队列已创建，远程 Worker 和迁移尚未部署。启用前应先保留可恢复备份、应用 0001–0011 迁移、核对机器凭据/回调与队列，再进行真实学校账号和网络验收。详见 [同步验证](../../docs/verification/daily-feedback.md)。

## 限定后台工作授权（2026-10-17）

`writing-work.mjs` 为已提交的固定操作提供独立授权。`work/authorize` 需要有效的交互授权和机器凭据；`work/introspect` 逐次核验本机保存的来源会话、账号角色与当前权限；`work/revoke` 只能撤销对应范围。来源 Cookie 沿用 Daily 本机加密存储，不传到 Worker，也不新增教师配置项目。

学校批阅授权绑定运行、任务、成员、班级、稿次、输入摘要、模型输入摘要、模型配置版本和管线版本；普通模型任务授权绑定单个任务与完整请求摘要。授权最长 24 小时，且不超过来源会话到期时间；不授予报告发布、名册浏览或任意新任务的权限。班级/教师授权版本变化会使旧授权失效，重新授予权限不自动恢复旧工作。

交互授权到期或被常规清理不取消已确认工作，关闭浏览器也不取消。主动退出则撤销同来源/同会话范围的工作；Worker 还在本地 D1 记录退出，Daily 连接失败时也能阻止后续模型发送。暂停后的继续处理需要当前教师登录重新授权，结果不明的请求仍需明确确认后才可重试。已发出的供应商请求不能撤销，保存返回结果不会再次计费。详细边界见 [后台工作设计](../../docs/background-work.md) 与 [验证记录](../../docs/verification/background-work.md)。

## 独立互批轮次补充（22 文件版本）

新增 `src/writing-peer-rounds.mjs`，提供冻结轮次的教师授权、当前有效成员与最小身份投影；仅互批独立机器客户端可调用。活动登录滚动续期仍核验原来源，最长 24 小时；普通教师的课堂轮次持续授权独立于教师短时交互会话。实际本机源码已安装，最新快照 `audit/private/daily-bridge-2026-10-16T22-22-02-553Z`，原快照保留，正式配置与运行进程未变。原版、旧桥接、18 文件版和 21 文件版四条安装/回滚路径已验证。实现与边界见 [互批轮次](../../docs/peer-rounds.md)。
