export interface AgentPerformanceMetrics {
    agentId: string;
    displayName: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    completionRate: number;
    errorRate: number;
    avgResponseTimeMs: number | null;
    approvalCount: number;
    rejectionCount: number;
    satisfactionRate: number | null;
}
export interface PerformanceDashboardData {
    agents: AgentPerformanceMetrics[];
    totalTasks: number;
    totalCompleted: number;
    totalFailed: number;
    overallCompletionRate: number;
    overallErrorRate: number;
    overallAvgResponseTimeMs: number | null;
}
export declare function getPerformanceDashboardDataSync(workspaceId?: string): PerformanceDashboardData;
