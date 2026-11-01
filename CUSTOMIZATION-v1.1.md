# 官方版定制 v1.1

## 来源

- 上游：<https://github.com/MarSeventh/CloudFlare-ImgBed>
- 分支：main；包版本：2.7.8。
- 下载时提交：`99eb1a29fa24f3d2dbedf4ec8eff9d0ca425d7d0`。
- 请求地址：`https://api.github.com/repos/MarSeventh/CloudFlare-ImgBed/zipball/99eb1a29fa24f3d2dbedf4ec8eff9d0ca425d7d0`。
- 实际下载地址：`https://codeload.github.com/MarSeventh/CloudFlare-ImgBed/legacy.zip/99eb1a29fa24f3d2dbedf4ec8eff9d0ca425d7d0`。
- 未修改的官方 ZIP：`D:\Codex\图床\work\cloudflare-imgbed-official-99eb1a29-v1.1.zip`。
- 官方 ZIP 大小：38,678,881 字节；307 个文件。
- SHA256：`8A5E6E7D4360907CCB3F35271AB85E6E99BD764D8A90C260B8696AB446FD8FBD`。
- GitHub 页面及 Git clone 连接超时后，使用 GitHub 官方 API/codeload 下载，没有使用第三方中转。SHA256 为本地计算的一致性校验，不是官方签名。
- 本目录从官方 ZIP 解压，不包含 Git 历史；没有混入此前 2.7.6 分支的应用代码。原始 ZIP 和此前交付保持不变。

## 改动

- 首页、普通登录、管理登录左上角保留圆形音乐入口，并增加圆形图片压缩入口。
- 音乐默认地址：<https://yinyue.520xg.dpdns.org/>。
- 压缩地址：<https://yasuo.520kx.dpdns.org/>。
- 两个链接均在新标签页打开并隔离 `window.opener`，支持键盘聚焦和提示标题。
- 图标从上游已打包的 FontAwesome 音乐及图片图标渲染为本地 PNG，不依赖远程图片。不包含音乐播放器或音乐站源码。
- “过来人图床”为网站标题、页头及页脚的默认名称；保留原作者署名、许可证及上游文档。
- 页面设置的默认值不覆盖既有 USER_CONFIG 或数据库设置。首页音乐链接仍遵循原版 `useConfigLink` 配置语义；登录页使用默认音乐地址。
- 恢复页面缩放，补齐初始中文语言标签和有效的本地 favicon。
- 电脑入口 50px，手机入口 44px；适配安全区域。低高度/横屏登录页预留顶部空间，页脚跟随内容，避免遮挡。
- 没有修改上传、认证、存储、有效期、自动标签、Worker 或 Server 的业务逻辑和依赖锁文件。

## 前端维护

上游后端仓库提供编译后的前端及 sourcemap，不包含可直接重建的 Vue 源工程。
本次通过 `tools/customize-official.mjs` 对确认过的组件片段作严格匹配修改，脚本可重复运行。
受影响的 JavaScript 和 HTML 预压缩 gzip 已同步更新。
原始 sourcemap 保留供上游代码参考；其映射不包含本次定制，不能用来精确定位定制后的打包代码。
后续上游升级应重新核对片段，不可对其他版本盲目运行此补丁脚本。

## 本地验证

- `node tools/test-customization.mjs`：默认值、USER_CONFIG、数据库覆盖顺序、空值和无效配置、原版功能默认值。
- `node tools/test-browser-customization.mjs`：30 组响应式浏览器测试。
- 覆盖首页、普通登录、管理登录；320×640、390×844、768×1024、1440×900、568×320；深色及浅色主题。
- 检查图标加载、圆形尺寸、触控目标、入口间距、与表单/标题/主题按钮的遮挡、横向溢出、键盘顺序、登录输入保留和标签下划线；截图已人工查看。
- `node tools/test-shortcut-navigation.mjs`：真实点击新标签页跳转及 opener 隔离，配置覆盖和配置请求失败时的默认入口。
- 语法、JSON/sourcemap 解析、gzip 解压内容与原文件一致性检查通过。
- 原版 `npm test` 未运行成功：本机可用 npm，但项目依赖未安装，缺少 Mocha。未安装新依赖。
- 配置测试及预览用拒绝外部存储的替代模块；没有据此验证 SDK、真实上传、D1、线上认证、AI 或部署。
- 跳转测试使用本地拦截页面，验证实际目标 URL；不代表两个远程站点的服务可用性。

## 预览

在项目目录执行 `node --experimental-vm-modules tools/preview-server.mjs`。
默认地址：<http://127.0.0.1:8900/>；可用 `PREVIEW_PORT` 修改端口。
仅绑定本机，数据保存在内存，外部请求被拒绝；重启后预览数据消失。
该预览工具不用于生产部署，生产部署仍按官方文档操作。

图标和浏览器测试复用本机现有 Playwright/Chrome，其他电脑可通过 `PLAYWRIGHT_MODULE` 和 `CHROME_PATH` 指定路径。
截图默认放在 `D:\Codex\图床\temp\official-guolairen-v1.1`，可通过 `TEST_OUTPUT` 修改。

## 交付

- 定制源码：`D:\Codex\图床\work\cloudflare-imgbed-official-guolairen-v1.1`。
- 交付：`C:\Users\Administrator\Desktop\图床\ok\cloudflare-imgbed-official-guolairen-v1.1.zip`。
- 独立备份：`D:\Codex\图床\backups\cloudflare-imgbed-official-guolairen-v1.1.zip`。
- 包含完整官方应用文件及本次定制、说明和本地验证工具；不包含依赖、凭据、Git 元数据或预览日志/截图。
- 没有提交、推送、创建 PR 或部署。
