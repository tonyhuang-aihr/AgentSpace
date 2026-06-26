import type { StoredWorkspaceInvitationRecord, WorkspaceInvitationStatus, WorkspaceRole } from "./types.ts";
export interface CreatedWorkspaceInvitationRecord extends StoredWorkspaceInvitationRecord {
    token: string;
}
export declare function createWorkspaceInvitationSync(input: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    invitedBy: string;
    expiresAt?: string;
}): CreatedWorkspaceInvitationRecord;
export declare function readActiveWorkspaceInvitationByTokenSync(token: string): StoredWorkspaceInvitationRecord | null;
export declare function readWorkspaceInvitationByTokenSync(token: string): StoredWorkspaceInvitationRecord | null;
export declare function listWorkspaceInvitationsSync(workspaceId: string, options?: {
    statuses?: WorkspaceInvitationStatus[];
}): StoredWorkspaceInvitationRecord[];
export declare function countActiveWorkspaceInvitationsSync(workspaceId: string): number;
export declare function revokeWorkspaceInvitationSync(invitationId: string, workspaceId?: string): boolean;
export declare function acceptWorkspaceInvitationSync(token: string, userId: string): StoredWorkspaceInvitationRecord;
