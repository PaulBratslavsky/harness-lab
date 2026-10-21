import type { ChatOptions, Message, Model, ModelStats, ToolCall } from "./types.ts";

export interface OllamaOptions {
  /** Defaults to $HARNESS_MODEL, then qwen3:14b. */
  model?: string;
  /** Defaults to $OLLAMA_HOST, then http://localhost:11434. */
  host?: string;
  /** Let thinking models (qwen3, gemma4) reason before answering. Slower, often better. */
  think?: boolean;
  temperature?: number;
  /** Context window in tokens. Ollama's default is small, so we set it explicitly. */
  numCtx?: number;
}

/** A Model backed by a local Ollama server, talking to its /api/chat endpoint. */
export function ollama(options: OllamaOptions = {}): Model {
  const model = options.model ?? process.env.HARNESS_MODEL ?? "qwen3:14b";
  const host = (options.host ?? process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");
  const think = options.think ?? process.env.HARNESS_THINK === "1";

  return {
    name: model,
    async chat(messages: Message[], { tools, onToken, signal }: ChatOptions = {}) {
      const started = Date.now();
      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          model,
          stream: true,
          think,
          messages: messages.map(toOllamaMessage),
          tools: tools?.length ? tools.map((t) => ({ type: "function", function: t })) : undefined,
          options: {
            temperature: options.temperature ?? 0.3,
            num_ctx: options.numCtx ?? 16384,
          },
        }),
      }).catch((err: Error) => {
        throw new Error(`Could not reach Ollama at ${host}. Is it running? (${err.message})`);
      });

      if (!res.ok || !res.body) {
        throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
      }

      let content = "";
      let thinking = "";
      const toolCalls: ToolCall[] = [];
      let stats: ModelStats | undefined;

      for await (const chunk of readNdjson(res.body as unknown as AsyncIterable<Uint8Array>)) {
        if (chunk.error) throw new Error(`Ollama error: ${chunk.error}`);
        const m = chunk.message;
        if (m?.thinking) thinking += m.thinking;
        if (m?.content) {
          content += m.content;
          onToken?.(m.content);
        }
        for (const call of m?.tool_calls ?? []) {
          toolCalls.push({ name: call.function.name, arguments: parseArgs(call.function.arguments) });
        }
        if (chunk.done) {
          stats = {
            promptTokens: chunk.prompt_eval_count ?? 0,
            outputTokens: chunk.eval_count ?? 0,
            ms: Date.now() - started,
          };
        }
      }

      const message: Message = { role: "assistant", content };
      if (thinking) message.thinking = thinking;
      if (toolCalls.length) message.toolCalls = toolCalls;
      return { message, stats };
    },
  };
}

function toOllamaMessage(m: Message) {
  return {
    role: m.role,
    content: m.content,
    tool_calls: m.toolCalls?.map((c) => ({ function: { name: c.name, arguments: c.arguments } })),
    tool_name: m.toolName,
  };
}

function parseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return { _raw: args };
    }
  }
  return (args as Record<string, unknown>) ?? {};
}

// Ollama streams one JSON object per line.
async function* readNdjson(body: AsyncIterable<Uint8Array>): AsyncGenerator<any> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}
