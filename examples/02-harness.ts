// RING 2: model + harness.
// Same model as example 1. The harness adds three things:
//   - a loop: model asks for a tool -> harness runs it -> results go back in
//   - tools: a clock and a calculator
//   - memory: the harness keeps the conversation and re-sends it every turn

import { createHarness } from "../src/harness/harness.ts";
import { pureTools } from "../src/harness/tools.ts";
import { ollama } from "../src/model/ollama.ts";
import { createTracer, ring } from "../src/trace.ts";

const harness = createHarness({
  model: ollama(),
  system: "You are a helpful assistant. Use get_time for anything about dates or time, and calculator for any arithmetic. Be concise.",
  tools: pureTools,
  onEvent: createTracer(),
});

await harness.run("What is today's date, and what is 48213 * 3779? Answer in one line.");
console.log();
await harness.run("What did I just ask you?");

console.log(ring.dim(`\nThe harness now holds ${harness.messages.length} messages and re-sends them every turn. The model didn't remember anything: the harness did.`));
console.log(ring.dim("Next: npm run ex:3 turns this into named agents."));
