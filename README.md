# birthday-memory

一个采用公开壳层优先、Supabase Auth、云端增量同步和离线只读降级的私人生日纪念网站。

## 当前交付

- Supabase Auth 单账号登录、照片墙、时光轴、留言板、上传、编辑、删除、备份导出和可替换背景音乐。
- 公开注册关闭；匿名访客只看到登录入口，私密内容只从 authenticated RLS/Storage 读取。
- 六种云端聚合状态：`LOADING / READY / DEGRADED / PAUSED / QUOTA / OFFLINE`。
- 静态构建只包含公开壳层，真实内容替换与账号设置见 `docs/REPLACEMENT_CHECKLIST.md`。
- 已发布到 https://6544555.github.io/birthday-memory/。
- GitHub Pages 部署与 Supabase keepalive 均已真实运行成功。
- 管理密钥不进入浏览器。浏览器只使用 Supabase URL 和 anon key。

## 本地运行

要求 Node.js 22 或更高版本。

```powershell
npm install
npm run dev
```

质量门禁：

```powershell
npm test
npm run typecheck
npm run build
```

构建产物位于 `dist/`。Vite 的 build base 固定为 `/birthday-memory/`，与默认 GitHub 仓库名一致。构建后可运行：

```powershell
npm run preview
```

然后访问 `http://127.0.0.1:4174/birthday-memory/`。

## Supabase

1. 在 Supabase SQL Editor 依次执行：
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_storage_policy.sql`
   - `supabase/migrations/0003_authenticated_access.sql`
   - `supabase/migrations/0004_music_bucket.sql`
2. 在 Auth → Users 中只保留一个共享邮箱密码账号。
3. 在 Auth 设置中关闭公开注册。
4. 复制 `.env.example` 为本地 `.env`，填入项目 URL 与 anon key。
5. 不创建、不提交、不写入任何管理权限密钥。
6. 四份 SQL 具有重复执行保护，但仍建议先在测试项目验证。

本地环境变量：

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_BACKGROUND_MUSIC_URL=
```

GitHub Actions 使用仓库 Secrets：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SHARED_EMAIL`
- `SUPABASE_SHARED_PASSWORD`

## 背景音乐

默认音轨为 `public/audio/memory-theme.ogg`，登录后通过页头的“背景音乐”按钮播放。浏览器的自动播放限制会让首次播放需要一次点击；暂停后会记住偏好。

更换音乐：

1. 登录后点页头“换音乐”。
2. 选择不超过 16MB 的 MP3、OGG、WAV 或 M4A。
3. 音轨会上传到私有 `music` Storage，刷新和其他设备登录后继续使用。
4. 点“恢复默认”可删除自选音轨并切回打包音轨。

仍需在构建时固定默认音轨时，可替换 `public/audio/memory-theme.ogg` 或设置 `VITE_BACKGROUND_MUSIC_URL`。

## GitHub Pages

1. 创建并推送仓库，默认分支使用 `main`。
2. 在仓库 Settings → Pages → Source 中选择 GitHub Actions。
3. 添加上述四个 Repository Secrets。
4. 手动运行 `Deploy GitHub Pages`，或推送到 `main`。

部署工作流会执行测试、类型检查和生产构建。仓库创建、commit、push 和真实部署需要仓库所有者明确执行。

保活工作流为 `.github/workflows/keepalive.yml`，每 3 天运行一次，也可手动运行。它先用唯一共享账号登录，再用短期 access token 真实读取 `photos` 表；登录、读取非 2xx 或 Secrets 缺失时退出非零。

## 权限与限制

当前方案关闭 Supabase Auth 公开注册，只保留一个共享邮箱密码账号。匿名访客和 publishable key 不能按 RLS 读取或写入三表与私有 Storage；取得共享账号凭据的人登录后共同读写同一空间。

签名照片地址仅保存在内存。云端文本快照只在登录后写入 `localStorage`，退出时清除；照片 Blob、签名 URL 和密钥不会写入快照。

## 内容与文档

- 功能与验收契约：`docs/SPEC.md`、`docs/ACCEPTANCE.md`
- 数据层接口：`docs/LIB_API.md`
- 替换清单：`docs/REPLACEMENT_CHECKLIST.md`
- 实现报告：`docs/IMPLEMENTATION-REPORT.md`
- 验收记录：`docs/ACCEPTANCE-REPORT.md`
- 状态说明：`docs/CLOUD_STATES-REPORT.md`
- 进度：`docs/PROGRESS.md`
