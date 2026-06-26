import type { RuntimeAppCatalogItemRecord, RuntimeAppCatalogSource, RuntimeAppOperationRecord, RuntimeAppOperationStatus, RuntimeAppOperationType, RuntimeAppSkillBindingRecord, RuntimeInstalledAppRecord } from "./types.ts";
export interface UpsertRuntimeAppCatalogItemInput {
    source: RuntimeAppCatalogSource;
    name: string;
    displayName: string;
    description?: string;
    version?: string;
    category?: string;
    entryPoint?: string;
    installStrategy?: RuntimeAppCatalogItemRecord["installStrategy"];
    installCmd?: string;
    uninstallCmd?: string;
    updateCmd?: string;
    skillMd?: string;
    requiresText?: string;
    homepage?: string;
    registryJson?: string;
    syncedAt?: string;
}
export interface CreateRuntimeAppOperationInput {
    workspaceId?: string;
    runtimeId: string;
    appSource: RuntimeAppCatalogSource;
    appName: string;
    operation: RuntimeAppOperationType;
    requestedByUserId?: string;
    commandPlanJson: string;
}
export interface CompleteRuntimeAppOperationInput {
    operationId: string;
    workspaceId?: string;
    safeStdoutTail?: string;
    safeStderrTail?: string;
    installedApp?: {
        displayName: string;
        version?: string;
        entryPoint?: string;
        installStrategy?: RuntimeInstalledAppRecord["installStrategy"];
        metadataJson?: string;
    };
}
export interface FailRuntimeAppOperationInput {
    operationId: string;
    workspaceId?: string;
    safeStdoutTail?: string;
    safeStderrTail?: string;
    errorCode?: string;
    errorMessage: string;
}
export declare function upsertRuntimeAppCatalogItemsSync(items: UpsertRuntimeAppCatalogItemInput[]): number;
export declare function listRuntimeAppCatalogItemsSync(options?: {
    source?: RuntimeAppCatalogSource;
    query?: string;
    category?: string;
    limit?: number;
}): RuntimeAppCatalogItemRecord[];
export declare function readRuntimeAppCatalogItemSync(source: RuntimeAppCatalogSource, name: string): RuntimeAppCatalogItemRecord | null;
export declare function readRuntimeAppCatalogHealthSync(): {
    itemCount: number;
    lastSyncedAt?: string;
    stale: boolean;
};
export declare function listRuntimeInstalledAppsSync(options?: {
    workspaceId?: string;
    runtimeId?: string;
    enabledOnly?: boolean;
}): RuntimeInstalledAppRecord[];
export declare function readRuntimeInstalledAppSync(input: {
    workspaceId?: string;
    runtimeId: string;
    source: RuntimeAppCatalogSource;
    name: string;
}): RuntimeInstalledAppRecord | null;
export declare function createRuntimeAppOperationSync(input: CreateRuntimeAppOperationInput): RuntimeAppOperationRecord;
export declare function readRuntimeAppOperationSync(operationId: string, workspaceId?: string): RuntimeAppOperationRecord | null;
export declare function listRuntimeAppOperationsSync(options?: {
    workspaceId?: string;
    runtimeId?: string;
    status?: RuntimeAppOperationStatus;
    limit?: number;
}): RuntimeAppOperationRecord[];
export declare function claimNextRuntimeAppOperationForRuntimeSync(input: {
    workspaceId?: string;
    runtimeId: string;
}): RuntimeAppOperationRecord | null;
export declare function startRuntimeAppOperationSync(operationId: string, workspaceId?: string): RuntimeAppOperationRecord;
export declare function completeRuntimeAppOperationSync(input: CompleteRuntimeAppOperationInput): RuntimeAppOperationRecord;
export declare function failRuntimeAppOperationSync(input: FailRuntimeAppOperationInput): RuntimeAppOperationRecord;
export declare function upsertRuntimeAppSkillBindingSync(input: {
    workspaceId?: string;
    runtimeAppId: string;
    skillId: string;
    source: RuntimeAppCatalogSource;
    name: string;
}): RuntimeAppSkillBindingRecord;
export declare function listRuntimeAppSkillBindingsSync(workspaceId?: string): RuntimeAppSkillBindingRecord[];
