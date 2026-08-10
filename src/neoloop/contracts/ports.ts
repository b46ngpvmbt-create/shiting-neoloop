import type {
  AiNodeEnvelope,
  AiNodeId,
  AuditRecord,
  ClockSource,
  IngestRequest,
  JsonValue,
  Notification,
  ObjectReference,
  StoredRawFeedback,
} from "./model.js";

export interface Clock {
  readonly source: ClockSource;
  now(): Date;
}

export interface IdGenerator {
  nextId(namespace: string): string;
}

export interface Repository {
  findRawFeedbackByIdempotencyKey(idempotencyKey: string): Promise<StoredRawFeedback | null>;
  insertRawFeedbackIfAbsent(
    record: StoredRawFeedback,
  ): Promise<{ inserted: boolean; record: StoredRawFeedback }>;
}

export interface AiNodeRunRequest<TInput extends JsonValue> {
  node: AiNodeId;
  mode: string;
  version: string;
  object_ref: ObjectReference;
  input: TInput;
}

export interface AiNodeRunner {
  run<TInput extends JsonValue, TOutput extends JsonValue>(
    request: AiNodeRunRequest<TInput>,
  ): Promise<AiNodeEnvelope<TOutput>>;
}

export interface AuditSink {
  append(record: AuditRecord): Promise<void>;
}

export interface Notifier {
  notify(notification: Notification): Promise<void>;
}

export interface IngestPorts {
  clock: Clock;
  ids: IdGenerator;
  repository: Repository;
}

export interface IngestCommand {
  request: IngestRequest;
}
