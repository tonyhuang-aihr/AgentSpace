export type ChannelDocumentBlockType = "section";
export type ChannelDocumentChangeSetStatus = "pending" | "applied" | "conflicted" | "rejected";
export type ChannelDocumentConflictStatus = "open" | "resolved";
export type ChannelDocumentPresenceStatus = "viewing" | "editing" | "processing";
export type DocumentAccessRole = "owner" | "forwarder" | "editor" | "viewer";
export type AgentAssignableDocumentAccessRole = Exclude<DocumentAccessRole, "owner">;
export type DocumentAction = "view" | "edit" | "forward" | "manage";
export type ChannelDocumentAccessRole = DocumentAccessRole;
export interface AgentDocumentContext {
    documentId: string;
    role: DocumentAccessRole;
    source: "channel_context" | "explicit_grant" | "forward_grant";
    allowedActions: DocumentAction[];
}
export declare function allowsDocumentAction(role: DocumentAccessRole | undefined | null, action: DocumentAction): boolean;
export declare function getAllowedDocumentActions(role: DocumentAccessRole): DocumentAction[];
export interface ChannelDocumentBlock {
    id: string;
    documentId: string;
    parentId?: string;
    type: ChannelDocumentBlockType;
    order: number;
    heading?: string;
    contentMarkdown: string;
    revision: number;
    updatedBy: string;
    updatedAt: string;
}
export interface ChannelDocumentChangeSet {
    id: string;
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    baseVersionId: string;
    documentVersionId?: string;
    operationsJson: string;
    status: ChannelDocumentChangeSetStatus;
    sourceMessageId?: string;
    sourceTaskQueueId?: string;
    createdAt: string;
}
export interface ChannelDocumentConflict {
    id: string;
    documentId: string;
    blockId: string;
    leftChangeSetId: string;
    rightChangeSetId: string;
    status: ChannelDocumentConflictStatus;
    createdAt: string;
}
export interface ChannelDocumentAccess {
    id: string;
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    role: ChannelDocumentAccessRole;
    createdAt: string;
    updatedAt: string;
}
export interface ChannelDocumentPresence {
    id: string;
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    status: ChannelDocumentPresenceStatus;
    updatedAt: string;
}
