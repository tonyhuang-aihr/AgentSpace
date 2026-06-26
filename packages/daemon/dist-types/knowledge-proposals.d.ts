export interface AppliedKnowledgeProposal {
    proposalId?: string;
    approvalId?: string;
    title: string;
    operation: "create" | "update";
    status: "pending" | "failed";
    message: string;
}
export interface KnowledgeProposalOperationResult {
    warnings: string[];
    statusMessages: string[];
    knowledgeProposals: AppliedKnowledgeProposal[];
}
export declare function applyKnowledgeProposalOperations(input: {
    workDir: string;
    workspaceId: string;
    actorName: string;
    sourceTaskQueueId: string;
    sourceChannelName?: string;
}): KnowledgeProposalOperationResult;
