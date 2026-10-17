# 登录桥接与名册权限验证

日期：2026 年 10 月 16 日。范围是本地开发与合成账号，不是正式环境上线验收。

## 自动化

`npm test` 共 22 项通过：原有 12 项保留/兼容测试，加 7 项 Daily 桥接测试与 3 项 Worker/Daily HTTP 协议测试。记录见 `writing-bridge-tests.tap`。测试使用临时或内存 SQLite，未修改正式账号库。

覆盖 code 重放、并发兑换、PKCE 不匹配、回调白名单、跨站 POST、过期、账号停用、角色改变、撤销、来源退出、教师未授权、具体班级撤权、同名不同 ID、停用/转班/自主账户过滤，以及云端 Cookie 属性和本地退出。HTTP 协议测试中的 D1 为 SQLite 适配器，不能单独证明 Workers 运行时兼容。

安装后的 Daily 原有登录、绑定、账号管理、学情权限、网关与新增作文返回白名单共 14 项通过，记录见 `daily-after-writing-bridge.tap`。`node --check src/server.mjs` 通过。

## 实际 Wrangler 与浏览器

本地使用真实 Wrangler/workerd 和本地 D1，单独持久化目录为被 Git 忽略的 `output/qa-cloud-state`。桥接来源使用 `scripts/qa/daily-bridge-sandbox.mjs` 中的合成教师，不连接真实 WordUp 账号库。

复现顺序：

```sh
npm run build
node scripts/qa/daily-bridge-sandbox.mjs
```

另一终端：

```sh
npx wrangler d1 migrations apply writeascend-development --env development --local --persist-to output/qa-cloud-state
npx wrangler dev --env development --port 8789 --local --persist-to output/qa-cloud-state --var BRIDGE_SERVICE_TOKEN:synthetic-local-worker-bridge-service-token
```

第三终端以独立浏览器会话运行 `scripts/qa/cloud-login.cjs`。合成机器凭据仅适用于这个回环测试，不能用作正式凭据。

实测通过：

1. `8789/api/auth/start` 跳转至 `8890/writing-connect.html`，显示当前合成教师。
2. 点击继续，经 authorize、token、callback 后回到教师完整应用入口。
3. `/api/me` 返回 200，账号为合成教师；JS 读不到 HttpOnly 会话 Cookie。
4. `/api/classes` 返回空列表，没有自动赋予学校班级。
5. 同源退出返回 200，随后的 `/api/me` 返回 401。

这次实际运行发现 workerd 拒绝 `redirect:'error'`，已改成 `manual` 并将非成功状态作为错误处理，仍不会向重定向目标转发机器凭据。也发现并修复了初始 Worker 草稿中 8 个会话字段使用 9 个 SQL 占位符的问题。上述问题说明类型检查与 Node 协议测试不能替代实际运行环境验证。

390px 的交接页截图已目视核对，保存在 `output/daily-writing-connect-mobile.png`。

## 安装与恢复

实际 Daily 源码安装前后均按 `integrations/daily/patch-manifest.json` 核对。正式服务未重启，启用凭据未设置。另在临时目录中验证：预检、安装、重复安装、回滚预检、恢复原文件与移除新增模块均通过；测试目录和测试快照已清理，实际 Daily 的恢复快照保留。

未完成项仍包括正式防护/机器通道、真实身份端到端登录、学校学年目录初始化、权限管理 UI、教师端登录状态、云端模型调用与任务队列、正式部署与域名切换。
