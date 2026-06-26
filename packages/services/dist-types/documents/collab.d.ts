import type { AgentSpaceState, ChannelDocument, ChannelDocumentVersion } from "@agent-space/domain/workspace";
import type { ChannelDocumentBlock, ChannelDocumentChangeSet, ChannelDocumentConflict } from "@agent-space/domain";
export declare function rebuildChannelDocumentBlocksForVersion(input: {
    state: AgentSpaceState;
    document: ChannelDocument;
    version: ChannelDocumentVersion;
    actorName: string;
}): void;
export declare function listChannelDocumentBlocks(state: AgentSpaceState, documentId: string): ChannelDocumentBlock[];
export declare function serializeChannelDocumentBlocks(blocks: ChannelDocumentBlock[]): string;
export declare function createChannelDocumentChangeSet(input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    baseVersionId: string;
    documentVersionId?: string;
    operationsJson: string;
    status: ChannelDocumentChangeSet["status"];
    sourceMessageId?: string;
    sourceTaskQueueId?: string;
    createdAt?: string;
}): ChannelDocumentChangeSet;
export declare function createChannelDocumentConflict(input: {
    documentId: string;
    blockId: string;
    leftChangeSetId: string;
    rightChangeSetId: string;
    createdAt?: string;
}): ChannelDocumentConflict;
export declare function normalizeChannelDocumentBlocks(blocks: AgentSpaceState["channelDocumentBlocks"] | undefined, fallback: AgentSpaceState["channelDocumentBlocks"]): AgentSpaceState["channelDocumentBlocks"];
export declare function normalizeChannelDocumentAccesses(accesses: AgentSpaceState["channelDocumentAccesses"] | undefined, fallback: AgentSpaceState["channelDocumentAccesses"]): AgentSpaceState["channelDocumentAccesses"];
export declare function normalizeChannelDocumentChangeSets(changeSets: AgentSpaceState["channelDocumentChangeSets"] | undefined, fallback: AgentSpaceState["channelDocumentChangeSets"]): AgentSpaceState["channelDocumentChangeSets"];
export declare function normalizeChannelDocumentConflicts(conflicts: AgentSpaceState["channelDocumentConflicts"] | undefined, fallback: AgentSpaceState["channelDocumentConflicts"]): AgentSpaceState["channelDocumentConflicts"];
export declare function normalizeChannelDocumentPresences(presences: AgentSpaceState["channelDocumentPresences"] | undefined, fallback: AgentSpaceState["channelDocumentPresences"]): AgentSpaceState["channelDocumentPresences"];
