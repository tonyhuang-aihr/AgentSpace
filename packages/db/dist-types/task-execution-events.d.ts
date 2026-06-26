import { type QueuedTaskRecord, type TaskExecutionEventRecord, type TaskExecutionEventSeverity, type TaskExecutionEventStatus, type TaskExecutionEventType } from "./types.ts";
export interface TaskExecutionEventInput {
    workspaceId?: string;
    taskId: string;
    channelName?: string;
    agentId: string;
    runtimeId?: string;
    runId?: string;
    type: TaskExecutionEventType;
    title: string;
    summary?: string;
    severity?: TaskExecutionEventSeverity;
    status?: TaskExecutionEventStatus;
    data?: Record<string, unknown>;
    createdAt?: string;
}
export interface TaskExecutionEventListOptions {
    workspaceId?: string;
    taskId?: string;
    channelName?: string;
    agentId?: string;
    runtimeId?: string;
    limit?: number;
    order?: "asc" | "desc";
}
export interface TaskExecutionEventContext {
    workspaceId: string;
    taskId: string;
    channelName: string;
    agentId: string;
    runtimeId: string;
    runId?: string;
    taskTitle?: string;
    issueId?: string;
    triggerType: string;
}
export declare function recordTaskExecutionEventSync(input: TaskExecutionEventInput): TaskExecutionEventRecord;
export declare function listTaskExecutionEventsSync(options?: TaskExecutionEventListOptions): TaskExecutionEventRecord[];
export declare function buildTaskExecutionEventContext(task: QueuedTaskRecord): TaskExecutionEventContext;
