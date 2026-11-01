# harness-lab

A teaching project: an agent harness built from scratch on a local Ollama model, organised as four rings (model → harness → agent → environment). See README.md for the diagram and docs/exploring.md for experiments.

## Conventions
- TypeScript run directly by Node 23.6+ (type stripping). No build step, no runtime dependencies.
  - Imports use `.ts` extensions. Only erasable syntax: no enums, namespaces or constructor parameter properties.
  - `npm run typecheck` must pass.
- Keep each ring in its own folder and only depend inward: environment and harness may import model types; agent wires them together. The model ring imports nothing.
- Code here is for learning: prefer short, readable code with a comment saying *which ring* and *why*, over abstraction.
- Every new harness behaviour should emit a `HarnessEvent` and be printed in `src/trace.ts`, so it's visible in the colored trace.

## Running
- Ollama must be running locally. Default model `qwen3:14b`; `llama3.2:3b` is fast for quick checks (`HARNESS_MODEL=llama3.2:3b`).
- `workspace/` is scratch space for agents and is gitignored.
- Evals live in `evals/`. After adding or changing a task, run `npm run evals:check`. Results from `npm run ex:6` go to `results/` and are committed.
