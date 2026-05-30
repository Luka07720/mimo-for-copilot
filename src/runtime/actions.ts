import vscode from 'vscode';
import { EXTERNAL_URLS } from '../consts';
import { setErrorActionUrl } from '../client';

/**
 * Register external URLs used in error messages and diagnostics.
 */
export function registerActionUrls(_context: vscode.ExtensionContext): void {
  setErrorActionUrl('configureApiKey', `command:mimo-copilot.setApiKey`);
  setErrorActionUrl('showLogs', `command:mimo-copilot.showLogs`);
}
