# 个人模型配置与密钥托管

2026-10-17。本地实现，正式云端尚未部署；真实供应商与手写质量尚待验收。教师原有一键批阅、评分提示、报告、导出和分析继续使用。

## 教师操作

在“设置 → 我的模型与密钥配置”添加服务商、账户中可用的视觉型号及 API 密钥。服务商地址自动填入，配置名称、地域地址、图片能力、用途与协议参数放在更多选项。提供官方接入、获取密钥与图片说明链接，不预填未经账户核验的型号。千问默认北京兼容地址，其他地域及业务空间须按官方文档修改，并使用对应密钥。

保存不会调用模型；保存后默认选用新配置，OCR 优先复用批改模型。“检查连接和图片识别”用系统图片验证连接、读图及 JSON 返回，每个不同模型调用一次，按服务商计费。它不能证明中文姓名或英文手写识别、评分质量合格。纯文字配置可以保留，但不出现在照片批改和 OCR 的可选项。

配置和加密密钥由服务端按教师身份保存，其他设备登录同一账号可读取配置；批改/OCR 的当前选择仍按本机工作区保存，尚未实现跨设备偏好同步。编辑时密钥框为空，留空保持原密钥。删除配置清除当前记录的密文，已有模型响应、教师报告和学生发布快照继续保留。每位教师最多 8 个活动配置，每小时最多 60 次配置写入。

## 版本、工作与计费

配置有用于并发编辑的修订号，以及固定模型执行参数的版本摘要。只改名称不改变执行版本；更改地址、型号、能力、用途、输出参数、温度或密钥会产生新执行版本。入队和发送前均核对该版本；前端已取得旧版本时，新的提交会先被拒绝。队列中的旧请求不会借新密钥继续发送。

学校任务可从已完成、失败、暂停或待确认状态明确重新 AI 批阅，使用当前核对的模型并保留历史；结果不明的已发送请求需要勾选确认，不能通过改配置绕过核对。重新批阅不自动改变学生已发布的版本。普通工作台保留原恢复边界，见 [后台授权说明](background-work.md)。

删除或暂时无法读取所选个人配置时，不自动切换成学校模型承担费用，教师需要重新选择。现有学校模型的教师可见范围及任务配额保持原机制；这次个人托管没有新增学校付费资格或按供应商金额统计，正式启用时须核对系统模型授权与费用安排。

## 服务端设置

迁移 `0012_personal_models.sql` 在本地隔离 QA 数据库应用；远程需按顺序从已应用版本迁移，不能修改已应用文件。

- `MODEL_VAULT_KEY`：独立、随机的 32 字节密钥，Base64/Base64url 编码，作为 Worker secret 保存。不能复用供应商 API Key，也不能写入仓库或日志。
- `MODEL_VAULT_KEY_ID`：当前密钥版本标识，默认 `primary`；建议部署时明确指定。
- `MODEL_VAULT_PREVIOUS_KEYS`：可选的旧密钥映射 JSON，最多 4 项，内容同样作为 secret 管理。它只用于读取旧密文及核对旧操作回执。

凭据使用 AES-GCM、随机 nonce，并认证教师、配置 ID、凭据修订与托管密钥版本。只在发送前解密；浏览器配置响应、模型目录和配置历史不返回密文或原密钥。配置操作摘要使用带托管密钥的 HMAC，历史仅保留非秘密配置元数据，不复制历次凭据。客户端密钥输入和未完成保存请求只在当前组件内存保留，关闭/卸载清除，不存入 localStorage、sessionStorage、IndexedDB、作文报告或导出文件。

更换托管密钥时先保留旧 key ID 对应密钥，新写入使用新密钥；随后由教师更新凭据或执行经审计的重加密维护，再移除旧密钥。当前没有自动批量重加密工具。缺少相应旧密钥时显示配置不可用，禁止转用其他凭据；删除不依赖密钥可读取。

**备份恢复必须处理已删除凭据。** 从旧 D1 备份恢复，可能重新带回历史密文，不能宣称数据库删除会抹去所有备份。恢复环境应先停止消费者并取消旧待执行工作，停用恢复的个人配置、要求教师重新登记；或轮换托管密钥且不再提供能够解密恢复密文的旧密钥。验证后再开放调用，不能直接恢复旧数据库加旧密钥并启动队列。

## 接口与连接边界

`GET /api/model/settings` 返回本人配置元数据；`POST /api/model/personal` 新建；`PUT/DELETE /api/model/personal/:id` 以操作编号及 `expectedRevision` 幂等写入。仅教师/管理员可用，修改要求当前工作区与同源请求。`GET /api/model/profiles` 合并本人配置与已配置系统模型；个人目录附执行版本，模型任务和学校运行提交时可据此拒绝陈旧配置。

个人兼容接口只允许公网 HTTPS 域名，不带用户名、密码、查询串、片段或非标准端口；拒绝 IP、单标签/保留域名及本站/Daily 主机。回环 HTTP 仅在 localhost 开发来源允许。请求不跟随重定向，只有个人模型 Key 发往已配置地址，不附带 Daily 来源 Cookie 或机器凭据。运行依赖 Worker 的公网全局 fetch，不能把该能力接入 VPC/私网网络绑定，也不能让目标服务信任可伪造的 `CF-Worker` 来源信息。域名语法检查不能单独被描述为任意网络环境下的 DNS 重绑定防护。

当前使用 Chat Completions 兼容协议。OpenAI 默认 `max_completion_tokens` 且不发送 temperature，其他服务默认 `max_tokens` 和 temperature；具体能力仍由型号决定，可在更多选项调整，不声称所有型号通用。请求超时、未知结果、配额和授权规则沿用 [模型运行说明](cloud-model-runtime.md)。

## 官方依据

以下文档于 2026-10-17 核对，用于服务地址、帮助链接及可调整协议参数，真实账户可用性仍须实际检查：

- [Gemini OpenAI 兼容接口](https://ai.google.dev/gemini-api/docs/openai)、[API Key](https://ai.google.dev/gemini-api/docs/api-key)。
- [百炼服务地址](https://help.aliyun.com/zh/model-studio/base-url)、[千问视觉兼容接口](https://help.aliyun.com/zh/model-studio/qwen-vl-compatible-with-openai)、[获取 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)。
- [OpenAI Chat Completions 参数](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[图片输入](https://developers.openai.com/api/docs/guides/images-vision)。
- [Cloudflare 对全局 fetch 与服务绑定网络边界的说明](https://blog.cloudflare.com/workers-environment-live-object-bindings/)。

实际验证与限制见 [个人模型验收](verification/personal-models.md)。
