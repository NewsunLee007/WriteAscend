# WriteAscend 升级工程

第一阶段审计已完成，基线日期为 2026 年 10 月 16 日。当前已在保留原完整教师系统的基础上接入快速入口、本地验证的 Daily 登录、云端模型任务、报告版本存档、写作任务、授权名册、学校目录管理、个性化写作单、扫码收取、教师版本发布、学生本人反馈、Daily 摘要同步、个人模型密钥托管及学生自主二稿，尚未部署新的线上版本。

升级以原 GitHub 教师作文批阅系统的完整功能为基础：题目和标准设置、作文上传、大模型一键批量批改、教师核对、导出与班级分析。保留后逐项优化，再接入 Daily 身份、Cloudflare 后台与扫码收作业。

学生互批的独立工程位于 [apps/peer-review](apps/peer-review/README.md)，已完成研究核对、领域核心、独立登录和教师材料准备/导入的本地联调；互评轮次与实际评阅页面继续开发。它使用共享身份和评价标准接口，不替换或混入教师一键批改主流程。`src/main.tsx` 当前入口为从原系统保留的 `TeacherApp.jsx`；报告导入实验界面不作为产品入口。

运行 `npm install` 后使用 `npm run dev` 在 `http://127.0.0.1:5186/` 预览。默认快速批改与右上角“完整工作台”共用原评分、模型调用、结果、档案和导出逻辑。`npm test` 验证评分逻辑与历史兼容，`npm run peer:test` 与 `npm run peer:check` 单独检查互批核心，`npm run build` 验证生产构建。浏览器回归脚本和已验证范围见 [教师流程验证](docs/verification/teacher-workflow.md)。

- [第一阶段审计结论](docs/phase-1-audit.md)
- [具体改造规格](docs/implementation-spec.md)
- [批改报告保留与补齐清单](docs/export-preservation.md)
- [下一阶段开发顺序](docs/phase-2-backlog.md)
- [可复核的结构与数量证据](docs/phase-1-evidence.json)
- [已执行的验证记录](docs/verification/README.md)
- [当前执行记录](docs/EXECUTION.md)
- [独立互批研究与适龄改编](docs/peer-review-research.md)
- [独立互批接入方案](docs/peer-review-integration.md)
- [互批核心验证](docs/verification/peer-core.md)
- [云端模型配置与数据边界](docs/cloud-model-runtime.md)
- [云端批改及刷新恢复验证](docs/verification/cloud-grading.md)
- [云端报告保存与恢复](docs/cloud-report-storage.md)
- [跨设备存档验证](docs/verification/cloud-snapshots.md)
- [写作任务与授权名册](docs/writing-tasks.md)
- [任务与名册验证](docs/verification/writing-tasks.md)
- [学校目录、学期与教师授权](docs/school-directory.md)
- [真实名册对账与目录验证](docs/verification/school-directory.md)
- [个性化写作单](docs/writing-sheets.md)
- [打印与二维码验证](docs/verification/writing-sheets.md)
- [手机扫码收作业与稿次输入](docs/writing-collection.md)
- [收作业与弱网验证](docs/verification/writing-collection.md)

`sources/WriteAscend/` 是从用户 GitHub 仓库取得的只读审计基线，已从本工程 Git 跟踪中排除；该目录自身保留原仓库信息。Daily 和 WordUp 源码、正式数据库仍位于原路径，本阶段未复制账号库、口令或学生作文到本工程。

重新采集结构证据可运行 `scripts/collect-phase1-audit.py`，使用 WordUp 服务虚拟环境中的 Python。脚本通过只读 SQLite 连接输出表结构、聚合数量和代码摘要，不导出学生身份行或认证数据。
