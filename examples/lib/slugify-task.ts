// The "slugify" task used by examples 5 and 6, plus the harness and
// environment variants they compare. Change one ring at a time:
//   harness:     "bare" (one-line prompt) or "better" (look, write, run, fix)
//   environment: "bare" (empty folder) or "rich" (tests, npm test, AGENTS.md)

import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createAgent, defineAgent } from "../../src/agent/agent.ts";
import { builder } from "../../src/agent/agents.ts";
import { localWorkspace, type Environment } from "../../src/environment/environment.ts";
import type { HarnessEvent } from "../../src/harness/events.ts";
import { worldTools } from "../../src/harness/tools.ts";
import { ollama } from "../../src/model/ollama.ts";

export const TASK = `Create slugify.mjs exporting a named function slugify(text) (ES module: \`export function slugify(text)\`).
Rules: lowercase; strip accents (é -> e); "&" becomes the word "and"; every run of other non-letter/non-digit characters becomes a single "-"; no leading or trailing "-".`;

// Hidden checks: the agent never sees these.
export const HIDDEN: [string, string][] = [
  ["Hello World", "hello-world"],
  ["  Café & Crème brûlée! ", "cafe-and-creme-brulee"],
  ["a--b__c", "a-b-c"],
  ["", ""],
  ["Top 10 Tips", "top-10-tips"],
  ["Ünïcödé", "unicode"],
  ["---Leading and trailing---", "leading-and-trailing"],
  ["Rock & Roll & Jazz", "rock-and-roll-and-jazz"],
];

// ---- Harness variants: same tools, different instructions ----
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

// ---- Environment variants ----
export const environments = {
  async bare(dir: string): Promise<Environment> {
    return localWorkspace(dir);
  },

  async rich(dir: string): Promise<Environment> {
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
  },
};
export type EnvVariant = keyof typeof environments;

export async function score(dir: string): Promise<number> {
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

export interface RunResult {
  score: number;
  turns: number;
  seconds: number;
  toolCalls: number;
  stoppedBy: "done" | "max_turns" | "error";
  error?: string;
}

/** One attempt at the task in a fresh folder. */
export async function runOnce(opts: {
  model: string;
  harness: HarnessVariant;
  env: EnvVariant;
  dir: string;
  onEvent?: (e: HarnessEvent) => void;
}): Promise<RunResult> {
  await rm(opts.dir, { recursive: true, force: true });
  await mkdir(opts.dir, { recursive: true });

  let toolCalls = 0;
  const agent = createAgent(harnesses[opts.harness], {
    model: ollama({ model: opts.model }),
    env: await environments[opts.env](opts.dir),
    approve: async () => true,
    onEvent: (e) => {
      if (e.type === "tool:start") toolCalls++;
      opts.onEvent?.(e);
    },
  });

  const started = Date.now();
  try {
    const result = await agent.run(TASK);
    return { score: await score(opts.dir), turns: result.turns, seconds: (Date.now() - started) / 1000, toolCalls, stoppedBy: result.stoppedBy };
  } catch (err) {
    return { score: await score(opts.dir), turns: 0, seconds: (Date.now() - started) / 1000, toolCalls, stoppedBy: "error", error: (err as Error).message };
  }
}
