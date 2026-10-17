# 教师云端模型调用与任务恢复

当前完成本地开发与模拟来源联调，尚未启用正式 Daily 桥接、配置正式模型凭据或切换域名。原教师工作台、快速入口、评分提示词、结果解析/修复和导出继续保留。

## 教师配置与图片识别

教师选择批改模型即可开始，OCR 默认优先沿用同一模型，也可单独选择；选择按本机教师工作区保存，配置和托管密钥由服务端按教师身份保存。纯文字型号不出现在拍照批改和 OCR 选择中，服务端在入队和实际发送前再次阻止文字模型接收图片。旧配置继续按原图片模型处理；管理员须核验能力声明，`supportsImages` 不能当作真实识别验收证据。

“检查连接和图片识别”使用系统生成的印刷字符图片，检查连接、图片读取和 JSON 返回；每个不同模型调用一次，同一模型不重复检查，不使用学生作文，按供应商正常计费。检查不能替代中文手写姓名、英文手写正文及评分质量实测。界面提供 [Gemini 图片输入说明](https://ai.google.dev/gemini-api/docs/image-understanding)、[兼容接口文档](https://ai.google.dev/gemini-api/docs/openai)和可选的当前服务帮助链接。

题目图片及无二维码姓名识别使用 OCR 选择；原作文评分、JSON 修复、范文和难度优化继续使用批改选择及原有提示。二维码本机定位无需模型。姓名 OCR 只接收照片，不接收整班名单；本机精确匹配生成候选后仍需教师确认。

系统模型由管理员登记；教师也可在设置中添加本人模型，服务地址自动填入、密钥由服务端加密托管，其他设备登录同一账号可读取配置。OCR 默认复用，删除或无法读取所选个人配置时不自动切换成系统模型。原本地模式继续保留。详见 [个人模型设计与配置](personal-models.md)；正式凭据、真实供应商和手写质量验收仍待完成。

## 调用与数据

云端版先登录 Daily，获得经后台核验的教师工作区。运行时模型目录从服务器读取，仅包含选择所需的名称、型号、能力、用途、来源及版本等元数据。系统模型的地址与密钥由管理员登记；个人设置接口只返回本人的可编辑地址与非秘密参数，写入通过服务端校验，密钥不会回传。模型任务不能临时指定接口地址或密钥。原浏览器直连配置保留在本地开发模式，`legacy/index.html` 仍保存原版源码基线。

教师的现有 `callAI` 通过新的 transport 提交模型任务，并取得与原系统兼容的结果。模型任务与作文报告不是同一个对象：任务保存模型原始请求和响应；原有前端继续评分校准、修复难度、处理身份、显示与核对报告。教师核对后的报告仍按原格式保存在本机；原保存操作还会同步至私有云端存档，详见 [报告保存与恢复](cloud-report-storage.md)。学校任务另有固定输入的完整服务端批阅管线，并已本地接通教师版本发布与学生查看；正式环境尚未启用，参见 [学生发布验证](verification/student-publication.md)。

| 数据 | 位置与边界 |
| --- | --- |
| 登录会话、任务状态、重复提交摘要与处理状态 | D1，身份从会话取得 |
| 模型原始消息及响应 | 私有 R2，读取接口再次验证教师与 owner |
| 原稿图片 | 私有 R2；浏览器先上传图片，模型输入使用私有资源编号，发送前校验 owner 并读取 |
| 已保存报告、人工修改与当次 rubric | D1 存版本与摘要，私有 R2 存完整不可变 JSON |
| 待同步存档与原图 | 按工作区隔离的 IndexedDB outbox；刷新、恢复网络或手动重试后继续 |
| 原有设置、历史快照、档案、分析与导出历史 | 浏览器按服务器确认的工作区 ID 分隔保存 |
| 当前批次原图与进度 | IndexedDB，原图只写入一次，状态更新写小型清单 |
| 未完成模型请求编号 | 按工作区区分的 sessionStorage，刷新和网络恢复时复用 |
| 旧版浏览器数据 | 原位置继续保留；首次迁移可带入当前工作区，递归去除已识别的凭据字段 |

## 队列与重试

任务在调用供应商前先写入 D1/R2，再投递 Cloudflare Queues。重复请求使用同一 requestId，内容或模型配置不一致时拒绝；不同教师不能共享请求编号或读取彼此结果。消费者在实际发送前核验范围固定的后台工作授权、来源账号及当前班级权限，使用 D1 状态和租约避免同一任务的并发调用。学校任务的完整管线可在页面关闭后继续；原个人工作台每个已提交模型请求也可继续，后续由前端发起的修复或润色步骤仍需恢复页面。详见 [后台工作授权](background-work.md)。

供应商返回明确的 429/5xx 时最多尝试 3 次。连接中断、超时或发送后存储失败无法确认模型是否已处理，会记录为 `uncertain` 并停止自动重复调用。不能据此承诺供应商严格一次计费；界面需先核对结果，再决定是否重新批改。

每分钟的 outbox 恢复会补发未投递任务，清理未完成保存与过期租约。发送前失败可以重新排队，已进入发送且租约过期则标记待核对。配置和重试依据参见 [Queues 配置](https://developers.cloudflare.com/queues/configuration/configure-queues/)、[批次与重试](https://developers.cloudflare.com/queues/configuration/batching-retries/)。

## 服务端配置

单模型可设置 `MODEL_API_URL`、`MODEL_NAME` 与 secret `MODEL_API_KEY`。型号应选择该供应商实际可用、支持图片输入的兼容型号，正式验证前不在配置中写入未经核验的默认型号。

多模型使用服务器变量 `MODEL_PROFILES`，例如：

```json
[
  {
    "id": "classroom",
    "label": "课堂批改",
    "apiUrl": "https://YOUR-COMPATIBLE-PROVIDER/v1/chat/completions",
    "model": "YOUR_MODEL_NAME",
    "keyBinding": "MODEL_KEY_CLASSROOM",
    "supportsImages": true,
    "purposes": ["grading", "ocr"],
    "helpUrl": "https://ai.google.dev/gemini-api/docs/image-understanding",
    "maxTokens": 10000,
    "timeoutMs": 180000
  }
]
```

`purposes` 可为 `grading`（批改）、`ocr`（图片文字识别）或两者；纯文字型号设置 `supportsImages: false`。帮助链接只允许无账户凭据的 HTTPS 文档地址。OCR 可共用原供应商密钥，不需要再复制到手机。

密钥单独存入相应 Worker secret，不写进 JSON、Git、浏览器或测试记录。未配置密钥的模型不会出现在选择列表中。系统模型使用管理员登记地址；个人地址须通过公网 HTTPS 域名等校验，见个人模型说明。回环 HTTP 仅供本地联调；不跟随供应商重定向转发密钥。

额度变量 `MODEL_DAILY_LIMIT` 默认每位教师每滚动 24 小时 1200 个模型任务，设为 0 可关闭该限额；包含批改、题目识别、范文与修复调用。`MODEL_PENDING_LIMIT` 默认同时 20 个任务，均可由管理员调整。请求体最多 20 MiB，单次最多 6 张图、图片合计最多 12 MiB，响应最多 2 MiB。扫描端已对超大图进行整页 JPG 转换，常规照片保留原文件；自动透视裁切及多页模型输入优化仍待完成。

已创建独立测试队列 `writeascend-staging-model-jobs`。测试 D1 和私有 R2 已存在。正式部署前必须从当前版本顺序应用 `migrations/` 中 0001–0013 的增量迁移，配置桥接与模型 secret，并核对公网服务通道。个人托管另需配置独立 vault secret，详见 [密钥轮换和备份恢复](personal-models.md)。现在只在本地应用迁移，尚未远程部署 Worker 或切换正式域名。

## 验证

模型任务阶段 `npm test` 30 项通过，见 `verification/cloud-model-tests.tap`；加入存档后共 36 项通过，见 `verification/cloud-snapshot-tests.tap`；加入写作任务后共 43 项通过，见 `verification/writing-task-tests.tap`；`npm run build` 和 `npm run worker:check` 通过。模拟来源下的实际 Wrangler/D1/R2/Queues/浏览器联调见 `verification/cloud-grading.md`。真实模型质量、真实手写识别、正式手机浏览器、学校目录与正式学生发布仍需完成。私有报告存档已完成本地验证，尚未云端上线。

个人模型阶段 127 项测试与实际本地 Worker 浏览器验收见 [个人模型验证](verification/personal-models.md)。此前各阶段统计保留为当时记录，当前正式云端和真实模型验收仍未完成。
