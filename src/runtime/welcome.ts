import vscode from 'vscode';
import { WALKTHROUGH_ID, WELCOME_SHOWN_KEY } from '../consts';
import type { MiMoChatProvider } from '../provider';

/**
 * Show the welcome walkthrough on first activation if no API key is configured.
 */
export async function showWelcomeIfNeeded(
  context: vscode.ExtensionContext,
  provider: MiMoChatProvider,
): Promise<void> {
  const alreadyShown = context.globalState.get<boolean>(WELCOME_SHOWN_KEY);
  if (alreadyShown) {
    return;
  }

  const hasKey = await provider.hasApiKey();
  if (hasKey) {
    await context.globalState.update(WELCOME_SHOWN_KEY, true);
    return;
  }

  await context.globalState.update(WELCOME_SHOWN_KEY, true);
  await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID);
}
