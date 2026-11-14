# 云端状态实现报告

版本：4.0  
日期：2026-11-14  
实现位置：`src/App.tsx`、`src/lib/auth.ts`、`src/lib/storage.ts`、`src/ui/AuthStatus.tsx`、`src/ui/StatusSlot.tsx`、`public/sw.js`。  
原则：公开登录壳层先显示；只有 authenticated 会话可请求私密数据；不叠放全局 toast 或整页遮罩。

## 1. 认证与聚合状态

| 状态 | 当前界面行为 | 最新验证 |
|---|---|---|
| Auth `LOADING` | 公开认证壳层立即显示，不请求三表或 Storage | refresh 延迟 8 秒时壳层 `83ms` 可见，私密请求 `0` |
| `SIGNED_OUT` | 只显示单一共享账号的邮箱密码表单 | 错误密码不会挂载主站；页面无注册入口 |
| `AUTHENTICATED` | 挂载主站并开始云端增量读取 | 唯一账号真实登录、刷新恢复和跨浏览器读取通过 |
| `LOADING` | 已登录主站显示，增量区显示骨架 | 云端增量不阻塞公开壳层 |
| `READY` | 状态槽保持空白高度 | 唯一账号真实 REST/Storage CRUD 成功 |
| `DEGRADED` | 保留壳层和缓存文本，提供重试 | 普通失败映射保留；Auth 失效时会重新核对会话 |
| `PAUSED` | 显示休息文案，无重试按钮 | 既有暂停回归通过 |
| `QUOTA` | 写区提示空间已满并引导导出 | 既有额度回归通过 |
| `OFFLINE` | 已登录壳层、文本快照和离线文案保留 | 登录后真实离线刷新通过 |

## 2. Auth 与超时

- `restoreSession()` 在线只接受 Supabase Auth 返回的有效会话；离线时允许已认证用户读取本机文本快照。
- `signIn()` 使用唯一共享账号调用 `signInWithPassword`，前端不比较固定账号或密码。
- `signOut()` 在等待网络退出前同步清除文本快照和认证用户缓存。
- Auth 自动发出 `SIGNED_OUT` 时同样清除文本快照和用户缓存。
- Supabase 请求使用 8 秒超时包装；认证 refresh 被延迟时公开壳层不受阻塞。

## 3. 真实云端链路

- Supabase 项目 ref：`hrldvxiqzewotznghmai`，Tokyo。
- 公开注册关闭，Auth Users 仅一个共享邮箱账号。
- 匿名 REST 读取三表均 `401`。
- 匿名 Storage：对现有对象列表返回 `0` 行元数据；上传、签名和下载均 `400`。
- 唯一账号登录和 refresh `200`；三表与私有 Storage CRUD 成功，测试数据 remaining `0`。
- 两个独立 Edge profile/进程使用同一共享账号完成 A 写入、B 读取、B 删除、A 刷新同步。
- 证据：`docs/STAGE7-EXECUTION.md`、`docs/evidence/auth-live-matrix-20261114.txt`。

## 4. Service Worker v4

- SW 只在登录后的 `MemorySite` 注册。
- 安装时缓存主页面与构建资源，不预缓存 `content.json`、REST 响应、签名 URL、照片 Blob 或私有媒体。
- 对 `content.json` 与 `/memories/` 请求直接绕过缓存。
- 只处理同源 GET；Supabase 跨域请求不进入应用缓存。
- 激活时删除旧缓存版本。

## 5. 状态所有权与清理

- `MemorySite` 统一持有云端业务状态；认证状态由 App 根组件持有。
- 云端 401/403 需要重新核对 Auth；会话失效时卸载主站并清私密状态。
- 用户主动退出：主站 DOM、snapshot、认证用户缓存、Auth token 和 CloudStore 内存签名地址全部释放。
- `QUOTA`、`PAUSED`、`OFFLINE` 时写操作禁用；`PAUSED` 不提供重试。
- 重新联网只把 `OFFLINE` 变为待确认的 `DEGRADED`，真实读取成功后才回到 `READY`。

## 6. 门禁

```text
npm test          10 files / 49 tests passed
npm run typecheck exit 0
npm run build     exit 0, 103 modules
```

## 7. 残余风险

- 物理两台设备尚未执行；现有证据是同一机器上的两个独立浏览器进程与独立 profile。
- 三图批次、完整时光编辑、三处真实空状态和完整键盘旅程仍未形成闭环证据。
- 照片上传/删除跨 Storage 与数据库的一致性补偿仍未实现。
- A24 Actions 保活和 GitHub Pages 真实发布仍未执行。
