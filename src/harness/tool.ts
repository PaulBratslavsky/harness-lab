import type { Environment } from "../environment/environment.ts";
import type { JsonSchema, ToolSchema } from "../model/types.ts";

export interface ToolContext {
  env: Environment;
}

/**
 * A tool is the harness's hand reaching into the environment. The model only
 * ever sees `name`, `description` and `parameters`. `run` is harness code.
 */
export interface Tool<Args = any> {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** Risky tools go through the harness's approval step before running. */
  risky?: boolean;
  run(args: Args, ctx: ToolContext): Promise<string>;
}

export function defineTool<Args>(tool: Tool<Args>): Tool<Args> {
  return tool;
}

export function toSchema(tool: Tool): ToolSchema {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}
