// Proves workspace shell commands can't edit the project around them.
// Runs real npm and git commands inside a workspace that sits inside this
// repo, the same situation as every eval run and the chat CLI's builder.
//
//   npm run evals:check   (runs this after the task checks)

import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { localWorkspace } from "../src/environment/environment.ts";

const project = resolve(import.meta.dirname, "..");
const dir = resolve(project, "workspace/fence-check");
await rm(dir, { recursive: true, force: true });
const env = localWorkspace(dir);

const projectPkgBefore = await readFile(resolve(project, "package.json"), "utf8");

const checks: [string, boolean][] = [];

const prefix = await env.exec("npm prefix");
checks.push(["npm treats the workspace as its project", prefix.stdout.trim() === dir]);

// `npm init` and `npm pkg set` write to whichever package.json npm thinks is
// "the project", just like `npm install` does. No network needed.
await env.exec("npm init -y && npm pkg set description=fence-check");
const projectPkgAfter = await readFile(resolve(project, "package.json"), "utf8");
checks.push(["npm can't edit the project's package.json", projectPkgAfter === projectPkgBefore]);
checks.push(["npm writes inside the workspace instead", (await env.readFile("package.json").catch(() => "")).includes("fence-check")]);

const git = await env.exec("git rev-parse --show-toplevel");
checks.push(["git can't see the project's repo", git.code !== 0]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} fence: ${name}`);
}
if (projectPkgAfter !== projectPkgBefore) console.log("The project's package.json was changed. Restore it with: git checkout package.json");
process.exit(failed ? 1 : 0);
