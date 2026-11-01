// Follow a spec that lives in a file. The prompt says almost nothing, so the
// agent has to read SPEC.md, and handle the error cases it describes.
import { throws, testFile, type EvalTask } from "../task.ts";

const SPEC = `# Durations

Create \`duration.mjs\` with two named exports.

## parseDuration(text) -> number of seconds

- Units: \`d\` (86400 s), \`h\` (3600 s), \`m\` (60 s), \`s\` (1 s).
- The text is one or more parts, each a whole number followed by a unit: "1h30m", "2d", "45s", "1d2h3m4s".
- Spaces between parts are allowed: "1h 30m".
- Units are case-insensitive: "1H" is one hour.
- Parts may come in any order: "30m1h" is 5400.
- Each unit may appear at most once. "1h1h" is invalid.
- Throw an Error for anything invalid: empty text, unknown units ("5x"), a missing number ("h"), repeated units, or leftover characters.

## formatDuration(seconds) -> text

- Largest units first, zero parts left out: 5400 -> "1h30m", 90061 -> "1d1h1m1s", 3600 -> "1h".
- 0 -> "0s".
`;

export const duration: EvalTask = {
  id: "duration",
  title: "Follow a spec in a file",
  prompt: "Implement duration.mjs exactly as described in SPEC.md.",
  files: { "SPEC.md": SPEC },
  visibleTests: testFile(
    `import { parseDuration, formatDuration } from "./duration.mjs";`,
    `
eq("1h30m", () => parseDuration("1h30m"), 5400);
eq("2d", () => parseDuration("2d"), 172800);
eq("format 5400", () => formatDuration(5400), "1h30m");
throws("empty", () => parseDuration(""));
`,
  ),
  hidden: [
    { name: "parse 1h30m", run: async (load) => (await load("duration.mjs")).parseDuration("1h30m") === 5400 },
    { name: "parse 2d", run: async (load) => (await load("duration.mjs")).parseDuration("2d") === 172800 },
    { name: "spaces", run: async (load) => (await load("duration.mjs")).parseDuration("1h 30m") === 5400 },
    { name: "case-insensitive", run: async (load) => (await load("duration.mjs")).parseDuration("1H") === 3600 },
    { name: "any order", run: async (load) => (await load("duration.mjs")).parseDuration("30m1h") === 5400 },
    { name: "throws on empty", run: async (load) => { const m = await load("duration.mjs"); return throws(() => m.parseDuration("")); } },
    { name: "throws on unknown unit", run: async (load) => { const m = await load("duration.mjs"); return throws(() => m.parseDuration("5x")); } },
    { name: "throws on repeated unit", run: async (load) => { const m = await load("duration.mjs"); return throws(() => m.parseDuration("1h1h")); } },
    { name: "format 5400", run: async (load) => (await load("duration.mjs")).formatDuration(5400) === "1h30m" },
    { name: "format 0", run: async (load) => (await load("duration.mjs")).formatDuration(0) === "0s" },
    { name: "format 90061", run: async (load) => (await load("duration.mjs")).formatDuration(90061) === "1d1h1m1s" },
  ],
  reference: {
    "duration.mjs": `const UNITS = { d: 86400, h: 3600, m: 60, s: 1 };

export function parseDuration(text) {
  const src = String(text).toLowerCase().replace(/\\s+/g, "");
  if (!src) throw new Error("empty duration");
  const seen = new Set();
  let total = 0;
  let rest = src;
  while (rest) {
    const m = /^(\\d+)([dhms])/.exec(rest);
    if (!m) throw new Error("invalid duration: " + text);
    if (seen.has(m[2])) throw new Error("repeated unit: " + m[2]);
    seen.add(m[2]);
    total += Number(m[1]) * UNITS[m[2]];
    rest = rest.slice(m[0].length);
  }
  return total;
}

export function formatDuration(seconds) {
  if (seconds === 0) return "0s";
  let out = "";
  let left = seconds;
  for (const [unit, size] of Object.entries(UNITS)) {
    const n = Math.floor(left / size);
    if (n) out += n + unit;
    left -= n * size;
  }
  return out;
}
`,
  },
};
