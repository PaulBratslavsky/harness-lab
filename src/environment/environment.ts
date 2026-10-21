// The outer ring. The environment is the world the agent acts in: here, a
// folder on disk plus a shell. The model never touches it directly. Only the
// harness's tools do, and only through this interface.
//
// Blurry line (from the article): an `npm test` script lives in the
// environment, but once a tool can run it, it feels like part of the harness.
// In this codebase: `run_shell` is the harness, whatever it runs is the
// environment.

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Environment {
  readonly name: string;
  /** What the agent is told about its world at startup. */
  describe(): string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path?: string): Promise<string[]>;
  exec(command: string, timeoutMs?: number): Promise<ExecResult>;
}

/**
 * A folder on disk. Every path is resolved inside `root`, so the agent can't
 * wander off with `../../`. This is NOT a security sandbox: shell commands can
 * still reach anything your user account can. Run risky things in a container.
 */
export function localWorkspace(root: string, notes = ""): Environment {
  const base = resolve(root);

  const inside = (path: string) => {
    const full = resolve(base, path);
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error(`Path "${path}" is outside the workspace.`);
    }
    return full;
  };

  return {
    name: `workspace:${base}`,

    describe() {
      return [
        `You are working in a folder on disk. All paths are relative to it.`,
        `Shell commands run with this folder as the working directory (zsh/sh on ${process.platform}).`,
        notes,
      ]
        .filter(Boolean)
        .join("\n");
    },

    async readFile(path) {
      return readFile(inside(path), "utf8");
    },

    async writeFile(path, content) {
      const full = inside(path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, "utf8");
    },

    async listDir(path = ".") {
      const full = inside(path);
      if (full === base) await mkdir(base, { recursive: true });
      const entries = await readdir(full, { withFileTypes: true });
      return entries
        .filter((e) => e.name !== "node_modules" && e.name !== ".git")
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort();
    },

    async exec(command, timeoutMs = 30_000) {
      await mkdir(base, { recursive: true });
      return new Promise((done) => {
        execFile("sh", ["-c", command], { cwd: base, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
          done({ code, stdout: String(stdout), stderr: String(stderr) + (err?.killed ? "\n(timed out)" : "") });
        });
      });
    },
  };
}

/** An environment that doesn't exist. Tools that need the world will fail politely. */
export function noEnvironment(): Environment {
  const missing = async (): Promise<never> => {
    throw new Error("No environment attached. This agent has a brain and a harness, but no world to act in.");
  };
  return {
    name: "none",
    describe: () => "You have no environment: no files, no shell.",
    readFile: missing,
    writeFile: missing,
    listDir: missing,
    exec: missing,
  };
}
