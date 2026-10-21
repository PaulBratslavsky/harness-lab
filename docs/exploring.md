# Exploring the rings

Each section: the idea, where it lives in the code, and experiments to run.
Change one thing at a time and watch the colored trace.

---

## Model (yellow): the thinking engine

> You pass it text, and it gives you back some text.

**Code:** [src/model/types.ts](../src/model/types.ts) is the whole contract: `chat(messages) -> message`. [src/model/ollama.ts](../src/model/ollama.ts) is one implementation.

**Things to notice**
- The model has no memory. Example 1's second question proves it.
- Tool calls are just structured text the model emits. The model never *runs* anything.

**Experiments**
- [ ] Run `ex:2` with `HARNESS_MODEL=llama3.2:3b`. Does the small model still call tools correctly?
- [ ] Run with `HARNESS_THINK=1`. Use `npm run chat -- --think` to see the reasoning. Slower, but better?
- [ ] Write a second `Model` (e.g. `src/model/lmstudio.ts` or an OpenAI-compatible one). Nothing above this ring should need to change. That's the point of the interface.

---

## Harness (blue): connects the model to the world

> The harness connects that stateless model to the outside world.

**Code:** [src/harness/harness.ts](../src/harness/harness.ts). The loop is ~40 lines. Everything else is a decision a harness designer makes:

| Decision | Where | Default |
|---|---|---|
| What tools exist and how they're described | [tools.ts](../src/harness/tools.ts) | 6 tools |
| What fits in context | [context.ts](../src/harness/context.ts) | drop oldest messages |
| How big a tool result can be | `maxToolOutput` | 6000 chars |
| What needs permission | `risky` + `approve` | shell only |
| When to stop | `maxTurns` | 12 |
| How errors come back | `runTool` | as text, so the model can retry |

**Experiments**
- [ ] In `ex:3`, the explorer guessed `src/harness.ts` and `src/index.ts` before finding the right file. Add a `tree` tool that lists everything recursively. Does it find the file in fewer turns?
- [ ] Add an `edit_file` tool (find/replace) next to `write_file`. Do agents make fewer mistakes on big files?
- [ ] Set `contextBudget: 800` in the CLI and have a long conversation. Use `/context` to see what gets dropped. Then write a smarter `fitContext` (summarize old turns, or drop big tool outputs first).
- [ ] Rewrite a tool description badly (vague, no examples). How much does the model's behavior change?
- [ ] Make tool errors less helpful (just `"Error"`). Does the agent still recover?

---

## Agent (white, dashed): not a separate thing

> An agent is a model harnessed in an environment. It's just a name for the harness and model together.

**Code:** [src/agent/agent.ts](../src/agent/agent.ts) is tiny on purpose. [src/agent/agents.ts](../src/agent/agents.ts) defines four agents that share the same model and loop. They differ only in instructions and tools.

**Experiments**
- [ ] Ask `helper` and `chat` the same question. Same model, different agent.
- [ ] Write a `reviewer` agent: read-only tools, instructions to find bugs. Point it at `src/`.
- [ ] Give `builder` the instructions of `bare` in ex:5. How much of "the agent" was the prompt?

---

## Environment (red): the world

> Improving the environment in which the harness and model operate.

**Code:** [src/environment/environment.ts](../src/environment/environment.ts). A folder and a shell. Tools reach the world only through this interface.

**The blurry line.** An `npm test` script lives in the environment. But once `run_shell` can call it, it feels like part of the harness. In ex:5, `AGENTS.md` sits in the folder (environment) but the harness puts it into the system prompt. Claude Code does the same with `CLAUDE.md`. Where would you draw the line?

**Experiments**
- [ ] Run `ex:5` and compare "bigger model" with "better environment". Run it with `--runs 3`, because single runs are noisy.
- [ ] In ex:5's rich environment, delete the accent tip from `AGENTS.md`. Does the score drop?
- [ ] Add a linter or type checker to the workspace. Does the builder use it without being told?
- [ ] Make the environment smaller: a read-only workspace, or no shell. What can the agent still do?

---

## Bigger projects

- **Streaming UI:** the `onEvent` stream has everything needed for a web UI that shows the rings live.
- **Sub-agents:** a tool whose `run` calls `createAgent(...).run(task)`. An agent inside a harness inside an agent.
- **Evals:** turn ex:5 into a small eval suite with several tasks, so you can tell whether a harness change helped.
- **Real sandbox:** run `exec` inside Docker so the shell can't touch your machine.
