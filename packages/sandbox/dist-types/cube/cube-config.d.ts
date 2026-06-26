import type { SandboxConnectOptions, SandboxProvider } from "../types.ts";
export declare const SANDBOX_PROVIDER_ENV = "AGENT_SPACE_SANDBOX_PROVIDER";
export declare const LEGACY_SANDBOX_PROVIDER_ENV = "SANDBOX_PROVIDER";
export declare const CUBE_API_URL_ENV = "AGENT_SPACE_CUBE_API_URL";
export declare const LEGACY_CUBE_API_URL_ENV = "E2B_API_URL";
export declare const CUBE_API_KEY_ENV = "AGENT_SPACE_CUBE_API_KEY";
export declare const LEGACY_CUBE_API_KEY_ENV = "E2B_API_KEY";
export declare const CUBE_TEMPLATE_ID_ENV = "AGENT_SPACE_CUBE_TEMPLATE_ID";
export declare const LEGACY_CUBE_TEMPLATE_ID_ENV = "CUBE_TEMPLATE_ID";
export declare const CUBE_EXPERIMENTAL_ENABLE_ENV = "AGENT_SPACE_CUBE_ENABLE_EXPERIMENTAL";
export declare const CUBE_TIMEOUT_SECONDS_ENV = "AGENT_SPACE_CUBE_TIMEOUT_SECONDS";
export declare const CUBE_ALLOW_INTERNET_ENV = "AGENT_SPACE_CUBE_ALLOW_INTERNET";
export declare const CUBE_ALLOW_OUT_ENV = "AGENT_SPACE_CUBE_ALLOW_OUT";
export declare const CUBE_DENY_OUT_ENV = "AGENT_SPACE_CUBE_DENY_OUT";
export declare const CUBE_MOUNT_WORKDIR_ENV = "AGENT_SPACE_CUBE_MOUNT_WORKDIR";
export declare const CUBE_MOUNT_PATH_ENV = "AGENT_SPACE_CUBE_MOUNT_PATH";
export declare const CUBE_HOST_MOUNT_METADATA_KEY = "host-mount";
export declare const DEFAULT_CUBE_MOUNT_PATH = "/workspace";
export declare const DEFAULT_CUBE_API_REQUEST_TIMEOUT_MS = 30000;
export interface CubeSandboxNetworkConfig {
    allowOut?: string[];
    denyOut?: string[];
}
export interface CubeSandboxHostMount {
    hostPath: string;
    mountPath: string;
    readOnly: boolean;
}
export interface CubeSandboxConfig {
    apiUrl: string;
    apiKey: string;
    templateId: string;
    timeoutSeconds: number;
    allowInternetAccess?: boolean;
    network?: CubeSandboxNetworkConfig;
    requestTimeoutMs: number;
    runtimeId: string;
    workDir: string;
    mountWorkDir: boolean;
    mountPath: string;
    metadata: Record<string, string>;
}
export declare function resolveSandboxProvider(options: SandboxConnectOptions): SandboxProvider;
export declare function resolveCubeSandboxConfig(options: SandboxConnectOptions): CubeSandboxConfig;
