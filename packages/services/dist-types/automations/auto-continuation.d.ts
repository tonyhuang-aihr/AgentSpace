import type { ConversationAutoContinuationState } from "@agent-space/domain/workspace";
export declare const AUTO_CONTINUATION_REPLY = "\u597D\u7684\uFF0C\u5982\u679C\u6CA1\u505A\u5B8C\uFF0C\u7EE7\u7EED\u5F80\u4E0B\u6536\u5C3E\uFF0C\u5982\u679C\u505A\u5B8C\u4E86\u5BFB\u627E\u6709\u6CA1\u6709\u522B\u7684\u53EF\u4EE5\u505A\u7684\u7136\u540E\u7EE7\u7EED\u505A";
export interface AutoContinuationDirective {
    mode: "until";
    startedAt: string;
    until: string;
    instruction: string;
    durationMs: number;
}
export interface AutoContinuationDispatchResult {
    queued: boolean;
    reason?: "missing_task" | "missing_payload" | "inactive" | "stale_task" | "expired" | "missing_target" | "missing_runtime";
    queuedTaskId?: string;
    until?: string;
}
export interface StopAutoContinuationResult {
    stopped: boolean;
    reason?: "missing_target" | "inactive";
    cancelledTaskId?: string;
}
export declare function parseAutoContinuationDirective(message: string, now?: Date): AutoContinuationDirective | null;
export declare function createAutoContinuationState(input: {
    directive: AutoContinuationDirective;
    requestedByUserId?: string;
    requestedByDisplayName?: string;
    sourceMessageId?: string;
}): ConversationAutoContinuationState;
export declare function continueAutoContinuationAfterTaskSync(input: {
    taskId: string;
    workspaceId?: string;
    sessionId?: string;
    workDir?: string;
    now?: Date;
}): AutoContinuationDispatchResult;
export declare function stopAutoContinuationSync(input: {
    channelName: string;
    agentId: string;
    contactId?: string;
    workspaceId?: string;
    requestedByDisplayName?: string;
}): StopAutoContinuationResult;
