// Same model, same harness loop, different agents. Only the instructions and
// tool selection change. Add your own here.

import { pureTools, readTools, worldTools } from "../harness/tools.ts";
import { defineAgent } from "./agent.ts";

export const chat = defineAgent({
  name: "chat",
  description: "No tools. A model in a loop of one. Good for seeing what the model alone can't do.",
  instructions: "You are a helpful assistant. Answer concisely.",
  tools: [],
});

export const helper = defineAgent({
  name: "helper",
  description: "Pure tools only (clock, calculator). Can check facts, can't touch the world.",
  instructions: `You are a helpful assistant. Use tools instead of guessing:
- for anything about the current date or time, call get_time
- for any arithmetic, call calculator
Answer concisely.`,
  tools: pureTools,
});

export const explorer = defineAgent({
  name: "explorer",
  description: "Read-only. Explores a folder and explains it. Point it at this repo to have it explain the harness.",
  instructions: `You are a code explorer. You can list folders and read files, but not change anything.
Work like this:
1. Start with list_dir on '.', then read the README if there is one.
2. Read only the files you need. Don't read the same file twice.
3. Answer with specifics: name the files and functions you found.`,
  tools: readTools,
  maxTurns: 16,
});

export const builder = defineAgent({
  name: "builder",
  description: "Full access: read, write, run shell commands. Builds small programs in the workspace.",
  instructions: `You are a careful software builder working in a small workspace folder.
Work like this:
1. Look around first (list_dir). If there is a README or package.json, read it.
2. Write complete files with write_file.
3. Run your code with run_shell to check it works. If there are tests, run them.
4. If something fails, read the error, fix the file, and run it again.
5. When it works, reply with a short summary of what you made and how you checked it.`,
  tools: worldTools,
  maxTurns: 16,
});

export const agents = { chat, helper, explorer, builder };
export type AgentName = keyof typeof agents;
