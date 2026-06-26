import type { RuntimeToolCapability } from "@agent-space/domain";
import type { AgentDocumentContext } from "@agent-space/services";
export declare function buildDocumentRuntimeToolCapabilities(agentDocumentContexts: AgentDocumentContext[], options?: {
    canCreateGoogleSheet?: boolean;
}): RuntimeToolCapability[];
