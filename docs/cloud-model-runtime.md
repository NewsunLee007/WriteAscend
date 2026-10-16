# 教师云端模型调用与任务恢复

当前完成本地开发与模拟来源联调，尚未启用正式 Daily 桥接、配置正式模型凭据或切换域名。原教师工作台、快速入口、评分提示词、结果解析/修复和导出继续保留。

## 调用与数据

云端版先登录 Daily，获得经后台核验的教师工作区。模型设置从服务器读取，只公开模型 ID、显示名称和型号；API 地址、密钥和参数上限不由浏览器提交决定。原浏览器直连配置保留在本地开发模式，`legacy/index.html` 仍保存原版源码基线。

教师的现有 `callAI` 通过新的 transport 提交模型任务，并取得与原系统兼容的结果。模型任务与作文报告不是同一个对象：任务保存模型原始请求和响应；原有前端继续评分校准、修复难度、处理身份、显示与核对报告。教师核对后的报告目前仍保存在按账号区分的本机工作区，跨设备报告同步和正式发布尚未完成。

| 数据 | 位置与边界 |
| --- | --- |
| 登录会话、任务状态、重复提交摘要与处理状态 | D1，身份从会话取得 |
| 模型原始消息、图片及响应 | 私有 R2，读取接口再次验证教师与 owner |
| 原有设置、历史快照、档案、分析与导出历史 | 浏览器按服务器确认的工作区 ID 分隔保存 |
| 当前批次原图与进度 | IndexedDB，原图只写入一次，状态更新写小型清单 |
| 未完成模型请求编号 | 按工作区区分的 sessionStorage，刷新和网络恢复时复用 |
| 旧版浏览器数据 | 原位置继续保留；首次迁移可带入当前工作区，递归去除已识别的凭据字段 |

## 队列与重试

任务在调用供应商前先写入 D1/R2，再投递 Cloudflare Queues。重复请求使用同一 requestId，内容或模型配置不一致时拒绝；不同教师不能共享请求编号或读取彼此结果。消费者在处理前再次核验来源授权，使用 D1 状态和租约避免同一任务的并发调用。

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
    "maxTokens": 10000,
    "timeoutMs": 180000
  }
]
```

密钥单独存入相应 Worker secret，不写进 JSON、Git、浏览器或测试记录。未配置密钥的模型不会出现在选择列表中。接口只接受管理员登记的 HTTPS 地址，回环 HTTP 仅供本地联调；不跟随供应商重定向转发密钥。

额度变量 `MODEL_DAILY_LIMIT` 默认每位教师每滚动 24 小时 1200 个模型任务，设为 0 可关闭该限额；包含批改、题目识别、范文与修复调用。`MODEL_PENDING_LIMIT` 默认同时 20 个任务，均可由管理员调整。请求体最多 20 MiB，单次最多 6 张图，响应最多 2 MiB。大图压缩和扫描裁切仍属后续移动端工作，未在本阶段宣称完成。

已创建独立测试队列 `writeascend-staging-model-jobs`。测试 D1 和私有 R2 已存在。正式部署前必须应用增量迁移 `0001_report_workspace.sql`、`0002_model_jobs.sql`，配置桥接与模型 secret，并核对公网服务通道。现在只在本地应用迁移，尚未远程部署 Worker 或切换正式域名。

## 验证

`npm test` 30 项通过，见 `verification/cloud-model-tests.tap`；`npm run build` 和 `npm run worker:check` 通过。模拟来源下的实际 Wrangler/D1/R2/Queues/浏览器联调见 `verification/cloud-grading.md`。真实模型质量、真实手写识别、正式手机浏览器、学校目录、云端报告同步与发布仍需完成。
