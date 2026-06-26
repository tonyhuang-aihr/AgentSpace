import type { StoredWorkspaceMembershipRecord, WorkspaceRole } from "./types.ts";
export declare function createWorkspaceMembershipSync(params: {
    workspaceId: string;
    userId: string;
    role?: WorkspaceRole;
    invitedBy?: string;
}): StoredWorkspaceMembershipRecord;
export declare function upsertWorkspaceMembershipSync(params: {
    workspaceId: string;
    userId: string;
    role?: WorkspaceRole;
    invitedBy?: string;
}): StoredWorkspaceMembershipRecord;
export declare function readWorkspaceMembershipSync(workspaceId: string, userId: string): StoredWorkspaceMembershipRecord | null;
export declare function listWorkspaceMembershipsSync(workspaceId: string): StoredWorkspaceMembershipRecord[];
export declare function listUserWorkspacesSync(userId: string): StoredWorkspaceMembershipRecord[];
export declare function updateWorkspaceMembershipRoleSync(workspaceId: string, userId: string, role: WorkspaceRole): void;
export declare function removeWorkspaceMembershipSync(workspaceId: string, userId: string): void;
export declare function transferWorkspaceOwnershipSync(workspaceId: string, currentOwnerUserId: string, nextOwnerUserId: string): void;
