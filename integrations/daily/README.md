# Daily 作文登录桥接

本目录是可版本追踪的 Daily 集成包。保留 Daily/WordUp 既有登录验证器；新增模块只使用验证后的不可变身份和当前班级授权。学生互批仍是后续的独立项目，本包不增加学生互批产品入口。

## 安装与回滚

先运行以下预检，再使用 `--apply` 安装源码。预检核对原有 `server.mjs` 和登录返回白名单的 SHA-256，发现其他人的改动时停止。新增模块只有在匹配当前集成包或本工具先前安装快照时才可覆盖。

```sh
node scripts/install-daily-bridge.mjs /absolute/path/to/Daily
node scripts/install-daily-bridge.mjs /absolute/path/to/Daily --apply
```

安装器仅修改清单中的 8 个源码/测试文件，原文件及安装前后摘要保存在本工程被 Git 忽略的 `audit/private/daily-bridge-<时间>/`。不会复制账号库、媒体或 `.env`，不会启动/重启服务。安装可重复运行。

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

机器凭据保护 `token/introspect/revoke/roster`。`authorize` 只接受 Daily 同源 JSON POST。原 WordUp 会话仅作为 Daily 本机加密的来源引用保存，每次核验仍调用原会话验证器；Cloudflare 不接收该 Cookie 或原始签名密钥。更换本机存储密钥会使旧授权失效，用户需要重新登录。

缺少任何必需配置时桥接关闭，桥接路由返回 503；不会创建 `writing_*` 表，也不会改变既有模块行为。公网机器接口还需核对 Cloudflare 防护是否允许服务端受认证请求，不能直接假定本地通过就能公网使用。

## 权限与名册

已定义学校、学年班级、学生成员关系和教师班级授权表。注册教师仅拥有自己的 `writing.personal` 工作区，不自动拥有全校名单。具体班级可分别授予 `roster.read`、`writing.manage`、`writing.grade` 和 `writing.publish`。

名册适配器只读现有 WordUp 权威库，只选择非认证字段，并按唯一 subject、当前启用状态、已确认的源班级、年级和有效成员关系共同过滤。默认使用实际服务的 `~/Library/Application Support/WordUp/data/wordup.sqlite3`，可用 `WORDUP_REPORT_DB` 显式指定；不读旁边的旧库。

当前还没有学校目录初始化与授权管理界面，正式目录尚未写入。学校及学年由管理员在后续预检中确认，不能按日期自动猜测，不能通过姓名自动授予班级权限。

## 已验证与未完成

- WriteAscend 的 `npm test` 包含桥接、来源身份适配、名册权限和 Worker/Daily HTTP 协议测试。
- Daily 原有回归加新增登录返回测试共 14 项通过。
- 实际 Wrangler 本地 D1/Worker + 合成 Daily 来源 + 390px 浏览器完成跨域登录、会话核验和退出验证，见 `scripts/qa/cloud-login.cjs`。
- 合成来源不代表真实账号登录、正式 Cloudflare 防护、真实名册初始化已经通过。
- 后续已接入教师云端登录状态和模型任务，并完成本地 Wrangler 联调，见 `../../docs/cloud-model-runtime.md`；正式目录、名册投影同步与结果发布仍在开发范围内。
