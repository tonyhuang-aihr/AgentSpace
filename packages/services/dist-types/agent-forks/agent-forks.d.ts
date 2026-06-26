import { type AgentForkInvitationStatus, type StoredAgentForkInvitationRecord } from "@agent-space/db";
import type { ActiveEmployee } from "@agent-space/domain/workspace";
export interface AgentForkOptions {
    copyProfile: boolean;
    copyInstructions: boolean;
    copySkills: boolean;
    copyKnowledgeAssignments: boolean;
    copyMemorySummary?: boolean;
    contextNote?: string;
}
export interface AgentForkSnapshot {
    profile?: Pick<ActiveEmployee, "name" | "role" | "remarkName" | "summary" | "traits" | "fit" | "origin">;
    instructions?: string;
    skillIds: string[];
    knowledgePageIds: string[];
    contextNote?: string;
}
export type AgentForkInvitationRecord = StoredAgentForkInvitationRecord & {
    options: AgentForkOptions;
    snapshot?: AgentForkSnapshot;
};
export declare function createAgentForkInvitationForActorSync(input: {
    workspaceId: string;
    sourceAgentName: string;
    targetUserId: string;
    actorUserId: string;
    options: AgentForkOptions;
}): AgentForkInvitationRecord;
export declare function acceptAgentForkInvitationForActorSync(input: {
    workspaceId: string;
    invitationId: string;
    actorUserId: string;
    newAgentName: string;
    runtimeId: string;
}): {
    invitation: AgentForkInvitationRecord;
    agentName: string;
};
export declare function revokeAgentForkInvitationForActorSync(input: {
    workspaceId: string;
    invitationId: string;
    actorUserId: string;
}): AgentForkInvitationRecord;
export declare function listAgentForkInvitationsForActorSync(input: {
    workspaceId: string;
    actorUserId: string;
    statuses?: AgentForkInvitationStatus[];
}): AgentForkInvitationRecord[];
export declare function listAgentForkInvitationsForSourceAgentSync(input: {
    workspaceId: string;
    sourceAgentName: string;
    actorUserId: string;
    statuses?: AgentForkInvitationStatus[];
}): AgentForkInvitationRecord[];
