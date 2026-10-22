// Harness lift across a ladder of models.
//
// Which model gains most from a better harness? For each model we run the
// slugify task in four setups and score it with hidden checks:
//   bare      one-line prompt, empty folder
//   harness   better instructions (look, write, run, fix), empty folder
//   env       one-line prompt, folder with tests + AGENTS.md
//   both      better instructions + richer folder
// "Harness lift" = harness score - bare score. Same model, same tools.
//
//   npm run ex:6
//   npm run ex:6 -- --models llama3.2:3b,qwen3.5:9b --runs 5
//
// Every run is appended to results/lift-<timestamp>.json as it finishes,
// so a long run that's stopped halfway still leaves data behind.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ring } from "../src/trace.ts";
import { HIDDEN, runOnce, type EnvVariant, type HarnessVariant, type RunResult } from "./lib/slugify-task.ts";

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "llama3.2:3b,qwen3.5:9b,qwen3:14b,gemma4:26b" },
    runs: { type: "string", default: "3" },
  },
});

const SETUPS: { name: string; harness: HarnessVariant; env: EnvVariant }[] = [
  { name: "bare", harness: "bare", env: "bare" },
  { name: "harness", harness: "better", env: "bare" },
  { name: "env", harness: "bare", env: "rich" },
  { name: "both", harness: "better", env: "rich" },
];

const models = args.models.split(",").map((m) => m.trim()).filter(Boolean);
const runs = Number(args.runs);
const host = (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");

const resultsDir = resolve(import.meta.dirname, "../results");
await mkdir(resultsDir, { recursive: true });
const outFile = resolve(resultsDir, `lift-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
const log: ({ model: string; setup: string; run: number } & RunResult)[] = [];

const total = models.length * SETUPS.length * runs;
let done = 0;
const started = Date.now();

for (const model of models) {
  for (let r = 1; r <= runs; r++) {
    // Interleave setups within each run so slow drift (thermals, other apps) hits them equally.
    for (const setup of SETUPS) {
      done++;
      process.stdout.write(ring.dim(`[${done}/${total}] `) + `${model} · ${setup.name} · run ${r} ... `);
      const result = await runOnce({
        model,
        harness: setup.harness,
        env: setup.env,
        dir: resolve(import.meta.dirname, `../workspace/ex6/${model.replace(/[:/]/g, "_")}/${setup.name}-${r}`),
      });
      console.log(
        `${result.score}/${HIDDEN.length}  ${result.turns} turns  ${result.seconds.toFixed(0)}s` +
          (result.stoppedBy === "max_turns" ? ring.environment("  hit turn limit") : "") +
          (result.error ? ring.environment(`  error: ${result.error}`) : ""),
      );
      log.push({ model, setup: setup.name, run: r, ...result });
      await writeFile(outFile, JSON.stringify({ task: "slugify", hiddenChecks: HIDDEN.length, runs: log }, null, 2));
    }
  }
  // Free memory before loading the next model.
  await fetch(`${host}/api/generate`, { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => {});
}

// ---- Summary ----
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const cell = (model: string, setup: string) => log.filter((x) => x.model === model && x.setup === setup);

console.log(ring.agent(`\nAverage hidden checks passed (out of ${HIDDEN.length}), ${runs} run(s) each`));
console.table(
  models.map((model) => {
    const s = Object.fromEntries(SETUPS.map((x) => [x.name, avg(cell(model, x.name).map((y) => y.score))]));
    return {
      model,
      bare: s.bare.toFixed(1),
      "+harness": s.harness.toFixed(1),
      "+env": s.env.toFixed(1),
      "+both": s.both.toFixed(1),
      "harness lift": (s.harness - s.bare >= 0 ? "+" : "") + (s.harness - s.bare).toFixed(1),
      "avg secs": avg(log.filter((x) => x.model === model).map((y) => y.seconds)).toFixed(0),
    };
  }),
);
console.log(ring.dim(`Total time ${((Date.now() - started) / 60000).toFixed(1)} min. Raw runs: ${outFile}`));
