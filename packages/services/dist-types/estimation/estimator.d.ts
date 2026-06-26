export interface EstimationInput {
    taskTitle: string;
    taskDescription?: string;
    channelName?: string;
    candidateAgentIds?: string[];
}
export interface AgentEstimation {
    agentId: string;
    displayName: string;
    modelId: string;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCostUsd: number;
    confidence: "high" | "medium" | "low";
    basedOnTaskCount: number;
    avgCompletionRate: number;
    recommendedBudgetUsd: number;
    recommended: boolean;
}
export interface TaskEstimationResult {
    taskTitle: string;
    channelName: string;
    agents: AgentEstimation[];
}
export declare function estimateTaskSync(input: EstimationInput, workspaceId?: string): TaskEstimationResult;
