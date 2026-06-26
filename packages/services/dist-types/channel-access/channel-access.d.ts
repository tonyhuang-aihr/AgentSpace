import { type StoredChannelAccessRequestRecord, type StoredChannelInvitationRecord, type StoredChannelParticipantRecord, type WorkspaceRole } from "@agent-space/db";
import type { AgentSpaceState, ChannelRecord } from "@agent-space/domain/workspace";
export interface ChannelAccessActor {
    userId: string;
    displayName?: string;
    role?: WorkspaceRole;
}
export type ChannelAccessState = "accessible" | "pending" | "requestable";
export interface ChannelAccessSummary {
    channelName: string;
    state: ChannelAccessState;
    requestId?: string;
}
export declare function isWorkspaceAdminOrOwnerRole(role?: WorkspaceRole): boolean;
export declare function canReadChannelForActorSync(input: {
    workspaceId: string;
    channelName?: string | null;
    actor: ChannelAccessActor;
}): boolean;
export declare function canReadDirectChannelForActorSync(input: {
    workspaceId: string;
    channel: ChannelRecord;
    actor: ChannelAccessActor;
    state?: AgentSpaceState;
}): boolean;
export declare function assertCanReadChannelForActorSync(input: {
    workspaceId: string;
    channelName?: string | null;
    actor: ChannelAccessActor;
}): void;
export declare function canWriteChannelForActorSync(input: {
    workspaceId: string;
    channelName?: string | null;
    actor: ChannelAccessActor;
}): boolean;
export declare function assertCanWriteChannelForActorSync(input: {
    workspaceId: string;
    channelName?: string | null;
    actor: ChannelAccessActor;
}): void;
export declare function getChannelAccessSummaryForActorSync(input: {
    workspaceId: string;
    channelName: string;
    actor: ChannelAccessActor;
}): ChannelAccessSummary;
export declare function requestChannelAccessForActorSync(input: {
    workspaceId: string;
    channelName: string;
    actor: ChannelAccessActor;
    note?: string;
}): StoredChannelAccessRequestRecord;
export declare function listChannelAccessRequestsForManagerSync(input: {
    workspaceId: string;
    actor: ChannelAccessActor;
    statuses?: Array<"pending" | "approved" | "rejected" | "cancelled">;
}): StoredChannelAccessRequestRecord[];
export declare function approveChannelAccessRequestForActorSync(input: {
    workspaceId: string;
    requestId: string;
    actor: ChannelAccessActor;
}): StoredChannelAccessRequestRecord;
export declare function rejectChannelAccessRequestForActorSync(input: {
    workspaceId: string;
    requestId: string;
    actor: ChannelAccessActor;
}): StoredChannelAccessRequestRecord;
export declare function addWorkspaceMemberToChannelForActorSync(input: {
    workspaceId: string;
    channelName: string;
    targetUserId: string;
    actor: ChannelAccessActor;
}): StoredChannelParticipantRecord;
export declare function removeWorkspaceMemberFromChannelForActorSync(input: {
    workspaceId: string;
    channelName: string;
    targetUserId: string;
    actor: ChannelAccessActor;
}): StoredChannelParticipantRecord;
export declare function createChannelParticipantsForMembersSync(input: {
    workspaceId: string;
    channelName: string;
    memberDisplayNames: string[];
    addedByUserId: string;
}): StoredChannelParticipantRecord[];
export declare function inviteUserToChannelForActorSync(input: {
    workspaceId: string;
    channelName: string;
    actor: ChannelAccessActor;
    inviteeEmail?: string;
    inviteeUserId?: string;
}): StoredChannelInvitationRecord;
export declare function listChannelInvitationsForActorSync(input: {
    workspaceId: string;
    actor: ChannelAccessActor;
    statuses?: Array<"pending" | "accepted" | "rejected" | "revoked" | "expired">;
}): StoredChannelInvitationRecord[];
export declare function acceptChannelInvitationForActorSync(input: {
    invitationId: string;
    actor: ChannelAccessActor;
}): StoredChannelInvitationRecord;
export declare function rejectChannelInvitationForActorSync(input: {
    invitationId: string;
    actor: ChannelAccessActor;
}): StoredChannelInvitationRecord;
export declare function revokeChannelInvitationForActorSync(input: {
    workspaceId: string;
    invitationId: string;
    actor: ChannelAccessActor;
}): StoredChannelInvitationRecord;
