# 升级验收状态

2026-10-17。整个目标尚未完成。代码、合成流程和测试部署已经提供下列证据；真实学校账号、真实教学质量与正式上线仍须分别验收，不能由测试总数替代。

当前教师测试版源提交`0fc9523`，版本`3424251a-e994-4d93-ad68-2245a237613c`；独立互批版本`2a0eae02-3de2-46b4-85e7-cea566d03c60`。根工程208项及两项目Linux CI通过，具体版本/资源/范围见[最新验证](verification/report-fidelity-checks.json)。

| 用户要求 | 已有证据 | 尚需取得的证据 |
| --- | --- | --- |
| 保留教师大模型一键批阅及原主要功能 | [教师功能基线](scope-and-feature-baseline.md)、[教师流程](verification/teacher-workflow.md)，原提示和评分规则兼容测试；本轮教师浏览器回归通过 | 现任教师以真实班级完整完成一次任务 |
| 优化报告且保留主要内容、编辑和导出 | [保留清单](export-preservation.md)、[旧档案](verification/legacy-archive.md)、[展示复核](verification/report-fidelity-checks.json)，六区内容、原词数/分数、题目、旧维度及缺失数据；两类A4逐页检查 | 用户原设备历史备份、真实长作文和实体打印验收 |
| 专业简洁、手机操作高效 | [设计核对](ui-design-review.md)、[界面证据](verification/ui-review-browser.json)，375–1440px及触摸目标检查 | 学校网络下的iPhone/Android，相机授权、键盘、相册、弱网与打印 |
| 可配置模型、OCR前置检查及帮助 | [个人模型](verification/personal-models.md)、[实现](personal-models.md)，加密托管、图片协议检查及模拟模型回归 | 真实服务商密钥/型号、实际手写OCR、评分与反馈质量及费用 |
| Daily/WordUp统一身份与学校名册 | [桥接](verification/writing-bridge.md)、[目录](verification/school-directory.md)、[实际接入](verification/daily-activation.md)；真实目录只读核对和登录拒绝路径 | 真实管理员登录，目录初始化预览/确认，教师任教范围与学生会话 |
| 瑞安市新纪元实验学校、2026-1/2026-2格式 | 默认学校与学期格式已实现，曾只读对账54班2327名学生；本轮实际Daily学校/班级/成员/任教授权计数仍为0 | 管理员在真实会话中核对当前权威名册和学期，再提交正式目录 |
| 个性化手写写作单、扫码关联 | [写作单](verification/writing-sheets.md)、[收作业](verification/writing-collection.md)，版本、页码、重扫、作废、多页及本地待传 | 实际打印/复印、真实手写、混页与拿错纸的手机试点 |
| 按拼音首字母选学生后连续拍照、自动姓名候选 | [手机收取](verification/student-capture.md)、[界面流程](verification/ui-review-browser.json)，同名保留候选、上传回执后下一位 | 真实中文手写姓名识别率、同名核对及整班收取效率 |
| 批改关联学生账户、自主查看 | [学生发布](verification/student-publication.md)、本轮三账号回归，稳定身份、不可变发布、同名隔离及撤回 | 真实教师发布与真实学生本人登录查看，转班/权限核对 |
| Daily反馈打通 | [摘要同步](verification/daily-feedback.md)，独立outbox、去重、版本拒旧、失败重试与撤回 | 真实发布事件在Daily个人入口正确显示且不覆盖旧数据 |
| 学生互批为独立项目、依据科学框架并关联教师标准 | [研究](peer-review-research.md)、[轮次](verification/peer-rounds.md)、独立包/Worker/D1/Cookie；提示与原rubric版本相连 | 真实课堂提示理解、评阅质量、匿名分配与教师异常处理试点；原创学生量表不声称已完成本校效度验证 |
| 同伴反馈、作者回应和自主手写二稿 | [同伴二稿](verification/peer-feedback-revisions.md)、[自主修订](verification/student-revisions.md)，反馈/稿次绑定、教师接收与后续原批阅 | 真实学生完成评阅、回应、手写修订、教师核对及新版本反馈 |
| GitHub代码、Cloudflare迁移、可回滚上线 | 草稿PR、独立Linux CI、[实际测试发布/恢复](verification/cloudflare-staging.md)及后续版本记录，D1/R2与指定版本演练 | 真实学校试点全部通过后，准备正式域名/回调配置、最新数据备份与核对，再实施正式切换和恢复验证 |

## 下一项真实验收

后续用户已完成真实教师登录：服务端确认`writing.personal`且无班级权限，Cloudflare已有对应教师会话，学校目录/名单读取均返回403。用户选择切换管理员继续；管理员和学生会话仍未验证，正式目录未写入。当前离线只读预检仍为54班2327名学生，见[真实账户核对](verification/real-account-access.md)。下文的先前等待状态已由本次教师登录推进，不表示管理员验收已经通过。

用户已明确选择“稍后再验证真实账号”。当前可开始的下一项为教师测试版通过Daily登录现有管理员会话，核对目录预览与真实任教权限；无需向聊天发送密码或密钥。没有以合成身份代替云端学校账号，也未初始化正式目录。

获得真实会话后，依次核对学校/学期和当前名册、设定试点教师班级，完成写作单与手机收取、模型批阅和发布，再由学生验证本人报告、独立互批及手写二稿。真实模型、纸张/设备和课堂结果分别留证，存在问题先修复再扩大班级范围。

正式域名尚未切换。前述真实验收缺失时，不以修改DNS或合并草稿PR来宣称目标完成。原代码、旧浏览器数据与独立备份继续保留。此清单不代表之后无需修复试点发现的问题。
