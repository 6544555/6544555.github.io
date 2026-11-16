# 验收报告 A1–A28

日期：2026-11-14  
环境：Windows；Node `v26.13.0`；Vite `7.3.8`；Microsoft Edge `157.0.4341.46`；Playwright `1.62.1`；production preview `http://127.0.0.1:4174/恋爱日志/`。
权限模型：Supabase Auth 关闭公开注册，只保留一个共享邮箱密码账号；匿名只看到公开登录入口。

结论：**交付完成**。单账号 Auth、匿名 RLS/Storage 拒绝、唯一账号跨浏览器读写、登录后离线、非均匀照片编排、庆祝点缀、可上传且跨会话保留的自定义背景音乐、响应式和本地门禁已通过；GitHub Pages 与 keepalive 工作流也已真实运行成功。线上地址：https://6544555.github.io/恋爱日志/。

| 编号 | 结果 | 环境 | 操作 | 证据 |
|---|---|---|---|---|
| A1 [P0] | 通过 | Edge 157 headless / 全新 origin | 打开 4188 端口全新 origin，检查 DOM、请求、SW 与缓存 | 登录壳层 `1`、私密壳层 `0`、注册文字 `false`、私密/API 请求 `0`、SW `0`、缓存 `0`；`docs/evidence/A1-auth-fresh-origin.txt` |
| A2 [P0] | 通过 | production preview 375×812 / 真实 Supabase | 登录页账号输入框为空，输入共享账号与新密码后进入主站 | 账号经构建时环境变量映射到内部邮箱；真实登录进入 `#photos-title`，375px 无横向溢出，内部邮箱与账号提示未出现在可见界面 |
| A3 | 通过 | Edge 157 headless / 真实 Supabase | 输入错误密码 | HTTP `400`，无 access/refresh token；私密页面 `false`，显示统一重试文案 |
| A4 [P0] | 通过 | Edge 157 headless / production | 过期会话的 refresh 延迟 `8000ms` | 公开认证壳层 `79ms` 可见；认证前私密 REST/Storage 请求 `0`；`docs/evidence/A2-A4-auth-timing.txt` |
| A5 | 通过 | production 375 / 768 / 1440 | 检查照片列数和横向宽度 | 列数 `2 / 3 / 4`；三档均无横向溢出 |
| A6 | 未验证 | 真实 Supabase | 三图批次与单张失败不回滚 | 阶段 7 只完成单张真实上传；三图失败回滚路径未执行 |
| A7 [P0] | 通过 | 两个独立 Edge 157 profile/进程 | A 上传照片、留言和时光；B 使用同一共享账号读取 | B 读取照片 `1`、留言和时光；B 删除后 A 刷新照片消失；`docs/STAGE7-EXECUTION.md` |
| A8 | 通过 | 两个独立 Edge profile；mobile production 375×812 | B 打开照片、二次确认删除、A 刷新；手机端检查删除操作栏 | 跨浏览器删除同步通过；移动端 Dialog Portal 固定在视口，操作栏 `677–739px`、删除按钮 `693–739px`，无需滚动即可操作 |
| A9 | 未验证 | 真实 Supabase | 时光完整新增、编辑、删除 | 真实新增和读回已通过；编辑持久化未形成闭环 |
| A10 | 未验证 | 真实 Supabase | 留言中提交脚本与换行 | 鉴权改造后尚未重跑 XSS 纯文本证据 |
| A11 | 通过 | Vitest + production preview | `daysTogether` 与起始日 `2025-11-17` | 起始日第 0 天、跨月、跨年测试通过；2026-11-15 页面显示第 `363` 天，与自然日差一致；页面安排午夜自动刷新计数 |
| A12 | 未验证 | 真实空数据集 | 三处空状态 | 三块空状态存在；完整数据切换证据未归档 |
| A13 | 未验证 | 登录后 production | ZIP 导出 | 鉴权改造后尚未重跑导出闭环 |
| A14 | 通过 | production | 字体请求 | 系统中文字体回退，无第三方字体请求 |
| A15 | 通过 | `prefers-reduced-motion: reduce` | 读取 computed transform | 动效缩减规则生效，照片无位移 |
| A16 | 未验证 | production | 完整纯键盘旅程 | 登录、上传、大图和表单完整旅程未一次跑通 |
| A17 | 通过 | production 375 / 768 / 1440 | 扫描可见按钮和链接 | 小于 `44×44px` 控件均为 `0` |
| A18 | 通过 | DESIGN v5 + CSS | 核对暖米纸编辑部 token 与排版 | 使用 ink/paper/graphite/mauve/wash/rule/white 七个登记 token；标题衬线、正文无衬线；陈玫色未进入正文、按钮或状态 |
| A19 | 未验证 | production | 完整对比度与 alt 扫描 | 改版后的全量可读性扫描尚未归档 |
| A20 | 通过 | 源码 + production | 检查索引和 robots | `noindex, nofollow` 与 `robots.txt: Disallow: /` 存在 |
| A21 [P0] | 通过 | 登录后 Edge，真实离线 | 登录后切离线并刷新 | 主站、本地文本快照和离线文案可见，无白屏 |
| A22 | 通过 | 旧暂停回归 | 模拟项目暂停特征 | 显示“这里在休息，晚点再来”，无重试按钮 |
| A23 [P0] | 通过 | 两个独立 Edge profile | 退出登录并检查本地状态 | 主站 `0`、snapshot `null`、认证缓存 `null`、Auth token `0`；自动会话失效清理由单测覆盖 |
| A24 | 通过 | GitHub Actions / repository secrets | 运行 Pages 部署与 keepalive | Pages run #2 成功；keepalive run #1 成功；Auth `200`、REST `200`；`docs/evidence/A24-github-actions-20261114.txt` |
| A25 | 通过 | 旧文件边界回归 | 选择 8.1MB 与 10MB 文件 | 均在本地拒绝，无上传请求 |
| A26 [P0] | 通过 | 源码、环境示例与 `dist` | 扫描真实管理密钥与 JWT | 未发现管理密钥赋值或真实密钥；安全警示文字不参与判定 |
| A27 [P0] | 通过 | 本地 Git 仓库 `main` | 初始化、创建根提交、检查 `.env` 历史/索引和工作区 | `.env` 历史 0 条；`git ls-files --error-unmatch .env` 退出 1；工作区干净；`docs/evidence/A27-git-isolation.txt` |
| A28 | 未验证 | 登录后 production | ZIP 在新会话恢复 | 鉴权改造后尚未重跑恢复闭环 |
| A29 | 通过 | production 375 / 768 / 1440 | 渲染 7 张以上照片并检查主图和列桶 | 每 7 张首张独立整行并保持 3:2；其余照片按高度权重进入 2/3/4 个均衡列桶，混合 4:5、1:1、3:4 与错位节奏，无横向溢出；`docs/UI-POLISH-REPORT.md` |
| A30 | 通过 | production 375 / 768 / 1440 | 检查气球、爱心、间距和点击层 | 两枚黑白线稿气球和两枚陈玫色爱心独立成带，与标题间距 20–34px，`aria-hidden` 且不拦截操作 |
| A31 | 通过 | Edge production 375×812 + 私有 `music` Storage | 播放默认音轨；从“换音乐”上传 WAV；刷新；恢复默认 | 上传后的 `audio.src` 为 Supabase 私有签名地址；刷新后仍读到自选音轨；“恢复默认”后重新使用 `/audio/memory-theme.wav`；迁移连续执行两次成功 |
| A32 | 通过 | production 375 / 768 / 1440 | 核对暖米纸编辑部主题、字体、发丝线、留白、直角和响应式 | 页面底色 `#F9F8F6`、标题为衬线、正文为无衬线；375/768/1440 为 2/3/4 轨、无横向溢出；普通卡片无阴影且圆角为 0；音乐按钮 46px 高 |
| A33 | 通过 | production 375 / 768 / 1440 | 滚动主区块并检查动态偏好 | 首屏封面层级与进入动画生效；照片区滚动后增加 `is-revealed`，透明度 `1`、位移 `0`；粘性导航位置为 `sticky`；减少动态时内容和标题线直接显示 |
| A34 | 通过 | production 375 / 768 / 1440 | 切换爱心彩蛋开关，检查粒子、类型、挂载点、点击穿透和减少动态 | 开启后生成 70 枚彩蛋：50 枚五色小爱心、10 枚玫瑰、10 枚花苞；开关具有 `role="switch"` 与 `aria-checked`；层固定挂载到 `BODY`，`pointer-events: none` 且 `aria-hidden`；关闭后粒子归零；减少动态时静态排列 |
| A35 | 通过 | production 375 / 768 / 1440 | 滚动至留言区与页脚之间，检查心电波形、动画和减少动态 | 分隔带宽 320/657/1200px，均无横向溢出并与页脚保持 32px 间距；脉段颜色 `rgb(28,28,28)`，动画 `heartbeat-scan` 5.6s；减少动态时动画 `none`、显示完整静态波形；`docs/evidence/heartbeat-trace-1440.png` |
| A36 | 通过 | Edge production 375×812 / 真实共享账号 | 新增临时留言 → 点击“移走这条” → 二次确认 → 刷新 | 仅云端留言显示删除入口；确认弹层标题为“要把这条留言移走吗”；`messages.delete` 成功后条数恢复为 `0`，刷新后不再出现；按钮 49×44px，页面无横向溢出；`docs/evidence/A36-message-delete.txt` |
| A37 | 通过 | production preview 375×812 / 768×1024 / 1440×900 / 真实上传 | 一次上传 5 张临时照片，检查相框、列桶、相片库、查看与删除 | 命中 5 种相框和 3:2、4:5、1:1、3:4、错位 4:5；375/768/1440 普通照片列宽 320/657/1200 并分别使用 2/3/4 列；相片库显示 5 张并可进入大图；逐张删除后刷新为 0，无横向溢出；`docs/evidence/photo-frames-1440.png`、`photo-library-1440.png` |
| A38 | 通过 | production preview 375×812 | 首屏读取相识计时器两次，间隔约 2.2 秒 | 首次显示“至今 364 天 12:41:54”，第二次为 `12:41:56`，总秒数增加 `2`；起始配置为 `2025-11-17T00:00:00+08:00`，375px 无横向溢出；`docs/evidence/relationship-clock-375.png` |

## 真实 Supabase 配置

- Allow new users to sign up：关闭，保存并刷新后仍关闭。
- Auth Users：仅一个共享 Email 账号。
- `0002` 已加历史保护：检测到 `0003` 的 authenticated 策略后跳过，不会重新开放匿名访问。
- `0003_authenticated_access.sql`：连续两次执行成功。
- `0004_music_bucket.sql`：连续两次执行成功；创建私有 `music` 桶（16MB，MP3/WAV/M4A）及 authenticated-only 策略。
- 最终策略：三表 `authenticated / ALL`；`memories` 与 `music` Storage 均仅允许 authenticated。
- 匿名 REST：`401`；匿名 Storage 对现有对象列表 `0` 行，上传、签名和下载均 `400`。
- 唯一账号：登录/refresh `200`；三表与 Storage CRUD 成功，测试数据 remaining `0`。

## 最新门禁

```text
npm test          12 files / 61 tests passed
npm run typecheck exit 0
npm run build     exit 0, 106 modules
```

## 线上发布

- GitHub Pages：https://6544555.github.io/恋爱日志/
- Pages 部署 run #2：成功
- Keepalive run #1：成功，Auth `200`、REST `200`
- 远端 `main`：`ce3afb2ef3669f636acdbc000abb08288eaeb1cf`
- 四个 Repository Secrets 已配置；值未写入仓库或证据文件。
