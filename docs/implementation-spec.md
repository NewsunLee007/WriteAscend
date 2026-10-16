# WriteAscend 具体改造规格

本规格以第一阶段审计结果为基础，供后续开发执行。教师借助大模型一键批阅作文是主流程：原 GitHub 系统的题目识别、标准设置、范文、名册、上传、批量批改、核对、导出、档案与班级分析全部保留并逐项优化。复用 WordUp 身份，通过 Daily 受控接口连接云端后台。学生互批是独立新项目，仅通过共享身份、任务、稿次与评价标准接口关联。详见 [教师功能基线](scope-and-feature-baseline.md)。下列新接口和数据表是待实现设计，不是现有服务能力。

## 工程与部署

WriteAscend 使用 React、TypeScript、Vite 构建前端；服务端采用 Cloudflare Workers，静态资源由同一 Worker 工程部署，业务记录保存在独立 D1，原图及导出文件保存在独立私有 R2，识别与批改使用 Queues。客户端通过本域 `/api/*` 访问后台。模型密钥放 Worker secrets，保留教师可选择的模型配置与输出设置。

GitHub 仓库继续作为代码来源，开发分支采用 `codex/` 前缀。先在测试环境完成验证，生产 `writeascend.newsunenglish.com` 最后切换。Daily 的现有媒体 Worker、录音文件和业务数据库不随作文项目一起搬迁。

第一批上线后，作文文件、报告和处理任务运行在 Cloudflare；统一登录与权威名册仍依赖 Daily/WordUp 本机服务。这是明确的过渡架构。要完全消除 Mac 依赖，需要另行迁移身份权威和 Daily 业务，不能把本次迁移称为整个平台已经全云化。

## 统一身份与跨域登录

选择一次性授权码交接：复用 Daily 登录，WriteAscend 获得自己的会话。现有 HMAC 会话不是标准 JWT/OIDC 服务，不把它直接接入通用 JWT 校验器，也不把原有签名密钥复制到 Cloudflare。

流程如下：

1. WriteAscend `/api/auth/start` 建立短期登录事务，生成 state 与 PKCE S256 challenge；事务绑定本域 HttpOnly 临时 Cookie，保存固定回调地址与经过校验的站内返回路径。事务有效期 5 分钟。
2. 浏览器跳到 Daily 新增的 `/writing-connect.html`。未登录时进入现有 `/login.html`，通过新白名单页面回到交接流程。登录地址中的参数均不可直接成为外部重定向地址。
3. Daily 交接页面向同源 `/api/integrations/writeascend/authorize` POST。后端验证真实 WordUp 会话或历史 Daily 管理员会话，确认账户状态、学校身份与班级授权；仅接受已登记 client 和固定 WriteAscend callback。
4. Daily 签发 60 秒有效的一次性随机 code，服务器只存 code 摘要，绑定 client、回调、challenge 和身份授权。URL 中只出现短期 code/state，不出现原会话、口令或学生资料。回调页禁缓存，设置 Referrer-Policy: no-referrer，完成后清理地址栏。
5. WriteAscend 后台经受保护的 token 接口提交 code/verifier，使用原子消费避免重放。匹配成功返回服务器确认的 provider、subject、role、schoolId、grantId、权限版本和到期时间，随后创建本域随机会话。
6. WriteAscend 会话 Cookie 使用 HttpOnly、Secure、SameSite=Lax、Path=/，不设置父域 Domain。登录完成后回到事务中已校验的站内页面。

服务端 token、名册和授权核验接口使用 Cloudflare Access 服务凭据或等价独立机器认证，只保存在服务端；浏览器授权页面与机器接口分别配置访问策略。现有网关会屏蔽 `/api/v1/internal/*`，新桥接接口使用专属路径与明确策略，不把旧内部路由整体开放。

WordUp 的原始 Cookie 不交给作文前端或云端存储。桥接端保存可撤销 grant 与身份来源的服务器引用，核对来源会话有效期、账号启用状态和班级授权。WriteAscend 会话有效期先设 15 分钟，敏感写入使用最近 60 秒内的权威核验；停用、撤销任教权限和退出登录触发 grant 撤销，过期会话重新交接。桥接失败时不新建登录、不扩大权限、不发布学生反馈。

这不是仅靠 Cookie 名称实现的单点登录，需要测试 state 错误、PKCE 不匹配、code 重放、错误回调、账号停用、权限撤销、登录超时、角色切换和退出。现有登录和原模块继续工作。

## 学生与任教授权

学生全局标识使用 `(provider='wordup', subject=students.id)`。Daily 背诵的整数 student_id、WriteAscend 的本地随机 ID 只作为历史映射。历史 Daily admin 使用独立 provider，避免与 WordUp 的 `admin` 字符串混同。

在身份桥接端新增学校班级目录：`schools`、`school_classes`、`student_memberships`、`teacher_class_grants`。班级使用稳定 UUID，另存学校、学年、显示名称和状态；不能将“813”或年级单元码直接当作跨学年的唯一身份。学年与班级批次在首次名册预检时由学校管理员确认，不能按电脑日期猜测。

教师注册不自动获得学校名册。管理员给教师授予具体班级及 `roster.read`、`writing.manage`、`writing.grade`、`writing.publish` 等权限，可撤销并记录操作人。幸运星自建班级保持原用途，不直接转换为学校授权。

云端保存受限名册投影：统一 ID、姓名、年级、班级 ID/显示名、状态、来源版本与同步时间；不传输 PIN、密码哈希、source_key 或其他认证字段。学校学生可加入班级作文；自主注册账户和游客需要显式学校绑定后才开放班级任务与互评。

姓名与班级是可变资料，作品保存提交时快照和持续不变的 subject。转班或改名创建有时间范围的新成员关系，既有作品不自动转入另一个人的档案。同班同名在界面显示教师可核对的短编号或学号，不暴露登录口令。

## 写作业务数据

| 数据对象 | 关键关系与规则 |
| --- | --- |
| `writing_tasks` | 题目、目标班级、教师、截止时间、模式、教材可选关联；任务可跨多个班 |
| `rubric_versions` | 完整旧 rubric、稳定 criterion ID、学生描述、分值规则、hash；发布后不可原位改变 |
| `task_members` | 任务发布时的学生与班级快照，记录追加、退课与豁免 |
| `writing_sheets` | 学生、任务、稿次、页码、模板版本、token 摘要；支持作废和重印 |
| `submissions` | 同一任务同一学生的一份作业，身份确认状态与当前发布版本 |
| `draft_versions` | 初稿、学生二稿等独立版本；保留正文、来源、父版本与修订说明 |
| `submission_pages` | 稿次、页码、私有文件 key、文件 hash、识别结果和确认稿 |
| `grading_runs` | 输入稿次 hash、rubric 版本、模型与提示版本、运行状态、AI 原始结果 |
| `report_revisions` | 经校验的报告、legacy 兼容视图、教师修改、确认与发布时间 |
| `legacy_import_batches` / `legacy_identity_links` | 来源、去重摘要、旧 ID 对新 ID 的确认关系、导入数量与失败原因 |
| `integration_outbox` | 发布事件、版本、重试和确认；事件与报告发布原子保存 |

互评阶段再增加 `peer_review_rounds`、`peer_review_assignments`、`peer_reviews` 与 `revision_responses`，引用同一 rubric 版本与被评稿次，不能读取“当前任意新版作文”替代当时评价对象。

正文识别稿、教师校正后的正文、AI 升级稿与学生自主二稿各自保存；AI 修复不能改写原稿和人工确认结果。评分导入不重算；以后调整规则通过新版本执行。

## 与 Daily 交换的数据

新增接口按用途拆分，全部显式标版本：

| 接口 | 调用方 | 约束 |
| --- | --- | --- |
| Daily `/api/integrations/writeascend/authorize` | 已登录 Daily 页面 | 同源 POST，固定 client/callback，签发一次性 code |
| Daily `/api/integrations/writeascend/token` | WriteAscend 后台 | 机器认证、PKCE、原子消费 code |
| Daily `/api/integrations/writeascend/introspect` | WriteAscend 后台 | 核验 grant、角色、成员状态和授权版本 |
| Daily `/api/integrations/writeascend/roster` | WriteAscend 后台 | 按 grant 与班级范围过滤；快照版本与游标分页 |
| Daily `/api/integrations/writeascend/events` | WriteAscend 后台 | 机器认证＋事件授权；按 eventId 去重并检查对象版本 |
| WriteAscend `/api/me`、`/api/classes`、`/api/tasks` | 本域页面 | 服务器从会话取身份，不采信前端 role 或 subject |
| WriteAscend `/api/legacy-imports/*` | 已授权教师 | 预检、人工关联、提交、回滚；重复导入不重复入档 |

Daily 新增 `writing_summaries`、`writing_inbox`，按真实 task/submission ID 保存任务状态、最终分与满分、修订情况及合法详情入口。旧 `learning_progress` 中每单元一个 writing 记录保留；同一单元多篇作文不能塞进该旧键反复覆盖。

事件包含 eventId、schemaVersion、taskId、submissionId、subject、reportRevision、eventType、occurredAt。仅教师已发布版本向 Daily 同步；AI 初评和他人的互评正文不进入公开成长摘要。取消发布和更正通过新事件记录，接收端忽略过时版本，失败进入待重试和对账，不显示为已同步。

Journey 初期只增加关联入口与作品引用，不修改其证据、独立检查和提示记录。后续如把作文纳入 Journey，另建显式关联，分别保留写作成绩与学习过程评价。

## 原系统迁移与报告兼容

先把原系统的完整教师工作流纳入可构建工程，验证题目设置、上传、大模型一键批改、核对与导出仍能完成，再逐项优化交互、替换存储与请求。`legacy-report-v1` 兼容层是迁移辅助，不作为产品主页。保留栏目、默认评分、编辑与打印配置，详见 [保留清单](export-preservation.md)。

旧数据迁移需要覆盖 v5/v4 核心配置、学生档案、CSV 导出历史、已保存批改快照、评分标准历史与班级分析历史。完整备份与结果快照的外层不同，解析器分别识别。未知字段保留在经过凭据过滤的兼容载荷中。

在教师浏览器本地先解析和剔除凭据，再上传业务数据；不能把带 API Key 的完整 JSON 原件放进 R2 后再清理。导入前显示班级、学生、报告和缺图数量，身份有歧义时要求教师选择；可先放入未关联的教师私有历史档案，确认前不进入学生账户。

同域迁移后浏览器 localStorage 理论上仍可能可读，但不同设备、浏览器和历史 hostname 的存储互不相通。上线前保留导出工具和迁移说明，不能假设一次导入就涵盖所有教师设备。原始文件与数据库备份保留在教师控制的位置，云端迁移有批次账本和回滚标记。

## 写作单与手机扫描

默认一生一任务一稿次的个性化 A4 写作单；页内有唯一随机 token 的二维码、短校验编号、姓名班级、页码、定位点和正文区。二维码中不放口令，不把统一学生 ID 或姓名直接当作访问链接。后台保存 token 摘要及对应记录。

二维码定位成功后仍核验当前教师能操作该任务；检测纸面身份信息冲突、跨任务页面、重复页和作废写作单。老师可预览并修正拿错纸等情况。姓名 OCR 只是核对和候选检索，不能绕过人工异常处理。通用空白写作单在收作业时人工确认身份。

手机采用连续取景拍摄与相册多选两条路径；相机不可用时回退文件选择。对照片处理压缩、方向和清晰度检查，保留必要原图。每页有独立上传状态与去重 key，上传完成才标记已收。网络失败在本机待传队列中恢复；共享设备退出清理本地敏感缓存。

上传未完成时不承诺锁屏或系统关闭浏览器后继续传输；服务器已确认收齐的页面才交给后台队列继续识别和批改。前端 API 和私有报告不进公共 Service Worker 缓存。独立扫描页开放本站 camera 权限，不能照搬 Daily 默认禁止相机的响应头。

## 后台处理与异常恢复

每一步保存状态：待上传、待关联、待识别、待文字核对、待批改、待教师确认、已发布。识别不清不等于零分；AI 失败不等于学生未交。教师可以选择逐篇核对识别稿，也可先放行清晰样本，仅集中处理被标记的页面。

识别、批改和导出分别排队，使用稳定 job ID、数据库条件更新、租约、重试上限和失败队列。队列可能重复投递，处理器必须去重；任务输入的稿次或 rubric 版本变化后，旧任务不得把结果写入新版本。后台失败仅重试对应步骤，不重复创建学生作业或覆盖教师修订。

R2 私有图片和报告通过后端授权读取。短期直传如采用 presigned URL，需要限制目标 key、有效期、类型和大小，并在上传确认时重新核验；其本身不是学生访问权限。首版教师 PDF 沿用经过验证的浏览器打印，批量服务器导出后续按实际容量单独排队。

## 上线门槛与回滚

报告兼容验收、权限与重复请求测试先于大规模界面调整。Cloudflare 测试环境通过后，再做真实打印和手机扫描试点。生产切换前核对域名防护、回调、凭据、R2 私有性、名册投影、备份恢复及历史导入结果。

部署旧代码不能撤回已产生的数据。回滚采用兼容字段的增量迁移、功能开关及写入停止点；旧 GitHub 版本先保留，云端新增记录保持可导出。没有数据对账前不清理旧浏览器档案、不删除本机数据库。

技术依据：[Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)、[R2 预签名地址](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[Cloudflare Access 服务凭据](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)、[PKCE RFC 7636](https://www.rfc-editor.org/info/rfc7636/)。授权码桥接是本项目待实现的受控协议，以上资料不意味着 Daily 已提供 OAuth/OIDC 服务。
