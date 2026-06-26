import type { AgentSpaceState } from "@agent-space/domain/workspace";
export interface ContactContextEntity {
    type: "employee";
    name: string;
    role: string;
    relationship: "workspace-collaborator";
    sharedChannels: string[];
    observedLabels: string[];
    recentSharedInteractionChannel?: string;
    recentSharedInteractionTime?: string;
    recentSharedInteractionSummary?: string;
}
export interface ContactAgentContext {
    self: {
        name: string;
        role: string;
        channels: string[];
    };
    knownEntities: ContactContextEntity[];
}
export declare function buildContactAgentContextSync(agentName: string): ContactAgentContext;
export declare function buildContactAgentContext(state: AgentSpaceState, agentName: string): ContactAgentContext;
