import type { ChannelAccessRequestStatus, ChannelInvitationStatus, ChannelParticipantStatus, StoredChannelAccessRequestRecord, StoredChannelInvitationRecord, StoredChannelParticipantRecord } from "./types.ts";
export interface CreateChannelParticipantInput {
    workspaceId?: string;
    channelName: string;
    userId: string;
    addedBy?: string;
}
export interface ListChannelParticipantsOptions {
    statuses?: ChannelParticipantStatus[];
    userId?: string;
}
export interface CreateChannelAccessRequestInput {
    workspaceId?: string;
    channelName: string;
    userId: string;
    note?: string;
}
export interface ListChannelAccessRequestsOptions {
    channelName?: string;
    userId?: string;
    statuses?: ChannelAccessRequestStatus[];
}
export interface CreateChannelInvitationInput {
    workspaceId?: string;
    channelName: string;
    inviteeUserId?: string;
    inviteeEmail?: string;
    invitedBy: string;
    expiresAt?: string;
}
export interface ListChannelInvitationsOptions {
    channelName?: string;
    inviteeUserId?: string;
    inviteeEmail?: string;
    statuses?: ChannelInvitationStatus[];
}
export declare function createChannelParticipantSync(input: CreateChannelParticipantInput): StoredChannelParticipantRecord;
export declare function readChannelParticipantSync(workspaceId: string, channelName: string, userId: string, options?: {
    includeRemoved?: boolean;
}): StoredChannelParticipantRecord | null;
export declare function listChannelParticipantsSync(workspaceId: string, channelName: string, options?: ListChannelParticipantsOptions): StoredChannelParticipantRecord[];
export declare function listChannelParticipantsForUserSync(workspaceId: string, userId: string, options?: Pick<ListChannelParticipantsOptions, "statuses">): StoredChannelParticipantRecord[];
export declare function listWorkspaceChannelParticipantsSync(workspaceId: string, options?: ListChannelParticipantsOptions): StoredChannelParticipantRecord[];
export declare function removeChannelParticipantSync(workspaceId: string, channelName: string, userId: string): StoredChannelParticipantRecord | null;
export declare function createChannelAccessRequestSync(input: CreateChannelAccessRequestInput): StoredChannelAccessRequestRecord;
export declare function readChannelAccessRequestSync(requestId: string, workspaceId?: string): StoredChannelAccessRequestRecord | null;
export declare function listChannelAccessRequestsSync(workspaceId: string, options?: ListChannelAccessRequestsOptions): StoredChannelAccessRequestRecord[];
export declare function approveChannelAccessRequestSync(requestId: string, resolvedBy: string, workspaceId?: string): StoredChannelAccessRequestRecord | null;
export declare function rejectChannelAccessRequestSync(requestId: string, resolvedBy: string, workspaceId?: string): StoredChannelAccessRequestRecord | null;
export declare function cancelChannelAccessRequestSync(requestId: string, workspaceId?: string): StoredChannelAccessRequestRecord | null;
export declare function createChannelInvitationSync(input: CreateChannelInvitationInput): StoredChannelInvitationRecord;
export declare function readChannelInvitationSync(invitationId: string, workspaceId?: string): StoredChannelInvitationRecord | null;
export declare function listChannelInvitationsSync(workspaceId: string, options?: ListChannelInvitationsOptions): StoredChannelInvitationRecord[];
export declare function acceptChannelInvitationSync(invitationId: string, acceptedByUserId: string, workspaceId?: string): StoredChannelInvitationRecord | null;
export declare function rejectChannelInvitationSync(invitationId: string, rejectedByUserId: string, workspaceId?: string): StoredChannelInvitationRecord | null;
export declare function revokeChannelInvitationSync(invitationId: string, revokedByUserId: string, workspaceId?: string): StoredChannelInvitationRecord | null;
export declare function cancelChannelInvitationSync(invitationId: string, cancelledByUserId: string, workspaceId?: string): StoredChannelInvitationRecord | null;
export declare function expireChannelInvitationSync(invitationId: string, workspaceId?: string): StoredChannelInvitationRecord | null;
