// Built-in tools. Two groups:
//  - "pure" tools that need no environment (time, math)
//  - "world" tools that read and change the environment (files, shell)

import { defineTool } from "./tool.ts";

export const getTime = defineTool<{}>({
  name: "get_time",
  description: "Get the current local date and time.",
  parameters: { type: "object", properties: {} },
  async run() {
    return new Date().toString();
  },
});

export const calculator = defineTool<{ expression: string }>({
  name: "calculator",
  description: "Evaluate an arithmetic expression, e.g. '(17 * 23) / 4'. Supports + - * / % ** and parentheses.",
  parameters: {
    type: "object",
    properties: { expression: { type: "string", description: "The arithmetic expression." } },
    required: ["expression"],
  },
  async run({ expression }) {
    if (!/^[\d\s+\-*/%.()]+$/.test(expression)) return "Error: only numbers and + - * / % ( ) are allowed.";
    return String(Function(`"use strict"; return (${expression});`)());
  },
});

export const listDir = defineTool<{ path?: string }>({
  name: "list_dir",
  description: "List files and folders. Folders end with '/'.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Folder to list. Defaults to '.'." } },
  },
  async run({ path }, { env }) {
    const entries = await env.listDir(path || ".");
    return entries.length ? entries.join("\n") : "(empty)";
  },
});

export const readFile = defineTool<{ path: string }>({
  name: "read_file",
  description: "Read a text file.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "File path." } },
    required: ["path"],
  },
  async run({ path }, { env }) {
    return env.readFile(path);
  },
});

export const writeFile = defineTool<{ path: string; content: string }>({
  name: "write_file",
  description: "Create or overwrite a text file with the full content given.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path." },
      content: { type: "string", description: "The complete new file content." },
    },
    required: ["path", "content"],
  },
  async run({ path, content }, { env }) {
    await env.writeFile(path, content);
    return `Wrote ${content.length} chars to ${path}.`;
  },
});

export const runShell = defineTool<{ command: string }>({
  name: "run_shell",
  description: "Run a shell command in the workspace and get its exit code and output. Use it to run scripts and tests.",
  risky: true,
  parameters: {
    type: "object",
    properties: { command: { type: "string", description: "The command, e.g. 'node index.js' or 'npm test'." } },
    required: ["command"],
  },
  async run({ command }, { env }) {
    const { code, stdout, stderr } = await env.exec(command);
    return [`exit code: ${code}`, stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`].filter(Boolean).join("\n");
  },
});

export const pureTools = [getTime, calculator];
export const readTools = [listDir, readFile];
export const worldTools = [listDir, readFile, writeFile, runShell];
