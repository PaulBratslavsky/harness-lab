// Change two files that depend on each other. The details are in SPEC.md,
// including exact output formats that are easy to get slightly wrong.
import { throws, testFile, type EvalTask } from "../task.ts";

const SPEC = `# Multi-currency reports

## format.mjs: formatMoney(amount, currency = "USD")

| Currency | Example for 1234.5 | Rules |
|---|---|---|
| USD | \`$1,234.50\` | "$" prefix, "," between thousands, "." before 2 decimals |
| EUR | \`€1.234,50\` | "€" prefix, "." between thousands, "," before 2 decimals |
| JPY | \`¥1,235\` | "¥" prefix, "," between thousands, no decimals (round to whole yen) |

Any other currency code throws an Error.

## report.mjs: buildReport(rows)

- Each row is \`{ name, amount, currency }\`. If \`currency\` is missing, it's USD.
- One line per row: \`<name>: <formatted amount>\`, using the row's currency.
- Then one total line per currency, in the order each currency first appears:
  \`Total <CODE>: <formatted total>\`.
- Lines are joined with "\\n". No trailing newline.

Example:

\`\`\`
buildReport([{ name: "A", amount: 1000, currency: "EUR" }, { name: "B", amount: 5 }])

A: €1.000,00
B: $5.00
Total EUR: €1.000,00
Total USD: $5.00
\`\`\`
`;

export const currency: EvalTask = {
  id: "currency",
  title: "Change two files together",
  prompt: "Add multi-currency support to this project as described in SPEC.md. Both format.mjs and report.mjs need changes.",
  files: {
    "SPEC.md": SPEC,
    "format.mjs": `// Formatting helpers used by report.mjs.
export function formatMoney(amount) {
  return "$" + amount.toFixed(2);
}
`,
    "report.mjs": `import { formatMoney } from "./format.mjs";

// rows: [{ name, amount }]
export function buildReport(rows) {
  return rows.map((r) => \`\${r.name}: \${formatMoney(r.amount)}\`).join("\\n");
}
`,
  },
  visibleTests: testFile(
    `import { formatMoney } from "./format.mjs";
import { buildReport } from "./report.mjs";`,
    `
eq("USD", () => formatMoney(1234.5), "$1,234.50");
eq("EUR", () => formatMoney(1234.5, "EUR"), "€1.234,50");
eq("report", () => buildReport([{ name: "A", amount: 1000, currency: "EUR" }, { name: "B", amount: 5 }]), "A: €1.000,00\\nB: $5.00\\nTotal EUR: €1.000,00\\nTotal USD: $5.00");
`,
  ),
  hidden: [
    { name: "USD default", run: async (load) => (await load("format.mjs")).formatMoney(1234.5) === "$1,234.50" },
    { name: "EUR", run: async (load) => (await load("format.mjs")).formatMoney(1234.5, "EUR") === "€1.234,50" },
    { name: "JPY rounds", run: async (load) => (await load("format.mjs")).formatMoney(1234.5, "JPY") === "¥1,235" },
    { name: "small USD", run: async (load) => (await load("format.mjs")).formatMoney(5, "USD") === "$5.00" },
    { name: "millions", run: async (load) => (await load("format.mjs")).formatMoney(1000000) === "$1,000,000.00" },
    { name: "unknown throws", run: async (load) => { const m = await load("format.mjs"); return throws(() => m.formatMoney(1, "GBP")); } },
    {
      name: "report single",
      run: async (load) => (await load("report.mjs")).buildReport([{ name: "A", amount: 10 }]) === "A: $10.00\nTotal USD: $10.00",
    },
    {
      name: "report mixed",
      run: async (load) =>
        (await load("report.mjs")).buildReport([
          { name: "A", amount: 1000, currency: "EUR" },
          { name: "B", amount: 5 },
          { name: "C", amount: 250.5, currency: "EUR" },
        ]) === "A: €1.000,00\nB: $5.00\nC: €250,50\nTotal EUR: €1.250,50\nTotal USD: $5.00",
    },
  ],
  reference: {
    "format.mjs": `const FORMATS = {
  USD: { symbol: "$", thousands: ",", decimal: ".", decimals: 2 },
  EUR: { symbol: "€", thousands: ".", decimal: ",", decimals: 2 },
  JPY: { symbol: "¥", thousands: ",", decimal: ".", decimals: 0 },
};

export function formatMoney(amount, currency = "USD") {
  const f = FORMATS[currency];
  if (!f) throw new Error("Unknown currency: " + currency);
  const [whole, frac] = amount.toFixed(f.decimals).split(".");
  const grouped = whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, f.thousands);
  return f.symbol + grouped + (frac ? f.decimal + frac : "");
}
`,
    "report.mjs": `import { formatMoney } from "./format.mjs";

export function buildReport(rows) {
  const totals = new Map();
  const lines = rows.map((r) => {
    const cur = r.currency ?? "USD";
    totals.set(cur, (totals.get(cur) ?? 0) + r.amount);
    return \`\${r.name}: \${formatMoney(r.amount, cur)}\`;
  });
  for (const [cur, total] of totals) lines.push(\`Total \${cur}: \${formatMoney(total, cur)}\`);
  return lines.join("\\n");
}
`,
  },
};
