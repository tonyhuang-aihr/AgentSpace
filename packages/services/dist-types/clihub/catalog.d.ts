import { listRuntimeAppCatalogItemsSync, readRuntimeAppCatalogHealthSync, upsertRuntimeAppCatalogItemsSync, type RuntimeAppCatalogItemRecord, type RuntimeAppCatalogSource, type UpsertRuntimeAppCatalogItemInput } from "@agent-space/db";
export declare const CLIHUB_HARNESS_REGISTRY_URL = "https://hkuds.github.io/CLI-Anything/registry.json";
export declare const CLIHUB_PUBLIC_REGISTRY_URL = "https://hkuds.github.io/CLI-Anything/public_registry.json";
export declare const CLIHUB_PUBLIC_REGISTRY_FALLBACK_URL = "https://raw.githubusercontent.com/HKUDS/CLI-Anything/main/public_registry.json";
export interface CliHubCatalogSyncResult {
    status: "fresh" | "stale";
    itemCount: number;
    syncedCount: number;
    syncedAt?: string;
    errors: string[];
}
export declare function syncCliHubCatalog(options?: {
    fetchImpl?: typeof fetch;
    now?: Date;
    upsertItemsSync?: typeof upsertRuntimeAppCatalogItemsSync;
    readHealthSync?: typeof readRuntimeAppCatalogHealthSync;
}): Promise<CliHubCatalogSyncResult>;
export declare function listCliHubCatalogItems(options?: Parameters<typeof listRuntimeAppCatalogItemsSync>[0]): RuntimeAppCatalogItemRecord[];
export declare function readCliHubCatalogItem(source: RuntimeAppCatalogSource, name: string): RuntimeAppCatalogItemRecord | null;
export declare function readCliHubCatalogHealth(): ReturnType<typeof readRuntimeAppCatalogHealthSync>;
export declare function normalizeCliHubRegistryPayload(source: RuntimeAppCatalogSource, payload: unknown, syncedAt: string): UpsertRuntimeAppCatalogItemInput[];
