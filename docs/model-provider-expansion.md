# 主流模型供应商扩充

2026-10-17。新增 DeepSeek、火山方舟豆包、月之暗面 Kimi、MiniMax、百度千帆、腾讯混元 TokenHub、Anthropic Claude。与已有千问、智谱、硅基流动、Gemini、OpenAI、Mistral 合计13家主流供应商，另保留自定义接口和本地模型。

入口：模型与设置 → 添加模型 → 选择用途、供应商与型号。每家配置绑定对应接口、官方密钥申请入口、接入说明及计费链接。缺少已核实账户目录协议的供应商保留官方精选，不向猜测的接口发送密钥。

## 本轮精选与依据

| 新增供应商 | 本轮精选 | 官方核对依据 |
| --- | --- | --- |
| DeepSeek | `deepseek-flash` | [模型与能力](https://api-docs.deepseek.com/quick_start/pricing/)、[视觉输入](https://api-docs.deepseek.com/guides/vision/)、[目录](https://api-docs.deepseek.com/api/list-models/) |
| 豆包 | Seed 2.1 Lite/Pro（260915）、Turbo（260628） | [方舟模型列表](https://docs.volcengine.com/docs/82379/1330310?lang=zh)、[接入说明](https://www.volcengine.com/docs/82379/1399008) |
| Kimi | `kimi-k3`、`kimi-k2.6` | [当前/下线型号](https://platform.kimi.com/docs/models)、[图片输入](https://platform.kimi.com/docs/guide/use-kimi-vision-model)、[参数限制](https://platform.kimi.com/docs/api/models-overview) |
| MiniMax | `MiniMax-M3` | [兼容接口与多模态参数](https://platform.minimax.cn/docs/api-reference/text-openai-api)、[密钥与计费账户](https://platform.minimax.cn/docs/guides/quickstart-preparation) |
| 百度千帆 | `ernie-5.0` | [型号与视觉能力](https://intl.cloud.baidu.com/en/doc/qianfan/s/7m95lyy43-intl-en)、[v2模型目录](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y) |
| 腾讯混元 TokenHub | `hy-vision-2.0-instruct` | [图片输入](https://cloud.tencent.com/document/product/1823/136956)、[鉴权及目录](https://cloud.tencent.com/document/product/1823/130078)、[上下文与输出限制](https://cloud.tencent.com/document/product/1823/130051) |
| Anthropic Claude | Sonnet/Haiku/Opus 5.5 | [当前型号](https://platform.claude.com/docs/en/models/overview)、[原生接口](https://platform.claude.com/docs/en/api/messages)、[模型目录能力](https://platform.claude.com/docs/en/api/models/list) |

这是针对照片作文流程的用途筛选，不能把每个品牌的全部型号都标成视觉模型。DeepSeek Pro等纯文字型号和已下线的Kimi型号不会列入推荐；明确不支持图片或已下线的已知型号，也不能通过手动勾选绕过配置检查。专业OCR继续用于题目/姓名等文字提取，不分配为作文评分模型。模型是否适合本校手写、评分与反馈，还需教师以实际作文验证。

## 实际适配

- DeepSeek和豆包默认关闭额外思考；Kimi K3使用low推理强度，K2.6采用非思考模式，均省略其不支持的自定义温度。
- MiniMax M3使用新输出量参数并分离思考与最终文字。
- Claude使用原生Messages协议，转换system与Base64图像块，使用`x-api-key`和`anthropic-version`，从响应中只提取文字块；不将思考块混入报告，不发送不受支持的温度或兼容JSON字段。
- 目录查询仍按教师、供应商、用途、密钥及域名隔离缓存，不跟随跳转；识别DeepSeek和千帆的输入/输出模态、Claude的image_input能力、腾讯在线状态。无目录接口或刷新失败时保留内置精选，提示教师核对权限。
- 沿用个人密钥加密、任务授权、班级隔离、队列去重、报告保留及发布流程；不需要迁移数据库、改Daily或改学生账户。

## 验证

新增5项集成测试，覆盖7家供应商逐一保存配置→发送图片→现有绑定批阅流水线→读取报告（均为合成响应，真实供应商调用为0）、目录鉴权/能力筛选、Claude原生协议和响应归一化、已知纯文字或下线型号在付费调用前拒绝。原有本地模型连接与OCR协议测试继续保留。

浏览器使用隔离合成账号，逐一核对7家型号、接口和申请入口；OCR用途可见Mistral且作文批阅用途不显示它。没有在官方供应商域名输入合成密钥来触发目录调用，也没有读取或代填真实API Key。正式上线记录另见`docs/verification/provider-expansion-release.json`。
