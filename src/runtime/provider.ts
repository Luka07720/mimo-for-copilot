import vscode from 'vscode';
import { logger } from '../logger';
import { MiMoChatProvider } from '../provider';
import { MiMoInlineCompletionProvider } from '../provider/inline';

export async function registerProvider(
  context: vscode.ExtensionContext,
): Promise<MiMoChatProvider> {
  const provider = new MiMoChatProvider(context);
  const inlineProvider = new MiMoInlineCompletionProvider(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('mimo-copilot.setApiKey', () => provider.configureApiKey()),
    vscode.commands.registerCommand('mimo-copilot.clearApiKey', () => provider.clearApiKey()),
    vscode.lm.registerLanguageModelChatProvider('mimo', provider),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, inlineProvider),
  );

  // Copilot Chat can serve cached model info. Activate it first so
  // this refresh reaches a live listener and re-queries the provider.
  await activateCopilotChat();
  provider.refreshModelPicker();

  return provider;
}

async function activateCopilotChat(): Promise<void> {
  try {
    await vscode.extensions.getExtension('github.copilot-chat')?.activate();
  } catch (error) {
    logger.warn('Copilot Chat activation unavailable; model picker refresh may be delayed', error);
  }
}
