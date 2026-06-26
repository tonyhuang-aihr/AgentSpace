import type { CollaborationActorRef, CollaborationChangeProposal, CollaborativeObjectType } from "@agent-space/domain";
export declare function listCollaborationChangeProposalsSync(filter?: {
    objectType?: CollaborativeObjectType;
    objectId?: string;
    status?: CollaborationChangeProposal["status"];
}, workspaceId?: string): CollaborationChangeProposal[];
export declare function createCollaborationChangeProposalSync(input: {
    objectType: CollaborativeObjectType;
    objectId: string;
    proposedBy: CollaborationActorRef;
    title: string;
    summary: string;
    patch: Record<string, unknown>;
}, workspaceId?: string): CollaborationChangeProposal;
export declare function acceptCollaborationChangeProposalSync(input: {
    proposalId: string;
    decidedByUserId: string;
}, workspaceId?: string): CollaborationChangeProposal;
export declare function rejectCollaborationChangeProposalSync(input: {
    proposalId: string;
    decidedByUserId: string;
}, workspaceId?: string): CollaborationChangeProposal;
