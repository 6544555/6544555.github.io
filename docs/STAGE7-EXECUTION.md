# 阶段 7：单账号与共享空间真实联调记录

日期：2026-11-14  
环境：Windows；Microsoft Edge `157.0.4341.46` headless；Playwright 1.62.1；production preview `http://127.0.0.1:4174/birthday-memory/`。  
账号：唯一共享 Supabase Auth 账号；凭据只从安全环境变量读取，未写入文档、命令输出或 Git。

## 1. 自动化入口

```powershell
node scripts/stage7-smoke.mjs
```

脚本通过环境变量接收 Edge、Playwright、Supabase 和测试账号配置，并使用两个独立临时 profile 启动两个独立 Edge 进程。

## 2. 真实权限与共享空间结果

```json
{
  "authAttemptA": 1,
  "anonymousReadStatuses": {
    "photos": 401,
    "memories": 401,
    "messages": 401
  },
  "readyA": true,
  "photoCountAfterUpload": 1,
  "authAttemptB": 4,
  "readyB": true,
  "sharedBrowser": {
    "photos": 1,
    "message": true,
    "memory": true
  },
  "photoGoneInA": true,
  "offlineAfterLogin": {
    "main": true,
    "snapshotText": true,
    "offlineCopy": true
  },
  "cleanup": {
    "messages": 204,
    "memories": 204
  },
  "signedOut": {
    "mainSections": 0,
    "snapshot": null,
    "authCache": null,
    "authTokens": []
  },
  "wrongPassword": {
    "privateVisible": false,
    "message": "这次没有认出你，再试一次"
  }
}
```

验证覆盖：

- 匿名直接读取 `photos / memories / messages` 三表均返回 `401`。
- 独立 Edge A 登录唯一共享账号，应用进入 READY。
- A 通过 UI 完成私有 Storage 照片上传和 `photos` 表写入。
- A 通过 UI 新增 `messages` 与 `memories` 数据。
- 独立 Edge B 使用同一共享账号登录，读取到同一张照片、同一条留言和同一条时光记录。
- B 删除照片后，A 刷新确认照片消失。
- 登录后断网刷新仍显示主站、本地文本快照和离线状态。
- 退出后主站 DOM 消失，文本快照、认证用户缓存和 Auth token 全部清空。
- 错误密码不会挂载私密内容，只显示通用重试文案。
- 测试留言与时光清理请求均返回 `204`。
- 登录期间偶发连接重置通过有限重试收敛；A 第 1 次、B 第 4 次成功，没有篡改结果。

## 3. 响应式结果

| 视口 | 宽度 | 照片列数 | 横向溢出 | 小于 44px 控件 |
|---|---:|---:|---|---:|
| 375×812 | 375 | 2 | 否 | 0 |
| 768×1024 | 768 | 3 | 否 | 0 |
| 1440×900 | 1440 | 4 | 否 | 0 |

## 4. 截图证据

- [Edge A 上传后](evidence/stage7-browser-a-375.png)
- [Edge B 读取后](evidence/stage7-browser-b-375.png)

截图均为 `375px` 宽 production 页面，A 为 `375×3297`，B 为 `375×3185`。

## 5. 门禁

```text
npm test
10 files passed / 46 tests passed
TEST_EXIT_CODE=0

npm run typecheck
TYPECHECK_EXIT_CODE=0

npm run build
101 modules transformed
BUILD_EXIT_CODE=0
```

## 6. 未执行项

- GitHub Pages 真实发布、GitHub Secrets、保活工作流。keepalive 已改为共享账号登录后读取，并有静态测试，但尚未在 GitHub Actions 真实运行。
- 物理两台手机/电脑；当前是同一台机器上的两个独立 Edge 进程与独立 profile。
- 真实长时间 token 到期刷新和签名 URL 24 小时过期行为。
