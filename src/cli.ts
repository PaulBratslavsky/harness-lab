// Interactive chat with any agent.
//
//   npm run chat                                  builder in ./workspace
//   npm run chat -- --agent explorer --dir .      explore this repo
//   npm run chat -- --model llama3.2:3b --think   swap the model, turn on thinking
//   npm run chat -- --yolo                        skip shell approvals

import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createAgent } from "./agent/agent.ts";
import { agents, type AgentName } from "./agent/agents.ts";
import { localWorkspace } from "./environment/environment.ts";
import { estimateTokens } from "./harness/context.ts";
import { ollama } from "./model/ollama.ts";
import { createTracer, ring } from "./trace.ts";

const { values: args } = parseArgs({
  options: {
    agent: { type: "string", default: "builder" },
    model: { type: "string" },
    dir: { type: "string" },
    think: { type: "boolean", default: false },
    yolo: { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
  },
});

const spec = agents[args.agent as AgentName];
if (!spec) {
  console.error(`Unknown agent "${args.agent}". Pick one of: ${Object.keys(agents).join(", ")}`);
  process.exit(1);
}

const dir = resolve(args.dir ?? (spec.name === "explorer" ? "." : "workspace"));
const model = ollama({ model: args.model, think: args.think });
const env = spec.tools.length ? localWorkspace(dir) : undefined;
const rl = createInterface({ input: process.stdin, output: process.stdout });

const agent = createAgent(spec, {
  model,
  env,
  onEvent: createTracer({ tokens: !args.quiet, thinking: args.think }),
  approve: async (call) => {
    if (args.yolo) return true;
    const answer = await rl.question(ring.harness(`  allow ${call.name} ${JSON.stringify(call.arguments)}? [y/N] `));
    return answer.trim().toLowerCase().startsWith("y");
  },
});

console.log(`${ring.agent(`agent: ${spec.name}`)} — ${spec.description}`);
console.log(`${ring.model(`model: ${model.name}`)}${args.think ? " (thinking on)" : ""}`);
console.log(`${ring.harness(`harness: ${spec.tools.map((t) => t.name).join(", ") || "no tools"}`)}`);
console.log(`${ring.environment(`environment: ${env ? dir : "none"}`)}`);
console.log(ring.dim("Commands: /context (what the model sees), /exit\n"));

while (true) {
  const input = (await rl.question("> ")).trim();
  if (!input) continue;
  if (input === "/exit") break;
  if (input === "/context") {
    for (const m of agent.messages) {
      const extra = m.toolCalls ? ` calls ${m.toolCalls.map((c) => c.name).join(",")}` : m.toolName ? ` (${m.toolName})` : "";
      console.log(ring.dim(`  ${m.role.padEnd(9)} ~${estimateTokens(m)} tok${extra}: ${m.content.slice(0, 80).replace(/\s+/g, " ")}`));
    }
    continue;
  }
  try {
    const result = await agent.run(input);
    if (args.quiet) console.log(`\n${result.text}`);
    console.log();
  } catch (err) {
    console.error(ring.environment(`error: ${(err as Error).message}`));
  }
}
rl.close();
