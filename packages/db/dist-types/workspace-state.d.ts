import { type AgentSpaceState } from "@agent-space/domain/workspace";
export declare const WORKSPACE_STATE_VERSION: unique symbol;
export declare class WorkspaceStateConflictError extends Error {
    readonly workspaceId: string;
    readonly expectedVersion?: number;
    readonly currentVersion: number;
    readonly code: string;
    constructor(input: {
        workspaceId: string;
        expectedVersion?: number;
        currentVersion: number;
    });
}
type WorkspaceStateWriteOptions = {
    expectedVersion?: number;
    skipVersionCheck?: boolean;
};
export declare function ensureWorkspaceStateRecordSync(defaultState?: AgentSpaceState, workspaceId?: string): AgentSpaceState;
export declare function readWorkspaceStateRecordSync(workspaceId?: string): AgentSpaceState | null;
export declare function writeWorkspaceStateRecordSync(state: AgentSpaceState, workspaceId?: string, options?: WorkspaceStateWriteOptions): AgentSpaceState;
export declare function getDatabaseStatusSync(): Record<string, string | number>;
export declare function resetWorkspaceExecutionStateSync(workspaceId?: string): {
    removedDocumentAgentAccessRows: number;
    removedDocumentPermissionRequestRows: number;
    removedAgentAccessRequestRows: number;
    removedKnowledgeProposalRows: number;
    removedAgentRouterProviderSessionRows: number;
    removedAgentTaskAttemptRows: number;
    removedAgentRouterEventRows: number;
    removedAgentRouterContextSnapshotRows: number;
    removedAgentRouterSessionRows: number;
    removedBindings: number;
    removedQueuedTasks: number;
    removedTaskMessages: number;
    removedRuntimes: number;
    removedDaemons: number;
    removedTasks: number;
    removedChannels: number;
    removedEmployees: number;
};
export declare function readWorkspaceStateVersion(state: AgentSpaceState): number | undefined;
export declare function readWorkspaceStateCurrentVersionSync(workspaceId?: string): number | null;
export {};
