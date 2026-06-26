import { type CreateWorkspaceNotificationInput, type WorkspaceNotificationRecipient, type WorkspaceNotificationRecord, type WorkspaceNotificationRecipientType, type WorkspaceNotificationStatus } from "@agent-space/db";
export type { CreateWorkspaceNotificationInput, WorkspaceNotificationRecipient, WorkspaceNotificationRecord, WorkspaceNotificationRecipientType, WorkspaceNotificationStatus, };
export declare function createNotificationSync(input: CreateWorkspaceNotificationInput): WorkspaceNotificationRecord;
export declare function createNotificationsSync(inputs: CreateWorkspaceNotificationInput[]): WorkspaceNotificationRecord[];
export declare function listNotificationsForRecipientSync(input: {
    workspaceId: string;
    recipientType: WorkspaceNotificationRecipientType;
    recipientId: string;
    status?: WorkspaceNotificationStatus | WorkspaceNotificationStatus[];
    includeArchived?: boolean;
    limit?: number;
}): WorkspaceNotificationRecord[];
export declare function markNotificationReadSync(input: {
    workspaceId: string;
    notificationId: string;
    recipient: WorkspaceNotificationRecipient;
}): WorkspaceNotificationRecord | null;
export declare function archiveNotificationSync(input: {
    workspaceId: string;
    notificationId: string;
    recipient: WorkspaceNotificationRecipient;
}): WorkspaceNotificationRecord | null;
export declare function countUnreadNotificationsSync(input: {
    workspaceId: string;
    recipientType: WorkspaceNotificationRecipientType;
    recipientId: string;
}): number;
export declare function postNotificationChannelMessageSync(input: {
    workspaceId: string;
    channelName: string;
    summary: string;
    code: string;
    data?: Record<string, string | undefined>;
    speaker?: string;
    status?: "pending" | "completed" | "error";
}): boolean;
