import type { AuthProvider, StoredAuthIdentityRecord, StoredSessionRecord, StoredUserRecord, WorkspaceRole } from "./types.ts";
export interface WorkspaceMemberUserRecord {
    userId: string;
    displayName: string;
    primaryEmail?: string;
    role: WorkspaceRole;
}
export interface PasswordAuthIdentityRecord {
    identity: StoredAuthIdentityRecord;
    passwordHash: string;
}
export declare function countUsersSync(): number;
export declare function createUserSync(input: {
    displayName: string;
    primaryEmail?: string;
    avatarUrl?: string;
}): StoredUserRecord;
export declare function readUserSync(userId: string): StoredUserRecord | null;
export declare function readUserByEmailSync(email: string): StoredUserRecord | null;
export declare function createPasswordAuthIdentitySync(input: {
    userId: string;
    email: string;
    passwordHash: string;
}): StoredAuthIdentityRecord;
export declare function createAuthIdentitySync(input: {
    userId: string;
    provider: AuthProvider;
    providerSubject: string;
    email?: string;
    emailVerified?: boolean;
    profileJson?: string;
}): StoredAuthIdentityRecord;
export declare function readPasswordAuthIdentityByEmailSync(email: string): PasswordAuthIdentityRecord | null;
export declare function readAuthIdentityByProviderSubjectSync(provider: AuthProvider, providerSubject: string): StoredAuthIdentityRecord | null;
export declare function updateUserSync(input: {
    userId: string;
    displayName?: string;
    primaryEmail?: string;
    avatarUrl?: string;
}): StoredUserRecord | null;
export declare function createSessionSync(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
}): StoredSessionRecord;
export declare function readSessionByTokenHashSync(tokenHash: string): StoredSessionRecord | null;
export declare function touchSessionLastSeenSync(tokenHash: string): void;
export declare function deleteSessionByTokenHashSync(tokenHash: string): boolean;
export declare function listSessionsForUserSync(userId: string): StoredSessionRecord[];
export declare function countActiveSessionsForUserSync(userId: string): number;
export declare function revokeSessionByIdSync(sessionId: string, userId?: string): boolean;
export declare function revokeOtherSessionsForUserSync(userId: string, currentSessionId: string): number;
export declare function listWorkspaceMemberUsersSync(workspaceId: string): WorkspaceMemberUserRecord[];
export declare function countWorkspaceMembersSync(workspaceId: string): number;
