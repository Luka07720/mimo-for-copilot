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

// Context limits
const FULL_FILE_MAX_CHARS = 8000;
const SUFFIX_MAX_LINES = 20;
const SUFFIX_MAX_CHARS = 1000;
const COMPLETION_MAX_LINES = 15;
const DEBOUNCE_MS = 800;

const SYSTEM_PROMPT =
  'You are a code completion tool. Given code with a <<<CURSOR>>> marker, ' +
  'output ONLY the code to insert at the cursor. No explanations. No markdown. ' +
  'No reasoning. Just raw code that continues seamlessly. Match indentation and style. ' +
  'Keep it short (1-10 lines).';

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
    if (!getInlineCompletionEnabled()) {
      return undefined;
    }

    const apiKey = await this.authManager.getApiKey();
    if (!apiKey) {
      return undefined;
    }

    // Get full file context
    const fullText = document.getText();
    const cursorOffset = document.offsetAt(position);

    // Build context: file before cursor + [CURSOR] + file after cursor
    const beforeCursor = fullText.slice(Math.max(0, cursorOffset - FULL_FILE_MAX_CHARS), cursorOffset);
    const afterCursor = fullText.slice(cursorOffset, cursorOffset + SUFFIX_MAX_CHARS);
    const language = document.languageId;
    const fileName = document.fileName.split(/[\\/]/).pop() ?? '';

    if (beforeCursor.trim().length === 0) {
      return undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    const requestKey = `${document.uri.toString()}:${position.line}:${position.character}:${beforeCursor.slice(-100)}`;
    if (requestKey === this.lastRequestKey) {
      return undefined;
    }

    if (this.requestInFlight) {
      return undefined;
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        this.requestInFlight = true;

        try {
          logger.info(`[InlineCompletion] requesting: model=${getInlineCompletionModel()} lang=${language} file=${fileName} beforeLen=${beforeCursor.length} afterLen=${afterCursor.length}`);

          const completion = await this.requestCompletion(
            apiKey,
            language,
            fileName,
            beforeCursor,
            afterCursor,
          );

          if (!completion) {
            logger.info('[InlineCompletion] empty response from API');
            resolve(undefined);
            return;
          }

          this.lastRequestKey = requestKey;

          const cleaned = this.cleanCompletion(completion, position, document);
          if (!cleaned) {
            logger.info(`[InlineCompletion] cleaned result is empty, raw was: "${completion.slice(0, 100)}"`);
            resolve(undefined);
            return;
          }

          logger.info(`[InlineCompletion] returning ${cleaned.split('\n').length} lines: "${cleaned.slice(0, 120)}"`);

          // Insert at cursor position, replacing nothing
          const item = new vscode.InlineCompletionItem(
            cleaned,
            new vscode.Range(position, position),
          );
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

  private async requestCompletion(
    apiKey: string,
    language: string,
    fileName: string,
    beforeCursor: string,
    afterCursor: string,
  ): Promise<string> {
    const baseUrl = getBaseUrl();
    const modelId = getApiModelId(getInlineCompletionModel());
    const maxTokens = getInlineMaxTokens();

    // Try FIM (completions) endpoint first — no reasoning overhead
    try {
      const fimResult = await this.tryFimCompletion(baseUrl, apiKey, modelId, maxTokens, beforeCursor, afterCursor);
      if (fimResult !== null) {
        return fimResult;
      }
    } catch {
      // FIM endpoint not available, fall through to chat
    }

    // Fallback: chat completions endpoint
    const userPrompt =
      `File: ${fileName} (${language})\n\n` +
      `The cursor is marked as <<<CURSOR>>> below. Write ONLY the code to insert there.\n\n` +
      '```' + language + '\n' +
      beforeCursor +
      '<<<CURSOR>>>' +
      afterCursor +
      '\n```\n\n' +
      'Output ONLY the continuation code. No explanation. No markdown fences.';

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
        temperature: 0.1,
        enable_thinking: false,
        reasoning_effort: 'low',
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

    logger.info(`[InlineCompletion] chat API response: contentLen=${content.length} reasoningLen=${reasoning.length} finishReason=${finishReason}`);

    if (content) {
      return content;
    }

    // Fallback: use reasoning content if it looks like code
    if (reasoning) {
      logger.info(`[InlineCompletion] content empty, reasoning preview: "${reasoning.slice(0, 200)}"`);
      const trimmed = reasoning.trim();
      if (this.looksLikeCode(trimmed)) {
        return trimmed;
      }
    }

    return '';
  }

  private async tryFimCompletion(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    maxTokens: number,
    prefix: string,
    suffix: string,
  ): Promise<string | null> {
    // Standard FIM format: /v1/completions with prefix/suffix
    const response = await fetch(`${baseUrl}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        prefix,
        suffix,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      logger.info(`[InlineCompletion] FIM endpoint not available (${response.status}), using chat`);
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const text = (data.text as string) ??
      ((data.choices as Array<Record<string, unknown>>)?.[0]?.text as string) ?? '';

    logger.info(`[InlineCompletion] FIM response: textLen=${text.length}`);
    return text;
  }

  private looksLikeCode(text: string): boolean {
    const firstLine = text.split('\n')[0].trim();
    // Code-like patterns
    if (/^[{(\[]/.test(firstLine)) return true;
    if (/^(\/\/|\/\*|#|\/\/)/.test(firstLine)) return true;
    if (/^(for|if|while|switch|return|int|void|char|float|double|struct|class|const|static|extern|typedef|#include|#define)\b/.test(firstLine)) return true;
    if (/^[a-zA-Z_]\w*\s*[=(;]/.test(firstLine)) return true;
    // If it starts with common code tokens
    if (/^[\w]+[\s]*[(){}[\];,]/.test(firstLine)) return true;
    return false;
  }

  private cleanCompletion(
    completion: string,
    position: vscode.Position,
    document: vscode.TextDocument,
  ): string | undefined {
    let text = completion;

    // Remove markdown fences if present
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

    // Remove leading/trailing whitespace lines
    text = text.replace(/^\s*\n/, '');

    // Remove duplicate of text already after cursor
    const lineText = document.lineAt(position.line).text;
    const textAfterCursor = lineText.slice(position.character);
    if (textAfterCursor.length > 0) {
      // Check if completion starts with the text after cursor
      if (text.startsWith(textAfterCursor)) {
        text = text.slice(textAfterCursor.length);
      }
      // Also check if completion ends with text after cursor
      if (text.endsWith(textAfterCursor)) {
        text = text.slice(0, -textAfterCursor.length);
      }
    }

    // If cursor is at the end of a line and completion doesn't start with newline, add one
    if (position.character > 0 && !text.startsWith('\n') && textAfterCursor.length === 0) {
      // Check if the current line has content (not just whitespace)
      const currentLine = lineText.trimEnd();
      if (currentLine.length > 0 && !text.startsWith('\n')) {
        // Keep as-is if it's a continuation on the same line
      }
    }

    // Limit lines
    const lines = text.split('\n');
    if (lines.length > COMPLETION_MAX_LINES) {
      text = lines.slice(0, COMPLETION_MAX_LINES).join('\n');
    }

    text = text.trimEnd();
    if (text.length === 0) {
      return undefined;
    }

    return text;
  }
}
