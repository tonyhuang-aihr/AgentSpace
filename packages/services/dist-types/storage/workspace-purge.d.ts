import { type HardDeleteWorkspaceResult } from "@agent-space/db";
export type PurgeWorkspaceStorageResult = {
    workspaceId: string;
    db: HardDeleteWorkspaceResult;
    removedWorkspaceDataDir: boolean;
    removedDaemonExecutionRootDir: boolean;
};
export declare function purgeWorkspaceStorageSync(workspaceId: string, options?: {
    daemonStateDir?: string;
}): PurgeWorkspaceStorageResult;
