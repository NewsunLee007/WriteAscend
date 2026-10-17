# WriteAscend 正式域名发布

用户于2026-10-17明确要求以新版替换 `https://writeascend.newsunenglish.com/` 的旧页面。本次授权包括正式发布和必要的登录入口切换，真实课堂质量验收仍单独记录。

正式教师Worker为 `writeascend-production`，独立互批Worker为 `newsun-writing-peer-production`。两个应用各有独立正式D1；教师有独立私有R2、模型队列和反馈队列，不与测试环境共用。Daily继续作为身份、学校目录和任教授权来源。

## 范围与切换次序

1. 记录旧站HTML/响应头、GitHub旧代码提交、Cloudflare现有域名与Worker路由；核对测试环境是否有需迁移的业务数据。
2. 创建独立正式资源，应用完整迁移；在没有正式域名路由和互批绑定的bootstrap配置下部署教师Worker，再部署互批，配置独立交换密钥和个人模型加密密钥。Daily机器凭据沿用已有集成的固定服务身份，秘密只经私有文件上传。
3. 构建、类型检查及测试通过后，提交源代码，运行 `node scripts/production-release.mjs`。该脚本限制唯一接管的正式主机名，校验数据库、私有存储、队列和服务绑定隔离，记录源码、静态资源及迁移摘要。bootstrap输出不含正式路由，不能提前替换旧站。
4. Daily两库使用SQLite在线备份，配置快照存入仓库外0700目录、文件0600。`scripts/daily-production-cutover.mjs` 仅把正式回调放在各自白名单首位并保留测试回调，不变更服务密钥、账号、名单或任教权限。摘要和新鲜度校验后原子替换配置，仅短暂重启Daily web服务。
5. 验证正式回调白名单及机器拒绝路径后，以最终正式配置部署教师Worker。唯一新增路由 `writeascend.newsunenglish.com/*` 接管已有Cloudflare代理域名的全部路径，页面和资源均由新版Worker响应。现有DNS和GitHub源文件保留为回退依据，Worker不透传旧GitHub页面。域名路由机制见[Cloudflare官方文档](https://developers.cloudflare.com/workers/configuration/routing/routes/)。
6. 从正式域名检查健康、构建资源摘要、CSP、学生入口、登录跳转、同源限制及匿名权限；独立互批与Daily服务分别检查。浏览器留存正式域名新页面。

## 日常更新与回退

后续先测试并提交经核对代码，再 `npm run build`、`npm run worker:check:production`，最后 `wrangler deploy --env production`。互批在其独立目录使用 `worker:check:production`，不把测试环境绑定带入正式。

新Worker回退使用发布记录中的明确版本UUID，并重新核对健康与资源。首次迁移若需暂时恢复旧站，只移除本次明确记录的精确域名路由；既有DNS仍指向原站点。不得删除其他域名路由。Daily配置回退需要原摘要一致，仅回退配置并重启web服务，不以旧数据库快照覆盖切换后新增的学习记录。正式D1/R2继续保留，数据恢复与源码/路由回退分别执行。

旧版浏览器本机数据不清除。新页面在相同域名发现旧数据时仍提供迁移或导入入口；密钥不自动从旧浏览器存储上传到云端。首次真实使用需学校登录并在“模型与设置”中完成个人或学校模型配置。实体打印、学校网络的相机/键盘、真实手写OCR与评分质量持续作为课堂验收项，不以页面发布代替。
