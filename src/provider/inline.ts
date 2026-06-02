import vscode from 'vscode';
import { AuthManager } from '../auth';
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
const DEBOUNCE_MS = 1000;

const SYSTEM_PROMPT =
  'You are a code completion assistant. Continue the code seamlessly from where the cursor is placed. ' +
  'Only output the continuation code — no explanations, no markdown fences, no code blocks. ' +
  'Match the indentation and style of the surrounding code.';

export class MiMoInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly authManager: AuthManager;
  private lastRequestKey = '';
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private requestInFlight = false;

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
    logger.info(`[InlineCompletion] called: pos=${position.line}:${position.character} enabled=${getInlineCompletionEnabled()}`);

    if (!getInlineCompletionEnabled()) {
      return undefined;
    }

    const apiKey = await this.authManager.getApiKey();
    if (!apiKey) {
      logger.info('[InlineCompletion] no API key');
      return undefined;
    }

    const prefix = this.getPrefix(document, position);
    const suffix = this.getSuffix(document, position);
    const language = document.languageId;

    if (prefix.trim().length === 0) {
      return undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    const requestKey = `${document.uri.toString()}:${position.line}:${position.character}:${prefix.slice(-100)}`;
    if (requestKey === this.lastRequestKey) {
      logger.info('[InlineCompletion] cache hit, skipping');
      return undefined;
    }

    if (this.requestInFlight) {
      logger.info('[InlineCompletion] request already in flight, skipping');
      return undefined;
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        this.requestInFlight = true;

        try {
          logger.info(`[InlineCompletion] requesting: model=${getInlineCompletionModel()} lang=${language} prefixLen=${prefix.length}`);
          const completion = await this.requestCompletion(
            apiKey,
            language,
            prefix,
            suffix,
          );

          if (!completion) {
            logger.info('[InlineCompletion] empty response from API');
            resolve(undefined);
            return;
          }

          this.lastRequestKey = requestKey;

          const cleaned = this.cleanCompletion(completion, position, document);
          if (!cleaned) {
            logger.info('[InlineCompletion] cleaned result is empty');
            resolve(undefined);
            return;
          }

          logger.info(`[InlineCompletion] returning: "${cleaned.slice(0, 80)}"`);
          const item = new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position));
          resolve([item]);
        } catch (error) {
          logger.warn('[InlineCompletion] error:', error);
          resolve(undefined);
        } finally {
          this.requestInFlight = false;
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
  ): Promise<string> {
    const baseUrl = getBaseUrl();
    const modelId = getApiModelId(getInlineCompletionModel());
    const maxTokens = getInlineMaxTokens();

    const userPrompt =
      `Complete the following ${language} code at the cursor position [CURSOR].\n\n` +
      '```' + language + '\n' +
      prefix + '[CURSOR]' + suffix + '\n' +
      '```';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        stream: false,
        enable_thinking: false,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MiMo API ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    const content = (message?.content as string) ?? '';
    const reasoning = (message?.reasoning_content as string) ?? '';
    const finishReason = choice?.finish_reason;

    logger.info(`[InlineCompletion] API response: contentLen=${content.length} reasoningLen=${reasoning.length} finishReason=${finishReason}`);

    if (content) {
      return content;
    }

    // For reasoning models: if content is empty but reasoning has code-like text, use it
    if (reasoning) {
      logger.info(`[InlineCompletion] content empty, reasoning preview: "${reasoning.slice(0, 200)}"`);
      // Only use reasoning if it looks like code (starts with code-like patterns)
      const trimmed = reasoning.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('//') || trimmed.startsWith('#') ||
          trimmed.startsWith('for') || trimmed.startsWith('if') || trimmed.startsWith('while') ||
          trimmed.startsWith('int') || trimmed.startsWith('void') || trimmed.startsWith('return') ||
          /^[a-zA-Z_]\w*\s*[=(;]/.test(trimmed.split('\n')[0])) {
        return trimmed;
      }
    }

    return '';
  }

  private cleanCompletion(
    completion: string,
    position: vscode.Position,
    document: vscode.TextDocument,
  ): string | undefined {
    let text = completion;

    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

    if (text.startsWith('\n')) {
      text = text.slice(1);
    }

    const lineText = document.lineAt(position.line).text;
    const textAfterCursor = lineText.slice(position.character);
    if (textAfterCursor.length > 0 && text.startsWith(textAfterCursor)) {
      text = text.slice(textAfterCursor.length);
    }

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
