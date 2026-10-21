# harness-lab

Build an agent harness from scratch on a local model, one ring at a time.

```
┌──────────────────────────── Environment ────────────────────────────┐   red
│  the world: files, shell, scripts, tests, AGENTS.md                 │
│                                                                     │
│        ┌ ─ ─ ─ ─ ─ ─ ─ ─ Agent ─ ─ ─ ─ ─ ─ ─ ─ ┐                    │   white (dashed)
│          a name for "model + harness, in a world"                   │
│        │  ┌──────────── Harness ────────────┐  │                    │   blue
│           │ loop, tools, memory, context,   │                       │
│        │  │ permissions, when to stop       │  │                    │
│           │      ┌──── Model ────┐          │                       │   yellow
│        │  │      │ text in,      │          │  │                    │
│           │      │ text out      │          │                       │
│        │  │      └───────────────┘          │  │                    │
│           └─────────────────────────────────┘                       │
│        └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

> An agent is a model harnessed in an environment. Training a model is out of
> reach for most of us, so the work is improving the **harness** and the **environment**.

## Where each ring lives

| Ring | Folder | What's there |
|---|---|---|
| Model | [src/model/](src/model/) | `Model` interface and an Ollama client. ~100 lines. Stateless. |
| Harness | [src/harness/](src/harness/) | The loop ([harness.ts](src/harness/harness.ts)), tools, context trimming, approvals, events |
| Agent | [src/agent/](src/agent/) | Deliberately tiny: instructions + tool choice, wired to a model and an environment |
| Environment | [src/environment/](src/environment/) | A workspace folder + shell. The only thing tools can touch |

[src/trace.ts](src/trace.ts) prints everything colored by ring, so you can watch which layer is doing what.

## Setup

Needs Node 23.6+ (runs `.ts` directly, no build step) and [Ollama](https://ollama.com) running.

```bash
npm install
```

Default model is `qwen3:14b`. Override with `HARNESS_MODEL=llama3.2:3b` or `--model`.

## Walk the rings

```bash
npm run ex:1
```
**Model alone.** Asks for today's date and a multiplication. It guesses both, and forgets the question on the next call.

```bash
npm run ex:2
```
**+ Harness.** Same model with a loop, a clock and a calculator. It gets both right, and "remembers" because the harness re-sends the history.

```bash
npm run ex:3
```
**+ Agent.** Same loop, given a role and read-only tools, pointed at this repo. It finds and explains the harness loop.

```bash
npm run ex:4
```
**+ Environment.** A builder agent writes a file, runs it, checks the output. The world changes.

```bash
npm run ex:5
```
**Which ring matters most?** One task with hidden checks. Change one ring at a time (bigger model / better harness / better environment) and compare scores.

## Chat with any agent

```bash
npm run chat
```

Flags: `--agent chat|helper|explorer|builder`, `--model llama3.2:3b`, `--dir path`, `--think`, `--yolo` (skip shell approvals), `--quiet`. Type `/context` to see exactly what the model is sent.

## Next

See [docs/exploring.md](docs/exploring.md) for experiments on each ring.
