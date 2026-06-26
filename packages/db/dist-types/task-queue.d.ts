import { type QueuedTaskRecord, type EnqueueTaskInput } from "./types.ts";
export declare function enqueueNativeTaskSync(input: EnqueueTaskInput): QueuedTaskRecord | null;
export declare function listQueuedTasksSync(options?: {
    workspaceId?: string;
    runtimeId?: string;
}): QueuedTaskRecord[];
export declare function readLatestChannelExecutionSync(agentId: string, channelName: string, workspaceId?: string): QueuedTaskRecord | null;
export declare function readLatestConversationExecutionSync(agentId: string, input: {
    channelName?: string;
    contactId?: string;
}, workspaceId?: string): QueuedTaskRecord | null;
export declare function readQueuedTaskSync(taskId: string): QueuedTaskRecord | null;
export declare function claimNextQueuedTaskForRuntimeSync(runtimeId: string, workspaceId?: string): QueuedTaskRecord | null;
export declare function startQueuedTaskSync(taskId: string): QueuedTaskRecord;
export declare function completeQueuedTaskSync(input: {
    taskId: string;
    resultJson?: Record<string, unknown>;
    sessionId?: string;
    workDir?: string;
}): QueuedTaskRecord;
export declare function failQueuedTaskSync(input: {
    taskId: string;
    errorText: string;
    sessionId?: string;
    workDir?: string;
    errorCode?: string;
    errorCategory?: string;
    provider?: string;
    rawProviderMessage?: string;
}): QueuedTaskRecord;
export declare function cancelQueuedTaskSync(input: {
    taskId: string;
    errorText?: string;
}): QueuedTaskRecord;
