import type { DaemonConnectionRecord, AgentRuntimeRecord, RegisteredDaemonSnapshot, RuntimeRegistrationInput } from "./types.ts";
export declare function registerDaemonRuntimesSync(input: {
    daemonKey: string;
    deviceName: string;
    workspaceId?: string;
    metadata?: Record<string, unknown>;
    runtimes: RuntimeRegistrationInput[];
}): RegisteredDaemonSnapshot;
export declare function heartbeatDaemonSync(daemonKey: string, options?: {
    metadata?: Record<string, unknown>;
    runtimes?: Array<{
        id?: string;
        provider?: string;
        metadata?: Record<string, unknown>;
    }>;
}): RegisteredDaemonSnapshot;
export declare function markDaemonOfflineSync(daemonKey: string, options?: {
    lastError?: string;
}): RegisteredDaemonSnapshot;
export declare function readDaemonSnapshotSync(daemonKey: string): RegisteredDaemonSnapshot;
export declare function readDaemonConnectionSync(daemonKey: string): DaemonConnectionRecord | null;
export declare function readAgentRuntimeSync(runtimeId: string): AgentRuntimeRecord | null;
export declare function deleteAgentRuntimeSync(input: {
    runtimeId: string;
    workspaceId?: string;
}): AgentRuntimeRecord | null;
export declare function listDaemonSnapshotsSync(workspaceId?: string): RegisteredDaemonSnapshot[];
export declare function pruneOfflineDaemonsSync(maxOfflineAgeMs: number, options?: {
    workspaceId?: string;
}): number;
