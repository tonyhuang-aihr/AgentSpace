import type { ModelPricingRecord, TokenUsageRecord } from "./types.ts";
export declare function ensureDefaultPricingSync(): void;
export declare function listModelPricingSync(): ModelPricingRecord[];
export declare function readModelPricingSync(modelId: string): ModelPricingRecord | undefined;
export declare function computeCostUsd(inputTokens: number, outputTokens: number, pricing: ModelPricingRecord): number;
export declare function recordTokenUsageSync(input: {
    taskQueueId: string;
    agentId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    channelName?: string;
    workspaceId?: string;
}): TokenUsageRecord;
export declare function listTokenUsageSync(filters?: {
    workspaceId?: string;
    agentId?: string;
    channelName?: string;
    since?: string;
}): TokenUsageRecord[];
export declare function getAgentCostSummarySync(agentId: string, since?: string, workspaceId?: string): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    taskCount: number;
};
export declare function getWorkspaceCostSummarySync(since?: string, workspaceId?: string): Array<{
    agentId: string;
    modelId: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    taskCount: number;
}>;
