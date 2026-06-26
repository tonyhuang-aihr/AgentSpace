import type { MentionPlan } from "@agent-space/domain";
import type { ChannelDocumentRun, ChannelDocumentRunStep } from "@agent-space/domain";
import type { AgentSpaceState } from "@agent-space/domain/workspace";
export declare function createChannelDocumentRun(input: {
    state: AgentSpaceState;
    channelName: string;
    sourceMessageId: string;
    sourceSummary: string;
    plan: MentionPlan;
}): {
    state: AgentSpaceState;
    run: ChannelDocumentRun;
    steps: ChannelDocumentRunStep[];
};
export declare function listChannelDocumentRunSteps(state: AgentSpaceState, runId: string): ChannelDocumentRunStep[];
export declare function findChannelDocumentRunStepByQueuedTaskId(state: AgentSpaceState, queuedTaskId: string): ChannelDocumentRunStep | null;
export declare function listReadyChannelDocumentRunSteps(state: AgentSpaceState, runId: string): ChannelDocumentRunStep[];
export declare function markChannelDocumentRunStepQueued(state: AgentSpaceState, stepId: string, queuedTaskId: string): ChannelDocumentRunStep;
export declare function markChannelDocumentRunStepRunning(state: AgentSpaceState, stepId: string): ChannelDocumentRunStep;
export declare function markChannelDocumentRunStepCompleted(state: AgentSpaceState, input: {
    stepId: string;
    documentUpdates?: Array<{
        documentId: string;
        documentVersionId: string;
    }>;
    warningText?: string;
}): {
    step: ChannelDocumentRunStep;
    run: ChannelDocumentRun;
    readySteps: ChannelDocumentRunStep[];
};
export declare function markChannelDocumentRunStepFailed(state: AgentSpaceState, stepId: string, errorText: string): {
    step: ChannelDocumentRunStep;
    run: ChannelDocumentRun;
};
export declare function normalizeChannelDocumentRuns(runs: AgentSpaceState["channelDocumentRuns"] | undefined, fallback: AgentSpaceState["channelDocumentRuns"]): AgentSpaceState["channelDocumentRuns"];
export declare function normalizeChannelDocumentRunSteps(steps: AgentSpaceState["channelDocumentRunSteps"] | undefined, fallback: AgentSpaceState["channelDocumentRunSteps"]): AgentSpaceState["channelDocumentRunSteps"];
