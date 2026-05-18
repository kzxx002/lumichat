# LumiChat ✨

> 一个基于 **智谱 GLM-5.1** 的 AI 聊天助手，支持深度思考模式，纯前端实现，无需服务器，一键部署到 GitHub Pages。

![LumiChat 预览](https://img.shields.io/badge/AI-LumiChat-6366f1?style=for-the-badge&logo=openai)
![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?style=for-the-badge&logo=github)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## ✨ 特性

- 🧠 **深度思考模式** — GLM-5.1 原生推理思考过程，可折叠展示
- 🔮 **超大上下文** — 200K token 超长上下文支持
- 🤖 **多模型支持** — GLM-5.1 / GLM-5-FlashX / GLM-4-Plus / GLM-4-Flash
- 💬 **多对话管理** — 侧边栏历史记录，随时切换
- 🌙 **深色/浅色主题** — 一键切换，偏好自动保存
- 📝 **Markdown 渲染** — 完整的代码高亮、表格、公式支持
- 📋 **一键复制代码** — 代码块右上角复制按钮
- 🔐 **本地存储** — API Key 及设置仅存储于浏览器，不上传服务器
- 📱 **响应式设计** — 完美支持手机、平板、桌面端

---

## 🚀 快速开始

### 方法一：直接使用 GitHub Pages（推荐）

1. **Fork 本仓库**
2. 进入仓库 **Settings → Pages**
3. Source 选择 `Deploy from a branch`，Branch 选 `main`，目录选 `/` (root)
4. 保存，等待几分钟后访问 `https://你的用户名.github.io/lumichat`

### 方法二：本地运行

```bash
# 克隆仓库
git clone https://github.com/你的用户名/lumichat.git
cd lumichat

# 直接用浏览器打开（推荐用 Live Server 避免 CORS）
npx serve .
```

---

## 🔑 配置智谱 GLM API Key

1. 访问 [open.bigmodel.cn/dev/apikey](https://open.bigmodel.cn/dev/apikey) 免费注册并获取 API Key
2. 打开网站，点击左下角 **⚙️ 设置**
3. 粘贴你的 API Key，点击保存
4. 可选：开启/关闭 **深度思考模式**（开启后模型会展示推理过程）

> **免费额度**：智谱提供新用户免费 token 额度，个人使用完全够用。

---

## 🧠 关于深度思考模式

GLM-5.1 内置深度思考能力，开启后模型会先展示完整的推理分析过程，再给出最终答案。

- 适合复杂问题（数学、逻辑、代码分析）
- 关闭后响应更快，适合简单问答

---

## 📁 项目结构

```
lumichat/
├── index.html       # 主页面（完整 HTML 结构）
├── style.css        # 样式表（浅色/深色主题 + 思考过程样式）
├── app.js           # 主逻辑（GLM API 调用、状态管理）
└── README.md        # 说明文档
```

---

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| 纯 HTML/CSS/JS | 前端界面，无框架依赖 |
| [智谱 GLM-5.1](https://bigmodel.cn) | AI 推理，200K 上下文 + 深度思考 |
| [marked.js](https://marked.js.org) | Markdown 渲染 |
| [highlight.js](https://highlightjs.org) | 代码语法高亮 |
| [DOMPurify](https://github.com/cure53/DOMPurify) | XSS 防护 |
| GitHub Pages | 静态网站托管 |

---

## 📝 自定义

### 更改系统提示词

打开设置，在"系统提示词"中填入自定义 prompt，例如：

```
你是一个专业的前端开发工程师，擅长 React 和 TypeScript，
回答时请提供完整可运行的代码示例。
```

### 更换默认模型

在 `app.js` 中修改 `State.model` 的默认值，或直接在界面的模型选择器中切换。

---

## 📄 License

MIT License
