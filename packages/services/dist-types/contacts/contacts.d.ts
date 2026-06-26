import { type AgentSpaceState, type ChannelRecord, type MessageAttachment } from "@agent-space/domain/workspace";
export declare function sendContactMessageSync(contactId: string, content: string, workspaceId?: string, requesterUserId?: string): AgentSpaceState;
export declare function sendContactMessageWithAttachmentsSync(contactId: string, content: string, attachments?: MessageAttachment[], workspaceId?: string, requesterUserId?: string): AgentSpaceState;
export declare function sendContactMessageForHumanWithAttachmentsSync(humanMemberName: string, contactId: string, content: string, attachments?: MessageAttachment[], workspaceId?: string, requesterUserId?: string): AgentSpaceState;
export declare function sendHumanDirectMessageSync(input: {
    workspaceId?: string;
    actorUserId: string;
    targetUserId: string;
    content: string;
    attachments?: MessageAttachment[];
    replyToMessageId?: string;
}): AgentSpaceState;
export declare function postHumanDirectSystemMessageSync(input: {
    workspaceId?: string;
    leftUserId: string;
    rightUserId: string;
    summary: string;
    code: string;
    data?: Record<string, string | undefined>;
}): AgentSpaceState;
export declare function resolveHumanDirectChannelForUsersSync(input: {
    workspaceId?: string;
    userIds: [string, string];
    state?: AgentSpaceState;
}): ChannelRecord | null;
export declare function upsertDirectConversationStateSync(input: {
    contactId: string;
    humanMemberName?: string;
    sessionId?: string | null;
    workDir?: string | null;
}, workspaceId?: string, stateArg?: AgentSpaceState): AgentSpaceState;
