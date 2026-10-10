<div align="center">

# DeepSeek Monitor

一个简洁优雅的桌面端工具，用于实时监控 DeepSeek 账户余额、API 用量、按 Key 消费与成本趋势。

[![Electron](https://img.shields.io/badge/Electron-42.8.1-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/yaro-o-O/deepseek-monitor?color=blue&label=release)](https://github.com/yaro-o-O/deepseek-monitor/releases)
[![Downloads](https://img.shields.io/github/downloads/yaro-o-O/deepseek-monitor/total?color=green)](https://github.com/yaro-o-O/deepseek-monitor/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yaro-o-O/deepseek-monitor/pulls)

[English](README.md) | **简体中文** | [Українська](README.uk.md)

</div>

---

## ✨ 为什么选择 DeepSeek Monitor？

DeepSeek 官方平台的余额和用量分散在不同页面，用量看板没有刷新按钮，也不提供按 Key 的明细。**DeepSeek Monitor** 把所有数据整合到一块紧凑的仪表盘上：

- 💰 余额一目了然，工作时**自动刷新**
- 📊 分别追踪 **V4 Flash 与 V4 Pro** 的 Token 消耗、缓存命中率与消费金额
- 🔑 **按 API Key** 统计请求数、Token、缓存命中率与消费，并支持全部 Key 汇总
- 💱 消费**按币种**分别显示（如 `¥12.45 + $0.76`），绝不混加
- 📈 7 日趋势图 + 按日明细穿透
- 🪟 驻留**系统托盘**，一键唤出，不打扰工作

## 📸 界面预览

<p align="center">
  <img src="assets/screenshots/dashboard.png" alt="DeepSeek Monitor 仪表盘" width="380" />
</p>

<p align="center">
  <img src="assets/screenshots/details.png" alt="模型详情视图" width="245" />
  <img src="assets/screenshots/keys.png" alt="按 API Key 统计" width="245" />
  <img src="assets/screenshots/settings.png" alt="设置页" width="245" />
</p>

## 🚀 功能特性

- **余额实时监控** — 一键查询 DeepSeek 账户余额，实时显示可用金额与账户状态
- **双模型用量统计** — 分别追踪 V4 Flash 与 V4 Pro 模型的 Token 消耗、缓存命中率及消费金额
- **按 API Key 统计** — "按 API Key" 卡片将所选月份的请求数、Token、缓存命中率与消费拆分到每个 Key，数据来自官方用量导出（用量 Token 自动获取，或手动导入 ZIP/CSV）。可选择最近 12 个月
- **全部 Key 汇总** — 余额卡片的选择器还提供"全部 Key"，将所有 Key 合并；它是默认视图，并驱动当日消耗、本月消费、模型行、趋势图与详情页
- **多币种消费** — 若账户以多种币种结算，消费按币种分别显示（如 `¥12.45 + $0.76`），绝不换算或相加
- **7 日趋势图表** — 可视化展示最近 7 天的 Token 使用趋势，支持命中缓存 / 未命中缓存 / 输出三项细分
- **用量详情穿透** — 点击模型行进入详情页，查看按日细分的 Token 消耗与请求次数
- **余额预警** — 余额低于设定阈值时发送系统通知（每个账户每个阈值只提醒一次，余额回升后重置）
- **多账户支持** — 管理多个 DeepSeek 账户，在设置页一键切换
- **英文 / 简体中文 / 乌克兰语界面** — 在设置页选择界面语言，选择会被保存
- **凭证加密存储** — API Key 与用量 Token 使用系统钥匙串加密保存（Electron `safeStorage`）
- **应用内自动更新** — 在应用内检测并安装新版本
- **自动刷新** — 支持 1 分钟 / 5 分钟 / 30 分钟 / 1 小时四档自动刷新间隔
- **开机自启** — 支持 Windows 与 macOS 开机自动启动
- **系统托盘** — 关闭或最小化后驻留系统托盘，任务栏不留图标，随时唤出
- **置顶悬浮窗** — 窗口置顶，鼠标悬停时可自动隐藏或变为预设透明度（可点击穿透，不遮挡桌面操作），移开后自动恢复（托盘菜单也能直接控制）
- **Token 自动同步** — 内置浏览器登录窗口，自动捕获并保存用量查询 Token

## 🔑 按 API Key 统计

实时用量接口只能按模型拆分，按 Key 的数据来自官方**用量导出**（`GET /api/v0/usage/export`，ZIP 内含 `amount-*.csv` + `cost-*.csv`）。

- **自动获取** — 配置用量 Token 后，会下载并缓存当月导出文件（带较短 TTL）。点击"按 API Key"卡片中的 ⟳ 强制重新下载，或在下拉框中选择其他月份。
- **手动导入** — 从 DeepSeek 平台导出文件，通过 **导入导出文件（ZIP/CSV）** 导入。
- **全部 Key** — 余额卡片的选择器可将所有 Key 合并，也是默认视图。
- **金额** 来自 `cost.csv`，按用量权重分摊到各 Key / 模型 / 日期，因此各 Key 之和等于官方总额。金额**按币种**分别保留。

API Key 仅以掩码形式显示（`sk-abc…0def`），完整值不会离开主进程，也不会写入日志。

## 📦 安装

### 方式一：下载安装包（推荐）

从 [Releases 页面](https://github.com/yaro-o-O/deepseek-monitor/releases) 下载最新安装程序，无需安装 Node.js。

### 方式二：从源码构建

**前置要求：** [Node.js](https://nodejs.org/) >= 18 及 npm（或 yarn）。

```bash
# 克隆仓库
git clone https://github.com/yaro-o-O/deepseek-monitor.git
cd deepseek-monitor

# 安装依赖
npm install

# 启动应用
npm start

# 开发模式（带开发者工具）
npm start -- --dev
```

### 打包构建

```bash
# 全平台构建
npm run build

# Windows (NSIS 安装包)
npm run build:win

# macOS (DMG 镜像)
npm run build:mac

# Linux (AppImage)
npm run build:linux
```

构建产物将输出到 `dist/` 目录。

## 🧭 使用指南

### 首次配置

1. 打开应用后进入 **设置页**（⚙ 图标）
2. **API Key**：粘贴你的 DeepSeek API Key（以 `sk-` 开头），点击"验证并保存"
3. **用量同步 Token**：
   - **方式一（推荐）**：点击"网页登录自动同步"，在弹出的登录窗口完成 DeepSeek 平台登录，应用将自动捕获 Token
   - **方式二**：点击"手动粘贴 Token"，从浏览器开发者工具中复制 Bearer Token 并粘贴保存

### 仪表盘说明

| 区域 | 说明 |
|------|------|
| 账户余额 | 当前账户总余额与可用状态（始终为账户级别） |
| API Key 选择 | 将下方数据限定到某个 Key，或选择"全部 Key"（默认）查看整个账户 |
| 当日消耗 | 当天累计消费（账户或所选 Key），按币种显示 |
| 本月消费 | 当月累计消费（账户或所选 Key），按币种显示 |
| V4 Flash / V4 Pro | 对应模型的本月 Token、消费金额与缓存命中率（账户或所选 Key） |
| 按 API Key | 所选月份每个 Key 的请求数、Token、缓存命中率与消费，以及全部 Key 汇总 |
| 7 日趋势 | 最近 7 天 Token 消耗柱状图（命中 / 未命中 / 输出）；点击模型行进入按日详情 |

### 自动刷新

在设置页开启"自动刷新"并选择间隔时间，应用将按设定周期自动更新余额与用量数据，并同步刷新按 Key 视图。

## 🏗 项目结构

```
deepseek-monitor/
├── .github/                 # CI 工作流与 Issue/PR 模板
│   └── workflows/build.yml  # 打标签时自动构建并发布
├── assets/                  # 应用图标与 README 截图
│   ├── icon.png
│   ├── icon.ico
│   └── screenshots/
├── src/                     # 源代码
│   ├── main.js              # 主进程：窗口管理、IPC、API 请求、配置存储
│   ├── usage-export.js      # 官方用量导出的纯解析模块（按 API Key 聚合）
│   ├── i18n.js              # 界面文案（英文 / 简体中文 / 乌克兰语）
│   ├── preload.js           # 预加载脚本：安全暴露主进程 API 到渲染进程
│   └── index.html           # 渲染进程：完整 UI 界面与交互逻辑
├── CONTRIBUTING.md          # 贡献指南
├── SECURITY.md              # 安全策略
├── CHANGELOG.md             # 版本历史
├── package.json             # 项目配置与构建脚本
├── README.md                # English
├── README.zh-CN.md          # 本文件
└── README.uk.md             # Українська
```

## 🛠 技术栈

- **Electron** — 跨平台桌面应用框架
- **原生 HTTP/HTTPS** — 直接与 DeepSeek API 通信，无额外 HTTP 客户端依赖
- **纯原生前端** — 无 UI 框架依赖，原生 HTML/CSS/JavaScript 实现
- **fflate** — 在主进程内解压官方用量导出文件
- **electron-builder** — 应用打包与分发

## 🔌 API 接口

应用通过以下 DeepSeek 官方接口获取数据：

| 接口 | 用途 | 认证方式 |
|------|------|----------|
| `GET /user/balance` | 查询账户余额 | API Key |
| `GET /models` | 获取可用模型列表 | API Key |
| `GET /api/v0/usage/amount` | 查询用量统计 | Usage Token |
| `GET /api/v0/usage/cost` | 查询消费统计 | Usage Token |
| `GET /api/v0/usage/export` | 月度用量导出（含按 Key 明细的 ZIP） | Usage Token |

## 🔐 配置存储

应用配置（API Key、Usage Token、语言、自启设置等）保存在系统用户数据目录下的 `config.json` 中：

- **Windows**: `%APPDATA%/deepseek-monitor/config.json`
- **macOS**: `~/Library/Application Support/deepseek-monitor/config.json`
- **Linux**: `~/.config/deepseek-monitor/config.json`

> **安全提示**：API Key 与用量 Token 在 Windows / macOS 上通过系统钥匙串（`safeStorage`）加密存储；Linux 无钥匙串时回退为明文保存。

## 📝 注意事项

1. **用量 Token 有效期**：通过网页登录自动获取的 Token 可能会过期，如遇用量查询失败，请重新同步
2. **余额与用量分离**：余额查询使用 API Key，用量统计使用独立的 Usage Token
3. **多币种**：消费按币种分别显示（如 `¥12.45 + $0.76`），绝不换算或相加
4. **默认全部 Key**：余额卡片的选择器默认选中"全部 Key"，切换单个 Key 可将数据限定到该 Key
5. **Windows 自启**：通过注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 实现
6. **macOS 自启**：通过 `~/Library/LaunchAgents/com.deepseek.monitor.plist` 实现

## 🤝 参与贡献

欢迎提交 [Issue](https://github.com/yaro-o-O/deepseek-monitor/issues) 或 [Pull Request](https://github.com/yaro-o-O/deepseek-monitor/pulls)！开始前请阅读[贡献指南](CONTRIBUTING.md)与[行为准则](CODE_OF_CONDUCT.md)，报告安全问题前请查看[安全策略](SECURITY.md)。

**需要帮助？** 翻译界面、反馈 bug、或帮助回答 issues 中的问题——每一个贡献对年轻的开源项目都很重要。

## 📄 许可证

[MIT](LICENSE) © [guniang2](https://github.com/guniang2)

---

> 本项目为独立的第三方开源工具，与 DeepSeek 官方无直接关联。
