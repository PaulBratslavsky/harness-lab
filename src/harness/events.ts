import type { Message, ModelStats, ToolCall } from "../model/types.ts";

/** Everything the harness does, as events. The tracer prints these colored by ring. */
export type HarnessEvent =
  | { type: "user"; content: string }
  | { type: "model:request"; turn: number; messages: number; dropped: number }
  | { type: "model:token"; text: string }
  | { type: "model:reply"; message: Message; stats?: ModelStats }
  | { type: "tool:start"; call: ToolCall }
  | { type: "tool:end"; call: ToolCall; result: string; ms: number }
  | { type: "tool:error"; call: ToolCall; error: string }
  | { type: "tool:denied"; call: ToolCall }
  | { type: "stop"; reason: "done" | "max_turns"; turns: number };
