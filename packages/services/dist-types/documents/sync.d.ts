import type { AgentSpaceState, ChannelDocument, ChannelDocumentAccessRole, ChannelDocumentEditorType, ChannelDocumentExternalProvider, ChannelDocumentJsonContent, ChannelDocumentKind, ChannelDocumentStorageMode, ChannelDocumentTriggerType, ChannelDocumentVersion, ExternalSheetOperationRun, ExternalSheetOperationRunStatus, ExternalSheetOperationType } from "@agent-space/domain/workspace";
import type { ChannelDocumentBlock } from "@agent-space/domain";
export declare function listChannelDocumentsSync(channelName?: string, workspaceId?: string): ChannelDocument[];
export declare function listChannelDocumentVersionsSync(documentId: string, workspaceId?: string): ChannelDocumentVersion[];
export declare function listChannelDocumentBlocksSync(documentId: string, workspaceId?: string): ChannelDocumentBlock[];
export declare function readChannelDocumentSync(documentId: string, workspaceId?: string): {
    document: ChannelDocument;
    currentVersion: ChannelDocumentVersion;
    versions: ChannelDocumentVersion[];
};
export declare function canViewChannelDocumentSync(documentId: string, actorId: string, actorType: "human" | "agent", workspaceId?: string): boolean;
export declare function upsertChannelDocumentPresenceSync(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    status: "viewing" | "editing" | "processing";
}, workspaceId?: string): AgentSpaceState;
export declare function clearChannelDocumentPresenceSync(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function recordExternalSheetOperationRunSync(input: {
    channelDocumentId: string;
    externalFileId?: string;
    actorType: ExternalSheetOperationRun["actorType"];
    actorId: string;
    delegatedUserId?: string;
    delegatedUserDisplayName?: string;
    delegatedGoogleEmail?: string;
    credentialDelegationId?: string;
    status?: ExternalSheetOperationRunStatus;
    intent: string;
    operationType: ExternalSheetOperationType;
    rangeA1?: string;
    affectedRows?: number;
    affectedCells?: number;
    requestSummary: string;
    responseSummary?: string;
    resultArtifactPath?: string;
    resultArtifactFileName?: string;
    resultArtifactMediaType?: string;
    resultArtifactSizeBytes?: number;
    resultPreview?: ExternalSheetOperationRun["resultPreview"];
    errorCode?: string;
    errorMessage?: string;
    startedAt?: string;
    finishedAt?: string;
}, workspaceId?: string): ExternalSheetOperationRun;
export declare function updateExternalSheetOperationRunSync(input: {
    runId: string;
    status: ExternalSheetOperationRunStatus;
    rangeA1?: string;
    affectedRows?: number;
    affectedCells?: number;
    responseSummary?: string;
    resultArtifactPath?: string;
    resultArtifactFileName?: string;
    resultArtifactMediaType?: string;
    resultArtifactSizeBytes?: number;
    resultPreview?: ExternalSheetOperationRun["resultPreview"];
    errorCode?: string;
    errorMessage?: string;
    finishedAt?: string;
}, workspaceId?: string): ExternalSheetOperationRun;
export declare function createChannelDocumentSync(input: {
    channelName: string;
    title: string;
    kind?: ChannelDocumentKind;
    storageMode?: ChannelDocumentStorageMode;
    contentJson?: ChannelDocumentJsonContent;
    linkedTableId?: string;
    externalProvider?: ChannelDocumentExternalProvider;
    externalFileId?: string;
    externalUrl?: string;
    externalRevisionId?: string;
    contentMarkdown?: string;
    summary?: string;
    externalSyncStatus?: ChannelDocument["externalSyncStatus"];
    externalMimeType?: string;
    externalUpdatedAt?: string;
    createdBy: string;
    createdByType: ChannelDocumentEditorType;
    triggerType?: ChannelDocumentTriggerType;
    sourceMessageId?: string;
    sourceAttachmentId?: string;
    sourceAttachmentStoredPath?: string;
    sourceTaskQueueId?: string;
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function createExternalGoogleSheetChannelDocumentSync(input: {
    channelName: string;
    title: string;
    externalFileId: string;
    externalUrl: string;
    externalRevisionId?: string;
    externalMimeType?: string;
    externalUpdatedAt?: string;
    summary?: string;
    createdBy: string;
    createdByType: ChannelDocumentEditorType;
    triggerType?: ChannelDocumentTriggerType;
    sourceTaskQueueId?: string;
    recordMetadataRun?: boolean;
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function createExternalGoogleDocChannelDocumentSync(input: {
    channelName: string;
    title: string;
    externalFileId: string;
    externalUrl: string;
    externalRevisionId?: string;
    externalMimeType?: string;
    externalUpdatedAt?: string;
    summary?: string;
    createdBy: string;
    createdByType: ChannelDocumentEditorType;
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function updateExternalChannelDocumentMetadataSync(input: {
    documentId: string;
    externalRevisionId?: string;
    externalSyncStatus?: ChannelDocument["externalSyncStatus"];
    externalMimeType?: string;
    externalUpdatedAt?: string;
    updatedBy?: string;
}, workspaceId?: string): ChannelDocument;
export declare function updateChannelDocumentSync(input: {
    documentId: string;
    title?: string;
    contentMarkdown: string;
    contentJson?: ChannelDocumentJsonContent;
    summary?: string;
    updatedBy: string;
    updatedByType: ChannelDocumentEditorType;
    baseVersionId?: string;
    triggerType?: ChannelDocumentTriggerType;
    sourceMessageId?: string;
    sourceAttachmentId?: string;
    sourceAttachmentStoredPath?: string;
    sourceTaskQueueId?: string;
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function renameChannelDocumentSync(documentId: string, nextTitle: string, workspaceId?: string): AgentSpaceState;
export declare function archiveChannelDocumentSync(input: {
    documentId: string;
    archivedBy: string;
    archivedByType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function restoreChannelDocumentSync(input: {
    documentId: string;
    restoredBy: string;
    restoredByType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function rollbackChannelDocumentVersionSync(input: {
    documentId: string;
    versionId: string;
    updatedBy: string;
    updatedByType: ChannelDocumentEditorType;
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function exportChannelDocumentAsAttachmentSync(input: {
    documentId: string;
    exportedBy: string;
}, workspaceId?: string): AgentSpaceState;
export declare function createChannelDocumentFromAttachmentSync(input: {
    channelName: string;
    attachmentId: string;
    title?: string;
    createdBy: string;
    createdByType: ChannelDocumentEditorType;
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function listChannelMarkdownAttachmentsSync(channelName: string, workspaceId?: string): Array<{
    id: string;
    fileName: string;
    sourceMessageId?: string;
    sourceSpeaker?: string;
}>;
export declare function listChannelDocumentAccessesSync(documentId: string, workspaceId?: string): AgentSpaceState["channelDocumentAccesses"];
export declare function updateChannelDocumentAccessRoleSync(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    role: ChannelDocumentAccessRole;
    changedBy: string;
    changedByType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function addChannelDocumentCollaboratorSync(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    role: ChannelDocumentAccessRole;
    addedBy: string;
    addedByType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function removeChannelDocumentCollaboratorSync(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    removedBy: string;
    removedByType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function recordChannelDocumentConflictSync(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    baseVersionId: string;
    operationsJson: string;
    sourceMessageId?: string;
    sourceTaskQueueId?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function resolveChannelDocumentConflictSync(input: {
    conflictId: string;
    resolvedBy: string;
    resolvedByType: "human" | "agent";
}, workspaceId?: string): AgentSpaceState;
export declare function retryChannelDocumentConflictSync(input: {
    conflictId: string;
    retriedBy: string;
    retriedByType: "human" | "agent";
}, workspaceId?: string): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function markChannelDocumentRunStepRunningSync(queuedTaskId: string, workspaceId?: string): AgentSpaceState;
export declare function completeChannelDocumentRunStepSync(input: {
    queuedTaskId: string;
    documentUpdates?: Array<{
        documentId: string;
        documentVersionId: string;
    }>;
    warningText?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function failChannelDocumentRunStepSync(input: {
    queuedTaskId: string;
    errorText: string;
}, workspaceId?: string): AgentSpaceState;
