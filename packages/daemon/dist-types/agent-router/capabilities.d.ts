import type { RuntimeToolCapability } from "@agent-space/domain";
import type { AgentRouterDiagnostic } from "./types.ts";
export declare function normalizeRuntimeToolCapabilities(capabilities: RuntimeToolCapability[] | undefined): RuntimeToolCapability[];
export declare function buildCapabilityPathDirs(capabilities: RuntimeToolCapability[] | undefined): string[];
export declare function buildCapabilityEnv(baseEnv: Record<string, string>, capabilities: RuntimeToolCapability[] | undefined): Record<string, string>;
export declare function buildCapabilityAllowedTools(capabilities: RuntimeToolCapability[] | undefined): string[];
export declare function runCapabilityDiagnostics(input: {
    env: Record<string, string>;
    capabilities: RuntimeToolCapability[] | undefined;
}): AgentRouterDiagnostic[];
