import vscode from 'vscode';
import { logger } from '../logger';

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mimo-copilot.showLogs', () => logger.show()),
    vscode.commands.registerCommand('mimo-copilot.getApiKey', () =>
      vscode.env.openExternal(vscode.Uri.parse('https://token-plan-cn.xiaomimimo.com')),
    ),
    vscode.commands.registerCommand('mimo-copilot.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'mimo-copilot'),
    ),
  );
}
