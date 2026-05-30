import vscode from 'vscode';
import { AuthManager } from '../auth';
import { t } from '../i18n';
import { logger } from '../logger';
import { toChatInfo } from './models';
import { prepareChatRequest } from './request';
import { estimateTokenCount } from './tokens';
import { streamChatCompletion } from './stream';
import { MODELS } from '../consts';

/**
 * MiMo Chat Provider — implements vscode.LanguageModelChatProvider so
 * MiMo models appear directly in the Copilot Chat model picker.
 */
export class MiMoChatProvider implements vscode.LanguageModelChatProvider {
  private readonly authManager: AuthManager;
  private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
  private isActive = true;

  readonly onDidChangeLanguageModelChatInformation =
    this.onDidChangeLanguageModelChatInformationEmitter.event;

  /**
   * Adaptive chars-per-token ratio, calibrated from actual usage data.
   * Updated via exponential moving average each time the API reports real token counts.
   */
  private charsPerToken = 4.0;

  constructor(context: vscode.ExtensionContext) {
    this.authManager = new AuthManager(context);

    context.subscriptions.push(
      this.onDidChangeLanguageModelChatInformationEmitter,
      // Settings-based fallback API key changes.
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mimo-copilot.apiKey')) {
          this.onDidChangeLanguageModelChatInformationEmitter.fire();
        }
      }),
      // Multi-window: SecretStorage changes don't fire onDidChangeConfiguration.
      context.secrets.onDidChange((e) => {
        if (e.key === 'mimo-copilot.apiKey') {
          this.onDidChangeLanguageModelChatInformationEmitter.fire();
        }
      }),
    );
  }

  // ---- Public commands ----

  async configureApiKey(): Promise<void> {
    const saved = await this.authManager.promptForApiKey();
    if (saved) {
      this.onDidChangeLanguageModelChatInformationEmitter.fire();
    }
  }

  async clearApiKey(): Promise<void> {
    await this.authManager.deleteApiKey();
    this.onDidChangeLanguageModelChatInformationEmitter.fire();
    vscode.window.showInformationMessage(t('auth.removed'));
  }

  async hasApiKey(): Promise<boolean> {
    return this.authManager.hasApiKey();
  }

  /** Force Copilot Chat to re-query model information. */
  refreshModelPicker(): void {
    this.onDidChangeLanguageModelChatInformationEmitter.fire();
  }

  async prepareForDeactivate(): Promise<void> {
    this.isActive = false;
    this.onDidChangeLanguageModelChatInformationEmitter.fire();

    try {
      await vscode.lm.selectChatModels({ vendor: 'mimo' });
    } catch (error) {
      logger.warn('Failed to refresh MiMo models during deactivate', error);
    }
  }

  // ---- LanguageModelChatProvider ----

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatInformation[]> {
    if (!this.isActive) {
      return [];
    }

    const hasKey = await this.authManager.hasApiKey();
    return MODELS.map((model) => toChatInfo(model, hasKey));
  }

  async provideLanguageModelChatResponse(
    modelInfo: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const prepared = await prepareChatRequest({
      authManager: this.authManager,
      modelInfo,
      messages,
      options,
      token,
    });

    return streamChatCompletion({
      prepared,
      progress,
      token,
      getCharsPerToken: () => this.charsPerToken,
      setCharsPerToken: (charsPerToken) => {
        this.charsPerToken = charsPerToken;
      },
    });
  }

  async provideTokenCount(
    _modelInfo: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    return estimateTokenCount(text, this.charsPerToken);
  }
}
