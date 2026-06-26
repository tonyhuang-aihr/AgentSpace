export interface AgentCostProfile {
    agentId: string;
    displayName: string;
    modelId: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    taskCount: number;
    avgCostPerTask: number;
}
export interface CostDashboardData {
    agents: AgentCostProfile[];
    totalCostUsd: number;
    totalTasks: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    models: Array<{
        modelId: string;
        displayName: string;
        inputPer1M: number;
        outputPer1M: number;
    }>;
    recentUsage: Array<{
        id: string;
        agentId: string;
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        channelName?: string;
        createdAt: string;
    }>;
}
export declare function getCostDashboardDataSync(period?: "monthly" | "total", workspaceId?: string): CostDashboardData;
export declare function getAgentCostProfileSync(agentId: string, period?: "monthly" | "total", workspaceId?: string): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    taskCount: number;
    avgCostPerTask: number;
};
