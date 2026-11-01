// A web research agent. Same model, same harness loop as every other example.
// What's new is the environment: the open web instead of a folder.
//
//   npm run ex:7
//   npm run ex:7 -- "your question here"
//   HARNESS_MODEL=qwen3.5:9b npm run ex:7
//
// Search works with no setup (DuckDuckGo). For steadier results set
// OLLAMA_API_KEY (Ollama's web search) or SEARXNG_URL (your own SearXNG).

import { createAgent } from "../src/agent/agent.ts";
import { researcher } from "../src/agent/agents.ts";
import { noEnvironment } from "../src/environment/environment.ts";
import { pickSearchProvider, withWeb } from "../src/environment/web.ts";
import { ollama } from "../src/model/ollama.ts";
import { createTracer, ring } from "../src/trace.ts";

const question =
  process.argv.slice(2).join(" ") || "What is the current LTS version of Node.js, and when does it reach end of life?";

const provider = pickSearchProvider();
const model = ollama();
console.log(ring.model(`model: ${model.name}`), " ", ring.environment(`web search: ${provider.name}`), "\n");

const agent = createAgent(researcher, {
  model,
  env: withWeb(noEnvironment(), provider),
  onEvent: createTracer({ tokens: false }),
});

const result = await agent.run(question);
console.log(`\n${ring.agent(result.text)}\n`);
console.log(ring.dim("The model never touched the internet. It asked for searches and pages; the harness fetched them and fenced the text off as untrusted."));
