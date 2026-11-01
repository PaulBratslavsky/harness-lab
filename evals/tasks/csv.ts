// Process data with awkward edges: quoted commas, blank lines, Windows line
// endings, no rows. Hidden checks use different data than the sample file,
// so hard-coding the sample's answers doesn't work.
import { same, testFile, type EvalTask } from "../task.ts";

const SAMPLE = `date,product,quantity,unit_price
2026-03-01,Widget,4,2.50
2026-03-15,"Gizmo, Mini",2,7.25
2026-04-02,Widget,1,2.50
`;

const HIDDEN_CSV = `date,product,quantity,unit_price
2026-01-05,Widget,3,2.50
2026-01-20,"Gadget, Large",1,10.00
2026-02-02,Widget,2,2.50

2026-02-14,"Gadget, Large",2,10.00
2026-02-28,Doohickey,10,0.99
`;

const summarize = async (load: (f: string) => Promise<any>, text: string) => (await load("summary.mjs")).summarize(text);

export const csv: EvalTask = {
  id: "csv",
  title: "Summarise messy CSV data",
  prompt: `Write summary.mjs exporting summarize(csvText) for files like sales.csv (columns: date,product,quantity,unit_price).
Return { totalRevenue, topProduct, revenueByMonth }:
- revenue of a row = quantity * unit_price
- totalRevenue: sum of all revenue, rounded to 2 decimals
- topProduct: the product name with the highest total revenue
- revenueByMonth: object keyed "YYYY-MM", each value rounded to 2 decimals
Product names may contain commas inside double quotes. Ignore blank lines. Handle \\r\\n line endings.
If there are no data rows: totalRevenue 0, topProduct null, revenueByMonth {}.`,
  files: { "sales.csv": SAMPLE },
  visibleTests: testFile(
    `import { summarize } from "./summary.mjs";
import { readFileSync } from "node:fs";
const sample = readFileSync(new URL("./sales.csv", import.meta.url), "utf8");`,
    `
eq("total", () => summarize(sample).totalRevenue, 27);
eq("top product", () => summarize(sample).topProduct, "Gizmo, Mini");
eq("by month", () => summarize(sample).revenueByMonth, { "2026-03": 24.5, "2026-04": 2.5 });
`,
  ),
  hidden: [
    { name: "total", run: async (load) => (await summarize(load, HIDDEN_CSV)).totalRevenue === 52.4 },
    { name: "top product (quoted comma)", run: async (load) => (await summarize(load, HIDDEN_CSV)).topProduct === "Gadget, Large" },
    { name: "January", run: async (load) => (await summarize(load, HIDDEN_CSV)).revenueByMonth["2026-01"] === 17.5 },
    { name: "February (blank line)", run: async (load) => (await summarize(load, HIDDEN_CSV)).revenueByMonth["2026-02"] === 34.9 },
    { name: "only two months", run: async (load) => Object.keys((await summarize(load, HIDDEN_CSV)).revenueByMonth).length === 2 },
    { name: "CRLF line endings", run: async (load) => (await summarize(load, HIDDEN_CSV.replace(/\n/g, "\r\n"))).totalRevenue === 52.4 },
    {
      name: "no rows",
      run: async (load) => same(await summarize(load, "date,product,quantity,unit_price\n"), { totalRevenue: 0, topProduct: null, revenueByMonth: {} }),
    },
  ],
  reference: {
    "summary.mjs": `function parseLine(line) {
  const out = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const round = (n) => Math.round(n * 100) / 100;

export function summarize(csvText) {
  const lines = csvText.split(/\\r?\\n/).filter((l) => l.trim());
  const byProduct = {};
  const byMonth = {};
  let total = 0;
  for (const line of lines.slice(1)) {
    const [date, product, qty, price] = parseLine(line);
    const revenue = Number(qty) * Number(price);
    total += revenue;
    byProduct[product] = (byProduct[product] ?? 0) + revenue;
    const month = date.slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + revenue;
  }
  let topProduct = null;
  for (const [p, r] of Object.entries(byProduct)) if (topProduct === null || r > byProduct[topProduct]) topProduct = p;
  for (const m of Object.keys(byMonth)) byMonth[m] = round(byMonth[m]);
  return { totalRevenue: round(total), topProduct, revenueByMonth: byMonth };
}
`,
  },
};
