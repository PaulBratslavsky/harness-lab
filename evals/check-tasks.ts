// Proves every eval task is fair before we blame a model for failing it:
//   1. With only the starting files, the hidden checks must NOT all pass.
//   2. With the reference solution, all hidden checks AND the visible tests must pass.
//
//   npm run evals:check

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareEnv, scoreTask } from "./run.ts";
import { allTasks } from "./tasks/index.ts";

let problems = 0;
for (const task of allTasks) {
  // Separate folders: Node caches modules imported by plain path (report.mjs -> ./format.mjs),
  // so scoring the same folder twice in one process would reuse the old code.
  const startDir = resolve(import.meta.dirname, `../workspace/evals-check/${task.id}-start`);
  const dir = resolve(import.meta.dirname, `../workspace/evals-check/${task.id}-reference`);

  await prepareEnv(task, "rich", startDir);
  const before = await scoreTask(task, startDir);

  const env = await prepareEnv(task, "rich", dir);
  for (const [path, content] of Object.entries(task.reference)) await writeFile(resolve(dir, path), content);
  const after = await scoreTask(task, dir);
  const visible = await env.exec("node test.mjs");

  const ok = before.passed < before.total && after.passed === after.total && visible.code === 0;
  if (!ok) problems++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${task.id.padEnd(9)} start ${before.passed}/${before.total}  reference ${after.passed}/${after.total}  visible tests: ${visible.stdout.trim().split("\n").pop()}`,
  );
  if (after.failed.length) console.log(`     reference fails: ${after.failed.join(", ")}`);
  if (visible.code !== 0) console.log(visible.stdout + visible.stderr);
}
process.exit(problems ? 1 : 0);
