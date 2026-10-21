// RING 3 (dashed): the agent.
// "An agent is a model harnessed in an environment." Nothing new is built
// here: same model, same harness loop. We just give it a role, a tool set,
// and a world, and call the result an agent.
//
// The world here is this repo itself, read-only. The explorer agent reads the
// code you're learning from and explains it back.

import { resolve } from "node:path";
import { createAgent } from "../src/agent/agent.ts";
import { explorer } from "../src/agent/agents.ts";
import { localWorkspace } from "../src/environment/environment.ts";
import { ollama } from "../src/model/ollama.ts";
import { createTracer, ring } from "../src/trace.ts";

const repo = resolve(import.meta.dirname, "..");

const agent = createAgent(explorer, {
  model: ollama(),
  env: localWorkspace(repo),
  onEvent: createTracer({ tokens: false }),
});

const result = await agent.run(
  "Find the file that implements the harness loop. In under 120 words: what happens on each turn of the loop, and when does it stop?",
);

console.log(`\n${ring.agent(result.text)}\n`);
console.log(ring.dim("Same loop as example 2. Different instructions + tools + world = a different agent."));
console.log(ring.dim("Next: npm run ex:4 lets an agent change its environment."));
