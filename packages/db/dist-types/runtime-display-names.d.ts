import type { WorkspaceRuntimeDisplayNameRecord } from "./types.ts";
export declare function listWorkspaceRuntimeDisplayNamesSync(workspaceId?: string): WorkspaceRuntimeDisplayNameRecord[];
export declare function updateWorkspaceRuntimeDisplayNameSync(input: {
    workspaceId?: string;
    runtimeId: string;
    displayName: string;
    updatedByUserId?: string;
}): WorkspaceRuntimeDisplayNameRecord | null;
