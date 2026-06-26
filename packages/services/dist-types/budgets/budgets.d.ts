import { upsertBudgetSync, toggleBudgetSync, deleteBudgetSync } from "@agent-space/db";
import type { BudgetAction, BudgetPeriod, BudgetRecord, BudgetScope } from "@agent-space/db";
export type BudgetCheckResult = {
    status: "ok";
} | {
    status: "warning";
    budget: BudgetRecord;
    spentUsd: number;
    percentUsed: number;
} | {
    status: "exceeded";
    budget: BudgetRecord;
    spentUsd: number;
    percentUsed: number;
    action: BudgetAction;
};
export declare function checkBudgetSync(scope: BudgetScope, scopeId: string, workspaceId?: string): BudgetCheckResult;
export declare function checkAllBudgetsForAgentSync(agentId: string, channelName?: string, workspaceId?: string): BudgetCheckResult;
export interface BudgetWithSpent extends BudgetRecord {
    spentUsd: number;
    percentUsed: number;
}
export declare function listBudgetsWithSpentSync(workspaceId?: string): BudgetWithSpent[];
export { upsertBudgetSync, toggleBudgetSync, deleteBudgetSync, };
export type { BudgetScope, BudgetPeriod, BudgetAction, BudgetRecord };
