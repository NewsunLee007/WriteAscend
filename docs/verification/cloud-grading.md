# 云端一键批改与手机中断恢复验证

日期：2026 年 10 月 16 日。本记录使用合成账号、作文和模拟模型，未读取或发送真实学生数据，没有真实模型调用费用。

## 自动化与构建

`npm test` 共 30 项通过，新增 8 项模型任务测试，记录见 `cloud-model-tests.tap`。检查任务 owner、重复提交、并发消费、原始文本兼容、服务器模型选择、未知结果不自动重发、有限重试、outbox 恢复、租约、授权复核、模型配置变化及输入上限。测试中的 SQL 使用隔离 SQLite，外部模型请求拦截为合成响应。

`npm run build`、`npm run worker:check` 均通过。后者为类型检查与 staging 打包 dry-run，没有部署线上版本。

## 实际本地运行环境

使用真实 Wrangler/workerd、本地 D1、R2 和 Queues。D1 迁移应用到独立的 `output/qa-cloud-state`，没有修改远程 D1 或学校账号库。

先运行 Vite `npm run dev`，供浏览器 QA 读取已提交的合成测试样例。另一终端启动：

```sh
node scripts/qa/daily-bridge-sandbox.mjs
```

再启动本地 Worker：

```sh
npx wrangler d1 migrations apply writeascend-development --env development --local --persist-to output/qa-cloud-state
npx wrangler dev --env development --port 8789 --local --persist-to output/qa-cloud-state --var BRIDGE_SERVICE_TOKEN:synthetic-local-worker-bridge-service-token --var MODEL_API_URL:http://127.0.0.1:8890/v1/chat/completions --var MODEL_NAME:synthetic-server-model --var MODEL_API_KEY:synthetic-local-model-key
```

所有 synthetic 值仅供回环测试，不可用作正式凭据。模型模拟服务等待约 8 秒后返回合成报告，便于验证中断。

独立 Playwright 会话运行 `scripts/qa/cloud-grading.cjs`。该脚本会清理自己的测试浏览器 Cookie、localStorage、sessionStorage 和草稿 IndexedDB，不接触用户浏览器。

实测通过：

1. 登录、显示合成教师身份、显式带入旧版数据，API Key 不带入云端工作区，旧数据保留。
2. 选择服务器模型；浏览器不请求填写 API Key，也没有向模型提交服务器或旧版密钥。
3. 上传合成图片，一键提交真实本地队列；D1/R2 接收持久化任务。
4. 请求完成前刷新页面；恢复原图与进度，点击继续后复用同一 requestId 和任务。模拟供应商调用次数恰为 1。
5. 原总评、优秀表达、纠错、内容优化、升级稿与标准范文栏目均可见；原评分逻辑得到 15.5 分并保存原格式快照。
6. 390px 页面无横向溢出，报告未被父容器裁切。
7. 模型配置接口临时 503 时，已有报告仍可查看和保存；恢复连接后继续可用。
8. 退出、切换另一位合成教师，草稿和本机记录使用不同工作区；访问前一位教师的云端结果返回 404。
9. 静态响应实际包含 `_headers` 中的 CSP 和相机权限规则。原学校标识保存为本地资源，避免依赖旧外部图片域名。

冷启动 Worker 后也完成上述流程。通过 `/cdn-cgi/local/scheduled` 手动触发恢复任务，响应 200。Wrangler 本地不会自动触发 cron，不能把该手动验证当作正式云端调度验收。

截图 `output/cloud-teacher-grading-mobile.png` 已目视核对。真实模型、实际 iPhone/Android、原始手写识别与正式防护通道均未计为通过。

联调初期出现过一次未记录细节的登录回调 500。增加仅本地的错误诊断后，重复流程和 Worker 冷启动均通过，未复现；正式试点仍需观察这一边界。测试工具的 APIRequestContext 对本地 HTTP Secure Cookie 与浏览器行为不同，私有接口断言改为实际浏览器同源 fetch，不以工具未携带 Cookie 的 401 判断产品失败。

## 原流程回归

新增云端入口后，`teacher-workflow.cjs`、`quick-grading.cjs`、`batch-grading.cjs` 均通过：完整工作台、快速入口、批量暂停/继续/失败重试、教师编辑、保存、原七列 CSV 与完整 JSON 备份保留。此部分仍使用合成模型响应，不能支持真实批改质量的结论。
