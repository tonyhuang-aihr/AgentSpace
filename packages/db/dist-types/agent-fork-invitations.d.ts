import type { AgentForkInvitationStatus, StoredAgentForkInvitationRecord, StoredAgentForkSnapshotRecord } from "./types.ts";
export interface CreateAgentForkInvitationRecordInput {
    workspaceId?: string;
    sourceAgentName: string;
    targetUserId: string;
    createdByUserId: string;
    optionsJson: string;
    snapshotJson: string;
}
export interface CreateAgentForkInvitationRecordResult {
    invitation: StoredAgentForkInvitationRecord;
    snapshot: StoredAgentForkSnapshotRecord;
    created: boolean;
}
export interface ListAgentForkInvitationsOptions {
    sourceAgentName?: string;
    targetUserId?: string;
    createdByUserId?: string;
    statuses?: AgentForkInvitationStatus[];
}
export declare function createAgentForkInvitationSync(input: CreateAgentForkInvitationRecordInput): CreateAgentForkInvitationRecordResult;
export declare function readAgentForkInvitationSync(invitationId: string, workspaceId?: string): StoredAgentForkInvitationRecord | null;
export declare function readAgentForkSnapshotByInvitationSync(workspaceId: string, invitationId: string): StoredAgentForkSnapshotRecord | null;
export declare function listAgentForkInvitationsSync(workspaceId: string, options?: ListAgentForkInvitationsOptions): StoredAgentForkInvitationRecord[];
export declare function acceptAgentForkInvitationSync(input: {
    workspaceId?: string;
    invitationId: string;
    acceptedAgentName: string;
    acceptedRuntimeId: string;
}): StoredAgentForkInvitationRecord | null;
export declare function revokeAgentForkInvitationSync(input: {
    workspaceId?: string;
    invitationId: string;
}): StoredAgentForkInvitationRecord | null;
