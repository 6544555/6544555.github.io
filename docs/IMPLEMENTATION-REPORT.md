# 实现报告

版本：4.0  
日期：2026-11-14  
范围：F-01～F-12、黑白 v3 视觉、Supabase Auth 单账号、production preview、离线壳层、真实 RLS/Storage、跨浏览器联调和最终门禁。

## 1. 架构

- 未认证时登录 `Gate` 独占根节点；主站组件、静态内容请求和私密云端请求均不挂载。
- Supabase Auth 关闭公开注册，只保留一个共享邮箱密码账号。
- 认证成功后挂载主站并渲染安全公开壳层；私密照片、时光和留言只从受 RLS/Storage 保护的云端读取。
- `MemorySite` 持有云端聚合状态；`createCloudStore()` 不操作 DOM。
- 静态与云端数据通过 `mergeContent()` 合并，同 ID 云端优先。
- 云端文本快照保存到 `localStorage`；照片 Blob、签名 URL 和密钥不进入快照。
- 用户可见状态集中在 `src/copy.ts`，数据层原始错误不直接渲染。

## 2. 功能落地

| 功能 | 实现 |
|---|---|
| F-01 单账号登录 | `src/ui/Gate.tsx` + `src/lib/auth.ts`：唯一共享邮箱密码、Supabase Auth 会话、错误凭据提示、退出与刷新恢复 |
| F-02 首屏开启 | `src/App.tsx`：会话级揭幕、直接进入、减少动效直接跳过 |
| F-03 批量上传 | `src/ui/PhotoWall.tsx`：最多 20 张、拖放、逐张压缩上传、单张状态与重试、8MB 双检查 |
| F-04 照片墙 | 2/3/4 列编辑网格、4:5、懒加载、替代文本、只读大图、签名失败占位 |
| F-05 删除 | 照片查看层和云端时光菜单，二次确认，失败不假删除 |
| F-06 时光增删改 | `src/ui/EntryDialog.tsx`：日期、标题、正文、单张云端照片引用，失败保留草稿 |
| F-07 时光轴 | 日期倒序、响应式日期列、长正文展开、关联照片、固定状态位 |
| F-08 留言 | 500 字、纯文本换行、成功后清空、失败保留草稿、离线只读 |
| F-09 彩蛋 | 起算日当天为第 0 天，真实自然日计算 |
| F-10 空状态 | 三块内容固定最小高度，LOADING 与空状态互斥 |
| F-11 导出 | 静态与云端文本、照片、`content.json`、`README.txt`、日期文件名，`jszip` 点击后动态加载 |
| F-12 云端状态 | 六状态、固定槽位、写操作隔离、暂停无重试、额度引导导出 |

## 3. 黑白 v3 视觉

- 用户要求黑白简约方向，变更原因、取舍和回滚记录在 `docs/CONTRACT_CHANGE.md`。
- `docs/DESIGN.md` v3 使用 paper、wash、ink、graphite、muted、line 六值。
- 标题使用系统宋体，正文使用系统中性无衬线；没有在线字体请求。
- 当前 production 375/768/1440 照片列数为 `2/3/4`，均无横向溢出。
- 功能、固定状态槽、44px 触控目标、焦点和减少动效契约保持不变。

## 3.1 视觉与音乐增量

- 照片墙每 7 张安排一张跨两列 3:2 主照片和一次错位节奏，普通照片仍为 4:5。
- 照片标题与网格之间加入两枚黑白线稿气球、两枚陈玫色爱心；装饰 `aria-hidden` 且不拦截操作。
- 背景音乐默认使用 `public/audio/memory-theme.ogg`，登录后可播放、暂停或从本机上传自定义音轨。
- 自选音乐保存到私有 `music` Storage，跨刷新和其他登录客户端读取；支持一键恢复默认。
- 支持 MP3、OGG、WAV、M4A，单文件上限 16MB；播放偏好保存在本地，退出主站时暂停音频并释放播放器。

## 4. 构建、离线与预览

- `scripts/build.mjs` 将 `TEMP/TMP` 指向项目内 `.build-tmp`，规避 Windows 系统临时目录上的 esbuild 删除竞争。
- `scripts/serve-preview.mjs` 以 `/birthday-memory/` 子路径正确服务 `dist`，模拟 GitHub Pages。
- Service Worker 只在 Supabase Auth 登录后的主站注册，匿名登录页不安装 Service Worker。
- `public/sw.js` 缓存名 `birthday-memory-static-v4`；只缓存公开 shell，明确绕过 `content.json`、`/memories/` 和跨域 Supabase 请求。
- Service Worker 不缓存 REST 响应、签名 URL、照片 Blob 或云端响应。
- 最新构建：103 modules；主 JS `504.69 kB`，`jszip` `97.47 kB`，CSS `48.69 kB`。

## 5. 超时与失败路径

- `src/lib/storage.ts` 的 `init()` 用 `withRequestTimeout()` 包裹客户端 Promise。
- 即使底层 Promise 永不 resolve，也会在硬超时后返回 `DEGRADED`。
- 新增 Vitest 用例覆盖“永不 resolve 的 init”。
- production REST 延迟 9 秒：静态标题 `382ms` 可见，约 `9.3s` 进入 DEGRADED。
- PAUSED：静态照片保留、休息文案出现、无重试按钮。
- QUOTA：413 后写入口禁用，出现额度文案和导出入口。
- OFFLINE：Service Worker 离线强制刷新后，3 张照片和离线文案仍显示。

## 6. Supabase 与迁移

- 项目 ref：`hrldvxiqzewotznghmai`，Tokyo。
- `0001_init.sql`：三张表、RLS、索引和私有 `memories` bucket upsert。
- `0002_storage_policy.sql`：历史开放策略迁移；检测到 `0003` 已生效时直接跳过，避免回退匿名访问。
- `0003_authenticated_access.sql`：撤销旧策略，三表和 Storage 只允许 authenticated；连续执行两次成功。
- 真实配置：公开注册关闭，Auth Users 仅一个共享账号。
- 匿名三表 REST 均 `401`；匿名 Storage 对现有对象列表 `0` 行，上传、签名和下载均 `400`。
- 唯一账号登录/refresh `200`；三表与 Storage CRUD 成功，测试数据 remaining `0`。
- A7/A23 已用两个独立 Microsoft Edge 157 headless 进程和独立 profile 闭环：A 写入，B 读取，B 删除，A 刷新同步；不是物理两台设备。
- A2 最终登录耗时 `1383ms / 851ms / 855ms`；A4 认证延迟 8 秒时公开壳层 `79ms` 可见且私密请求 `0`。

## 7. 最新门禁

```text
npm test          10 files / 49 tests passed
npm run typecheck exit 0
npm run build     exit 0, 103 modules
```

产物包含 `dist/sw.js`、主 JS、CSS 和独立 `jszip` chunk。

## 8. 最终未完成项

- A24：GitHub Actions 保活和 GitHub Pages 发布未执行。
- A27：已通过；本地 `main` 根提交存在，`.env` 历史 0 条且未入索引。没有 remote，也没有 push。
