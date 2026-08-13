import { bitable } from "@lark-base-open/js-sdk";
import { BASE_TABLES, type WorkbenchRole } from "./policy";

export type BaseTableSummary = {
  key: string;
  id: string | null;
  name: string;
  count: number;
  available: boolean;
};

export type BaseContext = {
  mode: "lark" | "standalone-preview";
  role: WorkbenchRole;
  locale: string;
  actorId: string;
  tables: BaseTableSummary[];
};

export type BaseRecordRow = {
  recordId: string;
  fields: Record<string, unknown>;
};

export type SyntheticRecordUpdate = {
  tableKey: string;
  recordId: string;
  expected: Readonly<Record<string, string>>;
  changes: Readonly<Record<string, string | number | boolean | null>>;
};

export type SyntheticRecordUpdateReceipt = {
  tableKey: string;
  recordId: string;
  changedFields: string[];
  readbackVerified: true;
};

export const SYNTHETIC_UPDATE_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  cases: new Set(["status", "evidence_summary"]),
  work_orders: new Set(["status", "disposition_evidence"]),
  improvements: new Set(["status", "human_conclusion"]),
  ai_audit: new Set(["review_action", "reviewed_by", "reviewed_at", "human_revision"]),
  knowledge_index: new Set(["approval_status", "citation_allowed_for_n7", "effective_at"]),
});

export interface WorkbenchBaseAdapter {
  getContext(): Promise<BaseContext>;
  listTables(): Promise<BaseTableSummary[]>;
  listRecords(tableKey: string, limit?: number): Promise<BaseRecordRow[]>;
  updateSyntheticRecord(input: SyntheticRecordUpdate): Promise<SyntheticRecordUpdateReceipt>;
  openTable(tableKey: string): Promise<void>;
}

type LarkTableMeta = { id: string; name: string };
type LarkFieldMeta = { id: string; name: string };
type LarkRecordPage = {
  total: number;
  hasMore?: boolean;
  pageToken?: number;
  records?: Array<{ recordId: string; fields: Record<string, unknown> }>;
};
type LarkTableLike = {
  id?: string;
  getFieldMetaList?: () => Promise<LarkFieldMeta[]>;
  getFieldByName?: (name: string) => Promise<LarkFieldLike>;
  getRecordsByPage?: (input: { pageSize: number; pageToken?: number; stringValue?: boolean }) => Promise<LarkRecordPage>;
  setRecord?: (recordId: string, value: { fields: Record<string, unknown> }) => Promise<string>;
};
type LarkFieldLike = {
  id: string;
  transform: (value: unknown) => unknown | Promise<unknown>;
  getCellString: (recordId: string) => Promise<string>;
  getValue: (recordId: string) => Promise<unknown>;
  getOptions?: () => Promise<Array<{ id: string; name: string }>>;
};

export type LarkBaseSdkLike = {
  base: {
    getTableMetaList: () => Promise<LarkTableMeta[]>;
    getTableById: (tableId: string) => Promise<LarkTableLike>;
  };
  bridge?: {
    getLocale?: () => Promise<string>;
    getUserId?: () => Promise<string>;
  };
  ui?: {
    switchToTable?: (tableId: string) => Promise<void>;
  };
};

function fallbackTable(key: string): (typeof BASE_TABLES)[number] {
  const result = BASE_TABLES.find((table) => table.key === key);
  if (!result) throw new Error(`Unknown table key: ${key}`);
  return result;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}

function assertedUpdateFields(input: SyntheticRecordUpdate): string[] {
  const allowed = SYNTHETIC_UPDATE_FIELDS[input.tableKey];
  if (!allowed) throw new Error("当前数据表不允许工作台写入");
  const changedFields = Object.keys(input.changes).sort();
  if (!changedFields.length || changedFields.some((field) => !allowed.has(field))) {
    throw new Error("更新包含未授权字段");
  }
  if (changedFields.some((field) => !(field in input.expected))) {
    throw new Error("每个变更字段都必须绑定写前值");
  }
  return changedFields;
}

/**
 * Adapter boundary for the Base client SDK.
 *
 * The UI depends only on this adapter contract. Production binds it to the
 * official `@lark-base-open/js-sdk` singleton below; tests may pass a small
 * machine-verifiable compatible host without loading a Feishu page.
 */
export function createLarkBaseAdapter(
  sdk: LarkBaseSdkLike,
  role: WorkbenchRole = "owner",
): WorkbenchBaseAdapter {
  let tableCache: BaseTableSummary[] | null = null;

  async function resolveTable(tableKey: string): Promise<{ summary: BaseTableSummary; table: LarkTableLike }> {
    const summary = (await listTables()).find((item) => item.key === tableKey);
    if (!summary?.id) throw new Error(`${fallbackTable(tableKey).name} 尚未映射到当前 Base`);
    return { summary, table: await sdk.base.getTableById(summary.id) };
  }

  async function listTables(): Promise<BaseTableSummary[]> {
    if (tableCache) return tableCache.map((table) => ({ ...table }));
    const meta = await sdk.base.getTableMetaList();
    const byName = new Map(meta.map((table) => [table.name, table]));
    tableCache = await Promise.all(BASE_TABLES.map(async (contract) => {
      const tableMeta = byName.get(contract.name);
      if (!tableMeta) {
        return { key: contract.key, id: null, name: contract.name, count: 0, available: false };
      }
      let count: number = contract.count;
      try {
        const table = await sdk.base.getTableById(tableMeta.id);
        if (table.getRecordsByPage) {
          count = (await table.getRecordsByPage({ pageSize: 1 })).total;
        }
      } catch {
        // A missing count must not make the entire workbench unavailable.
      }
      return {
        key: contract.key,
        id: tableMeta.id,
        name: contract.name,
        count,
        available: true,
      };
    }));
    return tableCache.map((table) => ({ ...table }));
  }

  return {
    async getContext() {
      const [tables, locale, actorId] = await Promise.all([
        listTables(),
        sdk.bridge?.getLocale?.().catch(() => "zh-CN") ?? Promise.resolve("zh-CN"),
        sdk.bridge?.getUserId?.().catch(() => "unknown_owner") ?? Promise.resolve("unknown_owner"),
      ]);
      return { mode: "lark", role, locale, actorId, tables };
    },
    listTables,
    async listRecords(tableKey, limit = 200) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
        throw new Error("记录读取上限必须是 1–1000 的安全整数");
      }
      const { table } = await resolveTable(tableKey);
      if (!table.getFieldMetaList || !table.getRecordsByPage) {
        throw new Error(`${fallbackTable(tableKey).name} 不支持记录读取`);
      }
      const fieldMeta = await table.getFieldMetaList();
      const fieldNameById = new Map(fieldMeta.map((field) => [field.id, field.name]));
      const rows: BaseRecordRow[] = [];
      let pageToken: number | undefined;
      do {
        const page = await table.getRecordsByPage({
          pageSize: Math.min(200, limit - rows.length),
          ...(pageToken === undefined ? {} : { pageToken }),
          stringValue: true,
        });
        for (const record of page.records ?? []) {
          const fields: Record<string, unknown> = {};
          for (const [fieldId, value] of Object.entries(record.fields)) {
            const fieldName = fieldNameById.get(fieldId);
            if (fieldName) fields[fieldName] = value;
          }
          rows.push({ recordId: record.recordId, fields });
          if (rows.length >= limit) break;
        }
        pageToken = page.hasMore ? page.pageToken : undefined;
      } while (pageToken !== undefined && rows.length < limit);
      return rows;
    },
    async updateSyntheticRecord(input) {
      const changedFields = assertedUpdateFields(input);
      const { table } = await resolveTable(input.tableKey);
      if (!table.getFieldByName || !table.setRecord) throw new Error(`${fallbackTable(input.tableKey).name} 不支持安全更新`);
      const scopeField = await table.getFieldByName("data_scope");
      if ((await scopeField.getCellString(input.recordId)).trim() !== "synthetic_experiment") {
        throw new Error("仅允许更新 synthetic_experiment 记录");
      }
      const fields = new Map<string, LarkFieldLike>();
      for (const fieldName of changedFields) {
        const field = await table.getFieldByName(fieldName);
        fields.set(fieldName, field);
        const actual = await field.getCellString(input.recordId);
        if (actual !== input.expected[fieldName]) throw new Error(`record_changed_before_commit:${fieldName}`);
      }
      const transformedEntries = await Promise.all(changedFields.map(async (fieldName) => {
        const field = fields.get(fieldName)!;
        const nextValue = input.changes[fieldName];
        if (field.getOptions && typeof nextValue === "string") {
          const options = await field.getOptions();
          if (!options.some((option) => option.id === nextValue || option.name === nextValue)) {
            throw new Error(`select_option_not_preconfigured:${fieldName}`);
          }
        }
        return [field.id, await field.transform(nextValue)] as const;
      }));
      await table.setRecord(input.recordId, { fields: Object.fromEntries(transformedEntries) });
      for (const fieldName of changedFields) {
        const field = fields.get(fieldName)!;
        const expectedValue = transformedEntries.find(([fieldId]) => fieldId === field.id)?.[1];
        const actualValue = await field.getValue(input.recordId);
        if (canonical(actualValue) !== canonical(expectedValue)) throw new Error(`write_readback_mismatch:${fieldName}`);
      }
      return { tableKey: input.tableKey, recordId: input.recordId, changedFields, readbackVerified: true };
    },
    async openTable(tableKey) {
      const { summary: table } = await resolveTable(tableKey);
      if (sdk.ui?.switchToTable) {
        await sdk.ui.switchToTable(table.id!);
        return;
      }
      window.dispatchEvent(new CustomEvent("neoloop:open-table-request", {
        detail: { tableId: table.id, tableKey },
      }));
    },
  };
}

/** Production binding. This never falls back to synthetic data. */
export function createOfficialLarkBaseAdapter(
  role: WorkbenchRole = "judge",
): WorkbenchBaseAdapter {
  return createLarkBaseAdapter(bitable as unknown as LarkBaseSdkLike, role);
}

/** Public read-only preview binding. It never contacts or mutates the Base. */
export function createPublicPreviewBaseAdapter(
  role: WorkbenchRole = "judge",
): WorkbenchBaseAdapter {
  const preview = createMockBaseAdapter(role);
  return {
    ...preview,
    async updateSyntheticRecord() {
      throw new Error("公开预览不允许写入 Base");
    },
  };
}

export function createMockBaseAdapter(role: WorkbenchRole = "owner"): WorkbenchBaseAdapter {
  const tables: BaseTableSummary[] = BASE_TABLES.map((table, index) => ({
    key: table.key,
    id: `synthetic-table-${String(index + 1).padStart(2, "0")}`,
    name: table.name,
    count: table.count,
    available: true,
  }));
  return {
    async getContext() {
      return {
        mode: "standalone-preview",
        role,
        locale: "zh-CN",
        actorId: "synthetic-owner",
        tables: tables.map((table) => ({ ...table })),
      };
    },
    async listTables() {
      return tables.map((table) => ({ ...table }));
    },
    async listRecords() {
      return [];
    },
    async updateSyntheticRecord(input) {
      const changedFields = assertedUpdateFields(input);
      return { tableKey: input.tableKey, recordId: input.recordId, changedFields, readbackVerified: true };
    },
    async openTable(tableKey) {
      if (!tables.some((table) => table.key === tableKey)) {
        throw new Error(`Unknown table key: ${tableKey}`);
      }
    },
  };
}
