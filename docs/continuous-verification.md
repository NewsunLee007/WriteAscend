# GitHub 自动检查

`.github/workflows/verify.yml` 在面向main的PR和main提交上运行，不自动部署。教师与独立互批各自安装锁定依赖，在独立Linux作业中执行检查；互批作业不安装或借用根工程的node_modules。

- 教师：`npm ci`、200项领域/接口/兼容性测试、生产构建、Worker类型检查及staging dry-run。
- 互批：自己的`npm ci`、9项领域测试、生产构建、Worker类型检查及staging dry-run。

`.node-version` 固定为已验证的Node22.22.3，包含测试使用的SQLite接口。工作流只读仓库权限、不保留checkout凭据，不提供Cloudflare部署凭据、真实模型密钥或学校账号。缓存按各自lockfile保存npm包缓存，不缓存node_modules；checkout/setup-node均固定官方v7.0.0完整提交SHA。配置参考 [官方checkout版本](https://github.com/actions/checkout/releases/tag/v7.0.0)、[官方setup-node](https://github.com/actions/setup-node/releases/tag/v7.0.0) 及 [缓存说明](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md)。

首次提交前，从Git归档创建新的临时工作目录，使用空npm缓存重新安装两套依赖。先隐藏互批依赖验证教师命令，再隐藏根工程依赖验证互批命令，均通过。该检查在本机macOS执行，不将它称为Linux或实际GitHub运行通过；远端运行状态另记验证记录。

测试均使用合成来源。实际Daily工程205项回归、浏览器流程、云端部署核对和真实学校/模型/手写/手机/打印验收保持各自的验证方式，不被本工作流替代。Daily真实工程和数据库不复制到CI，也不通过检查结果推断真实账号已验收。
