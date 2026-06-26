import type { StoredAgentGoogleWorkspaceDelegationRecord } from "./types.ts";
export declare function upsertAgentGoogleWorkspaceDelegationSync(input: {
    workspaceId?: string;
    employeeName: string;
    userId: string;
    googleOAuthCredentialId: string;
    scopes: string;
    googleEmail?: string;
    grantedByUserId: string;
}): StoredAgentGoogleWorkspaceDelegationRecord;
export declare function readAgentGoogleWorkspaceDelegationSync(input: {
    workspaceId?: string;
    employeeName: string;
    userId: string;
}): StoredAgentGoogleWorkspaceDelegationRecord | null;
export declare function readActiveAgentGoogleWorkspaceDelegationSync(input: {
    workspaceId?: string;
    employeeName: string;
}): StoredAgentGoogleWorkspaceDelegationRecord | null;
export declare function listAgentGoogleWorkspaceDelegationsSync(workspaceId?: string): StoredAgentGoogleWorkspaceDelegationRecord[];
export declare function revokeAgentGoogleWorkspaceDelegationSync(input: {
    workspaceId?: string;
    employeeName: string;
    userId: string;
}): StoredAgentGoogleWorkspaceDelegationRecord;
