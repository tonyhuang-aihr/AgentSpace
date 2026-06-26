export type AgentSpaceDeploymentMode = "self_hosted" | "cloud";
export interface AttachmentRuntimeConfig {
    provider: "local" | "r2";
    localRoot?: string;
    publicBaseUrl?: string;
    maxUploadBytes: number;
    signedUrlTtlSeconds: number;
    enableLocalFallback: boolean;
    r2?: {
        accountId: string;
        bucket: string;
        region: string;
        endpoint: string;
        accessKeyId: string;
        secretAccessKey: string;
        forcePathStyle: boolean;
    };
}
export interface AgentSpaceRuntimeConfig {
    deploymentMode: AgentSpaceDeploymentMode;
    databaseUrl: string;
    directDatabaseUrl?: string;
    attachments: AttachmentRuntimeConfig;
}
export declare function resolveAgentSpaceRuntimeConfig(env?: NodeJS.ProcessEnv): AgentSpaceRuntimeConfig;
export declare function resolveAttachmentRuntimeConfig(envOrMode?: NodeJS.ProcessEnv | AgentSpaceDeploymentMode): AttachmentRuntimeConfig;
