import type { EvalTask } from "../task.ts";
import { cart } from "./cart.ts";
import { csv } from "./csv.ts";
import { currency } from "./currency.ts";
import { duration } from "./duration.ts";
import { lru } from "./lru.ts";
import { slugify } from "./slugify.ts";

/** The warm-up task (example 5) first, then the harder suite. */
export const allTasks: EvalTask[] = [slugify, cart, duration, currency, csv, lru];
export const hardTasks: EvalTask[] = [cart, duration, currency, csv, lru];

export function pickTasks(spec: string): EvalTask[] {
  if (spec === "all") return allTasks;
  if (spec === "hard") return hardTasks;
  const ids = spec.split(",").map((s) => s.trim());
  const picked = allTasks.filter((t) => ids.includes(t.id));
  const missing = ids.filter((id) => !allTasks.some((t) => t.id === id));
  if (missing.length) throw new Error(`Unknown task(s): ${missing.join(", ")}. Known: ${allTasks.map((t) => t.id).join(", ")}`);
  return picked;
}
