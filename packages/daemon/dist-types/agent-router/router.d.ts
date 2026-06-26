import type { AgentRouterHarness, AgentRouterObserver, AgentRouterRunRequest, AgentRouterRunResult, HarnessCatalogEntry, HarnessDetectionResult } from "./types.ts";
export declare function listAgentRouterHarnesses(): HarnessCatalogEntry[];
export declare function detectAgentRouterHarnesses(): Promise<{
    harnesses: HarnessDetectionResult[];
}>;
export declare function runAgentRouter(request: AgentRouterRunRequest, observer?: AgentRouterObserver): Promise<AgentRouterRunResult>;
export declare function isAgentRouterHarness(value: string): value is AgentRouterHarness;
