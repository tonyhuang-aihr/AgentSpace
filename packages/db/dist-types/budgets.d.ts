import type { BudgetAction, BudgetPeriod, BudgetRecord, BudgetScope } from "./types.ts";
export declare function upsertBudgetSync(input: {
    scope: BudgetScope;
    scopeId: string;
    limitUsd: number;
    period?: BudgetPeriod;
    action?: BudgetAction;
    warningThreshold?: number;
    createdBy?: string;
    workspaceId?: string;
}): BudgetRecord;
export declare function readBudgetByIdSync(id: string, workspaceId?: string): BudgetRecord | undefined;
export declare function readBudgetSync(scope: BudgetScope, scopeId: string, workspaceId?: string): BudgetRecord | undefined;
export declare function listBudgetsSync(workspaceId?: string): BudgetRecord[];
export declare function toggleBudgetSync(id: string, enabled: boolean, workspaceId?: string): void;
export declare function deleteBudgetSync(id: string, workspaceId?: string): void;
export declare function getSpentUsdSync(scope: BudgetScope, scopeId: string, since?: string, workspaceId?: string): number;
export declare function getMonthStartIso(): string;
