// Runs one task with one model in one setup. Change one ring at a time:
//   harness:     "bare" (one-line prompt) or "better" (look, write, run, fix)
//   environment: "bare" (just the task's files) or "rich" (+ visible tests, npm test, AGENTS.md)

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createAgent, defineAgent } from "../src/agent/agent.ts";
import { builder } from "../src/agent/agents.ts";
import { localWorkspace, type Environment } from "../src/environment/environment.ts";
import type { HarnessEvent } from "../src/harness/events.ts";
import { worldTools } from "../src/harness/tools.ts";
import { ollama } from "../src/model/ollama.ts";
import { loaderFor, type EvalTask } from "./task.ts";

export const harnesses = {
  bare: defineAgent({
    name: "bare",
    description: "minimal prompt",
    instructions: "You are an assistant with file and shell tools.",
    tools: worldTools,
    maxTurns: 16,
  }),
  better: builder, // look -> write -> run -> fix, from src/agent/agents.ts
};
export type HarnessVariant = keyof typeof harnesses;
export type EnvVariant = "bare" | "rich";

async function writeFiles(dir: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

/** Sets up a fresh folder for the task and returns the environment around it. */
export async function prepareEnv(task: EvalTask, variant: EnvVariant, dir: string): Promise<Environment> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFiles(dir, task.files);
  if (variant === "bare") return localWorkspace(dir);

  const agentsMd = [
    "# Notes for agents",
    "- Read SPEC.md (if there is one) before writing code.",
    '- Run `npm test` after every change. The work is done only when it prints "all ... passed".',
    task.notes ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  await writeFiles(dir, {
    "test.mjs": task.visibleTests,
    "package.json": JSON.stringify({ type: "module", scripts: { test: "node test.mjs" } }, null, 2),
    "AGENTS.md": agentsMd,
  });
  // Blurry line: AGENTS.md lives in the environment, but the harness reads it
  // into the system prompt (like Claude Code does with CLAUDE.md).
  return localWorkspace(dir, agentsMd);
}

export interface Score {
  passed: number;
  total: number;
  failed: string[];
}

export async function scoreTask(task: EvalTask, dir: string): Promise<Score> {
  const load = loaderFor(dir);
  const failed: string[] = [];
  for (const check of task.hidden) {
    let ok = false;
    try {
      ok = (await check.run(load)) === true;
    } catch {
      ok = false; // missing file, syntax error, wrong export...
    }
    if (!ok) failed.push(check.name);
  }
  return { passed: task.hidden.length - failed.length, total: task.hidden.length, failed };
}

export interface RunResult extends Score {
  turns: number;
  seconds: number;
  toolCalls: number;
  stoppedBy: "done" | "max_turns" | "error";
  error?: string;
}

/** One attempt at a task in a fresh folder. */
export async function runTask(opts: {
  task: EvalTask;
  model: string;
  harness: HarnessVariant;
  env: EnvVariant;
  dir: string;
  onEvent?: (e: HarnessEvent) => void;
}): Promise<RunResult> {
  const env = await prepareEnv(opts.task, opts.env, opts.dir);
  let toolCalls = 0;
  const agent = createAgent(harnesses[opts.harness], {
    model: ollama({ model: opts.model }),
    env,
    approve: async () => true,
    onEvent: (e) => {
      if (e.type === "tool:start") toolCalls++;
      opts.onEvent?.(e);
    },
  });

  const started = Date.now();
  let turns = 0;
  let stoppedBy: RunResult["stoppedBy"] = "done";
  let error: string | undefined;
  try {
    const result = await agent.run(opts.task.prompt);
    turns = result.turns;
    stoppedBy = result.stoppedBy;
  } catch (err) {
    stoppedBy = "error";
    error = (err as Error).message;
  }
  const seconds = (Date.now() - started) / 1000;
  return { ...(await scoreTask(opts.task, opts.dir)), turns, seconds, toolCalls, stoppedBy, error };
}
