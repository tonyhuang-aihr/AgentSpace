import type { AgentSpaceState, ApprovalRequest } from "@agent-space/domain/workspace";
export declare function listApprovalsSync(workspaceId?: string): ApprovalRequest[];
export declare function createApprovalRequestSync(input: {
    type: ApprovalRequest["type"];
    sourceId: string;
    agentId: string;
    channelName: string;
    contentPreview: string;
    metadata?: Record<string, unknown>;
}, workspaceId?: string): AgentSpaceState;
export declare function createRuntimeToolApprovalRequestSync(input: {
    sourceId: string;
    agentId: string;
    channelName: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
    contentPreview: string;
    provider?: string;
    runtimeId?: string;
    sessionId?: string;
}, workspaceId?: string): ApprovalRequest;
export declare function reviewApprovalSync(approvalId: string, decision: "approved" | "rejected", comment?: string, workspaceId?: string): AgentSpaceState;
