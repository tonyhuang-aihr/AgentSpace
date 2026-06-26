import { type RuntimeOnlineStatus, type RuntimeProviderHealth } from "@agent-space/domain";
export interface NormalizeRuntimeProviderHealthInput {
    runtimeStatus: RuntimeOnlineStatus;
    runtimeMetadata: Record<string, unknown>;
    lastError?: string;
}
export declare function normalizeRuntimeProviderHealth(input: NormalizeRuntimeProviderHealthInput): RuntimeProviderHealth;
