import type { DocumentAgentAccessRecord, DocumentAgentAccessRole, DocumentPermissionRequestExternalProvider, DocumentPermissionRequestRecord, DocumentPermissionRequestStatus } from "./types.ts";
export declare function grantDocumentAgentAccessSync(input: {
    workspaceId?: string;
    documentId: string;
    subjectId: string;
    role: DocumentAgentAccessRole;
    grantedByUserId: string;
}): DocumentAgentAccessRecord;
export declare function revokeDocumentAgentAccessSync(input: {
    workspaceId?: string;
    documentId: string;
    subjectId: string;
}): DocumentAgentAccessRecord | null;
export declare function readDocumentAgentAccessSync(input: {
    workspaceId?: string;
    documentId: string;
    subjectId: string;
    includeRevoked?: boolean;
}): DocumentAgentAccessRecord | null;
export declare function listDocumentAgentAccessSync(input?: {
    workspaceId?: string;
    documentId?: string;
    subjectId?: string;
    includeRevoked?: boolean;
}): DocumentAgentAccessRecord[];
export declare function createDocumentPermissionRequestSync(input: {
    workspaceId?: string;
    documentId?: string;
    externalProvider?: DocumentPermissionRequestExternalProvider;
    externalFileId?: string;
    externalUrl?: string;
    requestedRole: DocumentAgentAccessRole;
    requestedByAgentName: string;
    requestedForChannelName?: string;
    triggeredByUserId?: string;
    reason: string;
    sourceTaskId?: string;
}): DocumentPermissionRequestRecord;
export declare function approveDocumentPermissionRequestSync(input: {
    requestId: string;
    decidedByUserId: string;
    decisionNote?: string;
}): DocumentPermissionRequestRecord;
export declare function linkDocumentPermissionRequestDocumentSync(input: {
    requestId: string;
    documentId: string;
}): DocumentPermissionRequestRecord;
export declare function rejectDocumentPermissionRequestSync(input: {
    requestId: string;
    decidedByUserId: string;
    decisionNote?: string;
}): DocumentPermissionRequestRecord;
export declare function cancelDocumentPermissionRequestSync(input: {
    requestId: string;
    decidedByUserId: string;
    decisionNote?: string;
}): DocumentPermissionRequestRecord;
export declare function listDocumentPermissionRequestsSync(input?: {
    workspaceId?: string;
    status?: DocumentPermissionRequestStatus;
    requestedByAgentName?: string;
    documentId?: string;
}): DocumentPermissionRequestRecord[];
export declare function readDocumentPermissionRequestSync(requestId: string): DocumentPermissionRequestRecord | null;
