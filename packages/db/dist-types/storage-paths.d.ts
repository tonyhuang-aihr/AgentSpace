export declare const SYSTEM_WORKSPACE_ID = "__system__";
export declare function getSystemWorkspaceDataDirPath(): string;
export declare function getWorkspaceAttachmentsDirPath(workspaceId?: string): string;
export declare function getWorkspaceChannelHistoryDirPath(workspaceId?: string): string;
export declare function getWorkspaceDaemonRemoteStagingDirPath(taskId: string, workspaceId?: string): string;
export declare function getLocalDaemonStateDirPath(): string;
export declare function getDaemonWorkspaceExecutionRootDir(stateDir: string, workspaceId?: string): string;
export declare function getDaemonTaskWorkDirPath(stateDir: string, input: {
    taskId: string;
    workspaceId?: string;
}): string;
export declare function getDaemonChannelWorkDirPath(stateDir: string, input: {
    threadId: string;
    agentId: string;
    workspaceId?: string;
}): string;
export declare function getDaemonRemoteTaskWorkDirPath(stateDir: string, input: {
    taskId: string;
    workspaceId?: string;
}): string;
export declare function sanitizeStoragePathSegment(value: string, fallback?: string): string;
