import type { AgentRouterActorType, AgentRouterContextSnapshotRecord, AgentRouterContextSnapshotType, AgentRouterEventRecord, AgentRouterProviderSessionRecord, AgentRouterProviderSessionStatus, AgentRouterSessionRecord, AgentTaskAttemptRecord, AgentTaskAttemptStatus, AgentRuntimeRecord, QueuedTaskRecord } from "./types.ts";
export interface AgentRouterConversationIdentity {
    conversationKey?: string;
    sourceType: string;
    title?: string;
}
export declare function resolveTaskRouterConversationIdentity(task: Pick<QueuedTaskRecord, "id" | "agentId" | "triggerType" | "inputJson" | "issueId">): AgentRouterConversationIdentity;
export declare function resolveRouterSessionForTaskSync(task: Pick<QueuedTaskRecord, "id" | "workspaceId" | "agentId" | "triggerType" | "inputJson" | "issueId">): AgentRouterSessionRecord;
export declare function upsertAgentRouterSessionSync(input: {
    workspaceId?: string;
    agentId: string;
    conversationKey?: string;
    sourceType?: string;
    title?: string;
    summary?: string;
    memorySummary?: string;
}): AgentRouterSessionRecord;
export declare function readAgentRouterSessionSync(id: string): AgentRouterSessionRecord | null;
export declare function readAgentRouterSessionForTaskSync(task: Pick<QueuedTaskRecord, "routerSessionId">): AgentRouterSessionRecord | null;
export declare function listAgentRouterSessionsSync(options?: {
    workspaceId?: string;
    agentId?: string;
    limit?: number;
}): AgentRouterSessionRecord[];
export declare function updateAgentRouterSessionMemorySync(input: {
    routerSessionId: string;
    memorySummary?: string | null;
    summary?: string | null;
}): AgentRouterSessionRecord;
export declare function upsertAgentRouterProviderSessionSync(input: {
    workspaceId?: string;
    routerSessionId: string;
    runtimeId: string;
    provider: AgentRuntimeRecord["provider"];
    providerSessionId: string;
    status?: AgentRouterProviderSessionStatus;
    lastError?: string | null;
    metadata?: Record<string, unknown>;
}): AgentRouterProviderSessionRecord;
export declare function markAgentRouterProviderSessionInvalidSync(input: {
    workspaceId?: string;
    routerSessionId: string;
    runtimeId?: string;
    provider?: AgentRuntimeRecord["provider"];
    providerSessionId?: string;
    lastError: string;
}): void;
export declare function readAgentRouterProviderSessionSync(id: string): AgentRouterProviderSessionRecord | null;
export declare function findActiveProviderSessionForRouterSync(input: {
    workspaceId?: string;
    routerSessionId: string;
    runtimeId: string;
    provider: AgentRuntimeRecord["provider"];
}): AgentRouterProviderSessionRecord | null;
export declare function listAgentRouterProviderSessionsSync(options?: {
    workspaceId?: string;
    routerSessionId?: string;
    runtimeId?: string;
    provider?: AgentRuntimeRecord["provider"];
}): AgentRouterProviderSessionRecord[];
export declare function createAgentTaskAttemptSync(input: {
    workspaceId?: string;
    taskQueueId: string;
    routerSessionId: string;
    runtimeId: string;
    provider: AgentRuntimeRecord["provider"];
    providerSessionId?: string;
    status?: AgentTaskAttemptStatus;
    metadata?: Record<string, unknown>;
}): AgentTaskAttemptRecord;
export declare function readAgentTaskAttemptSync(id: string): AgentTaskAttemptRecord | null;
export declare function readLatestAgentTaskAttemptForTaskSync(taskQueueId: string): AgentTaskAttemptRecord | null;
export declare function listAgentTaskAttemptsSync(options?: {
    workspaceId?: string;
    taskQueueId?: string;
    routerSessionId?: string;
    limit?: number;
}): AgentTaskAttemptRecord[];
export declare function updateAgentTaskAttemptSync(input: {
    attemptId: string;
    status: AgentTaskAttemptStatus;
    providerSessionId?: string | null;
    errorText?: string | null;
    handoffSnapshotId?: string | null;
    metadata?: Record<string, unknown>;
}): AgentTaskAttemptRecord;
export declare function recordAgentRouterEventSync(input: {
    workspaceId?: string;
    routerSessionId: string;
    taskQueueId?: string;
    attemptId?: string;
    type: string;
    actorType: AgentRouterActorType;
    actorId?: string;
    runtimeId?: string;
    provider?: AgentRuntimeRecord["provider"];
    summary?: string;
    data?: Record<string, unknown>;
    createdAt?: string;
}): AgentRouterEventRecord;
export declare function readAgentRouterEventSync(id: string): AgentRouterEventRecord | null;
export declare function listAgentRouterEventsSync(options?: {
    workspaceId?: string;
    routerSessionId?: string;
    taskQueueId?: string;
    limit?: number;
    order?: "asc" | "desc";
}): AgentRouterEventRecord[];
export declare function createAgentRouterContextSnapshotSync(input: {
    workspaceId?: string;
    routerSessionId: string;
    taskQueueId?: string;
    snapshotType: AgentRouterContextSnapshotType;
    contentMarkdown: string;
    sourceEventIds?: string[];
}): AgentRouterContextSnapshotRecord;
export declare function readAgentRouterContextSnapshotSync(id: string): AgentRouterContextSnapshotRecord | null;
export declare function readLatestAgentRouterContextSnapshotSync(input: {
    workspaceId?: string;
    routerSessionId: string;
    snapshotType?: AgentRouterContextSnapshotType;
}): AgentRouterContextSnapshotRecord | null;
export declare function chooseProviderSessionForTaskSync(input: {
    task: Pick<QueuedTaskRecord, "workspaceId" | "routerSessionId" | "runtimeId">;
}): AgentRouterProviderSessionRecord | null;
