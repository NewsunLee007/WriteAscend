# WriteAscend 升级工程

第一阶段审计已完成，基线日期为 2026 年 10 月 16 日。本阶段只建立源码基线、核对登录与学生数据、制定实施规格；未修改或部署两个线上系统。

升级以原 GitHub 教师作文批阅系统的完整功能为基础：题目和标准设置、作文上传、大模型一键批量批改、教师核对、导出与班级分析。保留后逐项优化，再接入 Daily 身份、Cloudflare 后台与扫码收作业。

学生互批是独立的新项目，使用共享身份和评价标准接口，不替换或混入教师一键批改主流程。`src/main.tsx` 当前入口为从原系统保留的 `TeacherApp.jsx`；报告导入实验界面不作为产品入口。

- [第一阶段审计结论](docs/phase-1-audit.md)
- [具体改造规格](docs/implementation-spec.md)
- [批改报告保留与补齐清单](docs/export-preservation.md)
- [下一阶段开发顺序](docs/phase-2-backlog.md)
- [可复核的结构与数量证据](docs/phase-1-evidence.json)
- [已执行的验证记录](docs/verification/README.md)

`sources/WriteAscend/` 是从用户 GitHub 仓库取得的只读审计基线，已从本工程 Git 跟踪中排除；该目录自身保留原仓库信息。Daily 和 WordUp 源码、正式数据库仍位于原路径，本阶段未复制账号库、口令或学生作文到本工程。

重新采集结构证据可运行 `scripts/collect-phase1-audit.py`，使用 WordUp 服务虚拟环境中的 Python。脚本通过只读 SQLite 连接输出表结构、聚合数量和代码摘要，不导出学生身份行或认证数据。
