export interface AppliedExternalDocumentLinkOperation {
    operationType: "link_google_sheet" | "create_google_sheet";
    status: "succeeded" | "failed";
    sourceDocumentId?: string;
    documentId?: string;
    targetChannel: string;
    externalFileId?: string;
    externalUrl?: string;
    title?: string;
    message: string;
    permissionSync?: {
        documentId: string;
        externalFileId?: string;
        delegatedUserId?: string;
        delegatedGoogleEmail?: string;
    };
}
export interface AppliedDocumentPermissionRequest {
    status: "created" | "failed";
    requestId?: string;
    requestedRole?: "viewer" | "editor" | "forwarder";
    documentId?: string;
    externalFileId?: string;
    externalUrl?: string;
    targetChannel?: string;
    message: string;
}
export interface DocumentRuntimeOutputResult {
    warnings: string[];
    statusMessages: string[];
    externalDocumentLinks: AppliedExternalDocumentLinkOperation[];
    permissionRequests: AppliedDocumentPermissionRequest[];
}
export declare function applyDocumentRuntimeOutputOperations(input: {
    workDir: string;
    workspaceId: string;
    actorName: string;
    sourceTaskQueueId: string;
    sourceChannelName?: string;
    requestedByUserId?: string;
    requestedByDisplayName?: string;
}): DocumentRuntimeOutputResult;
