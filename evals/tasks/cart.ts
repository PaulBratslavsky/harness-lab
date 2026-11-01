// Fix bugs in existing code. The agent has to read the code and the spec,
// and find four separate bugs. Rewriting from scratch also works if it follows the spec.
import { same, testFile, type EvalTask } from "../task.ts";

const SPEC = `# Cart totals

\`cartTotal(items, coupon)\` in cart.mjs returns what the customer pays.

- \`items\` is an array of \`{ price, qty }\`. Prices are in dollars and may have cents.
- The subtotal is the sum of \`price * qty\` over **all** items. An empty cart costs 0.
- \`coupon\` is optional:
  - \`{ type: "percent", value: 10 }\` takes 10% off the subtotal.
  - \`{ type: "fixed", value: 5 }\` takes $5 off the subtotal.
- The total is never below 0.
- The result is rounded to cents (2 decimal places), e.g. 16.9915 -> 16.99.
`;

const BUGGY = `// Shopping cart totals. See SPEC.md.
export function cartTotal(items, coupon) {
  let subtotal = 0;
  for (let i = 1; i < items.length; i++) {
    subtotal += items[i].price * items[i].qty;
  }
  let discount = 0;
  if (coupon && coupon.type === "percent") {
    discount = coupon.value;
  } else if (coupon && coupon.type === "fixed") {
    discount = coupon.value;
  }
  const total = subtotal - discount;
  return Math.round(total);
}
`;

const check = (name: string, items: unknown, coupon: unknown, want: number) => ({
  name,
  run: async (load: (f: string) => Promise<any>) => same((await load("cart.mjs")).cartTotal(items, coupon), want),
});

export const cart: EvalTask = {
  id: "cart",
  title: "Fix bugs in existing code",
  prompt: "Customers report wrong totals from cartTotal in cart.mjs. Find and fix the bugs so it matches SPEC.md. Keep the same file and export.",
  files: { "SPEC.md": SPEC, "cart.mjs": BUGGY },
  visibleTests: testFile(
    `import { cartTotal } from "./cart.mjs";`,
    `
eq("one item", () => cartTotal([{ price: 10, qty: 2 }]), 20);
eq("cents", () => cartTotal([{ price: 1.25, qty: 3 }, { price: 2, qty: 1 }]), 5.75);
eq("percent coupon", () => cartTotal([{ price: 50, qty: 2 }], { type: "percent", value: 10 }), 90);
eq("fixed coupon", () => cartTotal([{ price: 20, qty: 1 }], { type: "fixed", value: 5 }), 15);
`,
  ),
  hidden: [
    check("one item", [{ price: 10, qty: 2 }], undefined, 20),
    check("cents", [{ price: 1.25, qty: 3 }, { price: 2, qty: 1 }], undefined, 5.75),
    check("percent coupon", [{ price: 50, qty: 2 }], { type: "percent", value: 10 }, 90),
    check("fixed coupon", [{ price: 20, qty: 1 }], { type: "fixed", value: 5 }, 15),
    check("never below zero", [{ price: 3, qty: 1 }], { type: "fixed", value: 10 }, 0),
    check("empty cart", [], undefined, 0),
    check("float rounding", [{ price: 0.1, qty: 3 }], undefined, 0.3),
    check("percent with cents", [{ price: 19.99, qty: 1 }], { type: "percent", value: 15 }, 16.99),
  ],
  reference: {
    "cart.mjs": `export function cartTotal(items, coupon) {
  let subtotal = 0;
  for (const item of items) subtotal += item.price * item.qty;
  let discount = 0;
  if (coupon?.type === "percent") discount = (subtotal * coupon.value) / 100;
  else if (coupon?.type === "fixed") discount = coupon.value;
  const total = Math.max(0, subtotal - discount);
  return Math.round(total * 100) / 100;
}
`,
  },
};
