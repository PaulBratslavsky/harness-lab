// The original warm-up task from example 5. Easy for 9B+ models.
import { testFile, type EvalTask } from "../task.ts";

const CASES: [string, string][] = [
  ["Hello World", "hello-world"],
  ["  Café & Crème brûlée! ", "cafe-and-creme-brulee"],
  ["a--b__c", "a-b-c"],
  ["", ""],
  ["Top 10 Tips", "top-10-tips"],
  ["Ünïcödé", "unicode"],
  ["---Leading and trailing---", "leading-and-trailing"],
  ["Rock & Roll & Jazz", "rock-and-roll-and-jazz"],
];
const visible = CASES.filter((_, i) => [0, 1, 2, 4, 6].includes(i));

export const slugify: EvalTask = {
  id: "slugify",
  title: "Write a slugify function",
  prompt: `Create slugify.mjs exporting a named function slugify(text) (ES module: \`export function slugify(text)\`).
Rules: lowercase; strip accents (é -> e); "&" becomes the word "and"; every run of other non-letter/non-digit characters becomes a single "-"; no leading or trailing "-".`,
  files: {},
  visibleTests: testFile(
    `import { slugify } from "./slugify.mjs";`,
    visible.map(([input, want]) => `eq(${JSON.stringify(input)}, () => slugify(${JSON.stringify(input)}), ${JSON.stringify(want)});`).join("\n"),
  ),
  notes: '- Tip: `text.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")` strips accents.',
  hidden: CASES.map(([input, want]) => ({
    name: JSON.stringify(input),
    run: async (load) => (await load("slugify.mjs")).slugify(input) === want,
  })),
  reference: {
    "slugify.mjs": `export function slugify(text) {
  return text
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
`,
  },
};
