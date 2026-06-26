import type { ContactAgentContext, MaterializedSkillDirectories } from "@agent-space/services";
import { type AgentRuntimeRecord, type QueuedTaskRecord } from "@agent-space/db";
import type { ActiveEmployee, ChannelDocument, KnowledgePage, WorkspaceSkill } from "@agent-space/domain/workspace";
import { readWorkspaceStateSync, type AgentDocumentContext, type DocumentPermissionRequestRecord, type WorkspaceNotificationRecord } from "@agent-space/services";
import type { RuntimeAppContextEntry } from "@agent-space/domain";
export interface ParsedTaskPayload {
    taskId?: string;
    assignee?: string;
    title?: string;
    channel?: string;
    priority?: string;
    contactId?: string;
    channelName?: string;
    channelMessage?: string;
    sourceChannel?: string;
    sourceMessageId?: string;
    sourceTaskQueueId?: string;
    mentionSource?: string;
    initiatorAgentId?: string;
    mentionCascadeDepth?: number;
    mentionRootMessageId?: string;
    orchestrationRunId?: string;
    orchestrationStepId?: string;
    stepInstruction?: string;
    stepDependsOnIds?: string[];
    stepHandoffKind?: string;
    handoffDocumentIds?: string[];
    handoffDocumentVersionIds?: string[];
    autoContinuation?: {
        mode: "until";
        status: "active" | "expired" | "stopped";
        startedAt: string;
        until: string;
        instruction: string;
        iteration: number;
        lastContinuedAt?: string;
    };
    mentionType?: string;
    mentionedAgentIds?: string[];
    mentionedAgentLabels?: string[];
    assigneeMentionToken?: string;
    channelHistory?: Array<{
        speaker: string;
        role?: string;
        summary: string;
        time?: string;
        status?: string;
        kind?: string;
        processType?: string;
        mentions?: string[];
        attachments?: string[];
    }>;
    channelHistoryPath?: string;
    channelSessionId?: string;
    attachments?: Array<{
        fileName: string;
        storedPath: string;
        mediaType?: string;
        kind?: string;
    }>;
}
export interface PreparedDaemonTaskContext {
    prompt: string;
    payload: ParsedTaskPayload;
    agentProfile?: ActiveEmployee;
    agentSkills: WorkspaceSkill[];
    agentKnowledgePages: KnowledgePage[];
    runtimeApps: RuntimeAppContextEntry[];
    agentDocumentContexts: AgentDocumentContext[];
    agentNotifications: WorkspaceNotificationRecord[];
    attachmentLines: string[];
    skillContextDir?: string;
    providerSkillContextDir?: string;
    channelDocumentsContextDir?: string;
    knowledgeContextDir?: string;
}
export interface RouterSessionPromptContext {
    routerSessionId: string;
    conversationKey?: string;
    sourceType?: string;
    memorySummary?: string;
    providerSessionId?: string;
    continuationMode?: "same_provider_resume" | "cold_rebuild" | "fallback";
    previousRuntimeId?: string;
    selectedRuntimeId?: string;
    fallbackReason?: string;
    transcriptLines?: string[];
    latestHandoffSnapshot?: string;
    attemptCount?: number;
}
export interface AgentKnowledgePromptContext {
    pages: KnowledgePage[];
    contextDir?: string;
}
export declare function parseTaskInputJson(inputJson: string): ParsedTaskPayload;
export declare function parseTaskPayload(task: QueuedTaskRecord): ParsedTaskPayload;
export declare function resolveConversationThreadId(input: {
    triggerType: string;
    payload: Pick<ParsedTaskPayload, "channel" | "channelName" | "contactId">;
}): string | undefined;
export declare function prepareDaemonTaskContext(input: {
    runtime: AgentRuntimeRecord;
    task: QueuedTaskRecord;
    workDir: string;
    agentProfile?: ActiveEmployee;
    channelDocuments?: ChannelDocument[];
    agentDocumentContexts?: AgentDocumentContext[];
    contactContext?: ContactAgentContext;
    payloadOverride?: Partial<ParsedTaskPayload>;
    routerSessionContext?: RouterSessionPromptContext;
}): PreparedDaemonTaskContext;
export declare function buildTaskPrompt(runtime: AgentRuntimeRecord, payload: ParsedTaskPayload, attachmentLines: string[], agentProfile?: ActiveEmployee, agentSkills?: WorkspaceSkill[], skillContextDir?: string, providerSkillContextDir?: string, channelDocuments?: ChannelDocument[], channelDocumentsContextDir?: string, contactContext?: ContactAgentContext, knowledgeContext?: AgentKnowledgePromptContext, runtimeApps?: RuntimeAppContextEntry[], documentPermissionRequests?: DocumentPermissionRequestRecord[], agentNotifications?: WorkspaceNotificationRecord[], routerSessionContext?: RouterSessionPromptContext): string;
export declare function buildTaskPromptWithDocumentContexts(runtime: AgentRuntimeRecord, payload: ParsedTaskPayload, attachmentLines: string[], agentProfile?: ActiveEmployee, agentSkills?: WorkspaceSkill[], skillContextDir?: string, providerSkillContextDir?: string, agentDocumentContexts?: AgentDocumentContext[], channelDocumentsContextDir?: string, contactContext?: ContactAgentContext, knowledgeContext?: AgentKnowledgePromptContext, runtimeApps?: RuntimeAppContextEntry[], documentPermissionRequests?: DocumentPermissionRequestRecord[], agentNotifications?: WorkspaceNotificationRecord[], routerSessionContext?: RouterSessionPromptContext): string;
export declare function materializeAgentSkills(skills: WorkspaceSkill[], workDir: string, provider?: AgentRuntimeRecord["provider"]): MaterializedSkillDirectories;
export declare function resolveAgentKnowledgePages(_workspaceState: ReturnType<typeof readWorkspaceStateSync>, agentProfile: ActiveEmployee | undefined, workspaceId?: string): KnowledgePage[];
export declare function materializeAgentKnowledgePages(pages: KnowledgePage[], workDir: string): string | undefined;
export declare function materializeAttachments(attachments: Array<{
    fileName: string;
    storedPath: string;
    mediaType?: string;
    kind?: string;
}> | undefined, workDir: string): string[];
export declare function resolveAgentSkills(workspaceState: ReturnType<typeof readWorkspaceStateSync>, agentProfile: ActiveEmployee | undefined, workspaceId?: string): WorkspaceSkill[];
