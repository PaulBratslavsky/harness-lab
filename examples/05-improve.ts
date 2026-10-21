// Improving performance beyond just the model.
//
// One task, scored by hidden checks. We change ONE ring at a time:
//   baseline            small model, bare-bones harness, empty folder
//   bigger model        swap the engine, nothing else
//   better harness      small model, better instructions (look, write, run, fix)
//   better environment  small model, bare harness, but the folder has tests + AGENTS.md
//   all three           big model + better harness + better environment
//
//   npm run ex:5                                  one run of each
//   npm run ex:5 -- --runs 3                      average over 3 runs (models are noisy)
//   npm run ex:5 -- --small llama3.2:3b --big qwen3:14b --verbose

import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createAgent, defineAgent } from "../src/agent/agent.ts";
import { builder } from "../src/agent/agents.ts";
import { localWorkspace } from "../src/environment/environment.ts";
import { worldTools } from "../src/harness/tools.ts";
import { ollama } from "../src/model/ollama.ts";
import { createTracer, ring } from "../src/trace.ts";

const { values: args } = parseArgs({
  options: {
    small: { type: "string", default: "llama3.2:3b" },
    big: { type: "string", default: "qwen3:14b" },
    runs: { type: "string", default: "1" },
    verbose: { type: "boolean", default: false },
  },
});

const TASK = `Create slugify.mjs exporting a named function slugify(text) (ES module: \`export function slugify(text)\`).
Rules: lowercase; strip accents (é -> e); "&" becomes the word "and"; every run of other non-letter/non-digit characters becomes a single "-"; no leading or trailing "-".`;

// Hidden checks: the agent never sees these.
const HIDDEN: [string, string][] = [
  ["Hello World", "hello-world"],
  ["  Café & Crème brûlée! ", "cafe-and-creme-brulee"],
  ["a--b__c", "a-b-c"],
  ["", ""],
  ["Top 10 Tips", "top-10-tips"],
  ["Ünïcödé", "unicode"],
  ["---Leading and trailing---", "leading-and-trailing"],
  ["Rock & Roll & Jazz", "rock-and-roll-and-jazz"],
];

// ---- Harness variants (same tools, different instructions) ----
const bareAgent = defineAgent({
  name: "bare",
  description: "minimal prompt",
  instructions: "You are an assistant with file and shell tools.",
  tools: worldTools,
  maxTurns: 16,
});
const betterAgent = builder; // look -> write -> run -> fix loop, from src/agent/agents.ts

// ---- Environment variants ----
async function bareEnv(dir: string) {
  return localWorkspace(dir);
}

async function richEnv(dir: string) {
  // A visible test suite (a subset of the hidden checks) and a test script.
  const visible = HIDDEN.filter((_, i) => [0, 1, 2, 4, 6].includes(i));
  await writeFile(
    resolve(dir, "test.mjs"),
    `import { slugify } from "./slugify.mjs";
const cases = ${JSON.stringify(visible, null, 2)};
let failed = 0;
for (const [input, want] of cases) {
  const got = slugify(input);
  if (got !== want) { failed++; console.log("FAIL", JSON.stringify(input), "got", JSON.stringify(got), "want", JSON.stringify(want)); }
}
console.log(failed ? failed + " failed" : "all " + cases.length + " passed");
process.exit(failed ? 1 : 0);
`,
  );
  await writeFile(resolve(dir, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node test.mjs" } }, null, 2));
  const agentsMd = `# Notes for agents
- Run \`npm test\` after every change. Work is done only when it prints "all ... passed".
- Tip: \`text.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")\` strips accents.`;
  await writeFile(resolve(dir, "AGENTS.md"), agentsMd);
  // Blurry line: AGENTS.md lives in the environment, but the harness reads it
  // into the system prompt (like Claude Code does with CLAUDE.md).
  return localWorkspace(dir, agentsMd);
}

const configs = [
  { name: "baseline", model: args.small, agent: bareAgent, env: bareEnv },
  { name: "bigger model", model: args.big, agent: bareAgent, env: bareEnv },
  { name: "better harness", model: args.small, agent: betterAgent, env: bareEnv },
  { name: "better environment", model: args.small, agent: bareAgent, env: richEnv },
  { name: "all three", model: args.big, agent: betterAgent, env: richEnv },
];

async function score(dir: string): Promise<number> {
  try {
    const mod = await import(`${pathToFileURL(resolve(dir, "slugify.mjs")).href}?t=${Date.now()}`);
    return HIDDEN.filter(([input, want]) => {
      try {
        return mod.slugify(input) === want;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0; // file missing or doesn't load
  }
}

const runs = Number(args.runs);
const rows: { name: string; model: string; score: number; turns: number; secs: number }[] = [];

for (const config of configs) {
  let total = 0;
  let turns = 0;
  let secs = 0;
  for (let r = 1; r <= runs; r++) {
    const dir = resolve(import.meta.dirname, `../workspace/ex5/${config.name.replace(/\s+/g, "-")}-${r}`);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    console.log(ring.agent(`\n== ${config.name} (${config.model}) run ${r}/${runs}`));
    const started = Date.now();
    const agent = createAgent(config.agent, {
      model: ollama({ model: config.model }),
      env: await config.env(dir),
      approve: async () => true,
      onEvent: args.verbose
        ? createTracer({ tokens: false })
        : (e) => e.type === "tool:start" && process.stdout.write(ring.dim(`${e.call.name} `)),
    });
    let result;
    try {
      result = await agent.run(TASK);
    } catch (err) {
      console.log(ring.environment(`run failed: ${(err as Error).message}`));
    }
    const s = await score(dir);
    const t = (Date.now() - started) / 1000;
    console.log(`\n${s}/${HIDDEN.length} hidden checks, ${result?.turns ?? "?"} turns, ${t.toFixed(0)}s`);
    total += s;
    turns += result?.turns ?? 0;
    secs += t;
  }
  rows.push({ name: config.name, model: config.model, score: total / runs, turns: turns / runs, secs: secs / runs });
}

console.log(ring.agent("\nResults (average per run)"));
console.table(
  rows.map((r) => ({
    config: r.name,
    model: r.model,
    "hidden checks": `${r.score.toFixed(1)}/${HIDDEN.length}`,
    turns: r.turns.toFixed(1),
    seconds: r.secs.toFixed(0),
  })),
);
