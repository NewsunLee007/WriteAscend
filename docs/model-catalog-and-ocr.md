# 精选模型、账户目录与专业 OCR

核对日期：2026-10-17。内置的是接口、型号推荐和申请入口，实际调用仍需要学校提供模型，或教师连接自己的服务账户。型号可见不代表该账户已开通调用；这里的推荐是按输入输出能力和教学用途筛选，并非跨供应商质量排名或手写准确率保证。

## 教师操作

在“模型与设置”点击“添加模型”，依次选择用途、服务商、型号和密钥。常用接口、输出参数和供应商差异由系统预设，高级选项可调整实际服务地址。每个服务商都配有官方接入、API Key 和计费链接；密钥申请、开通及费用由相应服务商管理。

作文批阅默认推荐视觉语言模型，直接读取作文照片，保留现有评分标准、完整报告、编辑和导出流程。切换至图片文字识别时，千问专用 OCR 排在前面；Mistral 只出现在 OCR 用途中。题目和纸面身份可使用专业 OCR，正文评分仍由通用视觉批阅模型完成。

| 服务商 | 内置批阅推荐 | 专用 OCR | 主要核对来源 |
| --- | --- | --- | --- |
| 阿里云百炼 | Qwen3.8 Flash / Max | Qwen3.5 OCR、Qwen VL OCR | [兼容调用](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions/)、[OCR 接口](https://help.aliyun.com/en/model-studio/qwen-vl-ocr-api-reference) |
| 智谱 | GLM-4.6V / Flash | 使用视觉型号识别 | [视觉型号说明](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v) |
| 硅基流动 | Qwen3 VL 30B A3B Instruct | 使用视觉型号识别 | [账户模型目录](https://docs.siliconflow.cn/docs/api/models-get)、[JSON 模式限制](https://docs.siliconflow.cn/docs/userguide/guides/json-mode) |
| Google | Gemini 3.8 Flash、3.5 Flash-Lite | 使用视觉型号识别 | [当前模型](https://ai.google.dev/gemini-api/docs/models)、[兼容接口](https://ai.google.dev/gemini-api/docs/openai) |
| OpenAI | GPT-6.1 Sol、GPT-6 Luna、GPT-6 Astra | 使用视觉型号识别 | [模型目录](https://developers.openai.com/api/docs/models/all)、[Sol 图片输入与接口](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| Mistral | 不用于作文评分 | OCR 4.1、OCR 最新别名 | [Document OCR](https://docs.mistral.ai/studio/document-processing/basic_ocr)、[OCR 请求格式](https://docs.mistral.ai/api/endpoint/ocr)、[版本记录](https://docs.mistral.ai/resources/changelogs) |

每个列表最多显示 8 个适用型号。账户返回的已核对型号系列及其快照可入选；不会把未知的新型号直接视为支持作文照片。语音、绘图、实时音频、向量、重排序和未经核对的型号不会进入推荐列表。高级用户仍能手动填写已开通的视觉型号。

## 自动刷新与密钥

选择服务商即载入内置精选。有同供应商、同域名的已保存密钥时，自动查询账户目录；输入新密钥后延迟 600ms 查询，避免每个按键都发送请求。提供手动刷新，切换服务商或用途会取消旧查询，过时响应不会覆盖新列表。

- 千问采用原生 `/api/v1/models`，使用 `page_no`、`page_size`，兼容 `output.models`。额外尊重账户目录声明的图片输入与文字输出能力。
- OpenAI、Gemini、SiliconFlow、Mistral 使用各自官方模型目录。结果仍经过本项目用途筛选。
- 智谱目前没有纳入已核实的账户目录 API，因此刷新官方精选并明确说明，支持手动填写；不向猜测的路径发送密钥。自定义接口也由用户手动核对型号。
- 账户刷新失败保留内置列表，并显示鉴权、连接或限流提示。原有配置若未在目录中确认，会保留当前选择并提示核对，不静默替换。
- 服务端不跟随跳转，限制响应 1 MiB、每次最多两页、每页请求 12 秒超时，缓存 60 秒且按教师、服务商、用途、地址和密钥摘要隔离。

个人密钥加密托管，不返回浏览器、不写入本地设置、报告或导出。同一教师同服务商、同域名可复用已保存密钥，新配置独立加密保存。编辑、移除或轮换一份配置不会自动修改其他独立配置；供应商撤销旧 Key 后，需要逐份选择更新后的密钥。更换服务商或域名时不能沿用旧配置的密钥。

## 专用 OCR 适配

Mistral 使用 `/v1/ocr` 和 `document.image_url`，读取 `pages[].markdown`；千问 OCR 使用兼容图片转文字请求，去掉不适合专用识别的通用系统消息、JSON 模式及温度参数，VL OCR 输出限制保守设为 4096。SiliconFlow 视觉型号不发送其不支持的 `response_format`，继续使用原有 JSON 输出提示。

识别结果统一回现有题目、身份、连接检查协议。纸面身份转录仅解析顶部明确标注的姓名、班级、学号，不根据裸姓名猜测；同页出现多个姓名标签时标记为多人。照片与学校名单的后续核对及人工确认继续生效。专用 OCR 拒绝作文评分提示及多图请求，避免误用并在发送前停止。

学校提供的 `MODEL_PROFILES` 可加 `provider`（例如 `qwen`、`openai`、`mistral`），以应用相同适配。Mistral 示例：

```json
{"id":"school-ocr","label":"学校专用 OCR","provider":"mistral","apiUrl":"https://api.mistral.ai/v1/ocr","model":"mistral-ocr-4-1","purposes":["ocr"],"supportsImages":true,"keyBinding":"MODEL_KEY_SCHOOL_OCR"}
```

实际 Key 通过 Worker Secret 维护，不能写入上述配置文件。不带 `provider` 的既有系统配置保持原有协议。
