# 内容替换清单

当前站点是可运行的公开壳层版本。真实照片、时光和留言只存放在 Supabase，登录后才读取；不要把真实内容放回 `public/` 或 `src/defaultContent.ts`。

## 1. 唯一共享账号

1. 在 Supabase Dashboard 的 Auth → Users 中只保留一个邮箱密码用户。
2. 在 Auth Providers / Sign In / Up 设置中关闭公开注册。
3. 账号密码通过安全渠道提供给两位实际使用者，不写入源码、文档、`.env` 或 Git。
4. 网站只显示登录表单，不显示注册、邀请、账号列表或密码提示。

## 2. 公开壳层

编辑 `public/content.json` 与 `src/defaultContent.ts` 时只允许保留：

- `herName`：公开显示称呼。
- `startDate`：如果保持为空，彩蛋不显示。
- `openingLine`：公开首屏短句。
- `passHint`：兼容字段，必须保持空字符串。
- `photos`、`timeline`、`messages`：必须保持空数组。

真实内容由登录后的照片上传、时光轴和留言表单写入 Supabase。

## 3. Supabase

在目标项目依次执行：

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_storage_policy.sql`
3. `supabase/migrations/0003_authenticated_access.sql`

迁移完成后核验：

- 原开放策略已删除。
- `photos`、`memories`、`messages` 只允许 authenticated 用户访问。
- `memories` 是私有桶，Storage 只允许 authenticated 用户读写。
- Auth 只保留一个共享用户，公开注册关闭。
- 不存在 `allowed_users` 表或白名单策略。

## 4. 环境

1. 本地复制 `.env.example` 为 `.env`，填写：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. GitHub 仓库 Secrets 使用：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SHARED_EMAIL`
   - `SUPABASE_SHARED_PASSWORD`
3. `.env` 必须继续被 `.gitignore` 忽略。
4. 不创建、不保存、不提交 `service_role` 密钥。
5. keepalive 使用共享账号登录取得短期 access token，不把账号密码打印到日志。

## 5. 背景音乐

默认使用原创合成氛围音轨 `public/audio/memory-theme.ogg`，登录后点页头按钮播放。替换步骤：

1. 将获得授权的 OGG/MP3 文件放入 `public/audio/`。
2. 修改 `src/ui/BackgroundMusic.tsx` 的 `DEFAULT_MUSIC_FILE`，或设置 `VITE_BACKGROUND_MUSIC_URL`。
3. 建议 30–90 秒、可无缝循环、低响度；不要使用未经授权的商业歌曲。
4. 首次播放必须由用户点击触发，不能绕过浏览器自动播放限制。

## 6. 字体

当前使用系统中式字体回退，不请求第三方字体。需要设计指定字体时：

1. 将 `LXGWWenKai-Regular.woff2`、`SourceHanSansSC-Regular.woff2` 和 OFL 许可文本放入 `public/fonts/`。
2. 在 `src/styles.css` 加入同源 `@font-face`。
3. 保留 `KaiTi`、`Microsoft YaHei`、`PingFang SC` 回退。

## 7. 发布前检查

- 确认 `dist/` 不含真实照片、私密文本、密码或 `service_role`。
- 确认登录前没有三表 REST 或 Storage 请求。
- 确认 Service Worker 不缓存 `content.json`、Supabase 响应或照片。
- 执行 `npm test`、`npm run typecheck`、`npm run build`。
- 按 `docs/ACCEPTANCE.md` 重新执行匿名隔离、登录、跨设备、退出和离线验收。
- 未经仓库所有者明确授权，不创建远程仓库、不 commit、不 push、不部署。
