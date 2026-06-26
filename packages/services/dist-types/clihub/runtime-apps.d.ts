import { type RuntimeAppCatalogSource, type RuntimeAppOperationRecord, type RuntimeAppOperationType, type RuntimeInstalledAppRecord } from "@agent-space/db";
import type { RuntimeAppContextEntry, RuntimeAppInstallPlan } from "@agent-space/domain";
export interface RuntimeAppOperationRequestResult {
    operation: RuntimeAppOperationRecord;
    installPlan: RuntimeAppInstallPlan;
}
export declare function assertCanManageRuntimeAppsSync(input: {
    workspaceId: string;
    actorUserId?: string;
}): void;
export declare function requestRuntimeAppOperationSync(input: {
    workspaceId: string;
    runtimeId: string;
    source: RuntimeAppCatalogSource;
    name: string;
    operation: RuntimeAppOperationType;
    actorUserId?: string;
    confirmHighRisk?: boolean;
}): RuntimeAppOperationRequestResult;
export declare function listRuntimeAppsForRuntimeSync(input: {
    workspaceId: string;
    runtimeId: string;
}): RuntimeInstalledAppRecord[];
export declare function listRuntimeAppOperationsForRuntimeSync(input: {
    workspaceId: string;
    runtimeId: string;
    limit?: number;
}): RuntimeAppOperationRecord[];
export declare function listRuntimeAppContextEntriesForRuntimeSync(input: {
    workspaceId: string;
    runtimeId: string;
}): RuntimeAppContextEntry[];
export declare function readRuntimeAppAvailabilityForSkillSync(input: {
    workspaceId: string;
    runtimeId: string;
    source: RuntimeAppCatalogSource;
    name: string;
}): "available" | "unavailable";
export interface CliHubReadinessView {
    checkedAt?: string;
    python: {
        available: boolean;
        version?: string;
        error?: string;
    };
    pip: {
        available: boolean;
        version?: string;
        error?: string;
    };
    cliHub: {
        available: boolean;
        version?: string;
        error?: string;
    };
    npm: {
        available: boolean;
        version?: string;
        error?: string;
    };
    uv: {
        available: boolean;
        version?: string;
        error?: string;
    };
}
export declare function readCliHubReadinessFromRuntimeMetadata(metadataJson: string): CliHubReadinessView;
export declare function readCliHubReadinessForRuntimeSync(input: {
    workspaceId: string;
    runtimeId: string;
    runtimeMetadataJson?: string;
}): CliHubReadinessView;
export declare function normalizeCliHubReadiness(value: unknown): CliHubReadinessView;
