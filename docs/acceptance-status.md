# 升级验收状态

2026-10-17。整个目标尚未完成。代码、合成流程和测试部署已经提供下列证据；真实学校账号、真实教学质量与正式上线仍须分别验收，不能由测试总数替代。

当前教师测试版源提交`889f21f`，版本`aba81b1e-61cb-40c3-966f-7ef360e30ebb`；独立互批版本`2a0eae02-3de2-46b4-85e7-cea566d03c60`。根工程208项及两项目Linux CI通过，报告保留见[展示验证](verification/report-fidelity-checks.json)，本轮班级选择与实际发布见[最新验证](verification/class-selector.md)。

| 用户要求 | 已有证据 | 尚需取得的证据 |
| --- | --- | --- |
| 保留教师大模型一键批阅及原主要功能 | [教师功能基线](scope-and-feature-baseline.md)、[教师流程](verification/teacher-workflow.md)，原提示和评分规则兼容测试；本轮教师浏览器回归通过 | 现任教师以真实班级完整完成一次任务 |
| 优化报告且保留主要内容、编辑和导出 | [保留清单](export-preservation.md)、[旧档案](verification/legacy-archive.md)、[展示复核](verification/report-fidelity-checks.json)，六区内容、原词数/分数、题目、旧维度及缺失数据；两类A4逐页检查 | 用户原设备历史备份、真实长作文和实体打印验收 |
| 专业简洁、手机操作高效 | [设计核对](ui-design-review.md)、[界面证据](verification/ui-review-browser.json)，375–1440px及触摸目标检查 | 学校网络下的iPhone/Android，相机授权、键盘、相册、弱网与打印 |
| 可配置模型、OCR前置检查及帮助 | [个人模型](verification/personal-models.md)、[实现](personal-models.md)，加密托管、图片协议检查及模拟模型回归 | 真实服务商密钥/型号、实际手写OCR、评分与反馈质量及费用 |
| Daily/WordUp统一身份与学校名册 | [桥接](verification/writing-bridge.md)、[目录](verification/school-directory.md)、[实际接入](verification/daily-activation.md)；[真实管理员目录初始化及54班逐项核对](verification/real-account-access.md)，普通教师越权拒绝 | 指定教师两班交互登录与真实学生会话，完整云端目录页面操作 |
| 瑞安市新纪元实验学校、2026-1/2026-2格式 | 真实管理员核验后已备份并初始化瑞安市新纪元实验学校/2026-1：54班2327人；重复提交去重、后续预检零变更 | 后续学期与转班试点 |
| 个性化手写写作单、扫码关联 | [写作单](verification/writing-sheets.md)、[收作业](verification/writing-collection.md)，版本、页码、重扫、作废、多页及本地待传 | 实际打印/复印、真实手写、混页与拿错纸的手机试点 |
| 按拼音首字母选学生后连续拍照、自动姓名候选 | [手机收取](verification/student-capture.md)、[界面流程](verification/ui-review-browser.json)，同名保留候选、上传回执后下一位 | 真实中文手写姓名识别率、同名核对及整班收取效率 |
| 批改关联学生账户、自主查看 | [学生发布](verification/student-publication.md)、本轮三账号回归，稳定身份、不可变发布、同名隔离及撤回 | 真实教师发布与真实学生本人登录查看，转班/权限核对 |
| Daily反馈打通 | [摘要同步](verification/daily-feedback.md)，独立outbox、去重、版本拒旧、失败重试与撤回 | 真实发布事件在Daily个人入口正确显示且不覆盖旧数据 |
| 学生互批为独立项目、依据科学框架并关联教师标准 | [研究](peer-review-research.md)、[轮次](verification/peer-rounds.md)、独立包/Worker/D1/Cookie；提示与原rubric版本相连 | 真实课堂提示理解、评阅质量、匿名分配与教师异常处理试点；原创学生量表不声称已完成本校效度验证 |
| 同伴反馈、作者回应和自主手写二稿 | [同伴二稿](verification/peer-feedback-revisions.md)、[自主修订](verification/student-revisions.md)，反馈/稿次绑定、教师接收与后续原批阅 | 真实学生完成评阅、回应、手写修订、教师核对及新版本反馈 |
| GitHub代码、Cloudflare迁移、可回滚上线 | 草稿PR、独立Linux CI、[实际测试发布/恢复](verification/cloudflare-staging.md)及后续版本记录，D1/R2与指定版本演练 | 真实学校试点全部通过后，准备正式域名/回调配置、最新数据备份与核对，再实施正式切换和恢复验证 |

## 下一项真实验收

用户现已完成真实教师与管理员登录核验。正式目录初始化为瑞安市新纪元实验学校、2026-1、54班2327人；真实管理员名单接口与权威源逐班逐人相符，写入前已备份。首批指定教师账号已按用户要求归并，八（13）班47人、八（14）班49人的批阅与发布权限已通过真实管理员接口开通；用户随后完成归并后教师登录，实际来源身份teacher、仅可见2班及47/49人名单，其他班级403；真实学生会话尚未验证。Chrome DOM确认管理员身份和入口，但之后控制超时，完整目录界面流程尚未通过，见[真实账户核对](verification/real-account-access.md)。

用户已指定两账号归并、首批教师班级和发布权限，备份副本演练及实际账号/任教授权检查通过，见[首批账号核对](verification/pilot-account.md)。该教师登录及两班权限已核验，接下来依次完成写作单与手机收取、真实模型批阅和发布，由学生验证本人报告、独立互批及手写二稿。模型密钥只在网页设置输入，真实模型、纸张/设备和课堂结果分别留证，存在问题先修复再扩大班级范围。

正式域名尚未切换。前述真实验收缺失时，不以修改DNS或合并草稿PR来宣称目标完成。原代码、旧浏览器数据与独立备份继续保留。此清单不代表之后无需修复试点发现的问题。

教师端已按工作台、任务、快捷批阅、档案、学情、班级、模型设置重新组织，任务内分阶段执行，见[新版界面验证](verification/workspace-redesign.md)。
