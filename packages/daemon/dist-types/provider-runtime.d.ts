import type { DaemonProvider, ProviderErrorCategory, ProviderErrorCode, RuntimeAppContextEntry, RuntimeToolCapability } from "@agent-space/domain";
export interface ProviderRuntimeRecord {
    id: string;
    workspaceId: string;
    provider: DaemonProvider;
    name: string;
    version?: string;
    status: "online" | "offline";
    deviceInfo?: string;
    metadata: {
        executablePath: string;
        mode: "local" | "remote";
        providerHealth?: Record<string, unknown>;
        openClawProfile?: string;
        openClawModel?: string;
    };
}
export type RemoteRuntimeRecord = ProviderRuntimeRecord;
export interface DetectedProvider {
    provider: DaemonProvider;
    label: string;
    executablePath: string;
    version: string;
}
export interface ProviderTaskEvent {
    type: string;
    content?: string;
    tool?: string;
    inputJson?: Record<string, unknown>;
    output?: string;
}
export interface ProviderApprovalRequest {
    provider: DaemonProvider;
    runtimeId: string;
    sessionId?: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
    contentPreview: string;
}
export interface ProviderApprovalDecision {
    decision: "approved" | "rejected";
    comment?: string;
}
export interface ProviderTaskOptions {
    sessionId?: string;
    contextEnv?: Record<string, string>;
    taskTimeoutMs?: number;
    onEvent?: (event: ProviderTaskEvent) => void;
    onApprovalRequest?: (request: ProviderApprovalRequest) => Promise<ProviderApprovalDecision>;
    temporaryAllowedTools?: string[];
    runtimeApps?: RuntimeAppContextEntry[];
    runtimeToolCapabilities?: RuntimeToolCapability[];
}
type ProviderTaskFailureCategory = ProviderErrorCategory | "auth" | "profile" | "model";
export interface ProviderTaskStructuredError {
    provider: DaemonProvider;
    code: ProviderErrorCode;
    category?: ProviderTaskFailureCategory;
    message: string;
    rawProviderMessage?: string;
}
export declare function detectProviders(): DetectedProvider[];
export declare function runProviderTask(runtime: ProviderRuntimeRecord, prompt: string, workDir: string, options?: ProviderTaskOptions): Promise<{
    output: string;
    sessionId?: string;
}>;
export declare function resolveModelId(runtime: ProviderRuntimeRecord): string | undefined;
export declare function readNodeMetadata(serverUrl: string, runtimeName: string, runtimes?: ProviderRuntimeRecord[]): Record<string, unknown>;
export declare function buildProviderRuntimeMetadata(runtime: Pick<ProviderRuntimeRecord, "provider" | "metadata">): Record<string, unknown>;
export declare function readProviderTaskFailureMetadata(error: unknown): {
    sessionId?: string;
    workDir?: string;
    providerError?: ProviderTaskStructuredError;
} | undefined;
export declare function normalizeProviderTaskErrorCategory(category: ProviderTaskStructuredError["category"] | undefined): ProviderErrorCategory | undefined;
export {};
