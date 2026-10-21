import type { Message } from "../model/types.ts";

/** Rough token estimate. Good enough to decide what fits; swap for a real tokenizer if you like. */
export const estimateTokens = (m: Message) =>
  Math.ceil((m.content.length + JSON.stringify(m.toolCalls ?? "").length) / 4) + 4;

/**
 * The model is stateless: every turn the harness re-sends the conversation.
 * When it gets too long, something has to go. This keeps the system prompt
 * and the newest messages, and drops the oldest ones in between.
 *
 * Try other strategies here: summarise old turns, drop big tool outputs first,
 * keep the first user message pinned, etc.
 */
export function fitContext(messages: Message[], budgetTokens: number): { messages: Message[]; dropped: number } {
  const [system, ...rest] = messages;
  let used = estimateTokens(system);
  const kept: Message[] = [];

  for (let i = rest.length - 1; i >= 0; i--) {
    const cost = estimateTokens(rest[i]);
    if (used + cost > budgetTokens && kept.length > 0) break;
    used += cost;
    kept.unshift(rest[i]);
  }

  // Don't start on a tool result whose assistant call was dropped.
  while (kept.length > 1 && kept[0].role === "tool") kept.shift();

  return { messages: [system, ...kept], dropped: rest.length - kept.length };
}
