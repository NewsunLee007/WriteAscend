# Cloudflare 测试发布与回退

本文件说明独立测试环境的操作，不代表正式切换完成。教师应用使用 `writeascend-staging`，互批使用 `newsun-writing-peer-staging`，两者有各自的 D1，通过固定服务绑定交换数据。原正式域名和 Daily 业务库不作为恢复演练对象。

## 发布前记录

执行根工程与独立项目测试、构建和两个 Worker 的类型检查/dry-run，提交经核对的代码，然后运行：

```sh
node scripts/release-manifest.mjs
```

脚本要求工作区干净，核对测试账号、Worker 名称、HTTPS 来源、独立数据库、私有桶、队列与服务绑定；拒绝生产域名路由、共享数据库和明文凭据。输出目录包含 Git 提交、源文件/构建资源/迁移摘要，以及首次部署所需的教师 bootstrap 配置。构建与迁移必须对应同一份已审查代码，不能用工作目录中的随意旧包代替。

两个应用的页面先经过 Worker，再调用静态资源绑定，保证已有 CSP、相机和缓存策略实际执行；仅让 API 先经过 Worker 不能证明页面响应头生效。相关平台行为见 [静态资源路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) 和 [静态资源响应头](https://developers.cloudflare.com/workers/static-assets/headers/)。

## 首次部署次序

1. 核对 Cloudflare 账号、现有 Worker、D1 schema、R2 公开性和队列使用情况。先记录 D1 时间点/书签及导出，再应用本项目的远程增量迁移。测试环境也不使用本机合成数据库直接覆盖远程库。
2. 初次教师 bootstrap 配置省略尚不存在的互批服务绑定，先建立教师 Worker；它不替换正式域名。
3. 部署独立互批 Worker，绑定已存在的教师服务；再用正式测试配置部署教师 Worker，完成双向绑定。
4. 记录两个版本 UUID、标签、Git/构建摘要与当前部署。`VERSION` 绑定将当前版本投影到只读 `/api/health`，供部署和回退核对。
5. 执行 `node scripts/qa/staging-release.mjs`，核对公开页面、CSP、构建资源和匿名访问拒绝。`loginConfigured` 只说明配置存在，不证明学校账号、当前权限或完整教学流程已通过。

首次基础设施发布不启用学校登录。交换凭据与个人模型加密密钥保存在服务端；Daily 学校桥接凭据和回调须经后续具体配置与运行服务核对再启用，不以测试身份替代真实学校账号。私有部署文件留在被 Git 忽略且权限受限的目录，密钥不写入 manifest 或公开文档。

## 回退与数据恢复

Worker 回退选择已记录的明确版本 UUID，不依赖“上一个版本”的猜测。切换后再次核对健康端点的版本和匿名权限。新旧版本必须兼容当前数据结构；[Worker 版本回退](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)不会恢复关联的数据库或对象存储。

D1 另行记录书签和 SQL 导出。[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)可恢复到记录的时间点；恢复属于数据操作，必须先保存当前状态。实际恢复演练使用新建的 `writeascend-staging-restore-drill` 和合成探针表；不得据此恢复或删除正式数据。R2 独立校验私有探针的字节摘要，源码回退不等于删除文件。

实际执行日期、版本、检查结果和未完成项目记入后续验证记录。正式切换仍需学校目录/教师权限确认、真实账号、模型与手写/OCR、手机相机/软键盘、打印、历史数据迁移与正式回滚验证。

2026-10-17 已完成本阶段实际部署、指定版本切换和独立恢复演练，结果及边界见 [验证记录](verification/cloudflare-staging.md)。当前电脑终端的 HTTP 验收使用既有系统代理；浏览器也沿用系统网络设置。直连失败不被计为应用验收通过。

同日经用户确认维护时间，随后启用两个测试应用的 Daily 学校登录。实际配置/数据库备份、单服务重启、接口与浏览器结果、明确回退步骤见 [Daily 接入记录](verification/daily-activation.md)。这次接入没有切换正式域名，真实账号验证由用户安排稍后进行。
