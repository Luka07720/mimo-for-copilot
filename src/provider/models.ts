import vscode from 'vscode';
import { t } from '../i18n';
import type { ModelDefinition } from '../types';

/**
 * NOTE: Non-public API surface.
 *
 * The fields below (`configurationSchema` on chat info, `modelConfiguration`
 * on response options, plus `isUserSelectable` / `statusIcon`) are not part
 * of the stable `vscode.LanguageModelChat*` typings yet. They are the same
 * shape currently consumed by GitHub Copilot Chat to render a per-model
 * config dropdown in the model picker.
 */

export type ModelPickerChatInformation = vscode.LanguageModelChatInformation & {
  readonly isUserSelectable: boolean;
  readonly statusIcon?: vscode.ThemeIcon;
};

export function toChatInfo(m: ModelDefinition, hasApiKey: boolean): ModelPickerChatInformation {
  const detailKey = resolveDetailKey(m);
  const modelDetail = detailKey ? t(detailKey) : m.detail;
  return {
    id: m.id,
    name: m.name,
    family: m.family,
    version: m.version,
    detail: hasApiKey ? modelDetail : t('auth.apiKeyRequiredDetail'),
    tooltip: hasApiKey ? undefined : t('auth.apiKeyRequiredDetail'),
    statusIcon: hasApiKey ? undefined : new vscode.ThemeIcon('warning'),
    maxInputTokens: m.maxInputTokens,
    maxOutputTokens: m.maxOutputTokens,
    isUserSelectable: true,
    capabilities: {
      toolCalling: m.capabilities.toolCalling,
      imageInput: m.capabilities.imageInput,
    },
  };
}

function resolveDetailKey(m: ModelDefinition): string | undefined {
  const suffix = m.id.startsWith('mimo-v2.5-') ? m.id.slice('mimo-v2.5-'.length) : 'base';
  const key = `model.${suffix}.detail`;
  const translated = t(key);
  return translated !== key ? key : undefined;
}
