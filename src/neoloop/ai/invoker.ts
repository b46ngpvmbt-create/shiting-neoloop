import type {
  AiNodeId,
  DataScope,
  JsonValue,
  ObjectReference,
} from "../contracts/model.js";

export interface AiNodeInvocation {
  node: AiNodeId;
  mode: string;
  version: string;
  run_id: string;
  object_ref: ObjectReference;
  input_hash: string;
  input: JsonValue;
  retry_count: 0 | 1;
  repair_errors: string[];
  data_scope: DataScope;
  security_context: {
    original_text_trust: "untrusted" | "not_present";
    prompt_injection_detected: boolean;
    instructions_are_data_only: true;
    exposed_capabilities: [];
  };
}

export interface AiNodeInvoker {
  invoke(invocation: AiNodeInvocation): Promise<unknown>;
}
