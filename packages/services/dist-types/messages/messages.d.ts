import type { AgentSpaceState, MessageAttachment, MessageMention, WorkspaceMessage } from "@agent-space/domain/workspace";
type AgentMessageMention = Extract<MessageMention, {
    mentionType: "agent";
}>;
type HumanMessageMention = Extract<MessageMention, {
    mentionType: "human";
}>;
export interface ChannelMentionParseResult {
    agentMentions: AgentMessageMention[];
    humanMentions: HumanMessageMention[];
    unknownMentions: string[];
    outOfChannelAgentMentions: AgentMessageMention[];
    outOfChannelHumanMentions: HumanMessageMention[];
    allMentions: MessageMention[];
}
export interface CompleteAgentChannelReplyResult {
    state: AgentSpaceState;
    message: WorkspaceMessage;
    warnings: string[];
    queuedTaskIds: string[];
    dispatchedAgentIds: string[];
}
export declare function formatConversationFailureSummary(input: {
    agentName: string;
    channelName: string;
    errorText: string;
    isDirectConversation?: boolean;
}): string;
export declare function formatTaskFailureSummary(input: {
    title: string;
    errorText: string;
}): string;
export declare function pinMessageSync(messageId: string, workspaceId?: string, actorName?: string, actorUserId?: string): AgentSpaceState;
export declare function unpinMessageSync(messageId: string, workspaceId?: string, actorName?: string, actorUserId?: string): AgentSpaceState;
export declare function acknowledgeMessageSync(messageId: string, workspaceId?: string, actorName?: string, actorUserId?: string): AgentSpaceState;
export declare function postMessageSync(input: {
    channel: string;
    speaker: string;
    role: "human" | "agent";
    summary: string;
    code?: string;
    data?: Record<string, string>;
    status?: "pending" | "completed" | "error";
    attachments?: MessageAttachment[];
    mentions?: MessageMention[];
}, workspaceId?: string): AgentSpaceState;
export declare function parseChannelMentionsSync(state: AgentSpaceState, channelName: string, summary: string): ChannelMentionParseResult;
export declare function sendChannelHumanMessageSync(channelName: string, speaker: string, summary: string, attachments?: MessageAttachment[], replyToMessageId?: string, workspaceId?: string, requesterUserId?: string): AgentSpaceState;
export declare function completeAgentChannelReplySync(input: {
    channel: string;
    pendingSpeaker?: string;
    speaker: string;
    summary: string;
    attachments?: MessageAttachment[];
    sourceTaskQueueId?: string;
    requestedByUserId?: string;
    requestedByDisplayName?: string;
    mentionCascadeDepth?: number;
    mentionRootMessageId?: string;
    sessionId?: string;
    workDir?: string;
}, workspaceId?: string): CompleteAgentChannelReplyResult;
export declare function replacePendingChannelMessageSync(input: {
    channel: string;
    pendingSpeaker: string;
    speaker: string;
    role: "human" | "agent";
    summary: string;
    status?: "pending" | "completed" | "error";
    attachments?: MessageAttachment[];
}, workspaceId?: string): AgentSpaceState;
export {};
