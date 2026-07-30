# 我的手机应用（可扩展功能框架）

一个**只在手机上运行**的网页应用框架：首页是功能卡片网格，点开就是对应功能。
自带亮/暗主题、刘海屏适配、本地保存、可「添加到主屏幕」当 App 用。
后续你想加什么功能，只要往 `js/features/` 里丢一个文件就行。

## 目录结构

```
my-mobile-app/
├─ index.html          # 入口页面（引入框架 + 各功能）
├─ manifest.json        # PWA 配置（添加到主屏幕用）
├─ sw.js                # 离线缓存（Service Worker）
├─ assets/icon.svg      # 应用图标
├─ css/style.css        # 全部样式（已做亮/暗主题）
└─ js/
   ├─ app.js            # 核心框架：路由 / 主题 / 首页 / 工具（一般不用改）
   └─ features/         # ★ 你的功能都放这里
      ├─ hello.js       # 示例：静态页
      ├─ todo.js        # 示例：待办清单（带本地保存）
      └─ sync.js        # 多端同步（记账/打卡/心情/便签）
```

## 在手机上运行（3 步）

> 这个网页需要用一个「本地服务器」打开（直接双击 HTML 在手机上不行，因为浏览器会拦脚本）。

1. **在电脑上启动服务器**（在本项目文件夹里执行）：
   ```bash
   python -m http.server 8000
   ```
2. **查电脑的局域网 IP**（手机和电脑要在同一个 WiFi 下）：
   - Windows：命令行输入 `ipconfig`，找「IPv4 地址」，类似 `192.168.x.x`
   - macOS：终端输入 `ifconfig | grep inet`
3. **手机浏览器打开**：
   ```
   http://192.168.x.x:8000
   ```
   把 `192.168.x.x` 换成你电脑的 IP。

### 变成真正的 App（推荐）
手机浏览器打开后，点「分享 / 菜单 → 添加到主屏幕」。
之后桌面就有图标，点开是全屏、像原生 App，还能离线用。

## 如何添加新功能（以后就做这个）

1. 在 `js/features/` 新建一个文件，比如 `timer.js`，写入：
   ```js
   App.registerFeature({
     id: 'timer',            // 唯一标识，不能重复
     title: '计时器',         // 卡片标题
     desc: '简单的倒计时',     // 卡片副标题
     icon: '⏱️',             // 卡片图标（emoji 即可）
     color: '#0ea5e9',       // 卡片主题色
     render(container) {     // 点开后渲染的内容
       container.innerHTML = '<p>这里写你的功能页面</p>';
     }
   });
   ```
2. 在 `index.html` 里加一行（放在其它功能 `<script>` 旁边）：
   ```html
   <script src="js/features/timer.js"></script>
   ```
3. 刷新手机页面，首页就多了一张新卡片。

> 功能里可以用 `App.navigate(id)` 跳转、`App.toast('提示')` 弹轻提示，
> 用 `localStorage` 存数据（关掉也不丢），用 `App.escapeHtml()` 防 XSS。

## 想随时随地访问（不依赖电脑开机）

把整个 `my-mobile-app/` 文件夹部署到一个静态托管服务（例如 CloudStudio / GitHub Pages /
Vercel 等），拿到一个网址，手机随时打开即可。需要我帮你一键部署可以说一声。

## 小贴士

- 改完代码，手机上**下拉刷新**或重新打开页面即可看到更新。
- Service Worker 会缓存旧文件；如果你改了功能却看不到变化，手机浏览器里
  「清除站点数据 / 重新加载」一下即可。
- 所有数据都存在手机浏览器本地，不会上传，隐私安全。
