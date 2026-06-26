import type { AgentSpaceState, ConversationAutoContinuationState, ConversationExecutionWorkspaceState } from "@agent-space/domain/workspace";
export declare function buildConversationExecutionWorkspaceKey(input: {
    conversationKind?: "direct" | "group";
    channelName: string;
    agentId: string;
}): string;
export declare function resolveConversationExecutionWorkspacePath(input: {
    workspaceId: string;
    channelName: string;
    agentId: string;
}): string;
export declare function readConversationExecutionWorkspaceState(state: AgentSpaceState, input: {
    channelName: string;
    agentId: string;
    contactId?: string;
}): ConversationExecutionWorkspaceState | undefined;
export declare function upsertConversationExecutionWorkspaceState(state: AgentSpaceState, input: {
    channelName: string;
    agentId: string;
    contactId?: string;
    humanMemberName?: string;
    sessionId?: string | null;
    workDir?: string | null;
    lastTaskQueueId?: string;
    lastError?: string | null;
    autoContinuation?: ConversationAutoContinuationState | null;
    updatedAt?: string;
}): ConversationExecutionWorkspaceState;
export declare function writeConversationExecutionWorkspaceStateSync(input: Parameters<typeof upsertConversationExecutionWorkspaceState>[1], workspaceId?: string, stateArg?: AgentSpaceState): AgentSpaceState;
