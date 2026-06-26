import { type DocumentAgentAccessRecord, type DocumentPermissionRequestExternalProvider, type DocumentPermissionRequestRecord } from "@agent-space/db";
import { type AgentAssignableDocumentAccessRole, type DocumentAccessRole, type DocumentAction } from "@agent-space/domain";
import type { ChannelDocument } from "@agent-space/domain/workspace";
export type { DocumentAgentAccessRecord, DocumentPermissionRequestExternalProvider, DocumentPermissionRequestRecord, };
export interface AgentDocumentContext {
    document: ChannelDocument;
    role: DocumentAccessRole;
    source: "channel_context" | "explicit_grant" | "forward_grant";
    allowedActions: DocumentAction[];
}
export declare class AgentDocumentPermissionError extends Error {
    readonly code: "provider.document_read_denied" | "provider.document_edit_denied" | "provider.document_forward_denied" | "provider.document_external_auth_unavailable";
    readonly documentId?: string;
    readonly agentName: string;
    readonly action: DocumentAction;
    constructor(input: {
        code: AgentDocumentPermissionError["code"];
        message: string;
        agentName: string;
        action: DocumentAction;
        documentId?: string;
    });
}
export declare function grantDocumentAgentAccessSync(input: {
    workspaceId: string;
    documentId: string;
    agentName: string;
    role: AgentAssignableDocumentAccessRole;
    grantedByUserId: string;
}): DocumentAgentAccessRecord;
export declare function revokeDocumentAgentAccessSync(input: {
    workspaceId: string;
    documentId: string;
    agentName: string;
}): DocumentAgentAccessRecord | null;
export declare function listDocumentAgentAccessSync(input: {
    workspaceId: string;
    documentId?: string;
    agentName?: string;
    includeRevoked?: boolean;
}): DocumentAgentAccessRecord[];
export declare function resolveAgentDocumentContextSync(input: {
    workspaceId: string;
    agentName: string;
    channelName?: string;
    documentIds?: string[];
}): AgentDocumentContext[];
export declare function assertAgentDocumentActionAllowedSync(input: {
    workspaceId: string;
    agentName: string;
    action: DocumentAction;
    documentId?: string;
    externalProvider?: DocumentPermissionRequestExternalProvider;
    externalFileId?: string;
    channelName?: string;
}): AgentDocumentContext;
export declare function createDocumentPermissionRequestSync(input: {
    workspaceId: string;
    documentId?: string;
    externalProvider?: DocumentPermissionRequestExternalProvider;
    externalFileId?: string;
    externalUrl?: string;
    requestedRole: AgentAssignableDocumentAccessRole;
    requestedByAgentName: string;
    requestedForChannelName?: string;
    triggeredByUserId?: string;
    reason: string;
    sourceTaskId?: string;
}): DocumentPermissionRequestRecord;
export declare function approveDocumentPermissionRequestSync(input: {
    workspaceId: string;
    requestId: string;
    decidedByUserId: string;
    decisionNote?: string;
}): DocumentPermissionRequestRecord;
export declare function rejectDocumentPermissionRequestSync(input: {
    workspaceId: string;
    requestId: string;
    decidedByUserId: string;
    decisionNote?: string;
}): DocumentPermissionRequestRecord;
export declare function cancelDocumentPermissionRequestSync(input: {
    workspaceId: string;
    requestId: string;
    decidedByUserId: string;
    decisionNote?: string;
}): DocumentPermissionRequestRecord;
export declare function listPendingDocumentPermissionRequestsSync(input: {
    workspaceId: string;
    requestedByAgentName?: string;
    documentId?: string;
}): DocumentPermissionRequestRecord[];
export declare function listDocumentPermissionRequestsSync(input: {
    workspaceId: string;
    requestedByAgentName?: string;
    documentId?: string;
}): DocumentPermissionRequestRecord[];
export declare function resolveAgentDocumentRejectionContextSync(input: {
    workspaceId: string;
    agentName: string;
    documentId?: string;
}): DocumentPermissionRequestRecord[];
