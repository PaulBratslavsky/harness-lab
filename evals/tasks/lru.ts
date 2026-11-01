// Stateful logic with time. Several rules interact (recency, capacity, expiry),
// and the checks use a fake clock so timing is exact.
import { testFile, type EvalTask } from "../task.ts";

const SPEC = `# LRU cache with expiry

Create \`lru.mjs\` exporting \`class LRUCache\`.

\`new LRUCache(capacity, ttlMs, now = () => Date.now())\`

- \`set(key, value)\` stores a value. Setting an existing key replaces its value.
- \`get(key)\` returns the value, or \`undefined\` if it's missing or expired.
- \`size\` is a getter: the number of entries that are not expired.
- \`now\` returns the current time in milliseconds. Tests pass a fake clock.

Rules:

1. When a \`set\` of a new key would go over \`capacity\`, remove the least recently used entry first.
2. Both a successful \`get\` and a \`set\` count as using an entry.
3. An entry stored at time \`t\` is expired once \`now() - t >= ttlMs\`.
4. A \`get\` does **not** reset the expiry time. A \`set\` does.
`;

/** Each hidden check gets a fresh cache class and a controllable clock. */
const withCache = (fn: (LRU: any, clock: { t: number; now: () => number }) => boolean) => async (load: (f: string) => Promise<any>) => {
  const { LRUCache } = await load("lru.mjs");
  const clock = { t: 0, now: () => clock.t };
  return fn(LRUCache, clock);
};

export const lru: EvalTask = {
  id: "lru",
  title: "Stateful logic with a clock",
  prompt: "Implement lru.mjs as described in SPEC.md.",
  files: { "SPEC.md": SPEC },
  visibleTests: testFile(
    `import { LRUCache } from "./lru.mjs";`,
    `
const clock = { t: 0 };
const now = () => clock.t;
eq("set and get", () => { const c = new LRUCache(2, 1000, now); c.set("a", 1); return c.get("a"); }, 1);
eq("evicts oldest", () => { const c = new LRUCache(2, 1000, now); c.set("a", 1); c.set("b", 2); c.set("c", 3); return [c.get("a"), c.get("b"), c.get("c")]; }, [undefined, 2, 3]);
eq("expires", () => { clock.t = 0; const c = new LRUCache(2, 100, now); c.set("a", 1); clock.t = 100; return c.get("a"); }, undefined);
`,
  ),
  hidden: [
    { name: "set and get", run: withCache((LRU, k) => { const c = new LRU(2, 1000, k.now); c.set("a", 1); return c.get("a") === 1; }) },
    {
      name: "evicts least recent",
      run: withCache((LRU, k) => { const c = new LRU(2, 1000, k.now); c.set("a", 1); c.set("b", 2); c.set("c", 3); return c.get("a") === undefined && c.get("b") === 2 && c.get("c") === 3; }),
    },
    {
      name: "get counts as use",
      run: withCache((LRU, k) => { const c = new LRU(2, 1000, k.now); c.set("a", 1); c.set("b", 2); c.get("a"); c.set("c", 3); return c.get("b") === undefined && c.get("a") === 1; }),
    },
    {
      name: "replace keeps size",
      run: withCache((LRU, k) => { const c = new LRU(2, 1000, k.now); c.set("a", 1); c.set("a", 2); return c.get("a") === 2 && c.size === 1; }),
    },
    {
      name: "expires at ttl",
      run: withCache((LRU, k) => { const c = new LRU(2, 100, k.now); c.set("a", 1); k.t = 99; const before = c.get("a"); k.t = 100; return before === 1 && c.get("a") === undefined; }),
    },
    {
      name: "get doesn't refresh expiry",
      run: withCache((LRU, k) => { const c = new LRU(2, 100, k.now); c.set("a", 1); k.t = 50; c.get("a"); k.t = 100; return c.get("a") === undefined; }),
    },
    {
      name: "set refreshes expiry",
      run: withCache((LRU, k) => { const c = new LRU(2, 100, k.now); c.set("a", 1); k.t = 50; c.set("a", 2); k.t = 120; return c.get("a") === 2; }),
    },
    {
      name: "size skips expired",
      run: withCache((LRU, k) => { const c = new LRU(3, 100, k.now); c.set("a", 1); k.t = 60; c.set("b", 2); k.t = 100; return c.size === 1; }),
    },
    {
      name: "expired entry doesn't block new ones",
      run: withCache((LRU, k) => { const c = new LRU(2, 100, k.now); c.set("a", 1); k.t = 100; c.set("b", 2); c.set("c", 3); return c.get("b") === 2 && c.get("c") === 3; }),
    },
  ],
  reference: {
    "lru.mjs": `export class LRUCache {
  constructor(capacity, ttlMs, now = () => Date.now()) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map(); // insertion order = recency order
  }
  #expired(entry) {
    return this.now() - entry.at >= this.ttlMs;
  }
  #purge() {
    for (const [k, e] of this.map) if (this.#expired(e)) this.map.delete(k);
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.#expired(e)) { this.map.delete(key); return undefined; }
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  set(key, value) {
    this.#purge();
    this.map.delete(key);
    if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, at: this.now() });
  }
  get size() {
    this.#purge();
    return this.map.size;
  }
}
`,
  },
};
