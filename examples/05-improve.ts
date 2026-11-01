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
//
// The task and the variants live in evals/. Example 6 runs the same
// comparison across a ladder of models and a suite of harder tasks.

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createTracer, ring } from "../src/trace.ts";
import { runTask, type EnvVariant, type HarnessVariant } from "../evals/run.ts";
import { slugify } from "../evals/tasks/slugify.ts";

const { values: args } = parseArgs({
  options: {
    small: { type: "string", default: "llama3.2:3b" },
    big: { type: "string", default: "qwen3:14b" },
    runs: { type: "string", default: "1" },
    verbose: { type: "boolean", default: false },
  },
});

const configs: { name: string; model: string; harness: HarnessVariant; env: EnvVariant }[] = [
  { name: "baseline", model: args.small, harness: "bare", env: "bare" },
  { name: "bigger model", model: args.big, harness: "bare", env: "bare" },
  { name: "better harness", model: args.small, harness: "better", env: "bare" },
  { name: "better environment", model: args.small, harness: "bare", env: "rich" },
  { name: "all three", model: args.big, harness: "better", env: "rich" },
];

const runs = Number(args.runs);
const rows = [];

for (const config of configs) {
  let total = 0;
  let turns = 0;
  let secs = 0;
  for (let r = 1; r <= runs; r++) {
    console.log(ring.agent(`\n== ${config.name} (${config.model}) run ${r}/${runs}`));
    const result = await runTask({
      ...config,
      task: slugify,
      dir: resolve(import.meta.dirname, `../workspace/ex5/${config.name.replace(/\s+/g, "-")}-${r}`),
      onEvent: args.verbose
        ? createTracer({ tokens: false })
        : (e) => e.type === "tool:start" && process.stdout.write(ring.dim(`${e.call.name} `)),
    });
    if (result.error) console.log(ring.environment(`run failed: ${result.error}`));
    console.log(`\n${result.passed}/${result.total} hidden checks, ${result.turns} turns, ${result.seconds.toFixed(0)}s`);
    total += result.passed;
    turns += result.turns;
    secs += result.seconds;
  }
  rows.push({
    config: config.name,
    model: config.model,
    "hidden checks": `${(total / runs).toFixed(1)}/${slugify.hidden.length}`,
    turns: (turns / runs).toFixed(1),
    seconds: (secs / runs).toFixed(0),
  });
}

console.log(ring.agent("\nResults (average per run)"));
console.table(rows);
