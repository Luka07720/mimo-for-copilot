import vscode from 'vscode';

/**
 * Lightweight i18n module — zero dependencies, follows VS Code display language.
 *
 *  - en / en-US / en-*      → English (default)
 *  - zh-cn                  → Simplified Chinese
 *  - all other locales      → English until translated
 */

function isZh(): boolean {
  const lang = vscode.env.language.toLowerCase();
  return lang === 'zh-cn';
}

// ---- Translation dictionaries ----

type Translations = Record<string, string>;

const zh: Translations = {
  // Model descriptions
  'model.pro.detail': '深度推理',
  'model.base.detail': '快速通用',

  // API Key
  'auth.apiKeyRequiredDetail': '请先配置 API Key',
  'auth.prompt': '请输入 MiMo API Key。',
  'auth.placeholder': 'sk-...',
  'auth.emptyValidation': 'API Key 不能为空',
  'auth.saved': 'API Key 已安全保存。',
  'auth.removed': 'API Key 已移除。',
  'auth.notConfigured': 'API Key 未配置，请在命令面板运行 "MiMo: 设置 API Key"。',

  // Request
  'request.toolsLimitExceeded':
    'MiMo 单次 tools 请求最多支持 {0} 个 functions，当前请求包含 {1} 个。请先用 VS Code 的 Configure Tools 关闭不常用的工具。',

  // Errors
  'error.http.400': '[{0}] 请求体格式错误。请根据错误信息提示修改请求体。',
  'error.http.401':
    '[{0}] API Key 错误，认证失败。请检查您的 API Key 是否正确。',
  'error.http.402': '[{0}] 账号余额不足。请确认账户余额，并前往充值页面进行充值。',
  'error.http.422': '[{0}] 请求体参数错误。请根据错误信息提示修改相关参数。',
  'error.http.429': '[{0}] 请求速率（TPM 或 RPM）达到上限。请合理规划您的请求速率。',
  'error.http.500': '[{0}] 服务器内部故障。请等待后重试。',
  'error.http.503': '[{0}] 服务器负载过高。请稍后重试您的请求。',
  'error.http.generic': '[{0}] 服务返回错误响应。',
  'error.action.setApiKey': '设置 API Key',
  'error.action.viewDetails': '错误详情',
  'error.network.dns': '[{0}] DNS 解析失败。请检查网络连接、防火墙或代理设置，以及自定义 baseUrl。',
  'error.network.unreachable':
    '[{0}] 目标不可达或拒绝连接。请检查自定义 baseUrl、代理服务、网络连接或防火墙设置。',
  'error.network.interrupted': '[{0}] 连接被中断。请检查网络连接、防火墙或代理设置，或稍后重试。',
  'error.network.timeout': '[{0}] 连接超时。请稍后重试，或检查网络连接或代理设置。',
  'error.network.tls': '[{0}] TLS/证书校验失败。请检查代理、证书配置或自定义 baseUrl。',
  'error.network.aborted':
    '[{0}] 请求已中止。如果不是主动取消，请检查网络连接或代理设置，或稍后重试。',
  'error.network.protocol':
    '[{0}] HTTP 连接或响应解析失败。请检查代理设置、自定义 baseUrl 或服务响应。',
  'error.network.configuration': '[{0}] 请求配置无效。请检查自定义 baseUrl 或扩展设置。',
  'error.network.generic':
    '[{0}] 网络请求失败。请检查网络连接、防火墙或代理设置，以及自定义 baseUrl。',
  'error.unknown': 'MiMo 请求失败：{0}',

  // Extension
  'extension.activateFailed': 'MiMo 激活失败，请运行 "MiMo: 显示日志" 查看详情。',
  'extension.deactivateFailed': 'MiMo 停用异常',
  'extension.welcomeFailed': '欢迎引导加载异常',
};

const en: Translations = {
  // Model descriptions
  'model.pro.detail': 'Most capable reasoning model',
  'model.base.detail': 'Fast, general-purpose model',

  // API Key
  'auth.apiKeyRequiredDetail': 'Please run MiMo: Set API Key to configure.',
  'auth.prompt': 'Enter your MiMo API key.',
  'auth.placeholder': 'sk-...',
  'auth.emptyValidation': 'API key cannot be empty',
  'auth.saved': 'MiMo API key saved.',
  'auth.removed': 'MiMo API key removed.',
  'auth.notConfigured':
    'MiMo API key not configured. Run "MiMo: Set API Key" from the Command Palette.',

  // Request
  'request.toolsLimitExceeded':
    'MiMo supports at most {0} functions in a single `tools` request, but this request contains {1}. Use VS Code Configure Tools to disable tools you rarely use.',

  // Errors
  'error.http.400':
    '[{0}] Invalid request body format. Please modify your request body according to the hints in the error message.',
  'error.http.401':
    "[{0}] Authentication fails due to the wrong API key. Please check your API key.",
  'error.http.402':
    "[{0}] You have run out of balance. Please check your account's balance.",
  'error.http.422':
    '[{0}] Your request contains invalid parameters. Please modify your request parameters according to the hints in the error message.',
  'error.http.429':
    '[{0}] You are sending requests too quickly. Please pace your requests reasonably.',
  'error.http.500':
    '[{0}] Our server encounters an issue. Please retry your request after a brief wait.',
  'error.http.503':
    '[{0}] The server is overloaded due to high traffic. Please retry your request after a brief wait.',
  'error.http.generic': '[{0}] The service returned an error response.',
  'error.action.setApiKey': 'Set API Key',
  'error.action.viewDetails': 'Error Details',
  'error.network.dns':
    '[{0}] DNS lookup failed. Check your network connection, firewall, or proxy settings, and your custom baseUrl.',
  'error.network.unreachable':
    '[{0}] The target is unreachable or refused the connection. Check your custom baseUrl, proxy service, network connection, or firewall settings.',
  'error.network.interrupted':
    '[{0}] The connection was interrupted. Check your network connection, firewall, or proxy settings, or try again later.',
  'error.network.timeout':
    '[{0}] Connection timed out. Try again later, or check your network connection, firewall, or proxy settings.',
  'error.network.tls':
    '[{0}] TLS/certificate verification failed. Check your proxy settings, certificate configuration, or custom baseUrl.',
  'error.network.aborted':
    '[{0}] The request was aborted. If you did not cancel it, check your network connection or proxy settings, or try again later.',
  'error.network.protocol':
    '[{0}] The HTTP connection or response parsing failed. Check your proxy settings, custom baseUrl, or service response.',
  'error.network.configuration':
    '[{0}] The request configuration is invalid. Check your custom baseUrl or extension settings.',
  'error.network.generic':
    '[{0}] Network request failed. Check your network connection, firewall, or proxy settings, and your custom baseUrl.',
  'error.unknown': 'MiMo request failed: {0}',

  // Extension
  'extension.activateFailed': 'MiMo failed to activate. Run "MiMo: Show Logs" for details.',
  'extension.deactivateFailed': 'Failed to prepare MiMo provider for deactivate',
  'extension.welcomeFailed': 'Failed to show MiMo welcome prompt',
};

/**
 * Resolve a translation key for the current VS Code display language.
 * Supports positional placeholders {0}, {1}, ...
 */
export function t(key: string, ...args: (string | number)[]): string {
  const dict = isZh() ? zh : en;
  let text = dict[key];
  if (text === undefined) {
    // Fall back to English when a key is missing from the active locale.
    text = en[key];
  }
  if (text === undefined) {
    return key;
  }
  // Replace all occurrences of each positional placeholder.
  for (let i = 0; i < args.length; i++) {
    text = text.replaceAll(`{${i}}`, String(args[i]));
  }
  return text;
}
