# 数据层接口文档

版本：v2.0  
适用对象：CodeBuddy、复审人员  
边界：本层不操作 DOM，不渲染界面，不持久化签名地址；所有私密数据调用只允许发生在 Supabase Auth 已建立会话之后。

## 通用约定

- 云端操作失败抛 `CloudError`，并通过 `state + reason` 分类。
- 本地输入失败抛 `InputError`，不得把全局云端状态改成 `QUOTA` 或 `DEGRADED`。
- 所有文本在写入前 `trim`，正文内部换行保留。
- 日期只接受有效 `YYYY-MM-DD`。
- 云端照片的唯一事实源是 `photos` 表；时光轴通过 `photoId` 引用照片。
- 匿名请求不得进入业务数据层；三表与 Storage 只接受 authenticated 会话。
- 签名地址只存在内存中，失败返回 `null`；退出登录时通过卸载 CloudStore 丢弃缓存。
- `localStorage` 只保存已登录后的云端文本快照和已认证用户标记，不保存照片 Blob、签名地址、密码或令牌副本。

## src/types.ts

### `CloudError`
说明：云端操作的可分类错误；保留安全原因码，不携带令牌或完整响应体。  
参数：`state: PAUSED | DEGRADED | QUOTA | OFFLINE`，`reason`，安全消息，可选安全上下文。  
可能抛：由数据方法抛出；控制器捕获后更新应用级状态。  
建议 UI：`PAUSED` 不提供重试；`DEGRADED` 提供重试；`QUOTA` 引导导出；`OFFLINE` 禁用写入。  
示例：`catch (error) { if (error instanceof CloudError) setState(error.state) }`

### `InputError`
说明：文件、格式或字段的本地校验错误，不改变全局云端状态。  
参数：`reason` 为 `FILE_TOO_LARGE | UNSUPPORTED_FORMAT | INVALID_INPUT | IMAGE_PROCESSING`。  
可能抛：`uploadPhoto`、`compressImage`、增删改方法及鉴权前的数据校验。  
建议 UI：在对应字段或单张照片上显示 `COPY.md` 文案。  
示例：`{ state: 'FILE_TOO_LARGE', message: '这张照片太大，换一张或先压缩' }`

## src/config.ts

### `CONFIG` / `MAX_PHOTO_BYTES` / `REQUEST_TIMEOUT_MS`
说明：提供称呼、日期、桶名、8MB 文件上限和 8 秒请求超时；共享登录凭据只由 Supabase Auth 管理，不进入前端配置。  
参数：无。  
可能抛：不抛。  
建议 UI：真实内容由替换清单修改；不得在组件内复制常量。  
示例：`import { CONFIG, MAX_PHOTO_BYTES } from '../config'`

## src/lib/supabase.ts

### `getClient(): SupabaseClient`
说明：创建并复用唯一的 Supabase 客户端；所有请求带 8 秒 AbortController 超时。  
参数：无；URL 和公开 key 从 `VITE_SUPABASE_*` 环境变量读取。  
可能抛：配置缺失或超时时抛 `CloudError('DEGRADED')`。  
建议 UI：启动失败保留静态内容，状态进入 `DEGRADED`。  
示例：`const client = getClient()`

## src/lib/storage.ts

### `createCloudStore(): CloudStore`
说明：创建一次云端存储实例；签名地址缓存封装在该实例内。  
参数：无。  
可能抛：创建时不主动连接，因而通常不抛；具体方法负责分类错误。  
建议 UI：App 启动时创建一个实例并传给主站控制器。  
示例：`const store = createCloudStore()`

### `init(): Promise<CloudState>`
说明：探测云端是否可读并返回初始聚合状态，不抛断页错误。  
参数：无。  
返回：`READY / DEGRADED / PAUSED / OFFLINE`。  
建议 UI：静态内容不等待此方法；只更新云端增量状态槽。  
示例：`const state = await store.init()`

### `listPhotos(): Promise<PhotoItem[]>`
说明：读取云端照片元数据，按 `takenAt`、`createdAt` 倒序。  
参数：无。  
可能抛：`CloudError` 四种云端状态。  
建议 UI：照片 `src` 仍需通过 `getPhotoUrl` 获取；单张失败用占位图。  
示例：`const photos = await store.listPhotos()`

### `addPhoto(input): Promise<PhotoItem>`
说明：在照片文件上传成功后写入照片元数据。  
参数：`{ filename, takenAt, note?, storagePath }`。  
可能抛：`InputError(INVALID_INPUT/UNSUPPORTED_FORMAT)` 或 `CloudError`。  
建议 UI：先 `compressImage → uploadPhoto → addPhoto`；成功后才插入照片墙。  
示例：`await store.addPhoto({ filename: 'a.webp', takenAt: '2024-07-12', storagePath: 'u/a.webp' })`

### `deletePhoto(photoId): Promise<void>`
说明：先删除 Storage 对象，再删除照片记录；时光轴外键自动置空。  
参数：照片 UUID。  
可能抛：ID 无效时为 `InputError`；云端失败时为 `CloudError`。  
建议 UI：二次确认后调用；失败时不要先做假删除。  
示例：`await store.deletePhoto(photo.id)`

### `listMemories(): Promise<MemoryItem[]>`
说明：读取云端时光轴，按日期和创建时间倒序。  
参数：无。  
可能抛：`CloudError`。  
建议 UI：与静态时光轴按 `id` 合并，云端优先。  
示例：`const memories = await store.listMemories()`

### `addMemory(input): Promise<MemoryItem>`
说明：新增时光轴条目。  
参数：`{ date, title, body, photoId? }`；标题 ≤30，正文 ≤500。  
可能抛：字段问题为 `InputError`；云端失败为 `CloudError`。  
建议 UI：保存中保留草稿；成功后按日期插入。  
示例：`await store.addMemory({ date: '2024-07-12', title: '...', body: '...' })`

### `updateMemory(id, patch): Promise<MemoryItem>`
说明：更新一个时光轴条目的日期、标题、正文或关联照片。  
参数：UUID 与部分字段；空 patch 视为输入错误。  
可能抛：`InputError(INVALID_INPUT)` 或 `CloudError`。  
建议 UI：保存失败时保留表单草稿和重试入口。  
示例：`await store.updateMemory(id, { title: '新标题' })`

### `deleteMemory(id): Promise<void>`
说明：删除一个云端时光轴条目。  
参数：UUID。  
可能抛：`InputError` 或 `CloudError`。  
建议 UI：确认成功后调用，失败时保留当前列表。  
示例：`await store.deleteMemory(id)`

### `listMessages(): Promise<MessageItem[]>`
说明：读取云端留言，按创建时间倒序。  
参数：无。  
可能抛：`CloudError`。  
建议 UI：与静态留言按 `id` 合并并保存文本快照。  
示例：`const messages = await store.listMessages()`

### `addMessage(text): Promise<MessageItem>`
说明：截断首尾空白后新增留言，正文 ≤500。  
参数：留言纯文本；允许内部换行。  
可能抛：空或超长为 `InputError`；云端失败为 `CloudError`。  
建议 UI：纯文本渲染，禁止拼接 HTML；失败时保留草稿。  
示例：`await store.addMessage('下次还要一起看海')`

### `uploadPhoto(path, blob): Promise<string>`
说明：向私有 `memories` 桶上传文件；8MB 与格式检查发生在网络请求前。  
参数：安全 Storage 路径、JPEG/PNG/WebP Blob。  
可能抛：`InputError(FILE_TOO_LARGE/UNSUPPORTED_FORMAT/INVALID_INPUT)` 或 `CloudError`。  
建议 UI：逐张上传；单张失败不回滚其他成功项；`QUOTA` 停止批次。  
示例：`await store.uploadPhoto('u/photo.webp', compressed.blob)`

### `getPhotoUrl(path, expiresIn?): Promise<string | null>`
说明：签发私有照片地址并做带过期时间的实例内缓存；失败返回 `null`。  
参数：Storage 路径；有效期默认 86400 秒。  
可能抛：正常路径不抛，失败统一返回 `null`。  
建议 UI：单张空值只显示同尺寸占位，不把全站切到降级。  
示例：`const url = await store.getPhotoUrl(photo.storagePath)`

### `exportAll(): Promise<ExportBundle>`
说明：读取全部云端文本，并逐张下载照片，返回可重建路径的成对元数据。  
参数：无。  
可能抛：任一云端读取不完整时抛 `CloudError`，不得报告导出成功。  
建议 UI：与静态内容合并后交给上层动态加载 `jszip`；每张照片保留 `path + filename + blob`。  
示例：`const { json, photos } = await store.exportAll()`

## src/lib/localcache.ts

### `saveSnapshot(data): void`
说明：保存云端时光轴与留言文本快照，不保存照片。  
参数：`{ memories, messages }`。  
可能抛：不抛；存储空间不足或隐私模式失败时静默。  
建议 UI：云端读取或写入成功后更新快照。  
示例：`saveSnapshot({ memories, messages })`

### `readSnapshot(): TextSnapshot | null`
说明：读取并校验上一次文本快照。  
参数：无。  
返回：有效快照或 `null`。  
建议 UI：仅用于 `DEGRADED / PAUSED / OFFLINE` 的文本兜底。  
示例：`const cached = readSnapshot()`

### `clearSnapshot(): void`
说明：清理文本快照。  
参数：无。  
可能抛：不抛。  
建议 UI：只在用户明确清理本地状态时调用。  
示例：`clearSnapshot()`

## src/lib/image.ts

### `compressImage(file, opts?): Promise<CompressedImage>`
说明：按默认长边 1600px、质量 0.82 压缩为 WebP；不支持时自动改为 JPEG。  
参数：浏览器 `File`；可选 `maxEdge / quality / format`。  
返回：`blob, width, height, bytes, originalBytes, format, mimeType`。  
可能抛：`InputError(FILE_TOO_LARGE/UNSUPPORTED_FORMAT/IMAGE_PROCESSING)`。  
建议 UI：在本地逐张调用；失败只标记该张可重试。  
示例：`const result = await compressImage(file, { maxEdge: 1600, quality: 0.82 })`

## src/lib/content.ts

### `loadStaticContent(url?): Promise<ContentBundle>`
说明：加载 `public/content.json` 并排序；失败时返回带 `staticLoadFailed` 的空 bundle。  
参数：可选 URL，默认使用 Vite `BASE_URL`。  
可能抛：不抛。  
建议 UI：无论结果如何都先完成主站静态布局，不等待云端。  
示例：`const base = await loadStaticContent()`

### `mergeContent(staticBundle, cloud): ContentBundle`
说明：合并静态与云端照片、时光轴、留言，按 `id` 去重且云端优先。  
参数：静态 bundle；云端的 `photos? / memories? / messages?`。  
可能抛：不抛。  
建议 UI：返回后一次性替换增量区域，不重排静态首屏。  
示例：`const merged = mergeContent(staticBundle, { photos, memories, messages })`

### `sortPhotos(items)` / `sortMemories(items, order?)` / `sortMessages(items)`
说明：按契约稳定排序；时光轴同日期按创建时间倒序。  
参数：实体数组；时光轴可选 `desc/asc`。  
可能抛：不抛。  
建议 UI：合并后调用，不在组件内重写排序。  
示例：`const ordered = sortMemories(items, 'desc')`

### `daysTogether(startDate, now?): number`
说明：按本地自然日计算起始日到当前日的天数，起始日当天为 0。  
参数：`YYYY-MM-DD` 与可选当前日期。  
返回：自然日差；无效起始日返回 0。  
建议 UI：日期无效或缺失时隐藏彩蛋入口。  
示例：`daysTogether('2024-07-12', new Date())`

## src/lib/auth.ts

### `restoreSession(): Promise<AuthState>`
说明：从 Supabase Auth 恢复已持久化会话；在线时只接受 Auth 返回的有效会话，离线时允许已认证用户只读恢复。  
参数：无。  
返回：`LOADING | SIGNED_OUT | AUTHENTICATED | DEGRADED` 状态联合。  
建议 UI：只有 `AUTHENTICATED` 才挂载主站和请求私密数据。  
示例：`const state = await restoreSession()`

### `signIn(email, password): Promise<AuthState>`
说明：使用唯一共享账号调用 `signInWithPassword`；前端不比较固定账号或密码。  
参数：邮箱去首尾空格；密码保持原值。  
返回：成功为 `AUTHENTICATED`；错误凭据为 `SIGNED_OUT / INVALID_CREDENTIALS`；网络问题为 `DEGRADED`。  
建议 UI：错误信息保持统一，不显示技术响应或账号是否存在。  
示例：`const result = await signIn(email, password)`

### `signOut(): Promise<void>`
说明：调用 Supabase Auth 本地退出，并清除文本快照和已认证用户标记。  
参数：无。  
可能抛：通常不抛；清理在 `finally` 中执行。  
建议 UI：退出后立即卸载主站；CloudStore 随组件卸载释放签名 URL 缓存。  
示例：`await signOut()`

### `subscribeToAuth(listener): () => void`
说明：立即通知 `LOADING`，随后恢复会话并订阅 Supabase Auth 状态变化。  
参数：接收 `AuthState` 的监听函数。  
返回：取消订阅函数。  
建议 UI：应用根组件用它决定显示登录页还是主站。  
示例：`const unsubscribe = subscribeToAuth(setAuthState)`

## src/lib/music.ts

### `musicFileInfo(filename, mimeType): MusicFileInfo | null`
说明：校验扩展名与 MIME，返回标准扩展名和上传 MIME。
参数：文件名与浏览器 `File.type`；支持 MP3、OGG、WAV、M4A。
返回：`{ extension, mimeType }` 或 `null`。
建议 UI：不支持的格式只在音乐设置层提示。
示例：`musicFileInfo('theme.ogg', 'audio/ogg')`

### `loadCustomMusic(): Promise<StoredMusicTrack | null>`
说明：列为当前 authenticated 用户可访问的私有 `music/theme` 对象，选择最新受支持音轨并签发 24 小时 URL。
参数：无。
返回：自选音轨或 `null`；无音轨时 UI 使用打包默认音轨。
建议 UI：加载失败时静默回退默认音轨，不阻塞主站。

### `uploadCustomMusic(file): Promise<StoredMusicTrack>`
说明：验证 16MB 上限和格式，上传到 `music/theme/background.<ext>`，清理其他自选音轨并返回签名 URL。
参数：浏览器 `File`。
可能抛：`InputError` 或 `CloudError`。
建议 UI：上传期间禁用重复选择；成功后切换到新音轨并清理输入值。

### `resetCustomMusic(): Promise<void>`
说明：删除 `music/theme` 下的全部自选音轨。
参数：无。
建议 UI：成功后切回 `public/audio/memory-theme.ogg`。

## src/ui/BackgroundMusic.tsx

### `resolveMusicUrl(baseUrl, configuredUrl?): string`
说明：优先使用 `VITE_BACKGROUND_MUSIC_URL`，否则返回部署 base 下的 `audio/memory-theme.ogg`。  
参数：Vite `BASE_URL` 与可选自定义 URL。  
返回：可直接赋给 `<audio src>` 的地址。  
建议 UI：登录后才挂载；音频失败不影响主业务。  
示例：`resolveMusicUrl('/birthday-memory/', 'audio/custom.ogg')`

### `BackgroundMusic()`
说明：提供循环背景音乐的播放/暂停、自选上传、恢复默认、偏好恢复、错误降级和卸载暂停。
参数：无。
可能抛：组件内捕获播放、上传和存储失败，不向主站抛出。
建议 UI：首次播放必须由用户点击；`aria-pressed` 表示状态，播放和设置按钮均保持至少 44px。
示例：`<BackgroundMusic />`

## KNOWN_LIMITS

- 签名链接默认 24 小时有效；长时间不刷新页面时，旧链接到期后需要重新签发。
- 项目关闭 Supabase Auth 公开注册，部署时只保留一个共享账号；任何取得该共享凭据的人都能读写同一空间。
- 免费额度与项目暂停由 Supabase 账户状态决定；前端只能展示降级状态。
- 本数据层测试使用 mock，不代表真实项目已建表或策略已执行。
- 两份 SQL 不能只靠 TypeScript 验证；需要在 Supabase SQL Editor 或本地 PostgreSQL 真实重复执行两次。
- 浏览器 Canvas 的实际 EXIF 方向、WebP 编码和内存占用只能在目标浏览器做运行验证。
- 本层不提供 z-index、toast、弹层或整页状态遮罩；这些属于 UI 层。
