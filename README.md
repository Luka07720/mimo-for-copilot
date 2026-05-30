# MiMo for Copilot Chat

在 Copilot Chat 模型选择器中直接使用小米 MiMo-v2.5-pro —— 无需离开你熟悉的 Copilot 工作流。

## 功能特性

- **MiMo-v2.5-pro 出现在 Copilot Chat 模型选择器中** —— 与 GPT-4o、Claude 等并列
- **Agent 模式、工具调用、Instructions、MCP、Skills** —— 全部正常运作
- **SSE 流式响应** —— 实时输出，低延迟
- **需自行提供 API Key** —— 密钥存储在操作系统密钥链中，安全可靠

## 快速开始

### 前置条件

- VS Code 1.116 及以上版本
- GitHub Copilot 订阅（Free / Pro / Enterprise）
- MiMo API Key

### 使用步骤

1. 安装扩展后，运行命令 **MiMo: 设置 API Key**
2. 粘贴你的 API Key
3. 打开 Copilot Chat，点击模型选择器，选择 **MiMo-v2.5-pro**
4. 开始聊天

## 设置项

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `mimo-copilot.baseUrl` | `https://token-plan-cn.xiaomimimo.com/v1` | API 端点 |
| `mimo-copilot.maxTokens` | `0` | 最大输出 Token 数（0 = 不限制） |
| `mimo-copilot.modelIdOverrides` | `{"mimo-v2.5-pro": "mimo-v2.5-pro"}` | API 模型 ID 覆盖 |

## 开发

```bash
npm install
npm run compile
```

按 F5 启动扩展开发宿主进行测试。

## 许可证

MIT
