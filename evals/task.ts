// An eval task: a job for an agent, plus hidden checks that score the result.
// Evals sit outside the four rings. They measure the whole agent so we can
// tell whether a change to any ring actually helped.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/** Loads a module the agent wrote, fresh every time (no import cache). */
export type Loader = (file: string) => Promise<any>;

export interface HiddenCheck {
  name: string;
  run: (load: Loader) => Promise<boolean> | boolean;
}

export interface EvalTask {
  id: string;
  title: string;
  /** What the agent is asked to do. */
  prompt: string;
  /** Files that are part of the task itself, present in every setup (buggy code, SPEC.md, data). */
  files: Record<string, string>;
  /** test.mjs for the "rich" environment: a visible subset of the hidden checks. */
  visibleTests: string;
  /** Extra lines for AGENTS.md in the "rich" environment. */
  notes?: string;
  /** Hidden checks. The agent never sees these. */
  hidden: HiddenCheck[];
  /** A known-good solution, used only by `npm run evals:check` to prove the task is solvable. */
  reference: Record<string, string>;
}

export function loaderFor(dir: string): Loader {
  return (file) => import(`${pathToFileURL(resolve(dir, file)).href}?t=${Date.now()}-${Math.random()}`);
}

/** Deep equality via JSON, good enough for plain data. */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True if fn throws (sync or async). */
export async function throws(fn: () => unknown): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

/** Builds a self-contained test.mjs. Inside `body`, use eq(name, () => actual, expected) and throws(name, () => ...). */
export function testFile(importLine: string, body: string): string {
  return `${importLine}
let failed = 0, passed = 0;
function eq(name, fn, want) {
  let got;
  try { got = fn(); } catch (e) { got = "threw: " + e.message; }
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else { failed++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
}
function throws(name, fn) {
  try { fn(); failed++; console.log("FAIL", name, "should throw"); } catch { passed++; }
}
${body.trim()}
console.log(failed ? failed + " failed, " + passed + " passed" : "all " + passed + " passed");
process.exit(failed ? 1 : 0);
`;
}
