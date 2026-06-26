import type { AgentSpaceState, ChannelDocument, ChannelDocumentVersion, MessageAttachment, WorkspaceMessage } from "@agent-space/domain/workspace";
export declare function findWorkspaceAttachmentById(state: AgentSpaceState, attachmentId: string): {
    attachment: MessageAttachment;
    message?: WorkspaceMessage;
} | null;
export declare function assertCanAccessWorkspaceAttachment(state: AgentSpaceState, attachmentId: string, actorId: string, actorType: "human" | "agent"): {
    attachment: MessageAttachment;
    message?: WorkspaceMessage;
};
export declare function createAttachmentFromChannelDocumentVersion(input: {
    document: ChannelDocument;
    version: ChannelDocumentVersion;
    persistAttachment: (input: {
        sourcePath: string;
        fileName?: string;
        mediaType?: string;
    }) => MessageAttachment;
    tempDirPath: string;
}): MessageAttachment;
export declare function readMarkdownAttachmentContent(attachment: MessageAttachment): string;
