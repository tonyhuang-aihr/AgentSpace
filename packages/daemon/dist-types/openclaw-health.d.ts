import type { ProviderHealthSnapshot } from "@agent-space/domain";
export type OpenClawHealthStatus = "healthy" | "degraded" | "broken" | "unknown";
export type OpenClawProviderErrorCategory = "auth" | "profile" | "model" | "tool" | "protocol" | "runtime" | "configuration";
export type OpenClawProviderErrorCode = "provider.cli_missing" | "provider.auth_invalid" | "provider.profile_missing" | "provider.model_unavailable" | "provider.session_invalid" | "provider.tool_missing" | "provider.tool_unauthorized" | "provider.tool_permission_denied" | "provider.empty_response" | "provider.protocol_parse_failed" | "provider.timeout" | "provider.runtime_generic_failure";
export interface OpenClawProviderError {
    provider: "openclaw";
    code: OpenClawProviderErrorCode;
    category: OpenClawProviderErrorCategory;
    message: string;
    rawProviderMessage: string;
}
export interface OpenClawDaemonAuthHealth {
    provider: "openclaw";
    status: OpenClawHealthStatus;
    usable: boolean;
    checkedAt: string;
    authSource: {
        profile?: string;
        openclawConfigPath: string;
        authProfilesPath?: string;
        modelsPath?: string;
    };
    error?: OpenClawProviderError;
    details: {
        profile?: string;
        model?: string;
        hasExplicitConfigPath: boolean;
        hasOpenClawConfig: boolean;
        hasTaskAuthProfiles: boolean;
        hasTaskModels: boolean;
        requiresTaskFiles: boolean;
        authProfileCount?: number;
    };
}
export declare function inspectOpenClawDaemonAuthHealth(input?: {
    workDir?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    profile?: string;
    model?: string;
    requireTaskFiles?: boolean;
    now?: Date;
}): OpenClawDaemonAuthHealth;
export declare function buildOpenClawProviderHealthSnapshot(health: OpenClawDaemonAuthHealth): ProviderHealthSnapshot;
export declare function normalizeOpenClawProviderError(rawMessage: string): OpenClawProviderError | undefined;
