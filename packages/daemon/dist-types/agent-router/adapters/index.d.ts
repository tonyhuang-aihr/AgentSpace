import type { AgentRouterHarness, HarnessAdapter } from "../types.ts";
export declare const HARNESS_ADAPTERS: Record<AgentRouterHarness, HarnessAdapter>;
export declare function getHarnessAdapter(harness: AgentRouterHarness): HarnessAdapter;
