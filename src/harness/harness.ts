// The middle ring. The harness is everything between a stateless model and
// the world: it keeps the conversation, decides what fits in context, tells
// the model which tools exist, runs the tools the model asks for, asks for
// permission, and decides when to stop.
//
// The core is a loop:
//   send messages -> model replies -> if it asked for tools, run them,
//   append results, loop again -> otherwise we're done.

import { noEnvironment, type Environment } from "../environment/environment.ts";
import type { Message, Model, ToolCall } from "../model/types.ts";
import { fitContext } from "./context.ts";
import type { HarnessEvent } from "./events.ts";
import { toSchema, type Tool } from "./tool.ts";

export interface HarnessOptions {
  model: Model;
  system: string;
  tools?: Tool[];
  env?: Environment;
  /** Safety valve so a confused model can't loop forever. */
  maxTurns?: number;
  /** Token budget for what we send each turn. */
  contextBudget?: number;
  /** Tool output longer than this gets cut, so one big file can't flood the context. */
  maxToolOutput?: number;
  /** Called before any tool marked `risky`. Return false to block it. */
  approve?: (call: ToolCall, tool: Tool) => Promise<boolean>;
  onEvent?: (event: HarnessEvent) => void;
}

export interface RunResult {
  text: string;
  turns: number;
  stoppedBy: "done" | "max_turns";
}

export interface Harness {
  run(input: string, signal?: AbortSignal): Promise<RunResult>;
  readonly messages: Message[];
}

export function createHarness(options: HarnessOptions): Harness {
  const {
    model,
    tools = [],
    env = noEnvironment(),
    maxTurns = 12,
    contextBudget = 12_000,
    maxToolOutput = 6_000,
    approve,
    onEvent = () => {},
  } = options;

  const messages: Message[] = [{ role: "system", content: options.system }];
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const schemas = tools.map(toSchema);

  async function runTool(call: ToolCall): Promise<string> {
    const tool = toolsByName.get(call.name);
    if (!tool) {
      // Tell the model what went wrong so it can correct itself next turn.
      return `Error: there is no tool called "${call.name}". Available tools: ${[...toolsByName.keys()].join(", ") || "none"}.`;
    }
    if (tool.risky && approve && !(await approve(call, tool))) {
      onEvent({ type: "tool:denied", call });
      return "The user denied this action. Ask them what to do instead, or try another approach.";
    }

    onEvent({ type: "tool:start", call });
    const started = Date.now();
    try {
      let result = await tool.run(call.arguments, { env });
      if (result.length > maxToolOutput) {
        result = `${result.slice(0, maxToolOutput)}\n... (cut, ${result.length - maxToolOutput} more chars)`;
      }
      onEvent({ type: "tool:end", call, result, ms: Date.now() - started });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      onEvent({ type: "tool:error", call, error });
      return `Error: ${error}`;
    }
  }

  async function run(input: string, signal?: AbortSignal): Promise<RunResult> {
    messages.push({ role: "user", content: input });
    onEvent({ type: "user", content: input });

    for (let turn = 1; turn <= maxTurns; turn++) {
      const context = fitContext(messages, contextBudget);
      onEvent({ type: "model:request", turn, messages: context.messages.length, dropped: context.dropped });

      const { message, stats } = await model.chat(context.messages, {
        tools: schemas,
        signal,
        onToken: (text) => onEvent({ type: "model:token", text }),
      });
      messages.push(message);
      onEvent({ type: "model:reply", message, stats });

      if (!message.toolCalls?.length) {
        onEvent({ type: "stop", reason: "done", turns: turn });
        return { text: message.content, turns: turn, stoppedBy: "done" };
      }

      for (const call of message.toolCalls) {
        const result = await runTool(call);
        messages.push({ role: "tool", toolName: call.name, content: result });
      }
    }

    onEvent({ type: "stop", reason: "max_turns", turns: maxTurns });
    return { text: "(stopped: hit the turn limit)", turns: maxTurns, stoppedBy: "max_turns" };
  }

  return { run, messages };
}
