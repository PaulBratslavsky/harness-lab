// Prints harness events, colored to match the diagram:
//   red = environment, white = agent, blue = harness, yellow = model
// Watching this output is the fastest way to see which ring is doing what.

import type { HarnessEvent } from "./harness/events.ts";

const color = (code: string) => (s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const ring = {
  environment: color("31"),
  agent: color("97"),
  harness: color("34"),
  model: color("33"),
  dim: color("2"),
};

const tag = {
  env: ring.environment("[environment]"),
  agent: ring.agent("[agent]      "),
  harness: ring.harness("[harness]    "),
  model: ring.model("[model]      "),
};

const short = (s: string, n = 160) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

export interface TraceOptions {
  /** Stream the model's tokens as they arrive. */
  tokens?: boolean;
  /** Show reasoning from thinking models. */
  thinking?: boolean;
  /** Show full tool output instead of a one-line preview. */
  fullToolOutput?: boolean;
}

export function createTracer({ tokens = true, thinking = false, fullToolOutput = false }: TraceOptions = {}) {
  let streaming = false;
  const endStream = () => {
    if (streaming) process.stdout.write("\n");
    streaming = false;
  };

  return (e: HarnessEvent) => {
    switch (e.type) {
      case "user":
        console.log(`${tag.agent} task: ${short(e.content)}`);
        break;
      case "model:request":
        console.log(
          `${tag.harness} turn ${e.turn}: sending ${e.messages} messages` +
            (e.dropped ? ring.dim(` (dropped ${e.dropped} old ones to fit context)`) : ""),
        );
        break;
      case "model:token":
        if (!tokens) break;
        if (!streaming) process.stdout.write(`${tag.model} `);
        streaming = true;
        process.stdout.write(ring.model(e.text));
        break;
      case "model:reply": {
        endStream();
        if (thinking && e.message.thinking) console.log(`${tag.model} ${ring.dim(`(thinking) ${short(e.message.thinking, 400)}`)}`);
        if (!tokens && e.message.content) console.log(`${tag.model} ${ring.model(short(e.message.content, 400))}`);
        for (const c of e.message.toolCalls ?? []) {
          console.log(`${tag.model} wants tool ${ring.model(c.name)}(${short(JSON.stringify(c.arguments), 120)})`);
        }
        if (e.stats) {
          const tps = e.stats.outputTokens / (e.stats.ms / 1000);
          console.log(ring.dim(`               ${e.stats.promptTokens} in / ${e.stats.outputTokens} out, ${(e.stats.ms / 1000).toFixed(1)}s, ${tps.toFixed(0)} tok/s`));
        }
        break;
      }
      case "tool:start":
        console.log(`${tag.harness} runs ${e.call.name}`);
        break;
      case "tool:end":
        console.log(`${tag.env} ${fullToolOutput ? e.result : short(e.result)} ${ring.dim(`(${e.ms}ms)`)}`);
        break;
      case "tool:error":
        console.log(`${tag.env} ${ring.environment(`error: ${e.error}`)}`);
        break;
      case "tool:denied":
        console.log(`${tag.harness} ${e.call.name} denied by user`);
        break;
      case "stop":
        endStream();
        console.log(`${tag.harness} stop: ${e.reason} after ${e.turns} turn(s)`);
        break;
    }
  };
}
