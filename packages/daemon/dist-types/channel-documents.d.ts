import type { AgentDocumentContext } from "@agent-space/services";
import type { ChannelDocument } from "@agent-space/domain/workspace";
export declare function resolveChannelDocuments(channelName: string, workspaceId?: string): ChannelDocument[];
export declare function materializeChannelDocuments(documentsOrContexts: ChannelDocument[] | AgentDocumentContext[], workDir: string, workspaceId?: string): string | undefined;
export declare function buildChannelDocumentPromptLines(channelDocumentsOrContexts: ChannelDocument[] | AgentDocumentContext[], channelDocumentsContextDir?: string): string[];
export declare function applyChannelDocumentOperations(workDir: string, context: {
    channelName: string;
    sourceMessageId?: string;
    sourceTaskQueueId: string;
    actorName: string;
    workspaceId?: string;
}): {
    warnings: string[];
    documentUpdates: Array<{
        documentId: string;
        documentVersionId: string;
    }>;
};
export declare function clearChannelDocumentOperationArtifacts(workDir: string): void;
