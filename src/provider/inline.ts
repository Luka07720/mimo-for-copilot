import vscode from 'vscode';
import { AuthManager } from '../auth';
import { MiMoClient } from '../client';
import {
  getApiModelId,
  getBaseUrl,
  getInlineCompletionEnabled,
  getInlineCompletionModel,
  getInlineMaxTokens,
} from '../config';
import { logger } from '../logger';

const PREFIX_MAX_LINES = 50;
const PREFIX_MAX_CHARS = 2000;
const SUFFIX_MAX_LINES = 10;
const SUFFIX_MAX_CHARS = 500;
const DEBOUNCE_MS = 300;

const SYSTEM_PROMPT =
  'You are a code completion assistant. Continue the code seamlessly from where the cursor is placed. ' +
  'Only output the continuation code — no explanations, no markdown fences, no code blocks. ' +
  'Match the indentation and style of the surrounding code.';

export class MiMoInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly authManager: AuthManager;
  private lastRequestKey = '';
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.authManager = new AuthManager(context);

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mimo-copilot.inlineCompletion')) {
          this.lastRequestKey = '';
        }
      }),
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    logger.info(`[InlineCompletion] called: file=${document.fileName} pos=${position.line}:${position.character} enabled=${getInlineCompletionEnabled()}`);

    if (!getInlineCompletionEnabled()) {
      logger.info('[InlineCompletion] disabled, skipping');
      return undefined;
    }

    // Skip on explicit trigger only if we have nothing to show
    // Don't skip automatic triggers (typing)

    const apiKey = await this.authManager.getApiKey();
    if (!apiKey) {
      logger.info('[InlineCompletion] no API key, skipping');
      return undefined;
    }

    // Build context
    const prefix = this.getPrefix(document, position);
    const suffix = this.getSuffix(document, position);
    const language = document.languageId;

    if (prefix.trim().length === 0) {
      return undefined;
    }

    // Cache key: same position + same prefix = skip
    const requestKey = `${document.uri.toString()}:${position.line}:${position.character}:${prefix.slice(-100)}`;
    if (requestKey === this.lastRequestKey) {
      return undefined;
    }

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        if (token.isCancellationRequested) {
          resolve(undefined);
          return;
        }

        try {
          logger.info(`[InlineCompletion] requesting: model=${getInlineCompletionModel()} lang=${language} prefixLen=${prefix.length}`);
          const completion = await this.requestCompletion(
            apiKey,
            language,
            prefix,
            suffix,
            token,
          );

          if (token.isCancellationRequested || !completion) {
            logger.info(`[InlineCompletion] no result: cancelled=${token.isCancellationRequested} empty=${!completion}`);
            resolve(undefined);
            return;
          }

          this.lastRequestKey = requestKey;

          // Clean up the completion
          const cleaned = this.cleanCompletion(completion, position, document);
          if (!cleaned) {
            logger.info('[InlineCompletion] cleaned result is empty');
            resolve(undefined);
            return;
          }

          logger.info(`[InlineCompletion] returning suggestion: "${cleaned.slice(0, 50)}..."`);
          const item = new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position));
          resolve([item]);
        } catch (error) {
          logger.warn('Inline completion failed:', error);
          resolve(undefined);
        }
      }, DEBOUNCE_MS);
    });
  }

  private getPrefix(document: vscode.TextDocument, position: vscode.Position): string {
    const startLine = Math.max(0, position.line - PREFIX_MAX_LINES);
    const range = new vscode.Range(startLine, 0, position.line, position.character);
    let text = document.getText(range);
    if (text.length > PREFIX_MAX_CHARS) {
      text = text.slice(-PREFIX_MAX_CHARS);
    }
    return text;
  }

  private getSuffix(document: vscode.TextDocument, position: vscode.Position): string {
    const endLine = Math.min(document.lineCount - 1, position.line + SUFFIX_MAX_LINES);
    const range = new vscode.Range(position.line, position.character, endLine, Number.MAX_SAFE_INTEGER);
    let text = document.getText(range);
    if (text.length > SUFFIX_MAX_CHARS) {
      text = text.slice(0, SUFFIX_MAX_CHARS);
    }
    return text;
  }

  private async requestCompletion(
    apiKey: string,
    language: string,
    prefix: string,
    suffix: string,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const baseUrl = getBaseUrl();
    const modelId = getApiModelId(getInlineCompletionModel());
    const maxTokens = getInlineMaxTokens();

    const client = new MiMoClient(baseUrl, apiKey);

    const userPrompt =
      `Complete the following ${language} code at the cursor position [CURSOR].\n\n` +
      '```' + language + '\n' +
      prefix + '[CURSOR]' + suffix + '\n' +
      '```';

    const result = await client.chatCompletion(
      {
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
      },
      token,
    );

    return result;
  }

  private cleanCompletion(
    completion: string,
    position: vscode.Position,
    document: vscode.TextDocument,
  ): string | undefined {
    let text = completion;

    // Remove leading/trailing markdown fences if present
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

    // Remove leading newline (common API behavior)
    if (text.startsWith('\n')) {
      text = text.slice(1);
    }

    // If completion starts with the text already on the current line after cursor, deduplicate
    const lineText = document.lineAt(position.line).text;
    const textAfterCursor = lineText.slice(position.character);
    if (textAfterCursor.length > 0 && text.startsWith(textAfterCursor)) {
      text = text.slice(textAfterCursor.length);
    }

    // Trim to reasonable length for inline completion
    const lines = text.split('\n');
    if (lines.length > 10) {
      text = lines.slice(0, 10).join('\n');
    }

    text = text.trimEnd();
    if (text.length === 0) {
      return undefined;
    }

    return text;
  }
}
