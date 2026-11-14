# 自托管字体

首版不请求任何第三方字体，使用系统回退字体保证离线可读。

如需启用设计指定的字体，在本目录加入：

- `LXGWWenKai-Regular.woff2`
- `SourceHanSansSC-Regular.woff2`
- 两个字体各自的 OFL 许可文本

加入字体后，在 `src/styles.css` 增加同源 `@font-face`。单个字体文件建议不超过 2MB，并继续保留系统回退序列。
