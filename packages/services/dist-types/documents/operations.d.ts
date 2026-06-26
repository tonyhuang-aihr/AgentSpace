import type { AgentSpaceState, ChannelDocument, ChannelDocumentVersion } from "@agent-space/domain/workspace";
export type ChannelDocumentOperation = {
    op: "replace_block";
    blockId: string;
    baseRevision: number;
    contentMarkdown: string;
    heading?: string;
} | {
    op: "insert_after";
    afterBlockId?: string;
    contentMarkdown: string;
    heading?: string;
} | {
    op: "delete_block";
    blockId: string;
    baseRevision: number;
};
export declare function applyChannelDocumentBlockOperations(input: {
    state: AgentSpaceState;
    document: ChannelDocument;
    baseVersionId: string;
    actorId: string;
    actorType: "human" | "agent";
    operations: ChannelDocumentOperation[];
    summary?: string;
    sourceMessageId?: string;
    sourceTaskQueueId?: string;
}): {
    state: AgentSpaceState;
    document?: ChannelDocument;
    version?: ChannelDocumentVersion;
    appliedOperationCount: number;
    conflictCount: number;
};
