import type { AgentAccessRequestRecord, AgentAccessRequestStatus, AgentAccessRequestType } from "./types.ts";
export interface CreateAgentAccessRequestInput {
    workspaceId?: string;
    sourceAgentName: string;
    requesterUserId: string;
    requestType: AgentAccessRequestType;
    targetChannelName?: string;
    reason?: string;
    auditDataJson?: string;
}
export interface CreateAgentAccessRequestResult {
    request: AgentAccessRequestRecord;
    created: boolean;
}
export interface ListAgentAccessRequestsOptions {
    sourceAgentName?: string;
    requesterUserId?: string;
    requestType?: AgentAccessRequestType;
    statuses?: AgentAccessRequestStatus[];
}
export declare function createAgentAccessRequestSync(input: CreateAgentAccessRequestInput): CreateAgentAccessRequestResult;
export declare function approveAgentAccessRequestSync(input: {
    workspaceId?: string;
    requestId: string;
    resolverUserId: string;
    forkInvitationId?: string;
    auditDataJson?: string;
}): AgentAccessRequestRecord;
export declare function rejectAgentAccessRequestSync(input: {
    workspaceId?: string;
    requestId: string;
    resolverUserId: string;
    auditDataJson?: string;
}): AgentAccessRequestRecord;
export declare function cancelAgentAccessRequestSync(input: {
    workspaceId?: string;
    requestId: string;
    resolverUserId: string;
    auditDataJson?: string;
}): AgentAccessRequestRecord;
export declare function readAgentAccessRequestSync(requestId: string, workspaceId?: string): AgentAccessRequestRecord | null;
export declare function listAgentAccessRequestsSync(workspaceId?: string, options?: ListAgentAccessRequestsOptions): AgentAccessRequestRecord[];
