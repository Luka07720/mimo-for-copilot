import vscode from 'vscode';
import { CONFIG_SECTION } from './consts';

/**
 * Get MiMo API base URL from settings.
 * Falls back to the official endpoint when not configured.
 */
export function getBaseUrl(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('baseUrl') || 'https://token-plan-cn.xiaomimimo.com/v1';
}

/**
 * Resolve the API model ID to send to the endpoint.
 *
 * Users can override model IDs via the `modelIdOverrides` setting object
 * (e.g. for third-party API proxies). Falls back to the VS Code model ID
 * when no override is configured.
 */
export function getApiModelId(vscodeModelId: string): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const overrides = config.get<Record<string, string>>('modelIdOverrides');
  const override = overrides?.[vscodeModelId]?.trim();
  return override || vscodeModelId;
}

/**
 * Get the configured max output tokens limit.
 * Returns `undefined` when set to 0 (API default — no limit).
 */
export function getMaxTokens(): number | undefined {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const value = config.get<number>('maxTokens', 0);
  return value > 0 ? value : undefined;
}

/**
 * Whether inline completion is enabled.
 */
export function getInlineCompletionEnabled(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('inlineCompletion.enabled', true);
}

/**
 * Model ID to use for inline completions.
 */
export function getInlineCompletionModel(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('inlineCompletion.model', 'mimo-v2.5');
}

/**
 * Max tokens for inline completion responses.
 */
export function getInlineMaxTokens(): number {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<number>('inlineCompletion.maxTokens', 128);
}
