# 项目进度

更新：2026-11-14 12:30（Asia/Shanghai）

| 阶段 | 状态 | 说明 |
|---|---|---|
| S1 契约 | 完成 | 六份 S1 文档已通过 `CONTRACT_CHANGE.md` 同步为关闭注册、单一 Supabase Auth 共享账号 |
| S2 数据层 | 完成 | 10 个测试文件、49 项测试通过；`0003` 与 `0004_music_bucket.sql` 均已完成 |
| S3 UI 集成 | 完成 | 单账号登录、会话恢复、退出、公开壳层和私密卸载已接入 |
| S3 UI 精修与音乐 | 完成 | 暖米纸编辑部视觉、非均匀照片编排、黑白气球/陈玫色爱心点缀、可替换背景音乐已接入 |
| S4 本地门禁 | 完成 | `npm test` 49/49、`npm run typecheck`、`npm run build` 均通过 |
| S4 Auth 平台配置 | 完成 | 公开注册已关闭；Auth Users 仅保留一个共享邮箱账号 |
| S4 Auth 迁移 | 完成 | `0003` 在 Supabase SQL Editor 连续执行两次成功；旧开放策略已撤销 |
| S4 权限矩阵 | 完成 | 匿名 REST `401`、Storage 写入/签名 `400`、元数据 `0`；唯一账号登录与刷新 `200`，三表和 Storage CRUD 通过并清理 |
| S4 production preview | 完成 | 登录、刷新恢复、退出清理、375px 无横向溢出、登录后断网降级均真实通过 |
| S4 跨浏览器共享 | 完成 | 两个独立 Edge profile 用同一共享账号完成 A 写入、B 读取、删除同步和离线验证 |
| S4 本地 Git | 完成 | `main` 根提交已创建；`.env` 历史 0 条、索引未命中、工作区干净 |
| S4 GitHub Actions/Pages | 完成 | Pages run #2 成功；keepalive run #1 成功，Auth/REST 均 HTTP 200 |
| 线上地址 | 可用 | https://6544555.github.io/birthday-memory/ ，线上共享账号登录通过 |
| 整体交付 | DONE | 本地门禁、真实 Supabase、独立复审、Git 隔离、Pages 与保活全部完成 |

## 最新门禁

```text
npm test
Test Files  10 passed (10)
Tests       46 passed (46)
TEST_EXIT_CODE=0

npm run typecheck
TYPECHECK_EXIT_CODE=0

npm run build
103 modules transformed
BUILD_EXIT_CODE=0
```

## 真实 Supabase 结果

- 公开注册开关：`true -> false`，保存并刷新后仍为关闭。
- Auth Users：仅一个共享账号。
- `0003_authenticated_access.sql`：连续两次返回 `Success. No rows returned`。
- 在线策略：三表为 `authenticated / ALL`，Storage 为 `authenticated` 的 SELECT/INSERT/UPDATE/DELETE。
- 匿名 REST：HTTP `401`。
- 匿名 Storage：列表 `200` 且 0 行元数据；上传和签名均 `400`。
- 唯一账号：密码登录 `200`、refresh `200`、错误密码 `400`。
- 三表与私有 Storage：insert/read/delete 全部成功，测试数据 remaining `0`。
- 详见 `docs/evidence/auth-live-matrix-20261114.txt`。

## 发布

- 线上站点：https://6544555.github.io/birthday-memory/
- GitHub 仓库：https://github.com/6544555/birthday-memory
- Pages 与 keepalive 成功日志见 `docs/evidence/A24-github-actions-20261114.txt`。
- 非 P0 风险仍记录在 `docs/REVIEW.md`，不阻塞当前可用交付。
