import type { RuntimeAppInstallPlan } from "@agent-space/domain";
export interface RuntimeAppReadinessItem {
    available: boolean;
    version?: string;
    error?: string;
}
export interface CliHubReadiness {
    checkedAt: string;
    python: RuntimeAppReadinessItem;
    pip: RuntimeAppReadinessItem;
    cliHub: RuntimeAppReadinessItem;
    npm: RuntimeAppReadinessItem;
    uv: RuntimeAppReadinessItem;
}
export interface RuntimeAppExecutionResult {
    safeStdoutTail: string;
    safeStderrTail: string;
}
export declare function executeRuntimeAppPlan(plan: RuntimeAppInstallPlan): Promise<RuntimeAppExecutionResult>;
export declare function readCliHubReadiness(): CliHubReadiness;
export declare function parseRuntimeAppInstallPlan(value: unknown): RuntimeAppInstallPlan | null;
export declare function tailAndRedact(value: string): string;
