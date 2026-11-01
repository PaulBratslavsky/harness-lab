// Harness lift across a ladder of models and a suite of tasks.
//
// Which model gains most from a better harness? Each model runs each task in
// four setups, and hidden checks score the result:
//   bare      one-line prompt, just the task's files
//   harness   better instructions (look, write, run, fix)
//   env       one-line prompt, plus visible tests, `npm test` and AGENTS.md
//   both      better instructions + richer folder
// "Harness lift" = harness score - bare score. Same model, same tools.
//
//   npm run ex:6                                         every task, default ladder
//   npm run ex:6 -- --tasks hard --models qwen3.5:9b     the harder suite only
//   npm run ex:6 -- --tasks cart,lru --runs 5
//
// Tasks live in evals/tasks/. Every run is appended to results/lift-<timestamp>.json
// as it finishes, so a long run that's stopped halfway still leaves data behind.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runTask, type EnvVariant, type HarnessVariant, type RunResult } from "../evals/run.ts";
import { pickTasks } from "../evals/tasks/index.ts";
import { ring } from "../src/trace.ts";

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "llama3.2:3b,qwen3.5:9b,qwen3:14b,gemma4:26b" },
    tasks: { type: "string", default: "all" },
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
const tasks = pickTasks(args.tasks);
const runs = Number(args.runs);
const host = (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");

const resultsDir = resolve(import.meta.dirname, "../results");
await mkdir(resultsDir, { recursive: true });
const outFile = resolve(resultsDir, `lift-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
type Row = { model: string; task: string; setup: string; run: number } & RunResult;
const log: Row[] = [];

const total = models.length * tasks.length * SETUPS.length * runs;
let done = 0;
const started = Date.now();

for (const model of models) {
  for (const task of tasks) {
    for (let r = 1; r <= runs; r++) {
      // Interleave setups within each run so slow drift (thermals, other apps) hits them equally.
      for (const setup of SETUPS) {
        done++;
        process.stdout.write(ring.dim(`[${done}/${total}] `) + `${model} · ${task.id} · ${setup.name} · run ${r} ... `);
        const result = await runTask({
          task,
          model,
          harness: setup.harness,
          env: setup.env,
          dir: resolve(import.meta.dirname, `../workspace/ex6/${model.replace(/[:/]/g, "_")}/${task.id}/${setup.name}-${r}`),
        });
        console.log(
          `${result.passed}/${result.total}  ${result.turns} turns  ${result.seconds.toFixed(0)}s` +
            (result.stoppedBy === "max_turns" ? ring.environment("  hit turn limit") : "") +
            (result.error ? ring.environment(`  error: ${result.error}`) : ""),
        );
        log.push({ model, task: task.id, setup: setup.name, run: r, ...result });
        await writeFile(outFile, JSON.stringify({ tasks: tasks.map((t) => t.id), runs: log }, null, 2));
      }
    }
  }
  // Free memory before loading the next model.
  await fetch(`${host}/api/generate`, { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => {});
}

// ---- Summary: % of hidden checks passed, averaged over runs (and tasks) ----
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (rows: Row[]) => 100 * avg(rows.map((x) => x.passed / x.total));
const fmt = (n: number) => `${n.toFixed(0)}%`;
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}`;

function summaryRow(rows: Row[]) {
  const s = Object.fromEntries(SETUPS.map((x) => [x.name, pct(rows.filter((y) => y.setup === x.name))]));
  return {
    bare: fmt(s.bare),
    "+harness": fmt(s.harness),
    "+env": fmt(s.env),
    "+both": fmt(s.both),
    "harness lift": signed(s.harness - s.bare),
    "env lift": signed(s.env - s.bare),
  };
}

console.log(ring.agent(`\nHidden checks passed, averaged over ${tasks.length} task(s) × ${runs} run(s)`));
console.table(models.map((model) => ({ model, ...summaryRow(log.filter((x) => x.model === model)), "median secs": median(log.filter((x) => x.model === model).map((x) => x.seconds)) })));

if (tasks.length > 1) {
  console.log(ring.agent("\nBy task"));
  console.table(models.flatMap((model) => tasks.map((task) => ({ model, task: task.id, ...summaryRow(log.filter((x) => x.model === model && x.task === task.id)) }))));
}
console.log(ring.dim(`Total time ${((Date.now() - started) / 60000).toFixed(1)} min. Raw runs: ${outFile}`));

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)].toFixed(0) : "-";
}
