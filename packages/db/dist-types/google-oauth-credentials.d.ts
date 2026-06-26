import type { StoredGoogleOAuthCredentialRecord } from "./types.ts";
export declare function upsertGoogleOAuthCredentialSync(input: {
    workspaceId?: string;
    userId: string;
    googleSubject?: string;
    googleEmail?: string;
    scopes: string;
    accessTokenEncrypted?: string;
    refreshTokenEncrypted?: string;
    expiresAt?: string;
}): StoredGoogleOAuthCredentialRecord;
export declare function readGoogleOAuthCredentialSync(input: {
    workspaceId?: string;
    userId: string;
}): StoredGoogleOAuthCredentialRecord | null;
export declare function readActiveGoogleOAuthCredentialSync(input: {
    workspaceId?: string;
    userId: string;
}): StoredGoogleOAuthCredentialRecord | null;
export declare function listGoogleOAuthCredentialsSync(workspaceId?: string): StoredGoogleOAuthCredentialRecord[];
export declare function revokeGoogleOAuthCredentialSync(input: {
    workspaceId?: string;
    userId: string;
}): StoredGoogleOAuthCredentialRecord;
