import type { WorkspaceNotificationActorType, WorkspaceNotificationRecord, WorkspaceNotificationRecipientType, WorkspaceNotificationResourceType, WorkspaceNotificationSeverity, WorkspaceNotificationStatus } from "./types.ts";
export interface CreateWorkspaceNotificationInput {
    workspaceId?: string;
    recipientType: WorkspaceNotificationRecipientType;
    recipientId: string;
    actorType?: WorkspaceNotificationActorType;
    actorId?: string;
    type: string;
    resourceType: WorkspaceNotificationResourceType;
    resourceId?: string;
    channelName?: string;
    title: string;
    body: string;
    actionHref?: string;
    severity?: WorkspaceNotificationSeverity;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
}
export interface ListWorkspaceNotificationsOptions {
    workspaceId?: string;
    recipientType: WorkspaceNotificationRecipientType;
    recipientId: string;
    status?: WorkspaceNotificationStatus | WorkspaceNotificationStatus[];
    includeArchived?: boolean;
    limit?: number;
}
export interface WorkspaceNotificationRecipient {
    recipientType: WorkspaceNotificationRecipientType;
    recipientId: string;
}
export declare function createWorkspaceNotificationSync(input: CreateWorkspaceNotificationInput): WorkspaceNotificationRecord;
export declare function createWorkspaceNotificationsSync(inputs: CreateWorkspaceNotificationInput[]): WorkspaceNotificationRecord[];
export declare function listWorkspaceNotificationsForRecipientSync(options: ListWorkspaceNotificationsOptions): WorkspaceNotificationRecord[];
export declare function countUnreadWorkspaceNotificationsSync(input: {
    workspaceId?: string;
    recipientType: WorkspaceNotificationRecipientType;
    recipientId: string;
}): number;
export declare function markWorkspaceNotificationReadSync(input: {
    workspaceId?: string;
    notificationId: string;
    recipient: WorkspaceNotificationRecipient;
}): WorkspaceNotificationRecord | null;
export declare function archiveWorkspaceNotificationSync(input: {
    workspaceId?: string;
    notificationId: string;
    recipient: WorkspaceNotificationRecipient;
}): WorkspaceNotificationRecord | null;
