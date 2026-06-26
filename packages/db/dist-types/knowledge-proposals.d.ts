import type { KnowledgeProposalOperation, KnowledgeProposalRecord, KnowledgeProposalStatus, ResetKnowledgeProposalsResult } from "./types.ts";
import type { KnowledgeAssignmentMode } from "@agent-space/domain/workspace";
export interface CreateKnowledgeProposalInput {
    workspaceId?: string;
    sourceTaskQueueId: string;
    sourceChannelName?: string;
    sourceAgentName: string;
    operation: KnowledgeProposalOperation;
    title: string;
    contentMarkdown: string;
    summary?: string;
    reason?: string;
    tags?: string[];
    parentId?: string | null;
    assignmentMode?: KnowledgeAssignmentMode;
    assignedEmployeeNames?: string[];
    targetKnowledgePageId?: string;
    baseUpdatedAt?: string;
    approvalId?: string;
}
export interface ListKnowledgeProposalsOptions {
    statuses?: KnowledgeProposalStatus[];
    sourceTaskQueueId?: string;
    sourceAgentName?: string;
    approvalId?: string;
}
export interface DecideKnowledgeProposalInput {
    proposalId: string;
    workspaceId?: string;
    status: Exclude<KnowledgeProposalStatus, "pending">;
    decidedByUserId?: string;
    reviewerComment?: string;
    createdKnowledgePageId?: string;
}
export declare function createKnowledgeProposalSync(input: CreateKnowledgeProposalInput): KnowledgeProposalRecord;
export declare function readKnowledgeProposalSync(proposalId: string, workspaceId?: string): KnowledgeProposalRecord | null;
export declare function readKnowledgeProposalByApprovalIdSync(approvalId: string, workspaceId?: string): KnowledgeProposalRecord | null;
export declare function listKnowledgeProposalsSync(workspaceId: string, options?: ListKnowledgeProposalsOptions): KnowledgeProposalRecord[];
export declare function updateKnowledgeProposalApprovalIdSync(input: {
    proposalId: string;
    workspaceId?: string;
    approvalId: string;
}): KnowledgeProposalRecord;
export declare function decideKnowledgeProposalSync(input: DecideKnowledgeProposalInput): KnowledgeProposalRecord;
export declare function resetKnowledgeProposalsSync(workspaceId: string): ResetKnowledgeProposalsResult;
