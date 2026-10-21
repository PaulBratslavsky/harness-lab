// RING 1: the model, alone.
// Text in, text out. No memory, no tools, no world. Watch it:
//   (a) guess at things it can't know (today's date)
//   (b) forget everything between calls (it's stateless)

import { ollama } from "../src/model/ollama.ts";
import { ring } from "../src/trace.ts";

const model = ollama();
console.log(ring.model(`model: ${model.name}\n`));

async function ask(content: string) {
  console.log(ring.agent(`> ${content}`));
  process.stdout.write(ring.model(""));
  const { stats } = await model.chat([{ role: "user", content }], {
    onToken: (t) => process.stdout.write(ring.model(t)),
  });
  console.log(ring.dim(`\n(${stats?.outputTokens} tokens, ${((stats?.ms ?? 0) / 1000).toFixed(1)}s)\n`));
}

await ask("What is today's date, and what is 48213 * 3779? Answer in one line.");
await ask("What did I just ask you?");

console.log(ring.dim("The date is a guess (it can't see a clock), the math may be off, and it has no memory of the first question."));
console.log(ring.dim("Next: npm run ex:2 wraps the same model in a harness."));
