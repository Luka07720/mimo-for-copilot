import vscode from 'vscode';

/**
 * Recursively estimate the character count for a single content part.
 * Returns character count, which the caller divides by charsPerToken to get token estimate.
 */
function estimatePartChars(part: unknown): number {
  // 1. LanguageModelTextPart — the most common case
  if (part instanceof vscode.LanguageModelTextPart) {
    return part.value.length;
  }

  // 2. LanguageModelToolCallPart — count callId + name + JSON-serialized input
  if (part instanceof vscode.LanguageModelToolCallPart) {
    let chars = part.callId.length + part.name.length;
    try {
      chars += JSON.stringify(part.input).length;
    } catch {
      chars += 2;
    }
    return chars;
  }

  // 3. LanguageModelToolResultPart — recursively count nested content parts
  if (part instanceof vscode.LanguageModelToolResultPart) {
    let chars = part.callId.length;
    if (Array.isArray(part.content)) {
      for (const item of part.content) {
        chars += estimatePartChars(item);
      }
    }
    return chars;
  }

  // 4. LanguageModelDataPart — use a capped heuristic
  if (part instanceof vscode.LanguageModelDataPart) {
    return Math.min(part.data?.byteLength ?? 0, 10000);
  }

  // 5. Fallback: try to stringify unknown part types
  if (part && typeof part === 'object') {
    try {
      return JSON.stringify(part).length;
    } catch {
      return 0;
    }
  }

  return 0;
}

export function estimateTokenCount(
  text: string | vscode.LanguageModelChatRequestMessage,
  charsPerToken: number,
): number {
  if (typeof text === 'string') {
    return Math.max(1, Math.ceil(text.length / charsPerToken));
  }

  if (!text?.content || !Array.isArray(text.content)) {
    return 1;
  }

  let totalChars = 0;
  for (const part of text.content) {
    totalChars += estimatePartChars(part);
  }
  return Math.max(1, Math.ceil(totalChars / charsPerToken));
}
