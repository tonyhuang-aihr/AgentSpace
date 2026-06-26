import { type AgentSpaceState } from "@agent-space/domain/workspace";
export declare function getWorkspaceStateFilePath(): string;
export declare function getWorkspaceDatabaseFilePath(): string;
export declare function getWorkspaceAttachmentsDirPath(workspaceId?: string): string;
export declare function ensureWorkspaceStateSync(workspaceId?: string): AgentSpaceState;
export declare function readWorkspaceStateSnapshotSync(workspaceId?: string): AgentSpaceState;
export declare function readWorkspaceStateSync(workspaceId?: string): AgentSpaceState;
export declare function writeWorkspaceStateSync(state: AgentSpaceState, workspaceId?: string, options?: {
    skipVersionCheck?: boolean;
}): AgentSpaceState;
export declare function resetWorkspaceStateSync(workspaceId?: string): AgentSpaceState;
