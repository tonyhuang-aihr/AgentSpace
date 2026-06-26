import type { WorkspaceRuntimeGrantRecord } from "./types.ts";
export declare function grantRuntimeUseToUserSync(input: {
    workspaceId?: string;
    runtimeId: string;
    userId: string;
    grantedByUserId: string;
}): WorkspaceRuntimeGrantRecord;
export declare function revokeRuntimeUseFromUserSync(input: {
    workspaceId?: string;
    runtimeId: string;
    userId: string;
}): WorkspaceRuntimeGrantRecord | null;
export declare function listRuntimeGrantsSync(workspaceId?: string): WorkspaceRuntimeGrantRecord[];
export declare function listRuntimeGrantsForUserSync(workspaceId: string, userId: string): WorkspaceRuntimeGrantRecord[];
export declare function canUserUseRuntimeSync(workspaceId: string, runtimeId: string, userId: string): boolean;
