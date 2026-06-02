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
const DEBOUNCE_MS = 500;

const SYSTEM_PROMPT =
  'You are a code completion assistant. Continue the code seamlessly from where the cursor is placed. ' +
  'Only output the continuation code — no explanations, no markdown fences, no code blocks. ' +
  'Match the indentation and style of the surrounding code.';

export class MiMoInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly authManager: AuthManager;
  private lastRequestKey = '';
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private activeAbort: AbortController | undefined;

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

    // Cancel any previous in-flight request
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    // Cache key: same position + same prefix = skip
    const requestKey = `${document.uri.toString()}:${position.line}:${position.character}:${prefix.slice(-100)}`;
    if (requestKey === this.lastRequestKey) {
      logger.info('[InlineCompletion] cache hit, skipping');
      return undefined;
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        // Use our own AbortController, not VS Code's token
        const abort = new AbortController();
        this.activeAbort = abort;

        try {
          logger.info(`[InlineCompletion] requesting: model=${getInlineCompletionModel()} lang=${language} prefixLen=${prefix.length}`);
          const completion = await this.requestCompletion(
            apiKey,
            language,
            prefix,
            suffix,
            abort.signal,
          );

          if (abort.signal.aborted) {
            logger.info('[InlineCompletion] aborted after response');
            resolve(undefined);
            return;
          }

          if (!completion) {
            logger.info('[InlineCompletion] empty response');
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
          if (abort.signal.aborted) {
            logger.info('[InlineCompletion] request aborted');
            resolve(undefined);
            return;
          }
          logger.warn('[InlineCompletion] error:', error);
          resolve(undefined);
        } finally {
          if (this.activeAbort === abort) {
            this.activeAbort = undefined;
          }
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
    signal: AbortSignal,
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

    // Use fetch directly for cancellation control
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
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MiMo API ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  private cleanCompletion(
    completion: string,
    position: vscode.Position,
    document: vscode.TextDocument,
  ): string | undefined {
    let text = completion;

    // Remove leading/trailing markdown fences if present
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

    // Remove leading newline
    if (text.startsWith('\n')) {
      text = text.slice(1);
    }

    // Deduplicate if completion starts with text already after cursor
    const lineText = document.lineAt(position.line).text;
    const textAfterCursor = lineText.slice(position.character);
    if (textAfterCursor.length > 0 && text.startsWith(textAfterCursor)) {
      text = text.slice(textAfterCursor.length);
    }

    // Limit to reasonable length
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
