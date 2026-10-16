# 教师完整流程与快速入口验证

日期：2026 年 10 月 16 日。以下记录属于第二阶段本地开发，不更改第一阶段的审计结论。

## 验证范围与结果

使用 `scripts/qa/fixtures/teacher-workflow.json` 中的虚构班级、作文和模型响应。浏览器测试运行于独立 Playwright 会话，清理的是该测试浏览器的本地存储，不是用户浏览器。模型地址固定为 `model.invalid` 并由测试拦截，没有真实模型调用费用、真实学生或账户数据。

| 检查 | 结果 |
| --- | --- |
| 原评分辅助函数和提示词与 GitHub 基线比对 | 一致 |
| 原教师操作函数保留与完整应用入口 | 通过；仅函数存在性不代表全部功能实测 |
| 旧备份、历史快照、评分标准、未知业务字段和导出兼容 | 9 项测试通过 |
| 原完整工作台：上传、调用模型接口、展示主要报告栏目、保存 | 浏览器通过 |
| 默认快速入口：模型设置可访问、年级传到实际提示、满分同步分项、直接批改、切回完整工作台 | 浏览器通过 |
| 批量暂停 | 当前作文处理后停止，未启动下一份 |
| 继续批改与失败重试 | 2 份作文，第一次成功、第二次模拟 400 错误；重试仅再次请求第二份，总计 3 次请求 |
| 教师修改与保存 | 总评和 14.5 分修改保留，分项之和等于总分 |
| CSV 与 JSON 备份 | 实际下载并解析；CSV 原七列及教师修改分数保留，JSON 包含两份结果、标准和档案 |
| 390px 手机页面与报告 | 无整页横向溢出，报告不超出父容器 |
| 生产构建 | `npm run build` 通过 |

本阶段没有将真实模型质量、设备相机、Word/PDF 标准导入、实际打印/PDF 分页、Cloudflare 登录与云端任务计为已通过。正式域名没有切换，Daily 服务未重启。

## 复现

先启动 `npm run dev`。安装可用的 Playwright CLI 后，分别使用独立会话运行以下脚本；需要确保 `output/` 目录存在。当前本机通过技能附带的 `playwright_cli.sh` 包装器调用同样的命令。

```sh
mkdir -p output
playwright-cli -s=teacher-full open http://127.0.0.1:5186/
playwright-cli -s=teacher-full run-code --filename scripts/qa/teacher-workflow.cjs
playwright-cli -s=teacher-quick open http://127.0.0.1:5186/
playwright-cli -s=teacher-quick run-code --filename scripts/qa/quick-grading.cjs
playwright-cli -s=teacher-batch open http://127.0.0.1:5186/
playwright-cli -s=teacher-batch run-code --filename scripts/qa/batch-grading.cjs
```

图片上传使用合成的 1 像素 PNG，仅验证文件传输和流程。模型响应已经模拟，不能据此评估手写识别率或批阅质量。截图和下载结果保存在被 Git 忽略的 `output/`。
