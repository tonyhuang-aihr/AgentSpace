export type StorageScanIssueKind = "orphan-workspace" | "orphan-channel-history" | "orphan-daemon-workdir" | "orphan-remote-staging" | "legacy-storage-root";
export type StorageScanIssueReason = "workspace_missing" | "channel_missing" | "agent_missing" | "task_missing" | "unexpected_entry" | "legacy_path";
export interface StorageScanIssue {
    kind: StorageScanIssueKind;
    reason: StorageScanIssueReason;
    path: string;
    workspaceId?: string;
}
export interface StorageScanResult {
    scannedCount: number;
    issueCounts: Record<StorageScanIssueKind, number>;
    issues: StorageScanIssue[];
}
export declare function scanStorageArtifactsSync(): StorageScanResult;
export declare function getStorageScanWorkspacePath(workspaceId?: string): string;
