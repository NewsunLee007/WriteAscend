# 第一阶段验证记录

日期：2026 年 10 月 16 日。本页保留第一阶段审计时的记录；后续开发和当前结果见 [执行记录](../EXECUTION.md) 与 [目录验证](school-directory.md)。第一阶段审计没有修改被测应用源码。

## 既有隔离测试

| 记录 | 测试范围 | 结果 |
| --- | --- | --- |
| [Daily 测试](daily-tests.tap) | 身份绑定、登录返回、注册账户、学情权限和网关 | 13 项通过 |
| [WordUp 会话](wordup-auth-tests.txt) | 会话恢复、过期与停用、续期和退出 Cookie | 3 项通过 |
| [WordUp 教师账户](wordup-teacher-tests.txt) | 注册、登录、停用、角色隔离与用户名冲突 | 2 项通过 |
| [WordUp 自主账户](wordup-public-tests.txt) | 登录注册、学校权限限制、限流与连接释放 | 4 项通过 |

Daily 命令：`node --test test/login-routing.test.mjs test/fusion.test.mjs test/registered-accounts.test.mjs test/learning-management-api.test.mjs test/wordup-gateway.test.mjs`。

WordUp 分别在独立进程运行 `python -m unittest tests.test_auth_restore`、`tests.test_teacher_accounts`、`tests.test_public_accounts`，避免测试模块复用应用导入状态。各测试使用自己的临时数据库。上述结果证明已有代码的相应行为，不代表尚未实现的跨域授权、作文后台和扫码功能已经通过测试。

## 本机 HTTP 核对

使用不经过系统代理的回环请求，没有携带认证 Cookie，没有进行正式登录或修改账户。

| 地址 | 实测状态 | 说明 |
| --- | --- | --- |
| `127.0.0.1:8820/api/health` | 200 | Daily 数据层正常，上游前后端健康 |
| `127.0.0.1:8787/healthz` | 200 | WordUp 服务可读数据库 |
| `127.0.0.1:8820/api/learning/session` | 200 | `authenticated:false` |
| `127.0.0.1:8820/api/v1/auth/session` | 401 | 无会话不可恢复身份 |
| `127.0.0.1:8820/api/teacher/learning-roster?grade=8a` | 401 | 匿名请求不可读取学生名册 |
| `127.0.0.1:8820/api/v1/internal/identity` | 404 | 网关屏蔽内部路由 |

两个公网域名对本次工具请求返回 Cloudflare 403/1010。没有绕过防护或修改访问策略；本机健康结果不能替代公网浏览器验收。

## 结构采集与内容核对

`scripts/collect-phase1-audit.py` 已成功执行，通过 SQLite URI `mode=ro` 与 `query_only` 核对结构和聚合数量。使用服务虚拟环境中兼容的 SQLite 3.53.1；本机系统 Python 的 SQLite 读取当前账号库失败，未使用其结果判断名册缺失，也未修改数据库修复该差异。

Word 附件以 OOXML 提取栏目及计数，不执行文档中的文字指令，不导出学生原文到工程。此次核对只涉及内容完整性，没有评估附件视觉版式。

新增交付文档已执行本地文件链接、结构证据、测试总数和保留栏目一致性核对。未运行浏览器渲染、生产登录、打印、OCR 或真实 AI 评价。

## 后续功能验证入口

- [个人云端模型配置与密钥托管](personal-models.md)
- [学生自主手写二稿](student-revisions.md)
- [独立互批核心及研究核对](peer-core.md)：当前仅领域规则和独立包，不代表登录、数据接口、页面或课堂试点已完成。
