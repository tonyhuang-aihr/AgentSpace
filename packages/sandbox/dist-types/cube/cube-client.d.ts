import type { CubeSandboxNetworkConfig } from "./cube-config.ts";
export interface CubeSandboxConnection {
    templateId: string;
    sandboxId: string;
    clientId: string;
    envdVersion: string;
    envdAccessToken?: string;
    trafficAccessToken?: string;
    domain?: string;
}
export interface CubeSandboxDetail extends CubeSandboxConnection {
    state: string;
}
export interface CubeSandboxSnapshot {
    snapshotId: string;
    names: string[];
}
export interface CubeCreateSandboxRequest {
    templateId: string;
    timeoutSeconds: number;
    allowInternetAccess?: boolean;
    network?: CubeSandboxNetworkConfig;
    metadata?: Record<string, string>;
}
export declare class CubeApiError extends Error {
    readonly statusCode: number;
    readonly responseBody?: unknown;
    constructor(message: string, statusCode: number, responseBody?: unknown);
}
export declare class CubeApiRouteNotAvailableError extends CubeApiError {
    constructor(message: string, statusCode: number, responseBody?: unknown);
}
export interface CubeSandboxClientOptions {
    apiUrl: string;
    apiKey: string;
    requestTimeoutMs: number;
    fetchImpl?: typeof fetch;
}
export declare class CubeSandboxClient {
    private readonly apiUrl;
    private readonly apiKey;
    private readonly requestTimeoutMs;
    private readonly fetchImpl;
    constructor(options: CubeSandboxClientOptions);
    createSandbox(request: CubeCreateSandboxRequest): Promise<CubeSandboxConnection>;
    connectSandbox(sandboxId: string, timeoutSeconds: number): Promise<CubeSandboxConnection>;
    getSandbox(sandboxId: string): Promise<CubeSandboxDetail>;
    pauseSandbox(sandboxId: string): Promise<void>;
    deleteSandbox(sandboxId: string): Promise<void>;
    createSnapshot(sandboxId: string, name?: string): Promise<CubeSandboxSnapshot>;
    private request;
}
