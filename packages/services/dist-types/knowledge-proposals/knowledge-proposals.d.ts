import { type KnowledgeProposalRecord, type KnowledgeProposalStatus, type WorkspaceRole } from "@agent-space/db";
import type { KnowledgeAssignmentMode, KnowledgePage } from "@agent-space/domain/workspace";
export type KnowledgeProposalOperation = "create" | "update";
export interface CreateKnowledgeProposalFromAgentInput {
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
    assignToSelf?: boolean;
    targetKnowledgePageId?: string;
    baseUpdatedAt?: string;
}
export interface ApproveKnowledgeProposalInput {
    workspaceId?: string;
    proposalId: string;
    actor: {
        userId: string;
        displayName?: string;
        role?: WorkspaceRole;
    };
    reviewerComment?: string;
    title?: string;
    contentMarkdown?: string;
    tags?: string[];
    parentId?: string | null;
    assignmentMode?: KnowledgeAssignmentMode;
    assignedEmployeeNames?: string[];
}
export interface RejectKnowledgeProposalInput {
    workspaceId?: string;
    proposalId: string;
    actor: {
        userId: string;
        displayName?: string;
        role?: WorkspaceRole;
    };
    reviewerComment?: string;
}
export interface KnowledgeProposalApprovalResult {
    proposal: KnowledgeProposalRecord;
    knowledgePage?: KnowledgePage;
}
export declare function createKnowledgeProposalFromAgentSync(input: CreateKnowledgeProposalFromAgentInput): KnowledgeProposalRecord;
export declare function listPendingKnowledgeProposalsForApproverSync(input: {
    workspaceId?: string;
    actor?: {
        userId?: string;
        role?: WorkspaceRole;
    };
}): KnowledgeProposalRecord[];
export declare function listKnowledgeProposalsForWorkspaceSync(input?: {
    workspaceId?: string;
    statuses?: KnowledgeProposalStatus[];
}): KnowledgeProposalRecord[];
export declare function readKnowledgeProposalSync(proposalId: string, workspaceId?: string): KnowledgeProposalRecord | null;
export declare function approveKnowledgeProposalForActorSync(input: ApproveKnowledgeProposalInput): KnowledgeProposalApprovalResult;
export declare function rejectKnowledgeProposalForActorSync(input: RejectKnowledgeProposalInput): KnowledgeProposalRecord;
export declare function createKnowledgeProposalIdForTests(): string;
