import type { AgentSpaceState, ChannelDocument, ChannelDocumentEditorType, ChannelDocumentExternalProvider, ChannelDocumentJsonContent, ChannelDocumentKind, ChannelDocumentStorageMode, ChannelDocumentTriggerType, ChannelDocumentVersion } from "@agent-space/domain/workspace";
export declare function listChannelDocuments(state: AgentSpaceState, channelName?: string): ChannelDocument[];
export declare function listChannelDocumentVersions(state: AgentSpaceState, documentId: string): ChannelDocumentVersion[];
export declare function readChannelDocument(state: AgentSpaceState, documentId: string): {
    document: ChannelDocument;
    currentVersion: ChannelDocumentVersion;
    versions: ChannelDocumentVersion[];
};
export declare function createChannelDocument(input: {
    state: AgentSpaceState;
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
}): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function updateChannelDocument(input: {
    state: AgentSpaceState;
    documentId: string;
    contentMarkdown: string;
    contentJson?: ChannelDocumentJsonContent;
    summary?: string;
    updatedBy: string;
    updatedByType: ChannelDocumentEditorType;
    triggerType?: ChannelDocumentTriggerType;
    sourceMessageId?: string;
    sourceAttachmentId?: string;
    sourceAttachmentStoredPath?: string;
    sourceTaskQueueId?: string;
}): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
export declare function renameChannelDocument(input: {
    state: AgentSpaceState;
    documentId: string;
    nextTitle: string;
}): {
    state: AgentSpaceState;
    document: ChannelDocument;
    previousTitle: string;
};
export declare function archiveChannelDocument(input: {
    state: AgentSpaceState;
    documentId: string;
}): {
    state: AgentSpaceState;
    document: ChannelDocument;
};
export declare function restoreChannelDocument(input: {
    state: AgentSpaceState;
    documentId: string;
}): {
    state: AgentSpaceState;
    document: ChannelDocument;
};
export declare function rollbackChannelDocumentVersion(input: {
    state: AgentSpaceState;
    documentId: string;
    versionId: string;
    updatedBy: string;
    updatedByType: ChannelDocumentEditorType;
}): {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
};
