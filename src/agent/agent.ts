// The dashed ring. "An agent is a model harnessed in an environment."
// It isn't a separate machine: it's a name for the combination. That's why
// this file is tiny. An AgentSpec is just configuration (who you are, which
// tools you get), and createAgent() just wires model + harness + environment.

import type { Environment } from "../environment/environment.ts";
import { createHarness, type Harness, type HarnessOptions } from "../harness/harness.ts";
import type { Tool } from "../harness/tool.ts";
import type { Model } from "../model/types.ts";

export interface AgentSpec {
  name: string;
  description: string;
  /** The agent's role and working style. Becomes the top of the system prompt. */
  instructions: string;
  tools: Tool[];
  maxTurns?: number;
}

export const defineAgent = (spec: AgentSpec) => spec;

export interface AgentWiring extends Omit<HarnessOptions, "system" | "tools" | "model" | "env"> {
  model: Model;
  env?: Environment;
}

export function createAgent(spec: AgentSpec, wiring: AgentWiring): Harness {
  const system = [
    spec.instructions.trim(),
    wiring.env ? `## Your environment\n${wiring.env.describe()}` : "",
    `Today is ${new Date().toDateString()}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return createHarness({
    maxTurns: spec.maxTurns,
    ...wiring,
    system,
    tools: spec.tools,
  });
}
