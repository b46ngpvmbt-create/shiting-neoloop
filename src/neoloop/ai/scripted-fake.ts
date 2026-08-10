import type { AiNodeId, DataScope } from "../contracts/model.js";
import type { AiNodeInvocation, AiNodeInvoker } from "./invoker.js";

export type ScriptedAiStep =
  | { kind: "return"; value: unknown | ((invocation: AiNodeInvocation) => unknown) }
  | { kind: "throw"; error: string };

export interface ScriptedAiNodeInvokerOptions {
  data_scope: string;
  scripts: Partial<Record<AiNodeId, readonly ScriptedAiStep[]>>;
}

export class ScriptedAiNodeInvoker implements AiNodeInvoker {
  readonly calls: AiNodeInvocation[] = [];
  private readonly dataScope: DataScope;
  private readonly scripts: Partial<Record<AiNodeId, ScriptedAiStep[]>>;

  constructor(options: ScriptedAiNodeInvokerOptions) {
    if (options.data_scope !== "synthetic_experiment") {
      throw new Error("ScriptedAiNodeInvoker is restricted to synthetic_experiment");
    }
    this.dataScope = options.data_scope;
    this.scripts = Object.fromEntries(
      Object.entries(options.scripts).map(([node, steps]) => [node, [...steps]]),
    ) as Partial<Record<AiNodeId, ScriptedAiStep[]>>;
  }

  async invoke(invocation: AiNodeInvocation): Promise<unknown> {
    if (invocation.data_scope !== this.dataScope || invocation.data_scope !== "synthetic_experiment") {
      throw new Error("ScriptedAiNodeInvoker accepts synthetic_experiment invocations only");
    }
    this.calls.push({
      ...invocation,
      object_ref: { ...invocation.object_ref },
      repair_errors: [...invocation.repair_errors],
      security_context: { ...invocation.security_context, exposed_capabilities: [] },
    });
    const step = this.scripts[invocation.node]?.shift();
    if (!step) {
      throw new Error(`No scripted response remains for ${invocation.node}`);
    }
    if (step.kind === "throw") {
      throw new Error(step.error);
    }
    return typeof step.value === "function" ? step.value(invocation) : step.value;
  }
}
