import { type AgentSpaceState, type MessageAttachment } from "@agent-space/domain/workspace";
export interface DeleteChannelAttachmentResult {
    state: AgentSpaceState;
    attachmentId: string;
    removedFromMessage: boolean;
    physicalFileDeleted: boolean;
    retainedBecauseReferenced: boolean;
}
export declare function persistWorkspaceAttachmentFromFileSync(input: {
    workspaceId?: string;
    sourcePath: string;
    fileName?: string;
    mediaType?: string;
}): MessageAttachment;
export declare function persistWorkspaceAttachmentFromBytesSync(input: {
    workspaceId?: string;
    contentBytes: Uint8Array;
    fileName: string;
    mediaType?: string;
}): MessageAttachment;
export declare function deleteWorkspaceAttachmentsSync(attachments: Array<Pick<MessageAttachment, "storedPath" | "storageProvider" | "storageBucket" | "storageRegion" | "storageEndpoint" | "storageKey">>): void;
export declare function deleteChannelAttachmentSync(input: {
    workspaceId?: string;
    channelName: string;
    attachmentId: string;
    actorUserId: string;
    actorDisplayName: string;
}): DeleteChannelAttachmentResult;
export declare function pruneOrphanWorkspaceAttachmentsSync(): {
    scannedCount: number;
    deletedCount: number;
};
export declare function pruneOrphanWorkspaceAttachmentsSync(workspaceId: string): {
    scannedCount: number;
    deletedCount: number;
};
