import vscode from 'vscode';
import { AuthManager } from '../auth';
import { MiMoClient } from '../client';
import { getApiModelId, getBaseUrl, getMaxTokens } from '../config';
import { MODELS } from '../consts';
import { t } from '../i18n';
import type { MiMoRequest } from '../types';
import { convertMessages, countMessageChars } from './convert';

export interface PreparedChatRequest {
  client: MiMoClient;
  request: MiMoRequest;
  totalRequestChars: number;
  trailingToolResultIds: string[];
}

export interface PrepareChatRequestOptions {
  authManager: AuthManager;
  modelInfo: vscode.LanguageModelChatInformation;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  options: vscode.ProvideLanguageModelChatResponseOptions;
  token: vscode.CancellationToken;
}

export async function prepareChatRequest({
  authManager,
  modelInfo,
  messages,
  options,
  token,
}: PrepareChatRequestOptions): Promise<PreparedChatRequest> {
  const apiKey = await authManager.getApiKey();
  if (!apiKey) {
    throw new Error(t('auth.notConfigured'));
  }

  const client = new MiMoClient(getBaseUrl(), apiKey);
  const modelDef = MODELS.find((m) => m.id === modelInfo.id);
  const maxTokens = getMaxTokens();

  const mimoMessages = convertMessages(messages);
  const tools = prepareRequestTools(modelDef?.capabilities.toolCalling, options);

  const totalRequestChars = countMessageChars(mimoMessages);
  const request: MiMoRequest = {
    model: getApiModelId(modelInfo.id),
    messages: mimoMessages,
    stream: true,
    tools,
    tool_choice: tools && tools.length > 0 ? ('auto' as const) : undefined,
    max_tokens: maxTokens,
  };

  return {
    client,
    request,
    totalRequestChars,
    trailingToolResultIds: collectTrailingToolResultIds(mimoMessages),
  };
}

function prepareRequestTools(
  toolCallingLimit: boolean | number | undefined,
  options: vscode.ProvideLanguageModelChatResponseOptions,
): import('../types').MiMoTool[] | undefined {
  if (!toolCallingLimit) {
    return undefined;
  }

  const tools = options.tools;
  if (!tools || tools.length === 0) {
    return undefined;
  }

  const limit = typeof toolCallingLimit === 'number' ? toolCallingLimit : Infinity;
  const limitedTools = tools.slice(0, limit);

  return limitedTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown> | undefined,
    },
  }));
}

function collectTrailingToolResultIds(messages: import('../types').MiMoMessage[]): string[] {
  const ids: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'tool' && msg.tool_call_id) {
      ids.push(msg.tool_call_id);
    } else {
      break;
    }
  }
  return ids;
}
