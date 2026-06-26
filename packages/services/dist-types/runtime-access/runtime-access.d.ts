import { type WorkspaceRole, type WorkspaceRuntimeGrantRecord } from "@agent-space/db";
export interface RuntimeAccessActor {
    userId?: string;
}
export declare function isWorkspaceAdminOrOwnerSync(input: {
    workspaceId?: string;
    userId?: string;
}): boolean;
export declare function canManageRuntimeGrantsSync(input: {
    workspaceId?: string;
    actorUserId?: string;
}): boolean;
export declare function assertCanManageRuntimeGrantsSync(input: {
    workspaceId?: string;
    actorUserId?: string;
}): void;
export declare function grantRuntimeUseToUserForActorSync(input: {
    workspaceId?: string;
    runtimeId: string;
    userId: string;
    actorUserId: string;
}): WorkspaceRuntimeGrantRecord;
export declare function revokeRuntimeUseFromUserForActorSync(input: {
    workspaceId?: string;
    runtimeId: string;
    userId: string;
    actorUserId: string;
}): WorkspaceRuntimeGrantRecord | null;
export declare function listRuntimeGrantsForActorSync(input: {
    workspaceId?: string;
    actorUserId?: string;
}): WorkspaceRuntimeGrantRecord[];
export declare function canUseRuntimeForActorSync(input: {
    workspaceId?: string;
    runtimeId: string;
    actorUserId?: string;
}): boolean;
export declare function assertCanUseRuntimeForActorSync(input: {
    workspaceId?: string;
    runtimeId: string;
    actorUserId?: string;
}): void;
export declare function canManageEmployeeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): boolean;
export declare function assertCanManageEmployeeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): void;
export declare function canUseEmployeeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): boolean;
export declare function assertCanUseEmployeeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): void;
export declare function canUseEmployeeInChannelForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    channelName: string;
    actorUserId?: string;
    actorDisplayName?: string;
    actorRole?: WorkspaceRole;
}): boolean;
export declare function assertCanUseEmployeeInChannelForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    channelName: string;
    actorUserId?: string;
    actorDisplayName?: string;
    actorRole?: WorkspaceRole;
}): void;
export declare function canUseEmployeeRuntimeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): boolean;
export declare function assertCanUseEmployeeRuntimeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): void;
export declare function canUseEmployeeRuntimeInChannelForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    channelName: string;
    actorUserId?: string;
    actorDisplayName?: string;
    actorRole?: WorkspaceRole;
}): boolean;
export declare function assertCanUseEmployeeRuntimeInChannelForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    channelName: string;
    actorUserId?: string;
    actorDisplayName?: string;
    actorRole?: WorkspaceRole;
}): void;
export declare function assertCanUseBoundEmployeeRuntimeForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    actorUserId?: string;
}): void;
export declare function assertCanUseBoundEmployeeRuntimeInChannelForActorSync(input: {
    workspaceId?: string;
    employeeName: string;
    channelName: string;
    actorUserId?: string;
    actorDisplayName?: string;
    actorRole?: WorkspaceRole;
}): void;
