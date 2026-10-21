// RING 4: the environment.
// The builder agent gets a real folder and a shell. Now its actions have
// consequences: files appear, programs run, errors come back and it can react.
// The model still only produces text. The harness turns that text into
// changes in the world, and turns the world's response back into text.

import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createAgent } from "../src/agent/agent.ts";
import { builder } from "../src/agent/agents.ts";
import { localWorkspace } from "../src/environment/environment.ts";
import { ollama } from "../src/model/ollama.ts";
import { createTracer, ring } from "../src/trace.ts";

const dir = resolve(import.meta.dirname, "../workspace/ex4");
await rm(dir, { recursive: true, force: true });
const env = localWorkspace(dir);

const agent = createAgent(builder, {
  model: ollama(),
  env,
  onEvent: createTracer({ tokens: false }),
  approve: async () => true, // auto-approve shell for the demo; the CLI asks you instead
});

await agent.run(
  "Create fizzbuzz.mjs that prints FizzBuzz for 1 to 15 (one per line), then run it with node to check the output.",
);

console.log(`\n${ring.environment(`The world changed. Files now in ${dir}:`)}`);
console.log((await env.listDir()).map((f) => `  ${f}`).join("\n"));
console.log(ring.dim("\nNext: npm run ex:5 measures what improves an agent most: model, harness, or environment."));
