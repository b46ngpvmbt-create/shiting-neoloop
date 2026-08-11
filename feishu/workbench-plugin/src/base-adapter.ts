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
  tables: BaseTableSummary[];
};

export interface WorkbenchBaseAdapter {
  getContext(): Promise<BaseContext>;
  listTables(): Promise<BaseTableSummary[]>;
  openTable(tableKey: string): Promise<void>;
}

type LarkTableMeta = { id: string; name: string };
type LarkRecordPage = { total: number };
type LarkTableLike = {
  id?: string;
  getRecordsByPage?: (input: { pageSize: number }) => Promise<LarkRecordPage>;
};

export type LarkBaseSdkLike = {
  base: {
    getTableMetaList: () => Promise<LarkTableMeta[]>;
    getTableById: (tableId: string) => Promise<LarkTableLike>;
  };
  bridge?: {
    getLocale?: () => Promise<string>;
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
      const [tables, locale] = await Promise.all([
        listTables(),
        sdk.bridge?.getLocale?.().catch(() => "zh-CN") ?? Promise.resolve("zh-CN"),
      ]);
      return { mode: "lark", role, locale, tables };
    },
    listTables,
    async openTable(tableKey) {
      const table = (await listTables()).find((item) => item.key === tableKey);
      if (!table?.id) throw new Error(`${fallbackTable(tableKey).name} 尚未映射到当前 Base`);
      if (sdk.ui?.switchToTable) {
        await sdk.ui.switchToTable(table.id);
        return;
      }
      await sdk.base.getTableById(table.id);
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
        tables: tables.map((table) => ({ ...table })),
      };
    },
    async listTables() {
      return tables.map((table) => ({ ...table }));
    },
    async openTable(tableKey) {
      if (!tables.some((table) => table.key === tableKey)) {
        throw new Error(`Unknown table key: ${tableKey}`);
      }
    },
  };
}
