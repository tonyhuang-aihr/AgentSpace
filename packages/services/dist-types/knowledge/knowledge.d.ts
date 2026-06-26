import type { AgentSpaceState, KnowledgeAssignmentMode, KnowledgePage } from "@agent-space/domain/workspace";
export declare function listKnowledgePagesSync(workspaceId?: string): KnowledgePage[];
export declare function readKnowledgePageSync(id: string, workspaceId?: string): KnowledgePage | undefined;
export declare function createKnowledgePageSync(input: {
    title: string;
    parentId?: string | null;
    contentMarkdown?: string;
    tags?: string[];
    createdBy?: string;
    assignmentMode?: KnowledgeAssignmentMode;
    assignedEmployeeNames?: string[];
    sourceAttachmentId?: string;
    sourceAttachmentStoredPath?: string;
    sourceChannelDocumentId?: string;
    sourceKnowledgeProposalId?: string;
    sourceApprovalId?: string;
    sourceTaskQueueId?: string;
    sourceAgentName?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateKnowledgePageSync(id: string, input: {
    title?: string;
    contentMarkdown?: string;
    tags?: string[];
    sourceKnowledgeProposalId?: string;
    sourceApprovalId?: string;
    sourceTaskQueueId?: string;
    sourceAgentName?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function moveKnowledgePageSync(id: string, input: {
    parentId: string | null;
    sortOrder?: number;
}, workspaceId?: string): AgentSpaceState;
export declare function deleteKnowledgePageSync(id: string, workspaceId?: string): AgentSpaceState;
export declare function materialToKnowledgePageSync(materialId: string, parentId?: string | null, workspaceId?: string): AgentSpaceState;
export declare function createKnowledgePageFromSharedDocumentSync(input: {
    sourceType: "attachment" | "channelDocument";
    sourceId: string;
    parentId?: string | null;
    createdBy: string;
    createdByType: "human" | "agent";
    assignmentMode?: KnowledgeAssignmentMode;
    assignedEmployeeNames?: string[];
}, workspaceId?: string): KnowledgePage;
