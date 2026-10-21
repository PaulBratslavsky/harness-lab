// The innermost ring. A model only knows how to turn a list of messages into
// the next message. It has no memory, no loop, no tools of its own, and no
// idea what world it lives in. Everything else is built around this contract.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string;
  /** Set on assistant messages when the model asks for tools. */
  toolCalls?: ToolCall[];
  /** Set on tool messages: which tool produced this result. */
  toolName?: string;
  /** Reasoning text from "thinking" models (kept for tracing, never sent back). */
  thinking?: string;
}

/** JSON Schema describing a tool's arguments, as the model sees it. */
export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ModelStats {
  promptTokens: number;
  outputTokens: number;
  ms: number;
}

export interface ChatOptions {
  tools?: ToolSchema[];
  onToken?: (text: string) => void;
  signal?: AbortSignal;
}

export interface Model {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<{ message: Message; stats?: ModelStats }>;
}
