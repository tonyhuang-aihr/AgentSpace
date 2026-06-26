import { type AgentAccessRequestRecord, type AgentAccessRequestStatus, type AgentAccessRequestType } from "@agent-space/db";
export type { AgentAccessRequestRecord, AgentAccessRequestStatus, AgentAccessRequestType, };
export declare function createAgentAccessRequestForActorSync(input: {
    workspaceId: string;
    sourceAgentName: string;
    requesterUserId: string;
    requestType?: AgentAccessRequestType;
    targetChannelName?: string;
    reason?: string;
}): AgentAccessRequestRecord;
export declare function approveAgentAccessRequestForActorSync(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
}): AgentAccessRequestRecord;
export declare function rejectAgentAccessRequestForActorSync(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
}): AgentAccessRequestRecord;
export declare function cancelAgentAccessRequestForActorSync(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
}): AgentAccessRequestRecord;
export declare function listAgentAccessRequestsForActorSync(input: {
    workspaceId: string;
    actorUserId: string;
    statuses?: AgentAccessRequestStatus[];
}): AgentAccessRequestRecord[];
export declare function canDecideAgentAccessRequest(input: {
    workspaceId: string;
    request: AgentAccessRequestRecord;
    actorUserId: string;
}): boolean;
