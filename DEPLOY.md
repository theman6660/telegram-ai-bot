# 免费部署指南

## 方案一：Railway（推荐，最简单）

Railway 每月提供 $5 免费额度，这个 bot 用量很小，完全够用。

### 步骤

**1. 把代码推到 GitHub**

```bash
cd telegram-ai-bot
git init
git add .
git commit -m "init"
# 在 GitHub 上创建新仓库后：
git remote add origin https://github.com/你的用户名/telegram-ai-bot.git
git push -u origin main
```

**2. 注册 Railway**

- 打开 https://railway.app
- 用 GitHub 账号登录

**3. 创建项目**

- 点击 **New Project**
- 选择 **Deploy from GitHub Repo**
- 选择你刚推的 `telegram-ai-bot` 仓库

**4. 设置环境变量**

在 Railway 项目页面，点击你的服务 → **Variables** 标签，添加：

| 变量名 | 值 |
|---|---|
| `TELEGRAM_TOKEN` | 你的 Telegram Bot Token |
| `ANTHROPIC_AUTH_TOKEN` | 你的 API Key |
| `ANTHROPIC_BASE_URL` | 你的反代地址 |
| `ANTHROPIC_MODEL` | 模型名称 |

> 海外服务器不需要代理，`PROXY_URL` 留空即可。

**5. 等待部署完成**

Railway 会自动检测 Dockerfile 并构建。部署成功后在 **Deployments** 标签能看到绿色状态。

**6. 验证**

给你的 Telegram bot 发消息，应该能正常回复了。

---

## 方案二：Fly.io（备选）

Fly.io 免费额度包含 3 个共享 VM，足够跑这个 bot。

### 步骤

**1. 安装 flyctl**

Windows:
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**2. 登录**

```bash
flyctl auth login
```

**3. 初始化项目**

```bash
cd telegram-ai-bot
flyctl launch
```

会生成 `fly.toml`，按提示选择区域（建议选 Singapore 或 Tokyo）。

**4. 设置环境变量**

```bash
flyctl secrets set TELEGRAM_TOKEN="你的Token"
flyctl secrets set ANTHROPIC_AUTH_TOKEN="你的Key"
flyctl secrets set ANTHROPIC_BASE_URL="你的反代地址"
flyctl secrets set ANTHROPIC_MODEL="模型名称"
```

**5. 部署**

```bash
flyctl deploy
```

**6. 验证**

```bash
flyctl logs
```

看到 `Bot is running...` 就成功了。

---

## 常见问题

**Q: Railway 免费额度够吗？**
A: 够。这个 bot 每月消耗大约 $0.5-1，远低于 $5 免费额度。

**Q: 部署后 memory 目录会丢吗？**
A: Railway 的文件系统是非持久化的，重启后 memory 会丢失。如果需要持久化记忆，后续可以接数据库（对当前使用影响不大）。

**Q: 如何查看日志？**
A: Railway 在项目页面点 **Deployments** → 最新部署 → **View Logs**。
