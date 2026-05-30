import type { ModelDefinition } from './types';

/**
 * Compile-time constants shared across the extension.
 */

/** VS Code configuration section prefix for all extension settings. */
export const CONFIG_SECTION = 'mimo-copilot';

export const EXTERNAL_URLS = {
  mimo: {
    apiKeys: 'https://token-plan-cn.xiaomimimo.com',
    usage: 'https://token-plan-cn.xiaomimimo.com',
  },
} as const;

/** URI path handled by this extension to reveal the output log. */
export const SHOW_LOGS_URI_PATH = '/showLogs';

/** URI path handled by this extension to open API key configuration. */
export const CONFIGURE_API_KEY_URI_PATH = '/setApiKey';

// VS Code's internal LanguageModelChatMessageRole.System is not exposed in @types/vscode.
export const LANGUAGE_MODEL_CHAT_SYSTEM_ROLE = 3;

// ---- Secret keys ----

/** SecretStorage key for the MiMo API key. */
export const API_KEY_SECRET = 'mimo-copilot.apiKey';

/** memento key tracking whether the welcome walkthrough has been shown. */
export const WELCOME_SHOWN_KEY = 'mimo-copilot.welcomeShown';

// ---- Walkthrough ----

/** Walkthrough contribution ID. */
export const WALKTHROUGH_ID = 'mimo-copilot.mimo-for-copilot#mimoGettingStarted';

// ---- Model registry ----

/** MiMo tool calling limit. */
export const MIMO_TOOLS_LIMIT = 128;

/** Available MiMo models exposed through the language model provider. */
export const MODELS: ModelDefinition[] = [
  {
    id: 'mimo-v2.5-pro',
    name: 'MiMo-v2.5-pro',
    family: 'mimo',
    version: 'v2.5',
    detail: 'Xiaomi MiMo reasoning model',
    maxInputTokens: 131072,
    maxOutputTokens: 32768,
    capabilities: {
      toolCalling: MIMO_TOOLS_LIMIT,
      imageInput: false,
    },
  },
];
