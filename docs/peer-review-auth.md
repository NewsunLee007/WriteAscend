# 独立互批登录的本地实现

2026-10-17。独立项目已接通本地 Worker、D1 会话、Daily 授权交接页和账号入口，使用合成来源验证。后续已增加 [教师材料交换](peer-materials.md)；后续已完成 [本机互评轮次](peer-rounds.md)，正式环境未启用。

## 配置与职责

| 位置 | 变量 | 约束 |
| --- | --- | --- |
| Daily | `WRITING_PEER_SERVICE_TOKEN` | 至少 32 字符，与教师 `WRITING_BRIDGE_SERVICE_TOKEN` 不同 |
| Daily | `WRITING_PEER_STORAGE_KEY` | 至少 32 字符，仅 Daily 保存，用于 AES-GCM 加密来源引用 |
| Daily | `WRITING_PEER_ALLOWED_CALLBACKS` | 逗号分隔的完整回调白名单，路径固定 `/api/auth/callback` |
| 互批 Worker | `PEER_BRIDGE_SERVICE_TOKEN` | 与 Daily 互批机器凭据一致，不获得教师机器凭据或模型 Key |
| 互批 Worker | `PUBLIC_ORIGIN`、`DAILY_ORIGIN` | 服务端固定来源，公网必须 HTTPS，仅本机允许 HTTP |
| 互批 Worker | `DB`、`ASSETS` | 独立 D1 和构建产物绑定 |

Daily 缺少配置或误用教师机器令牌时，仅互批桥接关闭，不创建互批表。教师桥接源码未改变。新增路由 `/api/integrations/writing-peer/` 只提供浏览器 context/authorize 和机器 token/introspect/renew/revoke 及本轮限定的 round/preview、round/authorize、round/check，不支持名册、目录写入、模型工作授权或报告事件。

本地使用合成 Daily 8890 与互批 Worker 8793；Vite 5191 仅为页面开发。`wrangler.jsonc` 中 D1 UUID 是本地占位，不是远程资源。`0001_peer_auth.sql` 已应用独立本机 QA 数据库，后续采用新增迁移。

## 授权生命周期

Worker 保存 5 分钟登录事务，浏览器仅持有 HttpOnly、Secure、SameSite=Lax、Path=/ 的 `__Host-peer_login`。Daily 同源确认后签发最长 60 秒的一次性授权码，绑定固定客户端、回调和 PKCE S256。互批授权初始最长 15 分钟。前台有活动的页面可在仍有效、来源核验通过时滚动续期 15 分钟，最多至该次授权建立后 24 小时，且不超过原来源会话期限；过期或注销后不能通过续期复活。无活动的轮询不续期。

Worker 兑换成功后保存独立会话，浏览器使用 `__Host-peer_session`，无 Domain；数据库仅保存浏览器令牌摘要。原 WordUp/Daily Cookie 只留在 Daily 的加密引用中，不交给 Worker 或浏览器脚本。账号入口只显示本人名称、角色、授权班级与工作区标识，不返回 grant、班级学生名单或凭据。

每次 `/api/me` 均重新核验原来源和当前权限。教师只有同时获得当前班级 `roster.read`、`writing.manage`、`writing.grade` 才派生 `peer.manage`；管理员使用当前启用的学校班级；学校学生按有效成员关系获得 `peer.own`。同名学生依据稳定账号区分，注册教师不自动获得班级。

互批退出先删除本地会话和待完成登录事务，即使 Daily 撤销暂时不可达也不能继续使用；教师批阅登录及其他设备保留。来源账号注销或角色切换会撤销同来源的两应用授权；Daily 持久来源代次防止核验中途恢复旧登录。注销持久化失败时互批停止接受核验，避免继续使用旧授权。

Worker 在来源 RPC 返回后再次核对本地会话；登录回调仅一次认领，并检查退出是否取消事务。并发退出覆盖兑换前、兑换后和正在核验的场景。回调失败展示可恢复页面，网络失败隐藏旧账号班级并提供重连，不把旧缓存当作当前权限。

## 当前交付边界

账号页面已实现学校账号登录、当前班级、刷新、退出和连接异常恢复。独立领域核心已有标准映射、平衡分配、证据反馈与作者回应；后续已接成本机互评轮次，见 [轮次实现](peer-rounds.md)。

经教师确认的最小文本材料交换与撤回核验现已本地接通。独立轮次、当前学生读取授权、分配/反馈和实际评阅页面已本地接通，后续已增加 [同伴反馈作为自主二稿依据](peer-feedback-revisions.md)，仍限当前作者及有效来源。不能强制先有 AI 报告，也不能让同伴档位覆盖教师成绩。

验证结果见 [阶段记录](verification/peer-auth.md)。当前没有生产凭据、远程互批资源或正式目录写入，也没有重启现有 Daily 服务。
