import type { AgentSpaceState, MessageAttachment } from "@agent-space/domain/workspace";
export interface StoredAttachmentRecord extends MessageAttachment {
    workspaceId: string;
    messageId?: string;
    channelName?: string;
    speaker: string;
    role: string;
    sourceMessageTime?: string;
    sourceMessageIndex: number;
    sourceSummary?: string;
    createdAt: string;
}
export declare function replaceStoredAttachmentsSync(state: Pick<AgentSpaceState, "messages">, workspaceId?: string): void;
export declare function readStoredAttachmentSync(workspaceId: string, attachmentId: string): StoredAttachmentRecord | null;
