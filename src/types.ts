/**
 * Shared types for the MiMo Copilot extension.
 */

// ---- API request/response types ----

export interface MiMoMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: MiMoToolCall[];
}

export interface MiMoToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface MiMoTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface MiMoUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface MiMoRequest {
  model: string;
  messages: MiMoMessage[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: MiMoTool[];
  tool_choice?: 'none' | 'auto' | 'required';
  stream_options?: {
    include_usage: boolean;
  };
}

export interface MiMoStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: MiMoUsage;
}

// ---- Stream callbacks ----

export interface StreamCallbacks {
  onContent: (content: string) => void;
  onToolCall: (toolCall: MiMoToolCall) => void;
  onError: (error: Error) => void;
  onDone: () => void;
  onUsage?: (usage: MiMoUsage) => void;
}

// ---- Model definitions ----

export interface ModelDefinition {
  id: string;
  name: string;
  family: string;
  version: string;
  detail: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: {
    toolCalling: boolean | number;
    imageInput: boolean;
  };
}
