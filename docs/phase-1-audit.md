# WriteAscend 与 Daily 第一阶段审计

审计日期：2026 年 10 月 16 日，Asia/Shanghai。

改造采用保留现有批改报告、复用统一学生身份、独立建设作文后台的路线。Word 附件用于核对栏目完整性，不替换原系统的报告。第一批开发应先完成报告兼容、学生关联和登录接入，再开发写作单与手机连续扫描。

## 源码与运行基线

WriteAscend 的 GitHub 仓库为 `NewsunLee007/WriteAscend`。审计提交为 `2def1d2397b15666e17d46363ab811e4f722890b`，`index.html` 对应 blob 为 `26668d8628e44c8305a2c4460cf41525106a81e4`，共 7,324 行、515,072 字节。根目录主要是 `index.html` 与 `CNAME`，域名与用户提供的一致。

现有界面使用 React 18、浏览器 Babel 和浏览器 Tailwind，通过多个 CDN 加载。评分、识别、导出、学生管理和班级分析集中在该 HTML 中。旧版没有应用账号登录、服务器学生库或服务端任务队列；AI 请求由浏览器携带教师配置的 API Key 发出。

Daily 本机工程位于 `/Users/newsunsmac/Documents/ChatGPT/每日一句`。它是 Node HTTP 服务与本机 SQLite 应用，监听 `127.0.0.1:8820`，通过 Cloudflare Tunnel 提供公网入口。课程和公开媒体已有 `daily-media-edge` Worker 与私有 R2 分发。业务账号、学习记录及学生录音仍依赖本机服务。

WordUp 源码位于 `/Users/newsunsmac/Documents/ChatGPT/单词打榜`。Daily 通过本机 `8787` 的 WordUp API 验证身份，`8788` 提供 WordUp 前端。LaunchAgent 配置的账号数据库为 `~/Library/Application Support/WordUp/data/wordup.sqlite3`。安装环境中的 `server/local_api.py` 与工程源码 SHA-256 相同，已记录在证据文件中。

WordUp 根目录另有旧数据库，不能把它当成当前名册来源；同样不能把 `单词打榜/data` 下的开发库当作正式账号库。后续迁移必须从已核对的配置路径开始。

本聊天工作目录在审计开始时只有一个无提交、无远程的 Git 仓库。Daily 工程也没有提交基线，现有文件均为未跟踪状态。后续对 Daily 开发前需要建立只包含允许提交文件的版本基线；不能直接把整个目录和运行数据加入 Git。

## 登录与权限

| 系统与角色 | 当前实现 | 改造结论 |
| --- | --- | --- |
| WriteAscend 教师操作 | 浏览器本地配置，无应用登录 | 增加身份与班级权限后才能提供学生端和云端档案 |
| Daily 学校学生 | 班级、名单姓名、个人口令，调用 WordUp `student-login` | 复用账号及不可变学生 ID |
| Daily 自主注册学生与游客 | 也是 student 角色，但 `accountType`、`isGuest` 不同 | 不能仅按 student 角色放行班级作文和互评 |
| WordUp 注册教师 | 用户名和密码，teacher 角色 | 当前不代表拥有任何学校班级的管理权 |
| WordUp 管理员 | 独立 admin 登录 | 可作为学校管理入口，后端仍核验角色与授权 |
| Daily 历史管理员 | 独立 `daily_admin` 会话 | 保留过渡入口，与 WordUp admin 明确区分 |

WordUp 的 `wordup_session` 是带 HMAC 签名、12 小时期限的会话，Cookie 使用 HttpOnly、Secure、SameSite=None、Path=/，没有设置父域 Domain。Daily 先调用 `/api/v1/auth/session` 验证签名、过期时间和账户状态，再从经过验证的会话读取 subject。

因此 Daily 与 WordUp 现在通过同源网关共享登录，并不等于 `writeascend.newsunenglish.com` 可以读取 Daily Cookie。现有 `/login.html?next=...` 也限制同源与页面白名单，新接入需要明确增加受控返回页面。

注册教师在 Daily 目前主要能进入自己的幸运星功能。`/api/teacher/learning-roster` 等学情接口要求管理员；没有现成的“教师任教班级及作文管理范围”关系可以直接复用。幸运星的自建名单也不能作为学校任教授权。

依据：Daily `src/wordup-identity.mjs`、`src/wordup-gateway.mjs`、`src/teacher-auth.mjs`、`src/recitation-api.mjs`、`public/login-routing.mjs`；WordUp `server/local_api.py` 的 `issue_session`、`set_cookie`、`restore_session`。

## 学生身份与班级结构

| 数据层 | 关键字段与约束 | 用途 |
| --- | --- | --- |
| WordUp `students` | `id TEXT PRIMARY KEY`，`class_name`、`name`、`grade`、`status`、`is_guest`、`source_key` | 学生身份权威来源；认证相关字段不进入作文库 |
| WordUp `teacher_accounts` | `id`、`username_key`、`name`、`status` | 教师身份；尚无任教班级关系 |
| Daily `students` | `id INTEGER PRIMARY KEY`，`class_id`、`name`、`active`，同班姓名唯一 | 背诵模块的历史内部身份 |
| Daily `wordup_account_links` | `wordup_id PRIMARY KEY`，`student_id UNIQUE`，年级、班级与姓名快照 | 把统一学生身份关联到历史背诵 ID |
| Daily `learning_progress` | 联合键 `wordup_id, grade, unit, task_id`，`completed`、`artifact` | 单元自评与作品文本，不是完整作文批改任务 |
| WriteAscend 本地班级 | 班级与学生本地生成 ID，学生含 `name`、`no`、`aliases` | 需要迁移映射，不能直接当作统一账号 ID |

只读聚合核对结果如下，数量为本次审计快照：

- WordUp 账号表共 2,348 行，其中在用学校学生 2,327 人：七年级 758、八年级 836、九年级 733；每个年级 18 个班，共 54 个班。
- 账号库有 3 个注册教师账号和 3 个自主注册学生账号；账号总数还包含其他非学校记录，不能以总行数替代在校名册数。
- 学校名册中有 1 组同班同名、16 组跨班同名。姓名或班级加姓名都不能作为平台主键。
- Daily 有 2,327 条 WordUp 关联。关联均能在权威账号库中找到；全部在用学校学生都有对应关联；没有未关联的在用 Daily 历史学生。
- Daily 背诵学生表共有 2,335 行，包含非在用历史记录，不能按该表总数重建名册。

现有融合逻辑在姓名或班级变化时会要求人工核对，且历史背诵表有同班姓名唯一约束。新版作文直接使用 WordUp ID，不沿用这一约束；转班、改名保留身份及历史班级快照。学号先作为可选核对字段，不要求修改全部学校账号才能上线。

## Daily 已有写作数据

Daily 已有两条与新功能相关的数据路径。

第一条是 `learning_progress` 中 `task_id=writing` 的单元作品自评，以及 `learning_reviews` 的教师留言。当前有 6 条写作自评、0 条对应教师评阅。新作文任务不能用相同联合键反复覆盖这些历史作品。

第二条是 Journey 主题学习，已有草稿、稿次、作品证据、AI 评价、教师复核和学习档案代码。当前 Journey 方案有 3 个 draft、1 个 preview，尚无 approved 方案；草稿、稿次、作品和教师评阅表均为 0 条。这属于已具备代码但尚未形成正式学生数据的试点能力，不能描述为已经普遍使用的作文平台。

升级保留这两条路径的原有含义。WriteAscend 管理正式作文与报告，Daily 展示关联摘要和入口；旧自评不自动变成正式成绩，Journey 评价也不自动覆盖作文评价。

## 现有批改与导出基线

原系统已经支持总分与维度分数、词数、总体评价、优秀表达、诊断纠错、内容优化、学生升级稿、标准参考范文、可选题目与原稿，以及教师编辑、打印、CSV、JSON 快照和班级分析。详细保留清单见 [批改报告保留与补齐清单](export-preservation.md)。

现有默认评分是 20 分、五个维度，且可以编辑。先前讨论的 15 分四维示例仅作教学设计参考，不用于替换默认设置或重算历史成绩。

附件含 43 份作文，每份有原文、评分、简评、逐句批改和润色稿。它没有完整体现现有网站的优秀表达、内容优化与标准范文等栏目，所以不能用附件结构裁剪原系统。

## 需要在开发中解决的问题

| 优先级 | 已确认的问题 | 必须采取的改造 |
| --- | --- | --- |
| P1 | 现有核心本地配置和完整 JSON 备份包含 `config.apiKey`；“已保存结果快照”则没有 config | 新版密钥放服务端；迁移在上传前排除凭据，不能将完整旧备份直接存云端 |
| P1 | 跨域 Cookie 不共享，教师缺少任教班级授权 | 建立受控登录交接与班级权限，禁止向前端发管理员 token |
| P1 | 存在同名学生，旧系统有模糊姓名推断 | 用统一 ID 和写作单 token；模糊匹配仅给候选，不直接发布到学生档案 |
| P1 | 历史报告与身份、稿次、评价标准版本未形成独立云端模型 | 保存旧字段兼容视图，新增版本和发布状态，不覆盖历史报告 |
| P2 | 原稿图片主要依靠 File 和对象 URL，快照会剔除部分图像数据 | 独立保存图片；过期对象 URL 不能承诺恢复，缺图要明确标识 |
| P2 | localStorage 有容量限制、压缩与历史数量上限 | 云端长期档案和迁移账本；浏览器只保留临时队列与设置 |
| P2 | Daily 网关默认禁止 camera，现有 CSP 只允许特定来源 | 扫描页面独立配置 camera=(self)，校验脚本和文件连接范围 |
| P2 | 同一源文件同时承担评分、界面和打印，缺少报告回归基线 | 先建立兼容适配器和合成样例，再拆分模块 |

## 验证结果与边界

已运行 Daily 登录返回、身份绑定、注册账户、学情权限和网关相关 13 项测试，以及 WordUp 会话 3 项、教师账户 2 项、自主账户 4 项测试，合计 22 项通过。测试使用隔离数据库；没有使用真实学生口令或签发正式会话。

本机无认证 HTTP 验证：Daily 与 WordUp 健康检查返回 200；Daily 学习会话返回未登录；WordUp 会话与教师名册返回 401；被屏蔽的内部路由返回 404。初次请求受到本机 HTTP 代理影响，改用直连回环地址后验证正常，未据此认定线上故障。

公网域名在此次工具请求中返回 Cloudflare 403/1010，未绕过防护。生产浏览器内登录、手机相机、实际打印、OCR、AI 批改及 Cloudflare 发布未在本阶段验收。浏览器中的旧作文历史也未读取；本阶段确认的是其代码结构和迁移方法，不能把 GitHub 源码当作教师个人历史数据。

完整源码摘要、表结构、聚合数量和附件栏目计数见 [结构证据](phase-1-evidence.json)，测试原始记录见 [验证记录](verification/README.md)。
