interface MigrationResult {
    workspaceCount: number;
    scannedAttachments: number;
    migratedAttachments: number;
    alreadyCloudAttachments: number;
    missingLocalFiles: Array<{
        workspaceId: string;
        attachmentId: string;
        storedPath: string;
    }>;
}
export declare function migrateLocalAttachmentsToObjectStorageSync(input?: {
    dryRun?: boolean;
}): MigrationResult;
export {};
